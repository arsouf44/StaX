/**
 * Jeu de donnees de demonstration.
 *
 * ============================== HONNETETE ================================
 *
 * Tout ce que ce script cree porte `is_demo = true` et un nom qui ne laisse
 * aucun doute. Aucune de ces entreprises n'existe. Le moteur des sites publics
 * affiche un bandeau « site de demonstration — entreprise fictive » sur chacune
 * d'elles, et le fichier robots.txt de ces sites interdit leur indexation.
 *
 * Ce que le script ne fait JAMAIS :
 *   - creer un compte avec un role de plateforme ;
 *   - simuler un paiement, une commande payee ou un abonnement actif ;
 *   - produire des statistiques inventees ;
 *   - s'executer en production.
 *
 * Usage : pnpm db:seed
 * ==========================================================================
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly, deployEnvironment, readEnv } from '@stax/config';
import { loadRootEnv } from '@stax/config/dotenv';
import { resolveBusiness } from '@stax/business';
import { createBlock } from '@stax/site-engine';

/**
 * Les variables viennent de `.env.local` a la racine du depot (copie de
 * `.env.example`) ou de l environnement d execution. Une variable deja definie
 * — `VAR=... pnpm <script>`, secret de CI — n est jamais ecrasee.
 */
loadRootEnv(import.meta.dirname);

assertServerOnly('scripts/seed-demo');

function say(message: string): void {
  process.stdout.write(`${message}\n`);
}

function fail(message: string): never {
  process.stderr.write(`\n[StaX] ${message}\n\n`);
  process.exit(1);
}

if (deployEnvironment() === 'production' && readEnv('STAX_ALLOW_DEMO_SEED') !== 'true') {
  fail(
    'Refus de creer des donnees de demonstration en production.\n' +
      'Si c’est reellement voulu (vitrine publique), definissez STAX_ALLOW_DEMO_SEED=true.',
  );
}

const supabaseUrl = readEnv('SUPABASE_URL');
const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseUrl || !serviceKey) {
  fail('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.');
}

const db: SupabaseClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* -------------------------------------------------------------------------- */
/*  Les trois vitrines                                                         */
/* -------------------------------------------------------------------------- */

interface DemoSite {
  slug: string;
  organizationName: string;
  businessType: string;
  planSlug: string;
  settings: {
    business_name: string;
    tagline: string;
    description: string;
    email: string;
    phone: string;
    address_line1: string;
    postal_code: string;
    city: string;
  };
  theme: { preset: string; fontHeading: string; fontBody: string };
  hero: { eyebrow: string; title: string; subtitle: string };
  features: Array<{ title: string; description: string }>;
}

const DEMOS: DemoSite[] = [
  {
    slug: 'demo-restaurant',
    organizationName: 'Démonstration — Restaurant',
    businessType: 'restaurant',
    planSlug: 'premium',
    settings: {
      business_name: 'La Table de Démonstration',
      tagline: 'Cuisine de saison, produits du marché',
      description:
        'Établissement fictif créé pour illustrer les possibilités de la plateforme StaX. ' +
        'Aucune réservation ne sera honorée.',
      email: 'demo@exemple.test',
      phone: '00 00 00 00 00',
      address_line1: '1 rue de la Démonstration',
      postal_code: '00000',
      city: 'Ville-Exemple',
    },
    theme: { preset: 'ember', fontHeading: 'fraunces', fontBody: 'inter' },
    hero: {
      eyebrow: 'Site de démonstration',
      title: 'Une cuisine de saison, au rythme du marché',
      subtitle:
        'Cette page illustre ce que reçoit un restaurant : carte, horaires, réservation et galerie. ' +
        'L’établissement présenté est fictif.',
    },
    features: [
      {
        title: 'Carte modifiable en autonomie',
        description:
          'Plats, prix, allergènes et suggestions du jour se changent depuis l’espace client, sans nous solliciter.',
      },
      {
        title: 'Réservations en ligne',
        description:
          'Les créneaux proposés tiennent compte de la capacité réelle, des fermetures et du délai minimal.',
      },
      {
        title: 'Horaires toujours justes',
        description:
          'Les horaires affichés sur le site sont ceux saisis dans l’espace client, et sont publiés en données structurées pour les moteurs de recherche.',
      },
    ],
  },
  {
    slug: 'demo-coiffeur',
    organizationName: 'Démonstration — Salon de coiffure',
    businessType: 'coiffeur',
    planSlug: 'essentiel',
    settings: {
      business_name: 'Atelier de Démonstration',
      tagline: 'Coupe, couleur et conseil',
      description:
        'Salon fictif créé pour illustrer la plateforme StaX. Aucun rendez-vous ne sera honoré.',
      email: 'demo@exemple.test',
      phone: '00 00 00 00 00',
      address_line1: '2 avenue de l’Exemple',
      postal_code: '00000',
      city: 'Ville-Exemple',
    },
    theme: { preset: 'lumen', fontHeading: 'sora', fontBody: 'inter' },
    hero: {
      eyebrow: 'Site de démonstration',
      title: 'Prendre rendez-vous en trois clics',
      subtitle:
        'Cette page illustre ce que reçoit un salon : prestations tarifées, équipe, prise de rendez-vous et galerie.',
    },
    features: [
      {
        title: 'Prestations et tarifs à jour',
        description:
          'Chaque prestation porte sa durée et son prix. Une modification est en ligne immédiatement.',
      },
      {
        title: 'Rendez-vous par praticien',
        description:
          'Les disponibilités sont calculées côté serveur : deux personnes ne peuvent pas réserver le même créneau.',
      },
      {
        title: 'Rappels automatiques',
        description: 'Le client reçoit une confirmation, puis un rappel avant son rendez-vous.',
      },
    ],
  },
  {
    slug: 'demo-artisan',
    organizationName: 'Démonstration — Artisan',
    businessType: 'plombier',
    planSlug: 'essentiel',
    settings: {
      business_name: 'Démonstration Plomberie',
      tagline: 'Dépannage, installation, rénovation',
      description:
        'Entreprise fictive créée pour illustrer la plateforme StaX. Aucune intervention ne sera réalisée.',
      email: 'demo@exemple.test',
      phone: '00 00 00 00 00',
      address_line1: '3 impasse du Modèle',
      postal_code: '00000',
      city: 'Ville-Exemple',
    },
    theme: { preset: 'slate', fontHeading: 'ibm-plex-sans', fontBody: 'ibm-plex-sans' },
    hero: {
      eyebrow: 'Site de démonstration',
      title: 'Un dépannage, une intervention, un devis',
      subtitle:
        'Cette page illustre ce que reçoit un artisan : prestations, zones d’intervention, réalisations et demande de devis.',
    },
    features: [
      {
        title: 'Zones d’intervention explicites',
        description:
          'Les communes couvertes sont affichées et publiées pour le référencement local.',
      },
      {
        title: 'Demandes de devis qualifiées',
        description:
          'Le formulaire pose les bonnes questions dès le départ : moins d’allers-retours, des devis plus justes.',
      },
      {
        title: 'Réalisations avant / après',
        description: 'La preuve la plus convaincante pour un artisan, mise en avant sur la page.',
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */

async function ensureOrganization(demo: DemoSite): Promise<string> {
  const slug = `${demo.slug}-org`;
  const { data: existing } = await db
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('organizations')
    .insert({
      name: demo.organizationName,
      slug,
      status: 'active',
      is_demo: true,
      city: demo.settings.city,
      sector_slug: resolveBusiness(demo.businessType).sector,
      business_type_slug: demo.businessType,
    })
    .select('id')
    .single();

  if (error || !data) fail(`Organisation de demonstration impossible : ${error?.message}`);
  return data.id as string;
}

async function ensureSite(demo: DemoSite, organizationId: string): Promise<string> {
  const { data: existing } = await db
    .from('sites')
    .select('id')
    .eq('slug', demo.slug)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data, error } = await db
    .from('sites')
    .insert({
      organization_id: organizationId,
      name: demo.settings.business_name,
      slug: demo.slug,
      status: 'draft',
      business_type_slug: demo.businessType,
      plan_slug: demo.planSlug,
      is_demo: true,
    })
    .select('id')
    .single();

  if (error || !data) fail(`Site de demonstration impossible : ${error?.message}`);
  return data.id as string;
}

/** Bloc pret a inserer, avec ses valeurs par defaut validees par son schema. */
function block(type: string, props: Record<string, unknown>, sortOrder: number) {
  const created = createBlock(type);
  if (!created) fail(`Type de bloc inconnu dans le jeu de demonstration : ${type}`);
  return {
    type: created.type,
    version: created.version,
    props: { ...created.props, ...props },
    settings: created.settings,
    sort_order: sortOrder,
  };
}

async function seedDemo(demo: DemoSite): Promise<void> {
  const business = resolveBusiness(demo.businessType);
  const organizationId = await ensureOrganization(demo);
  const siteId = await ensureSite(demo, organizationId);

  await db.from('site_settings').upsert(
    {
      site_id: siteId,
      ...demo.settings,
      country: 'FR',
      // Un site de demonstration ne doit jamais etre indexe : il
      // cannibaliserait le referencement d un vrai commercant.
      robots_indexable: false,
      enabled_modules: business.modules,
      navigation: {
        primary: business.recommendedPages
          .filter((page) => page.showInNav)
          .map((page) => ({ label: page.title, path: page.path })),
        footer: [],
      },
      analytics_enabled: false,
      cookie_banner_enabled: false,
    },
    { onConflict: 'site_id' },
  );

  await db.from('site_themes').upsert(
    {
      site_id: siteId,
      preset: demo.theme.preset,
      font_heading: demo.theme.fontHeading,
      font_body: demo.theme.fontBody,
      tokens: {},
    },
    { onConflict: 'site_id' },
  );

  // Adresse de demonstration, sous le domaine des sous-domaines clients.
  await db.from('site_domains').upsert(
    {
      site_id: siteId,
      hostname: `${demo.slug}.${readEnv('NEXT_PUBLIC_SITES_DOMAIN') ?? 'sites.stax.fr'}`,
      kind: 'subdomain',
      status: 'active',
      is_primary: true,
      ssl_status: 'active',
      verified_at: new Date().toISOString(),
    },
    { onConflict: 'hostname' },
  );

  // Les pages proviennent du blueprint du METIER : le jeu de demonstration
  // montre donc exactement ce qu un vrai client recevrait.
  for (const [index, blueprint] of business.recommendedPages.entries()) {
    const { data: page } = await db
      .from('site_pages')
      .upsert(
        {
          site_id: siteId,
          path: blueprint.path,
          title: blueprint.title,
          kind: blueprint.kind,
          locale: 'fr',
          robots_indexable: false,
          is_visible_in_nav: blueprint.showInNav,
          sort_order: index * 10,
          is_published: true,
        },
        { onConflict: 'site_id,path' },
      )
      .select('id')
      .single();

    if (!page) continue;

    // On ne reconstruit pas une page deja remplie : le script est rejouable.
    const { count } = await db
      .from('page_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('page_id', page.id);
    if ((count ?? 0) > 0) continue;

    const blocks = blueprint.blocks.map((type, position) => {
      if (type === 'hero') {
        return block(
          'hero',
          {
            eyebrow: demo.hero.eyebrow,
            title: blueprint.path === '/' ? demo.hero.title : blueprint.title,
            subtitle: blueprint.path === '/' ? demo.hero.subtitle : '',
            layout: 'centered',
          },
          position * 10,
        );
      }
      if (type === 'features') {
        return block(
          'features',
          {
            title: 'Ce que ce site permet',
            items: demo.features.map((feature) => ({
              icon: 'check',
              title: feature.title,
              description: feature.description,
            })),
            columns: 3,
          },
          position * 10,
        );
      }
      if (type === 'section-heading') {
        return block('section-heading', { title: blueprint.title }, position * 10);
      }
      return block(type, {}, position * 10);
    });

    const rows = blocks
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
      .map((entry) => ({ ...entry, page_id: page.id, site_id: siteId }));

    if (rows.length > 0) await db.from('page_blocks').insert(rows);
  }

  // Formulaire de contact, comme sur un vrai site.
  const { data: form } = await db
    .from('forms')
    .upsert(
      {
        site_id: siteId,
        organization_id: organizationId,
        slug: 'contact',
        name: 'Contact',
        kind: 'contact',
        success_message: 'Merci, votre message a bien été envoyé.',
      },
      { onConflict: 'site_id,slug' },
    )
    .select('id')
    .single();

  if (form) {
    await db.from('form_fields').upsert(
      [
        {
          form_id: form.id,
          name: 'nom',
          label: 'Votre nom',
          type: 'text',
          is_required: true,
          sort_order: 10,
        },
        {
          form_id: form.id,
          name: 'email',
          label: 'Votre e-mail',
          type: 'email',
          is_required: true,
          sort_order: 20,
        },
        {
          form_id: form.id,
          name: 'telephone',
          label: 'Votre téléphone',
          type: 'tel',
          is_required: false,
          sort_order: 30,
        },
        {
          form_id: form.id,
          name: 'message',
          label: 'Votre message',
          type: 'textarea',
          is_required: true,
          sort_order: 40,
        },
      ],
      { onConflict: 'form_id,name' },
    );
  }

  // Publication : le site de demonstration doit etre reellement consultable.
  const { error: publishError } = await db.rpc('publish_site', {
    p_site: siteId,
    p_label: 'Jeu de démonstration',
  });
  if (publishError) {
    say(`  ! publication impossible pour ${demo.slug} : ${publishError.message}`);
  }

  say(`  ✓ ${demo.organizationName} (${demo.slug})`);
}

async function main(): Promise<void> {
  say('');
  say('Création des sites de démonstration.');
  say('Toutes les entreprises créées sont FICTIVES et marquées comme telles.');
  say('');

  for (const demo of DEMOS) {
    await seedDemo(demo);
  }

  say('');
  say('Terminé.');
  say('Ces sites ne sont pas indexables et affichent un bandeau de démonstration.');
  say('');
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : 'Echec du jeu de demonstration.');
});
