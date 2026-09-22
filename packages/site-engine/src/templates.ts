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

/** Textes d amorce par metier. Jamais de faux chiffre, jamais de Lorem Ipsum. */
function heroCopy(business: BusinessDefinition): { title: string; subtitle: string } {
  const sector = business.sector;
  const name = business.name.toLowerCase();

  if (sector === 'restauration') {
    return {
      title: 'Une cuisine qui vous ressemble',
      subtitle: 'Découvrez notre carte, nos horaires et réservez votre table en quelques secondes.',
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
 * Le texte structure ce que la loi demande (article 6 de la LCEN, RGPD) et
 * reprend ce que nous savons deja. Ce que nous ne savons pas — numero SIREN,
 * forme juridique — est marque « à compléter » : la verification avant
 * publication le signale au client, plutot que d inventer une valeur.
 */
function legalPages(businessName: string, sortOrder: number): TemplatePage[] {
  const legal = buildBlock('rich-text', {
    blocks: [
      { kind: 'heading', level: 2, text: 'Éditeur du site' },
      {
        kind: 'list',
        text: '',
        items: [
          `Nom commercial : ${businessName}`,
          'Forme juridique et capital : à compléter',
          'Numéro SIREN : à compléter',
          'Adresse du siège : à compléter',
          'Responsable de la publication : à compléter',
        ],
      },
      { kind: 'heading', level: 2, text: 'Hébergement' },
      {
        kind: 'paragraph',
        text:
          'Ce site est réalisé et hébergé par StaX. Les pages sont servies par le réseau ' +
          'Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, États-Unis).',
      },
      { kind: 'heading', level: 2, text: 'Propriété intellectuelle' },
      {
        kind: 'paragraph',
        text:
          'Les textes, photos et logos présentés sur ce site sont la propriété de leur auteur. ' +
          'Toute reproduction sans autorisation est interdite.',
      },
    ],
  });

  const privacy = buildBlock('rich-text', {
    blocks: [
      { kind: 'heading', level: 2, text: 'Les informations que vous nous confiez' },
      {
        kind: 'paragraph',
        text:
          'Lorsque vous nous écrivez depuis ce site, nous recevons les informations que vous ' +
          'saisissez (nom, adresse e-mail, téléphone, message). Elles servent uniquement à ' +
          `vous répondre. ${businessName} ne les revend ni ne les partage.`,
      },
      { kind: 'heading', level: 2, text: 'Combien de temps nous les gardons' },
      {
        kind: 'paragraph',
        text:
          'Vos messages sont conservés trois ans au plus après notre dernier échange, puis ' +
          'supprimés.',
      },
      { kind: 'heading', level: 2, text: 'Vos droits' },
      {
        kind: 'paragraph',
        text:
          'Vous pouvez demander à consulter, corriger ou supprimer vos informations à tout ' +
          'moment en nous écrivant depuis la page contact. Vous pouvez aussi adresser une ' +
          'réclamation à la CNIL (cnil.fr).',
      },
      { kind: 'heading', level: 2, text: 'Mesure d’audience' },
      {
        kind: 'paragraph',
        text:
          'Ce site mesure sa fréquentation sans cookie et sans suivre les visiteurs d’un site ' +
          'à l’autre. Aucune donnée n’est transmise à des régies publicitaires.',
      },
    ],
  });

  const pages: TemplatePage[] = [];
  const heading = (title: string) => buildBlock('section-heading', { title });
  const legalHeading = heading('Mentions légales');
  const privacyHeading = heading('Confidentialité');

  if (legalHeading && legal) {
    pages.push({
      path: '/mentions-legales',
      title: 'Mentions légales',
      kind: 'legal',
      showInNav: false,
      sortOrder: sortOrder,
      blocks: [legalHeading, legal],
    });
  }
  if (privacyHeading && privacy) {
    pages.push({
      path: '/confidentialite',
      title: 'Confidentialité',
      kind: 'legal',
      showInNav: false,
      sortOrder: sortOrder + 10,
      blocks: [privacyHeading, privacy],
    });
  }
  return pages;
}

export function buildTemplateForBusiness(
  businessTypeSlug: string,
  options: TemplateOptions = {},
): SiteTemplate {
  const business = resolveBusiness(businessTypeSlug);
  const modules = new Set<string>(options.enabledModules ?? business.modules);
  const hero = heroCopy(business);
  const cta = ctaCopy(modules);
  const businessName = options.businessName?.trim() || business.name;
  const pitch = options.pitch?.trim() || null;

  // Pages retenues : celles dont il reste au moins une section permise.
  const blueprints = business.recommendedPages
    .map((blueprint) => ({
      ...blueprint,
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
      : modules.has('restaurant-menu') && existingPaths.has('/carte')
        ? { label: 'Voir la carte', href: '/carte', style: 'secondary', external: false }
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

  pages.push(...legalPages(businessName, (pages.length + 1) * 10));

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
