import { getModule, resolveBusiness, type BusinessDefinition } from '@stax/business';
import { createBlock, getBlockDefinition, type ParsedBlock } from './blocks/registry';
import { getPreset } from './theme';

/**
 * Instanciation d un site a partir d un metier.
 *
 * Un nouveau site nait d un modele : pages recommandees, blocs pre-remplis
 * avec des textes francais adaptes au metier, theme conseille, formulaires qui
 * fonctionnent des le premier jour. Le contenu devient ensuite totalement
 * independant du modele.
 *
 * Deux regles :
 *  - AUCUNE donnee inventee. Pas de faux avis, pas de faux chiffre, pas de
 *    Lorem Ipsum. Un texte d amorce dit ce qu il faut ecrire, avec les mots du
 *    metier, et le client le remplace ;
 *  - AUCUNE section orpheline. Une section dont le module n est pas actif
 *    (une carte de restaurant sur une offre qui ne la comprend pas) n est pas
 *    creee, et aucun lien ne pointe vers une page absente.
 */

export interface TemplatePage {
  path: string;
  title: string;
  kind: string;
  showInNav: boolean;
  sortOrder: number;
  blocks: ParsedBlock[];
}

export interface TemplateFormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'email' | 'tel' | 'select' | 'consent';
  required: boolean;
  placeholder?: string;
}

export interface TemplateForm {
  slug: string;
  name: string;
  kind: 'contact' | 'quote' | 'newsletter';
  successMessage: string;
  fields: TemplateFormField[];
}

export interface SiteTemplate {
  businessTypeSlug: string;
  theme: { preset: string; fontHeading: string; fontBody: string; accent: string };
  modules: readonly string[];
  pages: TemplatePage[];
  navigation: {
    primary: { label: string; path: string }[];
    footer: { label: string; path: string }[];
  };
  forms: TemplateForm[];
}

export interface TemplateOptions {
  /**
   * Modules reellement actifs pour ce site (metier ∩ offre). A defaut, tous
   * les modules du metier.
   */
  enabledModules?: readonly string[];
  /** Nom commercial, pour personnaliser les textes d amorce. */
  businessName?: string | null;
  /** Phrase d accroche saisie a la commande, reprise telle quelle. */
  pitch?: string | null;
  city?: string | null;
}

/**
 * Accroches propres a un metier, quand celle du secteur sonnerait faux : une
 * boulangerie ne « reserve pas de table », un caviste n a pas de « cuisine ».
 */
const BUSINESS_HERO: Record<string, string> = {
  pizzeria: 'Nos pizzas, faites maison',
  brasserie: 'Une brasserie où l’on se sent bien',
  bar: 'Un lieu pour se retrouver',
  cafe: 'Une pause qui fait du bien',
  boulangerie: 'Du bon pain, chaque matin',
  patisserie: 'Des pâtisseries faites maison',
  traiteur: 'Vos réceptions, préparées avec soin',
  'food-truck': 'Notre cuisine vient à vous',
  boucherie: 'Des viandes choisies avec soin',
  caviste: 'Des vins choisis pour vous',
};

const SHOP_LIKE = new Set(['boulangerie', 'patisserie', 'boucherie', 'caviste']);

/**
 * Pages du secteur « restauration » renommees pour les metiers qui ne sont
 * pas des restaurants : une boulangerie a une boutique et des produits, pas
 * « Le restaurant » et « La carte ».
 */
const PAGE_RENAMES: Record<string, Record<string, { path: string; title: string }>> = {
  boulangerie: {
    '/le-restaurant': { path: '/la-boutique', title: 'La boutique' },
    '/carte': { path: '/nos-produits', title: 'Nos produits' },
  },
  patisserie: {
    '/le-restaurant': { path: '/la-boutique', title: 'La boutique' },
    '/carte': { path: '/nos-creations', title: 'Nos créations' },
  },
  boucherie: {
    '/le-restaurant': { path: '/la-boutique', title: 'La boutique' },
    '/carte': { path: '/nos-produits', title: 'Nos produits' },
  },
  caviste: {
    '/le-restaurant': { path: '/la-cave', title: 'La cave' },
    '/carte': { path: '/nos-vins', title: 'Nos vins' },
  },
  traiteur: {
    '/le-restaurant': { path: '/qui-sommes-nous', title: 'Qui sommes-nous' },
    '/carte': { path: '/nos-formules', title: 'Nos formules' },
  },
  'food-truck': { '/le-restaurant': { path: '/notre-histoire', title: 'Notre histoire' } },
  bar: { '/le-restaurant': { path: '/le-lieu', title: 'Le lieu' } },
  cafe: { '/le-restaurant': { path: '/le-lieu', title: 'Le lieu' } },
};

/** Textes d amorce par metier. Jamais de faux chiffre, jamais de Lorem Ipsum. */
function heroCopy(
  business: BusinessDefinition,
  modules: ReadonlySet<string>,
): { title: string; subtitle: string } {
  const sector = business.sector;
  const name = business.name.toLowerCase();

  if (sector === 'restauration') {
    const title = BUSINESS_HERO[business.id] ?? 'Une cuisine qui vous ressemble';
    if (SHOP_LIKE.has(business.id)) {
      return {
        title,
        subtitle: modules.has('ecommerce')
          ? 'Nos produits, nos horaires et la commande en ligne, à retirer en boutique.'
          : 'Nos produits, nos horaires et comment venir nous voir.',
      };
    }
    if (business.id === 'traiteur') {
      return {
        title,
        subtitle: 'Nos formules, nos réalisations, et un devis rapide pour votre événement.',
      };
    }
    if (business.id === 'food-truck') {
      return { title, subtitle: 'Nos plats, nos emplacements de la semaine et nos horaires.' };
    }
    return {
      title,
      subtitle: modules.has('booking')
        ? 'Découvrez notre carte, nos horaires et réservez votre table en quelques secondes.'
        : 'Découvrez notre carte, nos horaires et comment venir nous voir.',
    };
  }
  if (sector === 'beaute-bien-etre') {
    return {
      title: 'Prenez soin de vous',
      subtitle:
        'Nos prestations, nos tarifs et nos disponibilités. Prenez rendez-vous en ligne, à toute heure.',
    };
  }
  if (sector === 'artisanat') {
    return {
      title: 'Un artisan sur qui compter',
      subtitle:
        'Devis gratuit, intervention rapide et travail soigné. Décrivez votre besoin, nous vous rappelons.',
    };
  }
  if (sector === 'commerce') {
    return {
      title: 'Notre boutique, en ligne aussi',
      subtitle: 'Parcourez notre sélection, commandez et retirez sur place ou faites-vous livrer.',
    };
  }
  if (sector === 'immobilier') {
    return {
      title: 'Votre projet immobilier, accompagné',
      subtitle:
        'Consultez nos biens disponibles ou demandez une estimation gratuite de votre logement.',
    };
  }
  if (sector === 'hebergement-tourisme') {
    return {
      title: 'Un séjour dont on se souvient',
      subtitle:
        'Nos chambres, nos services et nos disponibilités. Réservez directement, sans intermédiaire.',
    };
  }
  if (sector === 'sante') {
    return {
      title: 'Votre santé entre de bonnes mains',
      subtitle: 'Informations pratiques, soins proposés et prise de rendez-vous en ligne.',
    };
  }
  if (sector === 'associations') {
    return {
      title: 'Agissons ensemble',
      subtitle: 'Nos actions, nos événements et toutes les façons de nous rejoindre.',
    };
  }
  return {
    title: `Votre ${name}, à votre service`,
    subtitle:
      'Présentez votre activité, vos prestations et vos coordonnées. Vos clients vous trouvent et vous contactent.',
  };
}

function ctaCopy(modules: ReadonlySet<string>): { title: string; subtitle: string; label: string } {
  if (modules.has('booking')) {
    return {
      title: 'Réservez en quelques secondes',
      subtitle: 'Choisissez votre créneau, nous confirmons rapidement.',
      label: 'Réserver',
    };
  }
  if (modules.has('quotes')) {
    return {
      title: 'Parlons de votre projet',
      subtitle: 'Décrivez votre besoin, nous revenons vers vous avec un devis clair.',
      label: 'Demander un devis',
    };
  }
  return {
    title: 'Une question ?',
    subtitle: 'Écrivez-nous, nous répondons rapidement.',
    label: 'Nous contacter',
  };
}

function buildBlock(
  type: string,
  overrides: Record<string, unknown> = {},
  settings: Record<string, unknown> = {},
): ParsedBlock | null {
  const block = createBlock(type);
  if (!block) return null;
  return {
    ...block,
    props: { ...block.props, ...overrides },
    settings: { ...block.settings, ...settings },
  };
}

/** Une section est-elle permise par les modules actifs ? */
function blockAllowed(type: string, modules: ReadonlySet<string>): boolean {
  const definition = getBlockDefinition(type);
  if (!definition) return false;
  return definition.requiresModule === null || modules.has(definition.requiresModule);
}

const CONTACT_FORM: TemplateForm = {
  slug: 'contact',
  name: 'Formulaire de contact',
  kind: 'contact',
  successMessage: 'Merci, votre message a bien été envoyé. Nous vous répondons rapidement.',
  fields: [
    { name: 'name', label: 'Votre nom', type: 'text', required: true },
    { name: 'email', label: 'Votre adresse e-mail', type: 'email', required: true },
    { name: 'phone', label: 'Votre téléphone', type: 'tel', required: false },
    { name: 'message', label: 'Votre message', type: 'textarea', required: true },
  ],
};

const QUOTE_FORM: TemplateForm = {
  slug: 'devis',
  name: 'Demande de devis',
  kind: 'quote',
  successMessage: 'Merci, votre demande de devis est bien arrivée. Nous revenons vers vous vite.',
  fields: [
    { name: 'name', label: 'Votre nom', type: 'text', required: true },
    { name: 'email', label: 'Votre adresse e-mail', type: 'email', required: true },
    { name: 'phone', label: 'Votre téléphone', type: 'tel', required: true },
    { name: 'city', label: 'Commune de l’intervention', type: 'text', required: false },
    { name: 'message', label: 'Décrivez votre besoin', type: 'textarea', required: true },
  ],
};

const NEWSLETTER_FORM: TemplateForm = {
  slug: 'newsletter',
  name: 'Inscription aux actualités',
  kind: 'newsletter',
  successMessage: 'Merci, votre inscription est bien enregistrée.',
  fields: [{ name: 'email', label: 'Votre adresse e-mail', type: 'email', required: true }],
};

/**
 * Pages legales.
 *
 * Leur contenu n est PAS du texte fige : les sections « Mentions légales »,
 * « Politique de confidentialité » et « Conditions générales de vente » sont
 * rendues a partir de l identite legale saisie dans « Mon entreprise » et des
 * fonctionnalites actives du site. Rien n est invente : tant qu une mention
 * obligatoire manque, la verification avant publication bloque et dit ou la
 * saisir.
 */
function legalPages(
  sortOrder: number,
  options: { sellsOnline: boolean; perishable: boolean },
): TemplatePage[] {
  const pages: TemplatePage[] = [];
  const heading = (title: string) => buildBlock('section-heading', { title });
  const entries: Array<[string, string, ParsedBlock | null]> = [
    ['/mentions-legales', 'Mentions légales', buildBlock('legal-notice')],
    ['/confidentialite', 'Confidentialité', buildBlock('privacy-notice')],
  ];
  if (options.sellsOnline) {
    entries.push([
      '/conditions-generales-de-vente',
      'Conditions générales de vente',
      buildBlock('sales-terms', { perishable: options.perishable }),
    ]);
  }

  entries.forEach(([path, title, body], index) => {
    const head = heading(title);
    if (!head || !body) return;
    pages.push({
      path,
      title,
      kind: 'legal',
      showInNav: false,
      sortOrder: sortOrder + index * 10,
      blocks: [head, body],
    });
  });
  return pages;
}

export function buildTemplateForBusiness(
  businessTypeSlug: string,
  options: TemplateOptions = {},
): SiteTemplate {
  const business = resolveBusiness(businessTypeSlug);
  const modules = new Set<string>(options.enabledModules ?? business.modules);
  const hero = heroCopy(business, modules);
  const cta = ctaCopy(modules);
  const businessName = options.businessName?.trim() || business.name;
  const pitch = options.pitch?.trim() || null;

  // Pages retenues : celles dont il reste au moins une section permise.
  const renames = PAGE_RENAMES[business.id] ?? {};
  const menuPath = renames['/carte']?.path ?? '/carte';
  const menuLabel = renames['/carte']?.title ?? 'Voir la carte';
  const blueprints = business.recommendedPages
    .map((blueprint) => ({
      ...blueprint,
      ...(renames[blueprint.path] ?? {}),
      blocks: blueprint.blocks.filter((type) => blockAllowed(type, modules)),
    }))
    .filter(
      (blueprint) =>
        blueprint.path === '/' ||
        blueprint.blocks.some((type) => type !== 'section-heading' && type !== 'rich-text') ||
        blueprint.blocks.includes('rich-text'),
    );

  const existingPaths = new Set(blueprints.map((blueprint) => blueprint.path));
  const contactPath = existingPaths.has('/contact') ? '/contact' : null;
  const quotePath = existingPaths.has('/devis') ? '/devis' : contactPath;

  const secondaryAction =
    modules.has('services') && existingPaths.has('/prestations')
      ? { label: 'Nos prestations', href: '/prestations', style: 'secondary', external: false }
      : modules.has('restaurant-menu') && existingPaths.has(menuPath)
        ? { label: menuLabel, href: menuPath, style: 'secondary', external: false }
        : null;

  const primaryHref = cta.label === 'Demander un devis' ? quotePath : contactPath;

  const pages: TemplatePage[] = blueprints.map((blueprint, index) => {
    const blocks: ParsedBlock[] = [];

    for (const blockType of blueprint.blocks) {
      let overrides: Record<string, unknown> = {};

      if (blockType === 'hero') {
        overrides = {
          eyebrow: options.city ? `${business.name} à ${options.city}` : business.name,
          title: blueprint.path === '/' ? hero.title : blueprint.title,
          subtitle: pitch ?? hero.subtitle,
          layout: business.sector === 'restauration' ? 'overlay' : 'split',
          actions: [
            ...(primaryHref
              ? [{ label: cta.label, href: primaryHref, style: 'primary', external: false }]
              : []),
            ...(secondaryAction ? [secondaryAction] : []),
          ],
        };
      } else if (blockType === 'cta') {
        overrides = {
          title: cta.title,
          subtitle: cta.subtitle,
          actions: primaryHref
            ? [{ label: cta.label, href: primaryHref, style: 'primary', external: false }]
            : [],
        };
      } else if (blockType === 'intro') {
        overrides = {
          title: `À propos de ${businessName}`,
          body: [
            {
              kind: 'paragraph',
              text:
                'Présentez votre histoire, votre équipe et ce qui fait votre différence. ' +
                'Un texte sincère vaut mieux qu’un discours générique.',
            },
          ],
        };
      } else if (blockType === 'section-heading') {
        overrides = { title: blueprint.title };
      } else if (blockType === 'rich-text') {
        overrides = {
          blocks: [
            {
              kind: 'paragraph',
              text:
                'Racontez ici ce qui rend votre lieu unique : son histoire, son ambiance, ' +
                'les personnes qui le font vivre.',
            },
          ],
        };
      } else if (blockType === 'features') {
        overrides = {
          title: 'Pourquoi nous choisir',
          items: [
            {
              icon: 'clock',
              title: 'Réactivité',
              description: 'Nous répondons rapidement à chaque demande.',
            },
            {
              icon: 'shield-check',
              title: 'Travail soigné',
              description: 'Un résultat à la hauteur de vos attentes.',
            },
            {
              icon: 'heart-handshake',
              title: 'Écoute',
              description: 'Nous prenons le temps de comprendre votre besoin.',
            },
          ],
        };
      } else if (blockType === 'process') {
        overrides = {
          title: 'Comment ça se passe',
          steps: [
            {
              title: 'Premier contact',
              description: 'Vous nous expliquez votre besoin, par téléphone ou via le formulaire.',
            },
            {
              title: 'Proposition',
              description: 'Nous vous adressons une proposition claire et détaillée.',
            },
            { title: 'Réalisation', description: 'Nous intervenons à la date convenue.' },
          ],
        };
      } else if (blockType === 'faq') {
        overrides = {
          title: 'Questions fréquentes',
          items: [
            {
              question: 'Quels sont vos horaires ?',
              answer: 'Retrouvez nos horaires détaillés sur la page contact.',
            },
            {
              question: 'Comment vous contacter ?',
              answer: 'Par téléphone, par e-mail ou via le formulaire de contact.',
            },
          ],
        };
      } else if (blockType === 'contact') {
        overrides = {
          title: 'Écrivez-nous',
          subtitle: 'Nous vous répondons dans les meilleurs délais.',
        };
      } else if (blockType === 'testimonials') {
        // Aucun faux avis : la section reste vide, et elle ne s affiche pas en
        // ligne tant que le client n a pas saisi de vrais temoignages.
        overrides = { title: 'Ils nous font confiance', items: [] };
      }

      const block = buildBlock(blockType, overrides, {
        background: blockType === 'cta' ? 'accent' : 'default',
        align: blockType === 'hero' || blockType === 'cta' ? 'center' : 'left',
      });
      if (block) blocks.push(block);
    }

    return {
      path: blueprint.path,
      title: blueprint.title,
      kind: blueprint.kind,
      showInNav: blueprint.showInNav,
      sortOrder: (index + 1) * 10,
      blocks,
    };
  });

  const sellsOnline = modules.has('orders');
  pages.push(
    ...legalPages((pages.length + 1) * 10, {
      sellsOnline,
      perishable: business.sector === 'restauration',
    }),
  );

  const navPages = pages.filter((page) => page.showInNav && page.path !== '/');
  const preset = getPreset(business.theme.preset);

  const blockTypes = new Set(pages.flatMap((page) => page.blocks.map((block) => block.type)));
  const forms: TemplateForm[] = [];
  if (blockTypes.has('contact')) forms.push(CONTACT_FORM);
  if (blockTypes.has('quote-form')) forms.push(QUOTE_FORM);
  if (blockTypes.has('newsletter')) forms.push(NEWSLETTER_FORM);

  return {
    businessTypeSlug: business.id,
    theme: {
      preset: preset.id,
      fontHeading: business.theme.fontHeading,
      fontBody: business.theme.fontBody,
      accent: business.theme.accent,
    },
    modules: [...modules].filter((id) => getModule(id) !== undefined),
    pages,
    navigation: {
      primary: [
        { label: 'Accueil', path: '/' },
        ...navPages.map((page) => ({ label: page.title, path: page.path })),
      ],
      footer: [
        { label: 'Mentions légales', path: '/mentions-legales' },
        { label: 'Confidentialité', path: '/confidentialite' },
        ...(sellsOnline
          ? [{ label: 'Conditions de vente', path: '/conditions-generales-de-vente' }]
          : []),
      ],
    },
    forms,
  };
}

/** Modeles proposes au catalogue, tous metiers confondus. */
export function templateCatalog(businessTypeSlugs: readonly string[]): SiteTemplate[] {
  return businessTypeSlugs.map((slug) => buildTemplateForBusiness(slug));
}

/**
 * Modules actifs d un site : ceux du metier dont la fonctionnalite requise est
 * comprise dans l offre. `hasFeature` vient de la base (app.has_feature).
 */
export function modulesForPlan(
  businessTypeSlug: string,
  hasFeature: (feature: string) => boolean,
): string[] {
  const business = resolveBusiness(businessTypeSlug);
  return business.modules.filter((id) => {
    const definition = getModule(id);
    if (!definition) return false;
    return definition.requiredFeature === null || hasFeature(definition.requiredFeature);
  });
}

/**
 * Charge utile de `provision_site` : le modele, sans identifiants (la base les
 * attribue) et sans rien qui ne soit pas du contenu.
 */
/**
 * Point de depart VIERGE : une page d'accueil sans aucune section, et les
 * seules pages que la loi impose (mentions legales, confidentialite, CGV pour
 * une vente en ligne), qui se remplissent d'apres « Mon entreprise ». Le
 * theme, les modules et le formulaire de contact du metier sont conserves :
 * ce sont des reglages, pas du contenu.
 */
export function blankTemplate(template: SiteTemplate): SiteTemplate {
  const home = template.pages.find((page) => page.path === '/');
  const legal = template.pages.filter((page) => page.kind === 'legal');
  const legalPaths = new Set(legal.map((page) => page.path));
  return {
    ...template,
    pages: [
      {
        path: '/',
        title: home?.title ?? 'Accueil',
        kind: home?.kind ?? 'home',
        showInNav: true,
        sortOrder: 0,
        blocks: [],
      },
      ...legal,
    ],
    navigation: {
      primary: [{ label: home?.title ?? 'Accueil', path: '/' }],
      footer: template.navigation.footer.filter((link) => legalPaths.has(link.path)),
    },
  };
}

export function templatePayload(template: SiteTemplate): Record<string, unknown> {
  return {
    theme: template.theme,
    modules: template.modules,
    navigation: template.navigation,
    forms: template.forms,
    pages: template.pages.map((page) => ({
      path: page.path,
      title: page.title,
      kind: page.kind,
      showInNav: page.showInNav,
      sortOrder: page.sortOrder,
      blocks: page.blocks.map((block) => ({
        type: block.type,
        version: block.version,
        props: block.props,
        settings: block.settings,
      })),
    })),
  };
}
