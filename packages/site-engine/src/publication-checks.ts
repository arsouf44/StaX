import { getBlockDefinition, parseBlock } from './blocks/registry';
import type { DraftBlock, DraftPage, DraftState } from './draft-state';
import { missingLegalFields, type LegalIdentity } from './legal';

/**
 * Verification avant publication.
 *
 * Elle repond a une seule question, du point de vue d un visiteur : « si je
 * publie maintenant, qu est-ce qui sera casse ou bizarre ? ». Chaque probleme
 * est decrit en francais courant, dit OU il se trouve et COMMENT le corriger.
 *
 * Deux niveaux :
 *  - `blocking` : le site serait reellement casse (page d accueil absente,
 *    bouton qui mene nulle part, section dont le contenu est invalide,
 *    formulaire qui n existe pas). La publication est refusee ;
 *  - `warning` : le site fonctionne, mais quelque chose merite l attention
 *    (texte d exemple, description absente pour Google, section vide). La
 *    publication reste possible.
 */

export type CheckSeverity = 'blocking' | 'warning';

export interface PublicationIssue {
  severity: CheckSeverity;
  code: string;
  /** Ce qui ne va pas, en une phrase. */
  message: string;
  /** Comment le corriger, en une phrase. */
  fix: string;
  pageId?: string;
  pageTitle?: string;
  blockId?: string;
  blockLabel?: string;
}

export interface PublicationContext {
  /** Formulaires du site : `slug`, actif ou non, destinataires. */
  forms: ReadonlyArray<{ slug: string; isActive: boolean; notifyEmails: readonly string[] }>;
  /** Fichiers encore presents dans la bibliotheque (hors corbeille). */
  liveMediaIds: ReadonlySet<string>;
  /** Nombre d elements par donnee metier, pour signaler les sections vides. */
  collections: Partial<Record<CollectionKey, number>>;
  /** Modules actifs du site. */
  enabledModules: ReadonlySet<string>;
  /**
   * Identite legale de l editeur (« Mon entreprise »). Absente : la
   * verification des mentions obligatoires n est pas faite.
   */
  legalIdentity?: LegalIdentity;
}

export type CollectionKey =
  | 'menu'
  | 'services'
  | 'team'
  | 'openingHours'
  | 'products'
  | 'bookingServices'
  | 'properties'
  | 'rooms'
  | 'serviceAreas'
  | 'entries';

export interface PublicationReport {
  ok: boolean;
  blocking: PublicationIssue[];
  warnings: PublicationIssue[];
}

/** Chemins servis par le moteur lui-meme, hors pages editoriales. */
const ENGINE_PATHS = new Set(['/compte', '/commande', '/sitemap.xml', '/robots.txt']);

/** Textes d amorce des modeles : a personnaliser avant d etre vus du public. */
const PLACEHOLDERS = [
  'Présentez votre histoire',
  'Racontez ici',
  'Votre titre principal',
  'Décrivez en une phrase',
  'à compléter',
  'Remplacez ce texte',
];

/** Section liee a une donnee metier : [collection, libelle de la page a ouvrir]. */
const DATA_SECTIONS: Record<string, [CollectionKey, string]> = {
  menu: ['menu', 'Carte'],
  'menu-preview': ['menu', 'Carte'],
  services: ['services', 'Prestations'],
  team: ['team', 'Équipe'],
  'opening-hours': ['openingHours', 'Horaires'],
  products: ['products', 'Produits'],
  booking: ['bookingServices', 'Réservations'],
  properties: ['properties', 'Biens'],
  rooms: ['rooms', 'Chambres'],
  'service-area': ['serviceAreas', 'Zones'],
  articles: ['entries', 'Actualités'],
  events: ['entries', 'Événements'],
  portfolio: ['entries', 'Réalisations'],
};

interface LinkLike {
  label?: unknown;
  href?: unknown;
}

function normalizePath(path: string): string {
  const clean = path.split('#')[0]?.split('?')[0] ?? '';
  if (clean === '' || clean === '/') return '/';
  return clean.replace(/\/+$/, '');
}

/** Tous les liens portes par une section, avec leur description lisible. */
function blockLinks(block: DraftBlock): Array<{ label: string; href: string }> {
  const props = block.props;
  const links: Array<{ label: string; href: string }> = [];
  const push = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const link = value as LinkLike;
    if (typeof link.href === 'string') {
      links.push({ label: typeof link.label === 'string' ? link.label : '', href: link.href });
    }
  };

  if (Array.isArray(props['actions'])) props['actions'].forEach(push);
  push(props['action']);
  if (Array.isArray(props['plans'])) {
    for (const plan of props['plans']) {
      if (plan && typeof plan === 'object') push((plan as { action?: unknown }).action);
    }
  }
  if (typeof props['targetPath'] === 'string') {
    links.push({ label: 'Page de résultats', href: props['targetPath'] });
  }
  return links;
}

/** Toutes les images referencees par une section. */
function blockMedia(block: DraftBlock): Array<{ mediaId: string | null; url: string | null }> {
  const found: Array<{ mediaId: string | null; url: string | null }> = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 4 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    const record = value as Record<string, unknown>;
    if ('mediaId' in record) {
      found.push({
        mediaId: typeof record['mediaId'] === 'string' ? record['mediaId'] : null,
        url: typeof record['url'] === 'string' ? record['url'] : null,
      });
      return;
    }
    Object.values(record).forEach((entry) => visit(entry, depth + 1));
  };
  visit(block.props, 0);
  return found;
}

/** Tous les textes d une section, pour reperer les textes d exemple. */
function blockTexts(value: unknown, depth = 0): string[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => blockTexts(entry, depth + 1));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) =>
      blockTexts(entry, depth + 1),
    );
  }
  return [];
}

function labelOf(block: DraftBlock): string {
  return getBlockDefinition(block.type)?.label ?? 'Section';
}

function where(page: DraftPage, block?: DraftBlock) {
  return {
    pageId: page.id,
    pageTitle: page.title || page.path,
    ...(block ? { blockId: block.id, blockLabel: labelOf(block) } : {}),
  };
}

export function checkSiteForPublication(
  state: DraftState,
  context: PublicationContext,
): PublicationReport {
  const blocking: PublicationIssue[] = [];
  const warnings: PublicationIssue[] = [];

  const published = state.pages.filter((page) => page.is_published);
  const paths = new Set(published.map((page) => normalizePath(page.path)));
  const home = published.find((page) => normalizePath(page.path) === '/');

  const linkTargetExists = (href: string): boolean | 'external' => {
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return 'external';
    }
    if (href.startsWith('https://')) return 'external';
    if (!href.startsWith('/')) return false;
    const path = normalizePath(href);
    return paths.has(path) || ENGINE_PATHS.has(path);
  };

  // --- Le site doit avoir une page d accueil ---------------------------------
  if (!home) {
    blocking.push({
      severity: 'blocking',
      code: 'no_home',
      message: 'Votre site n’a pas de page d’accueil.',
      fix: 'Restaurez la page « Accueil » depuis la corbeille des pages, ou restaurez une version précédente.',
    });
  } else if ((home.blocks ?? []).filter((block) => block.visible).length === 0) {
    blocking.push({
      severity: 'blocking',
      code: 'empty_home',
      message: 'Votre page d’accueil est vide : vos visiteurs verraient une page blanche.',
      fix: 'Ajoutez au moins une section à la page d’accueil, ou affichez une section masquée.',
      ...where(home),
    });
  }

  // --- Menus ---------------------------------------------------------------
  const navigation = state.settings.navigation;
  const menus: Array<[string, Array<{ label: string; path: string }>]> = [
    ['menu principal', navigation?.primary ?? []],
    ['pied de page', navigation?.footer ?? []],
  ];
  for (const [menuName, links] of menus) {
    for (const link of links) {
      if (linkTargetExists(link.path) === false) {
        blocking.push({
          severity: 'blocking',
          code: 'broken_nav',
          message: `Le lien « ${link.label || link.path} » du ${menuName} mène à une page qui n’existe pas (${link.path}).`,
          fix: 'Modifiez ce lien dans « Navigation », ou restaurez la page depuis la corbeille.',
        });
      }
    }
  }

  const formsBySlug = new Map(context.forms.map((form) => [form.slug, form]));
  const siteEmail = state.settings.email?.trim() || null;

  for (const page of published) {
    const visibleBlocks = (page.blocks ?? []).filter((block) => block.visible);

    if (!page.title.trim()) {
      blocking.push({
        severity: 'blocking',
        code: 'page_untitled',
        message: `Une page (${page.path}) n’a pas de titre.`,
        fix: 'Donnez-lui un titre dans « Pages » : il apparaît dans les onglets et sur Google.',
        ...where(page),
      });
    }

    if (visibleBlocks.length === 0 && normalizePath(page.path) !== '/') {
      warnings.push({
        severity: 'warning',
        code: 'page_empty',
        message: `La page « ${page.title} » est vide.`,
        fix: 'Ajoutez-y une section, ou masquez-la du menu en attendant.',
        ...where(page),
      });
    }

    for (const block of visibleBlocks) {
      const definition = getBlockDefinition(block.type);

      // Contenu invalide : la section ne serait pas affichee.
      const parsed = parseBlock({ type: block.type, props: block.props, settings: block.settings });
      if (!definition || !parsed.block) {
        blocking.push({
          severity: 'blocking',
          code: 'invalid_block',
          message: `La section « ${labelOf(block)} » de la page « ${page.title} » contient une valeur incorrecte : elle ne s’afficherait pas.`,
          fix: 'Ouvrez cette section et vérifiez ses champs (un bouton sans texte ou sans destination, par exemple).',
          ...where(page, block),
        });
        continue;
      }

      if (definition.requiresModule && !context.enabledModules.has(definition.requiresModule)) {
        warnings.push({
          severity: 'warning',
          code: 'module_disabled',
          message: `La section « ${definition.label} » (page « ${page.title} ») dépend d’une fonctionnalité qui n’est pas active sur votre site.`,
          fix: 'Elle ne s’affichera pas. Supprimez-la, ou contactez-nous pour activer cette fonctionnalité.',
          ...where(page, block),
        });
      }

      for (const link of blockLinks(block)) {
        const target = linkTargetExists(link.href);
        if (target === false) {
          blocking.push({
            severity: 'blocking',
            code: 'broken_link',
            message: `Le bouton « ${link.label || 'sans nom'} » (section « ${definition.label} », page « ${page.title} ») mène à une page qui n’existe pas : ${link.href}.`,
            fix: 'Choisissez une autre destination pour ce bouton, ou restaurez la page depuis la corbeille.',
            ...where(page, block),
          });
        }
      }

      for (const image of blockMedia(block)) {
        if (image.mediaId && !context.liveMediaIds.has(image.mediaId)) {
          warnings.push({
            severity: 'warning',
            code: 'media_trashed',
            message: `Une image de la section « ${definition.label} » (page « ${page.title} ») a été supprimée de vos photos.`,
            fix: 'Choisissez une autre image, ou restaurez la photo depuis la corbeille de « Photos & fichiers ».',
            ...where(page, block),
          });
        }
      }

      if (block.type === 'contact' || block.type === 'quote-form' || block.type === 'newsletter') {
        const slug =
          typeof block.props['formSlug'] === 'string'
            ? block.props['formSlug']
            : block.type === 'quote-form'
              ? 'devis'
              : block.type === 'newsletter'
                ? 'newsletter'
                : 'contact';
        const form = formsBySlug.get(slug);
        if (!form || !form.isActive) {
          blocking.push({
            severity: 'blocking',
            code: 'form_missing',
            message: `Le formulaire de la section « ${definition.label} » (page « ${page.title} ») n’existe pas ou est désactivé : vos visiteurs ne pourraient pas vous écrire.`,
            fix: 'Activez ou créez ce formulaire dans « Formulaires », ou supprimez la section.',
            ...where(page, block),
          });
        } else if (form.notifyEmails.length === 0 && !siteEmail) {
          warnings.push({
            severity: 'warning',
            code: 'form_no_destination',
            message: `Personne ne sera prévenu par e-mail quand un visiteur remplira le formulaire de la page « ${page.title} ».`,
            fix: 'Les messages arrivent dans « Messages ». Pour être prévenu, indiquez votre adresse e-mail dans « Formulaires ».',
            ...where(page, block),
          });
        }
      }

      const data = DATA_SECTIONS[block.type];
      if (data) {
        const [key, pageLabel] = data;
        if (context.collections[key] === 0) {
          warnings.push({
            severity: 'warning',
            code: 'section_no_data',
            message: `La section « ${definition.label} » (page « ${page.title} ») est vide : elle ne s’affichera pas en ligne.`,
            fix: `Ajoutez vos informations dans « ${pageLabel} », elles apparaîtront automatiquement.`,
            ...where(page, block),
          });
        }
      }

      if (
        (block.type === 'testimonials' || block.type === 'faq' || block.type === 'gallery') &&
        Array.isArray(block.props['items']) &&
        block.props['items'].length === 0
      ) {
        warnings.push({
          severity: 'warning',
          code: 'section_empty',
          message: `La section « ${definition.label} » (page « ${page.title} ») est vide : elle ne s’affichera pas en ligne.`,
          fix: 'Ouvrez-la et ajoutez des éléments, ou supprimez-la.',
          ...where(page, block),
        });
      }

      if (block.type === 'embed' && !String(block.props['resourceId'] ?? '').trim()) {
        warnings.push({
          severity: 'warning',
          code: 'section_empty',
          message: `La section « ${definition.label} » (page « ${page.title} ») n’indique pas encore quelle vidéo ou quelle carte afficher : elle ne s’affichera pas en ligne.`,
          fix: 'Ouvrez-la et indiquez la vidéo ou la carte à afficher, ou supprimez-la.',
          ...where(page, block),
        });
      }

      if (block.type === 'hero' && !String(block.props['title'] ?? '').trim()) {
        warnings.push({
          severity: 'warning',
          code: 'hero_no_title',
          message: `La bannière de la page « ${page.title} » n’a pas de titre : le nom de votre entreprise sera affiché à la place.`,
          fix: 'Écrivez une phrase qui dit ce que vous faites.',
          ...where(page, block),
        });
      }

      const texts = blockTexts(block.props).join(' ');
      const placeholder = PLACEHOLDERS.find((sample) => texts.includes(sample));
      if (placeholder) {
        warnings.push({
          severity: 'warning',
          code: 'placeholder_text',
          message: `La section « ${definition.label} » (page « ${page.title} ») contient encore un texte d’exemple (« ${placeholder}… »).`,
          fix: 'Remplacez-le par vos propres mots : vos visiteurs le liraient tel quel.',
          ...where(page, block),
        });
      }
    }
  }

  // --- Mentions obligatoires -----------------------------------------------
  // Un site professionnel doit identifier son editeur (article 6 III de la
  // LCEN). Publier sans ces mentions exposerait le client a une amende : on
  // refuse, en disant exactement quoi saisir et ou.
  if (context.legalIdentity) {
    const missing = missingLegalFields(context.legalIdentity);
    if (missing.length > 0) {
      blocking.push({
        severity: 'blocking',
        code: 'legal_identity',
        message: `Vos mentions légales sont incomplètes : il manque ${missing.join(', ')}.`,
        fix: 'Renseignez-les dans « Mon entreprise », rubrique « Mentions légales » : elles sont reprises automatiquement sur votre site.',
      });
    }
    const hasLegalNotice = published.some((page) =>
      (page.blocks ?? []).some((block) => block.visible && block.type === 'legal-notice'),
    );
    if (!hasLegalNotice && !paths.has('/mentions-legales')) {
      warnings.push({
        severity: 'warning',
        code: 'legal_page',
        message: 'Votre site n’a pas de page « Mentions légales ».',
        fix: 'Restaurez-la depuis la corbeille des pages : elle est obligatoire pour un site professionnel.',
      });
    }
    if (context.enabledModules.has('orders') && !context.legalIdentity.mediator.trim()) {
      warnings.push({
        severity: 'warning',
        code: 'mediator',
        message: 'Vous vendez en ligne, mais aucun médiateur de la consommation n’est indiqué.',
        fix: 'Si vous vendez à des particuliers, l’adhésion à un médiateur est obligatoire : indiquez-le dans « Mon entreprise ».',
      });
    }
  }

  // --- Referencement --------------------------------------------------------
  const description = state.settings.seo_description?.trim() || state.settings.description?.trim();
  if (!description) {
    warnings.push({
      severity: 'warning',
      code: 'seo_description',
      message: 'Votre site n’a pas de description pour Google.',
      fix: 'Ajoutez deux phrases qui décrivent votre activité dans « Référencement ».',
    });
  }
  if (!state.settings.business_name?.trim()) {
    warnings.push({
      severity: 'warning',
      code: 'business_name',
      message: 'Le nom de votre entreprise n’est pas renseigné.',
      fix: 'Indiquez-le dans « Mon entreprise » : il apparaît en haut du site et sur Google.',
    });
  }
  if (!state.settings.email?.trim() && !state.settings.phone?.trim()) {
    warnings.push({
      severity: 'warning',
      code: 'no_contact',
      message:
        'Aucun téléphone ni e-mail n’est affiché : vos visiteurs ne sauront pas comment vous joindre.',
      fix: 'Ajoutez vos coordonnées dans « Mon entreprise ».',
    });
  }

  return { ok: blocking.length === 0, blocking, warnings };
}
