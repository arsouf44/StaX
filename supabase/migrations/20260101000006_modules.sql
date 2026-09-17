-- =============================================================================
--  StaX — 0006 · Modules metier
--  Formulaires, CRM, reservations, carte de restaurant, catalogue produits,
--  commandes e-commerce, horaires, services, equipe, biens, chambres.
--  Tables generiques pilotees par configuration : ajouter un metier n'ajoute
--  pas de table, seulement des lignes dans le catalogue.
-- =============================================================================

-- -----------------------------------------------------------------------------
--  Formulaires et boite de reception
-- -----------------------------------------------------------------------------
create table public.forms (
  id               uuid primary key default gen_random_uuid(),
  site_id          uuid not null references public.sites (id) on delete cascade,
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  slug             text not null,
  name             text not null,
  kind             text not null default 'contact',
  description      text,
  success_message  text not null default 'Merci, votre message a bien ete envoyé.',
  notify_emails    text[] not null default '{}',
  is_active        boolean not null default true,
  /** Anti-spam : champ piege invisible pour les robots. */
  honeypot_field   text not null default 'website_url',
  require_captcha  boolean not null default false,
  /** Soumissions autorisees par heure et par IP hachee. */
  rate_limit_per_hour int not null default 10,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint forms_kind_valid
    check (kind in ('contact','quote','reservation','newsletter','callback','application','custom')),
  constraint forms_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  constraint forms_rate_limit_sane check (rate_limit_per_hour between 1 and 1000)
);

create unique index forms_site_slug_key on public.forms (site_id, slug);
create index forms_org_idx on public.forms (organization_id);

create trigger forms_touch_updated_at
  before update on public.forms
  for each row execute function app.touch_updated_at();

create table public.form_fields (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.forms (id) on delete cascade,
  name         text not null,
  label        text not null,
  type         text not null default 'text',
  placeholder  text,
  help_text    text,
  is_required  boolean not null default false,
  options      jsonb not null default '[]'::jsonb,
  validation   jsonb not null default '{}'::jsonb,
  sort_order   int not null default 100,

  constraint form_fields_name_format check (name ~ '^[a-z][a-z0-9_]{0,40}$'),
  constraint form_fields_type_valid check (
    type in ('text','textarea','email','tel','number','date','time','datetime',
             'select','multiselect','radio','checkbox','file','hidden','consent')
  )
);

create unique index form_fields_form_name_key on public.form_fields (form_id, name);
create index form_fields_form_order_idx on public.form_fields (form_id, sort_order);

create table public.form_submissions (
  id              uuid primary key default app.uuid_v7(),
  form_id         uuid not null references public.forms (id) on delete cascade,
  site_id         uuid not null references public.sites (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id      uuid,

  /** Donnees saisies, validees contre la definition du formulaire. */
  data            jsonb not null default '{}'::jsonb,
  status          app.submission_status not null default 'unread',
  spam_score      numeric(4,3) not null default 0,

  /** Jamais d'IP complete conservee : uniquement un hache tronque. */
  ip_hash         text,
  user_agent_family text,
  referrer_host   text,
  locale          text,

  replied_at      timestamptz,
  replied_by      uuid references public.profiles (id) on delete set null,
  internal_note   text,
  read_at         timestamptz,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),

  constraint form_submissions_data_object check (jsonb_typeof(data) = 'object'),
  constraint form_submissions_spam_score_range check (spam_score between 0 and 1)
);

create index form_submissions_site_idx on public.form_submissions (site_id, created_at desc);
create index form_submissions_form_idx on public.form_submissions (form_id, created_at desc);
create index form_submissions_status_idx on public.form_submissions (site_id, status)
  where status = 'unread';

-- -----------------------------------------------------------------------------
--  CRM leger
-- -----------------------------------------------------------------------------
create table public.contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id         uuid references public.sites (id) on delete set null,

  first_name      text,
  last_name       text,
  email           text,
  phone           text,
  company         text,
  source          text not null default 'form',
  status          app.contact_status not null default 'new',
  tags            text[] not null default '{}',
  notes           text,
  /** Consentement marketing explicite (RGPD) avec sa preuve. */
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  last_contacted_at timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint contacts_identity_present check (
    email is not null or phone is not null or last_name is not null
  ),
  constraint contacts_source_valid
    check (source in ('form','booking','shop','manual','import','newsletter'))
);

create unique index contacts_org_email_key on public.contacts (organization_id, lower(email))
  where email is not null;
create index contacts_org_status_idx on public.contacts (organization_id, status);
create index contacts_search_idx on public.contacts
  using gin ((coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' ||
              coalesce(email,'') || ' ' || coalesce(company,'')) extensions.gin_trgm_ops);

create trigger contacts_touch_updated_at
  before update on public.contacts
  for each row execute function app.touch_updated_at();

alter table public.form_submissions
  add constraint form_submissions_contact_fk foreign key (contact_id)
    references public.contacts (id) on delete set null;

create table public.contact_notes (
  id          uuid primary key default app.uuid_v7(),
  contact_id  uuid not null references public.contacts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  body        text not null,
  author_id   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint contact_notes_body_bounded check (length(body) between 1 and 10000)
);

create index contact_notes_contact_idx on public.contact_notes (contact_id, created_at desc);

-- -----------------------------------------------------------------------------
--  Horaires d'ouverture et fermetures exceptionnelles
-- -----------------------------------------------------------------------------
create table public.opening_hours (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites (id) on delete cascade,
  /** 0 = dimanche … 6 = samedi (compatible ISO via conversion applicative). */
  day_of_week  smallint not null,
  opens_at     time not null,
  closes_at    time not null,
  /** Service : `lunch`, `dinner`, `all_day`… pour les cartes midi/soir. */
  service      text not null default 'all_day',
  label        text,
  sort_order   int not null default 100,

  constraint opening_hours_day_range check (day_of_week between 0 and 6),
  constraint opening_hours_order check (closes_at > opens_at),
  constraint opening_hours_service_valid
    check (service in ('all_day','morning','lunch','afternoon','dinner','night'))
);

create index opening_hours_site_idx on public.opening_hours (site_id, day_of_week, sort_order);

create table public.closures (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  reason      text,
  /** Bloque aussi les reservations sur la periode. */
  blocks_booking boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint closures_range_valid check (ends_on >= starts_on)
);

create index closures_site_range_idx on public.closures (site_id, starts_on, ends_on);

-- -----------------------------------------------------------------------------
--  Prestations et equipe (artisans, coiffeurs, services professionnels)
-- -----------------------------------------------------------------------------
create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name   text not null,
  role_label  text,
  bio         text,
  photo_media_id uuid references public.media (id) on delete set null,
  email       text,
  phone       text,
  /** Ce membre peut-il recevoir des reservations ? */
  accepts_bookings boolean not null default false,
  sort_order  int not null default 100,
  is_visible  boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index team_members_site_idx on public.team_members (site_id, sort_order);

create trigger team_members_touch_updated_at
  before update on public.team_members
  for each row execute function app.touch_updated_at();

create table public.services (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid not null references public.sites (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  category          text,
  name              text not null,
  slug              text not null,
  description       text,
  /** NULL = « sur devis ». */
  price_cents       integer,
  price_suffix      text,
  price_from        boolean not null default false,
  duration_minutes  int,
  image_media_id    uuid references public.media (id) on delete set null,
  is_bookable       boolean not null default false,
  is_emergency      boolean not null default false,
  sort_order        int not null default 100,
  is_visible        boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint services_price_non_negative check (price_cents is null or price_cents >= 0),
  constraint services_duration_sane check (duration_minutes is null or duration_minutes between 5 and 1440),
  constraint services_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$')
);

create unique index services_site_slug_key on public.services (site_id, slug);
create index services_site_order_idx on public.services (site_id, sort_order);

create trigger services_touch_updated_at
  before update on public.services
  for each row execute function app.touch_updated_at();

-- Zones d'intervention (artisans)
create table public.service_areas (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  label       text not null,
  postal_code text,
  city        text,
  radius_km   int,
  sort_order  int not null default 100,

  constraint service_areas_radius_sane check (radius_km is null or radius_km between 1 and 500)
);

create index service_areas_site_idx on public.service_areas (site_id, sort_order);

-- -----------------------------------------------------------------------------
--  Reservations — moteur generique (restaurant, coiffeur, hotel, RDV pro)
-- -----------------------------------------------------------------------------
create table public.booking_services (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references public.sites (id) on delete cascade,
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  service_id         uuid references public.services (id) on delete set null,
  name               text not null,
  description        text,
  duration_minutes   int not null default 60,
  buffer_minutes     int not null default 0,
  /** Capacite par creneau : couverts pour un restaurant, 1 pour un RDV. */
  capacity_per_slot  int not null default 1,
  /** Delai minimum avant reservation, en heures. */
  lead_time_hours    int not null default 2,
  /** Horizon maximum de reservation, en jours. */
  horizon_days       int not null default 90,
  requires_approval  boolean not null default true,
  deposit_cents      integer,
  price_cents        integer,
  is_active          boolean not null default true,
  sort_order         int not null default 100,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint booking_services_duration_sane check (duration_minutes between 5 and 1440),
  constraint booking_services_capacity_positive check (capacity_per_slot > 0),
  constraint booking_services_horizon_sane check (horizon_days between 1 and 730)
);

create index booking_services_site_idx on public.booking_services (site_id, sort_order);

create trigger booking_services_touch_updated_at
  before update on public.booking_services
  for each row execute function app.touch_updated_at();

create table public.availability_rules (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references public.sites (id) on delete cascade,
  booking_service_id uuid references public.booking_services (id) on delete cascade,
  team_member_id     uuid references public.team_members (id) on delete cascade,
  day_of_week        smallint not null,
  starts_at          time not null,
  ends_at            time not null,
  slot_interval_minutes int not null default 30,
  /** Capacite specifique a ce creneau (ex. 40 couverts au service du soir). */
  capacity           int,
  valid_from         date,
  valid_until        date,

  constraint availability_rules_day_range check (day_of_week between 0 and 6),
  constraint availability_rules_order check (ends_at > starts_at),
  constraint availability_rules_interval_sane check (slot_interval_minutes between 5 and 240)
);

create index availability_rules_site_idx on public.availability_rules (site_id, day_of_week);
create index availability_rules_service_idx on public.availability_rules (booking_service_id);

create table public.bookings (
  id                 uuid primary key default app.uuid_v7(),
  site_id            uuid not null references public.sites (id) on delete cascade,
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  booking_service_id uuid references public.booking_services (id) on delete set null,
  team_member_id     uuid references public.team_members (id) on delete set null,
  contact_id         uuid references public.contacts (id) on delete set null,
  reference          text not null,

  /** Toujours stocke en UTC ; le fuseau du site sert a l'affichage. */
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  party_size         int not null default 1,
  status             app.booking_status not null default 'pending',

  customer_name      text not null,
  customer_email     text,
  customer_phone     text,
  customer_note      text,
  internal_note      text,

  deposit_payment_id uuid references public.payments (id) on delete set null,
  confirmed_at       timestamptz,
  cancelled_at       timestamptz,
  cancellation_reason text,
  /** Jeton d'annulation cote client (HMAC stocke). */
  manage_token_hash  text,
  source             text not null default 'site',

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint bookings_range_valid check (ends_at > starts_at),
  constraint bookings_party_positive check (party_size > 0),
  constraint bookings_contact_present check (customer_email is not null or customer_phone is not null)
);

create unique index bookings_reference_key on public.bookings (site_id, reference);
create index bookings_site_start_idx on public.bookings (site_id, starts_at);
create index bookings_status_idx on public.bookings (site_id, status, starts_at);
create index bookings_member_idx on public.bookings (team_member_id, starts_at)
  where team_member_id is not null;

create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Carte de restaurant
-- -----------------------------------------------------------------------------
create table public.menu_categories (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites (id) on delete cascade,
  name         text not null,
  description  text,
  /** Carte midi, carte du soir, boissons, formules… */
  menu_group   text not null default 'main',
  sort_order   int not null default 100,
  is_visible   boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint menu_categories_group_valid
    check (menu_group in ('main','lunch','dinner','drinks','wine','dessert','brunch','set_menu','kids'))
);

create index menu_categories_site_idx on public.menu_categories (site_id, menu_group, sort_order);

create trigger menu_categories_touch_updated_at
  before update on public.menu_categories
  for each row execute function app.touch_updated_at();

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.menu_categories (id) on delete cascade,
  site_id       uuid not null references public.sites (id) on delete cascade,
  name          text not null,
  description   text,
  price_cents   integer,
  currency      char(3) not null default 'EUR',
  image_media_id uuid references public.media (id) on delete set null,
  /** Allergenes reglementaires (INCO) — liste controlee cote application. */
  allergens     text[] not null default '{}',
  dietary_tags  text[] not null default '{}',
  /** Options : cuisson, accompagnement, supplement (avec surcout eventuel). */
  options       jsonb not null default '[]'::jsonb,
  is_available  boolean not null default true,
  is_signature  boolean not null default false,
  sort_order    int not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint menu_items_price_non_negative check (price_cents is null or price_cents >= 0),
  constraint menu_items_options_array check (jsonb_typeof(options) = 'array')
);

create index menu_items_category_idx on public.menu_items (category_id, sort_order);
create index menu_items_site_idx on public.menu_items (site_id);

create trigger menu_items_touch_updated_at
  before update on public.menu_items
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Catalogue produits et commandes e-commerce
-- -----------------------------------------------------------------------------
create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  name        text not null,
  slug        text not null,
  description text,
  image_media_id uuid references public.media (id) on delete set null,
  sort_order  int not null default 100,
  is_visible  boolean not null default true,

  constraint product_categories_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$')
);

create unique index product_categories_site_slug_key on public.product_categories (site_id, slug);

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.sites (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id    uuid references public.product_categories (id) on delete set null,

  name           text not null,
  slug           text not null,
  description    text,
  /** Texte riche assaini a l'ecriture (aucun HTML arbitraire accepte). */
  long_description text,
  price_cents    integer not null,
  compare_at_price_cents integer,
  currency       char(3) not null default 'EUR',
  vat_rate_bps   integer not null default 2000,
  sku            text,

  track_inventory boolean not null default false,
  stock_quantity int not null default 0,
  allow_backorder boolean not null default false,

  weight_grams   int,
  images         jsonb not null default '[]'::jsonb,
  is_visible     boolean not null default true,
  is_featured    boolean not null default false,
  sort_order     int not null default 100,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint products_price_non_negative check (price_cents >= 0),
  constraint products_stock_non_negative check (stock_quantity >= 0),
  constraint products_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  constraint products_images_array check (jsonb_typeof(images) = 'array')
);

create unique index products_site_slug_key on public.products (site_id, slug);
create unique index products_site_sku_key on public.products (site_id, sku) where sku is not null;
create index products_site_visible_idx on public.products (site_id, is_visible, sort_order);

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function app.touch_updated_at();

create table public.product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete cascade,
  site_id        uuid not null references public.sites (id) on delete cascade,
  name           text not null,
  sku            text,
  /** { "Taille": "M", "Couleur": "Noir" } */
  options        jsonb not null default '{}'::jsonb,
  price_cents    integer,
  stock_quantity int not null default 0,
  is_active      boolean not null default true,
  sort_order     int not null default 100,

  constraint product_variants_price_non_negative check (price_cents is null or price_cents >= 0),
  constraint product_variants_stock_non_negative check (stock_quantity >= 0)
);

create index product_variants_product_idx on public.product_variants (product_id, sort_order);

create table public.shop_orders (
  id                uuid primary key default app.uuid_v7(),
  site_id           uuid not null references public.sites (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  contact_id        uuid references public.contacts (id) on delete set null,
  reference         text not null,

  status            app.shop_order_status not null default 'pending',
  subtotal_cents    integer not null default 0,
  shipping_cents    integer not null default 0,
  discount_cents    integer not null default 0,
  vat_cents         integer not null default 0,
  total_cents       integer not null default 0,
  currency          char(3) not null default 'EUR',

  customer_name     text not null,
  customer_email    text not null,
  customer_phone    text,
  shipping_address  jsonb,
  billing_address   jsonb,
  fulfillment_method text not null default 'pickup',
  customer_note     text,
  internal_note     text,

  /** Paiement encaisse sur le compte Stripe connecte du professionnel. */
  payment_id        uuid references public.payments (id) on delete set null,
  stripe_account_id text,
  manage_token_hash text,

  paid_at           timestamptz,
  fulfilled_at      timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint shop_orders_amounts_non_negative check (
    subtotal_cents >= 0 and shipping_cents >= 0 and discount_cents >= 0
    and vat_cents >= 0 and total_cents >= 0
  ),
  constraint shop_orders_fulfillment_valid
    check (fulfillment_method in ('pickup','delivery','shipping','digital')),
  constraint shop_orders_email_format check (customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create unique index shop_orders_site_reference_key on public.shop_orders (site_id, reference);
create index shop_orders_site_status_idx on public.shop_orders (site_id, status, created_at desc);

create trigger shop_orders_touch_updated_at
  before update on public.shop_orders
  for each row execute function app.touch_updated_at();

alter table public.payments
  add constraint payments_shop_order_fk foreign key (shop_order_id)
    references public.shop_orders (id) on delete set null;

create table public.shop_order_items (
  id             uuid primary key default gen_random_uuid(),
  shop_order_id  uuid not null references public.shop_orders (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,
  variant_id     uuid references public.product_variants (id) on delete set null,
  /** Copie du libelle et du prix au moment de la commande. */
  name           text not null,
  variant_label  text,
  quantity       int not null default 1,
  unit_price_cents integer not null,
  total_cents    integer not null,
  vat_rate_bps   integer not null default 2000,

  constraint shop_order_items_quantity_positive check (quantity > 0),
  constraint shop_order_items_price_non_negative check (unit_price_cents >= 0)
);

create index shop_order_items_order_idx on public.shop_order_items (shop_order_id);

-- -----------------------------------------------------------------------------
--  Biens immobiliers et chambres — modules metier specialises
-- -----------------------------------------------------------------------------
create table public.properties (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null references public.sites (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  reference      text,
  title          text not null,
  slug           text not null,
  description    text,
  transaction_kind text not null default 'sale',
  property_kind  text not null default 'apartment',
  price_cents    bigint,
  currency       char(3) not null default 'EUR',
  surface_m2     numeric(8,2),
  land_surface_m2 numeric(10,2),
  rooms          int,
  bedrooms       int,
  bathrooms      int,
  floor          int,
  energy_class   char(1),
  ghg_class      char(1),
  city           text,
  postal_code    text,
  features       text[] not null default '{}',
  images         jsonb not null default '[]'::jsonb,
  status         text not null default 'available',
  is_visible     boolean not null default true,
  sort_order     int not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint properties_transaction_valid check (transaction_kind in ('sale','rent','seasonal')),
  constraint properties_status_valid check (status in ('available','under_offer','sold','rented','draft')),
  constraint properties_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  constraint properties_energy_class_valid
    check (energy_class is null or energy_class in ('A','B','C','D','E','F','G'))
);

create unique index properties_site_slug_key on public.properties (site_id, slug);
create index properties_site_status_idx on public.properties (site_id, status, sort_order);

create trigger properties_touch_updated_at
  before update on public.properties
  for each row execute function app.touch_updated_at();

create table public.rooms (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null,
  slug            text not null,
  description     text,
  capacity        int not null default 2,
  bed_configuration text,
  surface_m2      numeric(6,2),
  base_price_cents integer,
  currency        char(3) not null default 'EUR',
  amenities       text[] not null default '{}',
  images          jsonb not null default '[]'::jsonb,
  quantity        int not null default 1,
  is_visible      boolean not null default true,
  sort_order      int not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint rooms_capacity_positive check (capacity > 0),
  constraint rooms_quantity_positive check (quantity > 0),
  constraint rooms_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$')
);

create unique index rooms_site_slug_key on public.rooms (site_id, slug);

create trigger rooms_touch_updated_at
  before update on public.rooms
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
--  Contenus editoriaux generiques : actualites, evenements, realisations, avis
-- -----------------------------------------------------------------------------
create table public.content_entries (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  /** article | event | portfolio | testimonial | faq | job */
  collection      text not null,
  title           text not null,
  slug            text not null,
  excerpt         text,
  /** Contenu riche stocke en blocs structures, jamais en HTML libre. */
  body            jsonb not null default '[]'::jsonb,
  cover_media_id  uuid references public.media (id) on delete set null,
  /** Champs specifiques a la collection (date d'evenement, note d'avis…). */
  attributes      jsonb not null default '{}'::jsonb,
  tags            text[] not null default '{}',
  published_at    timestamptz,
  is_visible      boolean not null default true,
  sort_order      int not null default 100,
  author_id       uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint content_entries_collection_valid
    check (collection in ('article','event','portfolio','testimonial','faq','job','announcement')),
  constraint content_entries_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  constraint content_entries_body_array check (jsonb_typeof(body) = 'array')
);

create unique index content_entries_site_collection_slug_key
  on public.content_entries (site_id, collection, slug);
create index content_entries_site_published_idx
  on public.content_entries (site_id, collection, published_at desc);

create trigger content_entries_touch_updated_at
  before update on public.content_entries
  for each row execute function app.touch_updated_at();
