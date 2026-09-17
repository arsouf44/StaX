import { resolveBusiness, type BusinessDefinition } from '@stax/business';
import { createBlock, type ParsedBlock } from './blocks/registry';
import { getPreset } from './theme';

/**
 * Instanciation d un site a partir d un metier.
 *
 * Un nouveau site nait d un modele : pages recommandees, blocs pre-remplis
 * avec des textes francais adaptes au metier, theme conseille. Le contenu
 * devient ensuite totalement independant du modele.
 */

export interface TemplatePage {
  path: string;
  title: string;
  kind: string;
  showInNav: boolean;
  sortOrder: number;
  blocks: ParsedBlock[];
}

export interface SiteTemplate {
  businessTypeSlug: string;
  theme: { preset: string; fontHeading: string; fontBody: string; accent: string };
  modules: readonly string[];
  pages: TemplatePage[];
  navigation: { primary: { label: string; path: string }[]; footer: { label: string; path: string }[] };
}

/** Textes d amorce par metier. Jamais de faux chiffre, jamais de Lorem Ipsum. */
function heroCopy(business: BusinessDefinition): { title: string; subtitle: string } {
  const sector = business.sector;
  const name = business.name.toLowerCase();

  if (sector === 'restauration') {
    return {
      title: 'Une cuisine qui vous ressemble',
      subtitle:
        'Decouvrez notre carte, nos horaires et reservez votre table en quelques secondes.',
    };
  }
  if (sector === 'beaute-bien-etre') {
    return {
      title: 'Prenez soin de vous',
      subtitle:
        'Nos prestations, nos tarifs et nos disponibilites. Prenez rendez-vous en ligne, a toute heure.',
    };
  }
  if (sector === 'artisanat') {
    return {
      title: 'Un artisan sur qui compter',
      subtitle:
        'Devis gratuit, intervention rapide et travail soigne. Decrivez votre besoin, nous vous rappelons.',
    };
  }
  if (sector === 'commerce') {
    return {
      title: 'Notre boutique, en ligne aussi',
      subtitle: 'Parcourez notre selection, commandez et retirez sur place ou faites-vous livrer.',
    };
  }
  if (sector === 'immobilier') {
    return {
      title: 'Votre projet immobilier, accompagne',
      subtitle:
        'Consultez nos biens disponibles ou demandez une estimation gratuite de votre logement.',
    };
  }
  if (sector === 'hebergement-tourisme') {
    return {
      title: 'Un sejour dont on se souvient',
      subtitle: 'Nos chambres, nos services et nos disponibilites. Reservez directement, sans intermediaire.',
    };
  }
  if (sector === 'sante') {
    return {
      title: 'Votre sante entre de bonnes mains',
      subtitle: 'Informations pratiques, soins proposes et prise de rendez-vous en ligne.',
    };
  }
  if (sector === 'associations') {
    return {
      title: 'Agissons ensemble',
      subtitle: 'Nos actions, nos evenements et toutes les facons de nous rejoindre.',
    };
  }
  return {
    title: `Votre ${name}, a votre service`,
    subtitle:
      'Presentez votre activite, vos prestations et vos coordonnees. Vos clients vous trouvent et vous contactent.',
  };
}

function ctaCopy(business: BusinessDefinition): { title: string; subtitle: string; label: string } {
  if (business.modules.includes('booking')) {
    return {
      title: 'Reservez en quelques secondes',
      subtitle: 'Choisissez votre creneau, nous confirmons rapidement.',
      label: 'Reserver',
    };
  }
  if (business.modules.includes('quotes')) {
    return {
      title: 'Parlons de votre projet',
      subtitle: 'Decrivez votre besoin, nous revenons vers vous avec un devis clair.',
      label: 'Demander un devis',
    };
  }
  return {
    title: 'Une question ?',
    subtitle: 'Ecrivez-nous, nous repondons rapidement.',
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

export function buildTemplateForBusiness(businessTypeSlug: string): SiteTemplate {
  const business = resolveBusiness(businessTypeSlug);
  const hero = heroCopy(business);
  const cta = ctaCopy(business);
  const modules = new Set(business.modules);

  const pages: TemplatePage[] = business.recommendedPages.map((blueprint, index) => {
    const blocks: ParsedBlock[] = [];

    for (const blockType of blueprint.blocks) {
      let overrides: Record<string, unknown> = {};

      if (blockType === 'hero') {
        overrides = {
          title: hero.title,
          subtitle: hero.subtitle,
          layout: business.sector === 'restauration' ? 'overlay' : 'split',
          actions: [
            { label: cta.label, href: '/contact', style: 'primary', external: false },
            ...(modules.has('services')
              ? [{ label: 'Nos prestations', href: '/prestations', style: 'secondary', external: false }]
              : modules.has('restaurant-menu')
                ? [{ label: 'Voir la carte', href: '/carte', style: 'secondary', external: false }]
                : []),
          ],
        };
      } else if (blockType === 'cta') {
        overrides = {
          title: cta.title,
          subtitle: cta.subtitle,
          actions: [{ label: cta.label, href: '/contact', style: 'primary', external: false }],
        };
      } else if (blockType === 'intro') {
        overrides = {
          title: `A propos de ${business.name.toLowerCase()}`,
          body: [
            {
              kind: 'paragraph',
              text:
                'Presentez votre histoire, votre equipe et ce qui fait votre difference. ' +
                'Un texte sincere vaut mieux qu un discours generique.',
            },
          ],
        };
      } else if (blockType === 'section-heading') {
        overrides = { title: blueprint.title };
      } else if (blockType === 'features') {
        overrides = {
          title: 'Pourquoi nous choisir',
          items: [
            { icon: 'clock', title: 'Reactivite', description: 'Nous repondons rapidement a chaque demande.' },
            { icon: 'shield-check', title: 'Travail soigne', description: 'Un resultat a la hauteur de vos attentes.' },
            { icon: 'heart-handshake', title: 'Ecoute', description: 'Nous prenons le temps de comprendre votre besoin.' },
          ],
        };
      } else if (blockType === 'process') {
        overrides = {
          title: 'Comment ca se passe',
          steps: [
            { title: 'Premier contact', description: 'Vous nous expliquez votre besoin, par telephone ou via le formulaire.' },
            { title: 'Proposition', description: 'Nous vous adressons une proposition claire et detaillee.' },
            { title: 'Realisation', description: 'Nous intervenons a la date convenue.' },
          ],
        };
      } else if (blockType === 'faq') {
        overrides = {
          title: 'Questions frequentes',
          items: [
            { question: 'Quels sont vos horaires ?', answer: 'Retrouvez nos horaires detailles en bas de cette page.' },
            { question: 'Comment vous contacter ?', answer: 'Par telephone, par e-mail ou via le formulaire de contact.' },
          ],
        };
      } else if (blockType === 'contact') {
        overrides = {
          title: 'Contactez-nous',
          subtitle: 'Nous vous repondons dans les meilleurs delais.',
        };
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

  const navPages = pages.filter((page) => page.showInNav && page.path !== '/');
  const preset = getPreset(business.theme.preset);

  return {
    businessTypeSlug: business.id,
    theme: {
      preset: preset.id,
      fontHeading: business.theme.fontHeading,
      fontBody: business.theme.fontBody,
      accent: business.theme.accent,
    },
    modules: business.modules,
    pages,
    navigation: {
      primary: [
        { label: 'Accueil', path: '/' },
        ...navPages.map((page) => ({ label: page.title, path: page.path })),
      ],
      footer: [
        { label: 'Mentions legales', path: '/mentions-legales' },
        { label: 'Confidentialite', path: '/confidentialite' },
      ],
    },
  };
}

/** Modeles proposes au catalogue, tous metiers confondus. */
export function templateCatalog(businessTypeSlugs: readonly string[]): SiteTemplate[] {
  return businessTypeSlugs.map(buildTemplateForBusiness);
}
