import {
  MEDIA_COLUMNS,
  createServiceClient,
  toPublicImage,
  unwrapList,
  type Db,
  type MediaRow,
} from '@stax/database';
import {
  emptySiteData,
  type BookingServiceView,
  type ContentEntryView,
  type FormView,
  type MediaImage,
  type MenuCategoryView,
  type ParsedBlock,
  type SiteData,
} from '@stax/site-engine';

/**
 * Chargement des donnees vivantes d un site.
 *
 * Deux principes :
 *  1. On ne charge QUE ce dont la page a besoin. Une page « Accueil » sans bloc
 *     « carte » ne declenche aucune lecture des menus.
 *  2. Toutes les requetes sont filtrees par `site_id` COTE SERVEUR, a partir du
 *     site resolu par le nom d hote. Le client de service contourne la RLS :
 *     ce filtre est donc la garantie d isolation, et il n est jamais construit
 *     a partir d une valeur fournie par le navigateur.
 */

type Collection = keyof SiteData;

/** Dependances de chaque type de bloc. */
const BLOCK_DEPENDENCIES: Record<string, Collection[]> = {
  services: ['services'],
  'service-area': ['serviceAreas'],
  menu: ['menu'],
  'menu-preview': ['menu'],
  team: ['team'],
  'opening-hours': ['openingHours', 'closures'],
  products: ['products'],
  properties: ['properties'],
  rooms: ['rooms'],
  portfolio: ['entries'],
  articles: ['entries'],
  events: ['entries'],
  testimonials: ['entries'],
  faq: ['entries'],
  booking: ['bookingServices'],
  contact: ['forms'],
  'quote-form': ['forms'],
  newsletter: ['forms'],
};

export function requiredCollections(blocks: readonly ParsedBlock[]): Set<Collection> {
  const needed = new Set<Collection>();
  for (const block of blocks) {
    for (const collection of BLOCK_DEPENDENCIES[block.type] ?? []) needed.add(collection);
  }
  return needed;
}

/**
 * Une jointure Supabase vers `media` peut revenir sous forme d objet ou de
 * tableau selon la cardinalite deduite : on normalise les deux.
 */
function image(relation: MediaRow | MediaRow[] | null | undefined): MediaImage | null {
  const row = Array.isArray(relation) ? relation[0] : relation;
  return toPublicImage(row ?? null);
}

/**
 * Premiere image d un tableau JSON `images` porte par un produit, un bien ou
 * une chambre. Chaque entree reference un media par son bucket et son chemin :
 * aucune URL arbitraire n est acceptee.
 */
function firstImage(value: unknown): MediaImage | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0] as Partial<MediaRow> | undefined;
  if (!first || typeof first.storage_path !== 'string') return null;
  return toPublicImage({
    storage_bucket: typeof first.storage_bucket === 'string' ? first.storage_bucket : 'site-media',
    storage_path: first.storage_path,
    alt_text: typeof first.alt_text === 'string' ? first.alt_text : null,
    width: typeof first.width === 'number' ? first.width : null,
    height: typeof first.height === 'number' ? first.height : null,
    is_public: first.is_public !== false,
  });
}

async function loadServices(db: Db, siteId: string) {
  const rows = unwrapList<{
    id: string;
    category: string | null;
    name: string;
    slug: string;
    description: string | null;
    price_cents: number | null;
    price_suffix: string | null;
    price_from: boolean;
    duration_minutes: number | null;
    is_bookable: boolean;
    is_emergency: boolean;
    media: MediaRow | MediaRow[] | null;
  }>(
    (await db
      .from('services')
      .select(
        `id, category, name, slug, description, price_cents, price_suffix, price_from, duration_minutes, is_bookable, is_emergency, media:image_media_id (${MEDIA_COLUMNS})`,
      )
      .eq('site_id', siteId)
      .eq('is_visible', true)
      .order('sort_order')) as never,
  );

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    slug: row.slug,
    description: row.description,
    priceCents: row.price_cents,
    priceSuffix: row.price_suffix,
    priceFrom: row.price_from,
    durationMinutes: row.duration_minutes,
    image: image(row.media),
    isBookable: row.is_bookable,
    isEmergency: row.is_emergency,
  }));
}

async function loadMenu(db: Db, siteId: string): Promise<MenuCategoryView[]> {
  const categories = unwrapList<{
    id: string;
    name: string;
    description: string | null;
    menu_group: string;
  }>(
    (await db
      .from('menu_categories')
      .select('id, name, description, menu_group')
      .eq('site_id', siteId)
      .eq('is_visible', true)
      .order('sort_order')) as never,
  );
  if (categories.length === 0) return [];

  const items = unwrapList<{
    id: string;
    category_id: string;
    name: string;
    description: string | null;
    price_cents: number | null;
    currency: string;
    allergens: string[];
    dietary_tags: string[];
    is_signature: boolean;
    media: MediaRow | MediaRow[] | null;
  }>(
    (await db
      .from('menu_items')
      .select(
        `id, category_id, name, description, price_cents, currency, allergens, dietary_tags, is_signature, media:image_media_id (${MEDIA_COLUMNS})`,
      )
      .eq('site_id', siteId)
      .eq('is_available', true)
      .order('sort_order')) as never,
  );

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description,
    menuGroup: category.menu_group,
    items: items
      .filter((item) => item.category_id === category.id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        priceCents: item.price_cents,
        currency: item.currency,
        allergens: item.allergens ?? [],
        dietaryTags: item.dietary_tags ?? [],
        isSignature: item.is_signature,
        image: image(item.media),
      })),
  }));
}

async function loadForms(db: Db, siteId: string): Promise<FormView[]> {
  const forms = unwrapList<{
    id: string;
    slug: string;
    name: string;
    kind: string;
    description: string | null;
    success_message: string;
    honeypot_field: string;
    require_captcha: boolean;
  }>(
    (await db
      .from('forms')
      .select('id, slug, name, kind, description, success_message, honeypot_field, require_captcha')
      .eq('site_id', siteId)
      .eq('is_active', true)) as never,
  );
  if (forms.length === 0) return [];

  const fields = unwrapList<{
    form_id: string;
    name: string;
    label: string;
    type: string;
    placeholder: string | null;
    help_text: string | null;
    is_required: boolean;
    options: unknown;
  }>(
    (await db
      .from('form_fields')
      .select('form_id, name, label, type, placeholder, help_text, is_required, options')
      .in(
        'form_id',
        forms.map((form) => form.id),
      )
      .order('sort_order')) as never,
  );

  return forms.map((form) => ({
    id: form.id,
    slug: form.slug,
    name: form.name,
    kind: form.kind,
    description: form.description,
    successMessage: form.success_message,
    honeypotField: form.honeypot_field,
    requireCaptcha: form.require_captcha,
    fields: fields
      .filter((field) => field.form_id === form.id)
      .map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        placeholder: field.placeholder,
        helpText: field.help_text,
        isRequired: field.is_required,
        options: Array.isArray(field.options)
          ? (field.options as Array<{ value?: unknown; label?: unknown }>).map((option) => ({
              value: String(option?.value ?? ''),
              label: String(option?.label ?? option?.value ?? ''),
            }))
          : [],
      })),
  }));
}

async function loadEntries(db: Db, siteId: string): Promise<ContentEntryView[]> {
  const rows = unwrapList<{
    id: string;
    collection: string;
    title: string;
    slug: string;
    excerpt: string | null;
    attributes: Record<string, unknown>;
    tags: string[];
    published_at: string | null;
    media: MediaRow | MediaRow[] | null;
  }>(
    (await db
      .from('content_entries')
      .select(
        `id, collection, title, slug, excerpt, attributes, tags, published_at, media:cover_media_id (${MEDIA_COLUMNS})`,
      )
      .eq('site_id', siteId)
      .eq('is_visible', true)
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(120)) as never,
  );

  return rows.map((row) => ({
    id: row.id,
    collection: row.collection,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    cover: image(row.media),
    attributes: row.attributes ?? {},
    tags: row.tags ?? [],
    publishedAt: row.published_at,
  }));
}

async function loadBookingServices(db: Db, siteId: string): Promise<BookingServiceView[]> {
  const rows = unwrapList<{
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    capacity_per_slot: number;
    lead_time_hours: number;
    horizon_days: number;
    price_cents: number | null;
    deposit_cents: number | null;
  }>(
    (await db
      .from('booking_services')
      .select(
        'id, name, description, duration_minutes, capacity_per_slot, lead_time_hours, horizon_days, price_cents, deposit_cents',
      )
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('sort_order')) as never,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    capacityPerSlot: row.capacity_per_slot,
    leadTimeHours: row.lead_time_hours,
    horizonDays: row.horizon_days,
    priceCents: row.price_cents,
    depositCents: row.deposit_cents,
  }));
}

/**
 * Charge les collections demandees.
 *
 * Les lectures sont lancees en parallele : sur un reseau edge, la latence
 * domine, et serialiser six requetes couterait six aller-retours.
 */
export async function loadSiteData(siteId: string, needed: Set<Collection>): Promise<SiteData> {
  const data = emptySiteData();
  if (needed.size === 0) return data;
  const db = createServiceClient();

  const tasks: Array<Promise<void>> = [];

  if (needed.has('services')) {
    tasks.push(
      loadServices(db, siteId).then((rows) => {
        data.services = rows;
      }),
    );
  }

  if (needed.has('serviceAreas')) {
    tasks.push(
      (async () => {
        const rows = unwrapList<{
          label: string;
          city: string | null;
          postal_code: string | null;
          radius_km: number | null;
        }>(
          (await db
            .from('service_areas')
            .select('label, city, postal_code, radius_km')
            .eq('site_id', siteId)
            .order('sort_order')) as never,
        );
        data.serviceAreas = rows.map((row) => ({
          label: row.label,
          city: row.city,
          postalCode: row.postal_code,
          radiusKm: row.radius_km,
        }));
      })(),
    );
  }

  if (needed.has('menu')) {
    tasks.push(
      loadMenu(db, siteId).then((rows) => {
        data.menu = rows;
      }),
    );
  }

  if (needed.has('team')) {
    tasks.push(
      (async () => {
        const rows = unwrapList<{
          id: string;
          full_name: string;
          role_label: string | null;
          bio: string | null;
          email: string | null;
          phone: string | null;
          media: MediaRow | MediaRow[] | null;
        }>(
          (await db
            .from('team_members')
            .select(
              `id, full_name, role_label, bio, email, phone, media:photo_media_id (${MEDIA_COLUMNS})`,
            )
            .eq('site_id', siteId)
            .eq('is_visible', true)
            .order('sort_order')) as never,
        );
        data.team = rows.map((row) => ({
          id: row.id,
          fullName: row.full_name,
          roleLabel: row.role_label,
          bio: row.bio,
          photo: image(row.media),
          email: row.email,
          phone: row.phone,
        }));
      })(),
    );
  }

  if (needed.has('openingHours')) {
    tasks.push(
      (async () => {
        const rows = unwrapList<{
          day_of_week: number;
          opens_at: string;
          closes_at: string;
          service: string;
          label: string | null;
        }>(
          (await db
            .from('opening_hours')
            .select('day_of_week, opens_at, closes_at, service, label')
            .eq('site_id', siteId)
            .order('day_of_week')
            .order('sort_order')) as never,
        );
        data.openingHours = rows.map((row) => ({
          dayOfWeek: row.day_of_week,
          opensAt: row.opens_at.slice(0, 5),
          closesAt: row.closes_at.slice(0, 5),
          service: row.service,
          label: row.label,
        }));
      })(),
    );
  }

  if (needed.has('closures')) {
    tasks.push(
      (async () => {
        const rows = unwrapList<{ starts_on: string; ends_on: string; reason: string | null }>(
          (await db
            .from('closures')
            .select('starts_on, ends_on, reason')
            .eq('site_id', siteId)
            .order('starts_on')
            .limit(24)) as never,
        );
        data.closures = rows.map((row) => ({
          startsOn: row.starts_on,
          endsOn: row.ends_on,
          reason: row.reason,
        }));
      })(),
    );
  }

  if (needed.has('products')) {
    tasks.push(
      (async () => {
        const rows = unwrapList<{
          id: string;
          name: string;
          slug: string;
          description: string | null;
          price_cents: number;
          compare_at_price_cents: number | null;
          currency: string;
          images: unknown;
          track_inventory: boolean;
          stock_quantity: number;
          allow_backorder: boolean;
          is_featured: boolean;
        }>(
          (await db
            .from('products')
            .select(
              'id, name, slug, description, price_cents, compare_at_price_cents, currency, images, track_inventory, stock_quantity, allow_backorder, is_featured',
            )
            .eq('site_id', siteId)
            .eq('is_visible', true)
            .order('sort_order')
            .limit(96)) as never,
        );
        data.products = rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          priceCents: row.price_cents,
          compareAtPriceCents: row.compare_at_price_cents,
          currency: row.currency,
          image: firstImage(row.images),
          inStock: !row.track_inventory || row.stock_quantity > 0 || row.allow_backorder,
          isFeatured: row.is_featured,
        }));
      })(),
    );
  }

  if (needed.has('properties')) {
    tasks.push(
      (async () => {
        const rows = unwrapList<{
          id: string;
          reference: string | null;
          title: string;
          slug: string;
          description: string | null;
          transaction_kind: string;
          property_kind: string;
          price_cents: number | null;
          currency: string;
          surface_m2: number | null;
          rooms: number | null;
          bedrooms: number | null;
          energy_class: string | null;
          ghg_class: string | null;
          city: string | null;
          postal_code: string | null;
          status: string;
          images: unknown;
        }>(
          (await db
            .from('properties')
            .select(
              'id, reference, title, slug, description, transaction_kind, property_kind, price_cents, currency, surface_m2, rooms, bedrooms, energy_class, ghg_class, city, postal_code, status, images',
            )
            .eq('site_id', siteId)
            .eq('is_visible', true)
            .neq('status', 'draft')
            .order('sort_order')
            .limit(96)) as never,
        );
        data.properties = rows.map((row) => ({
          id: row.id,
          reference: row.reference,
          title: row.title,
          slug: row.slug,
          description: row.description,
          transactionKind: row.transaction_kind,
          propertyKind: row.property_kind,
          priceCents: row.price_cents,
          currency: row.currency,
          surfaceM2: row.surface_m2,
          rooms: row.rooms,
          bedrooms: row.bedrooms,
          energyClass: row.energy_class,
          ghgClass: row.ghg_class,
          city: row.city,
          postalCode: row.postal_code,
          status: row.status,
          image: firstImage(row.images),
        }));
      })(),
    );
  }

  if (needed.has('rooms')) {
    tasks.push(
      (async () => {
        const rows = unwrapList<{
          id: string;
          name: string;
          slug: string;
          description: string | null;
          capacity: number;
          bed_configuration: string | null;
          surface_m2: number | null;
          base_price_cents: number | null;
          currency: string;
          amenities: string[];
          images: unknown;
        }>(
          (await db
            .from('rooms')
            .select(
              'id, name, slug, description, capacity, bed_configuration, surface_m2, base_price_cents, currency, amenities, images',
            )
            .eq('site_id', siteId)
            .eq('is_visible', true)
            .order('sort_order')) as never,
        );
        data.rooms = rows.map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          description: row.description,
          capacity: row.capacity,
          bedConfiguration: row.bed_configuration,
          surfaceM2: row.surface_m2,
          basePriceCents: row.base_price_cents,
          currency: row.currency,
          amenities: row.amenities ?? [],
          image: firstImage(row.images),
        }));
      })(),
    );
  }

  if (needed.has('entries')) {
    tasks.push(
      loadEntries(db, siteId).then((rows) => {
        data.entries = rows;
      }),
    );
  }

  if (needed.has('bookingServices')) {
    tasks.push(
      loadBookingServices(db, siteId).then((rows) => {
        data.bookingServices = rows;
      }),
    );
  }

  if (needed.has('forms')) {
    tasks.push(
      loadForms(db, siteId).then((rows) => {
        data.forms = rows;
      }),
    );
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') {
      // Une collection indisponible ne doit pas faire tomber toute la page :
      // le bloc concerne ne s affichera simplement pas.
      console.error('[stax:site-runtime] chargement partiel des donnees', result.reason);
    }
  }

  return data;
}
