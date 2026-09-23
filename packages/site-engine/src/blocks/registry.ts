import { z } from 'zod';
import { blockSettingsSchema, linkSchema, mediaRefSchema, richParagraphSchema } from './primitives';

/**
 * Registre des blocs.
 *
 * Un bloc declare : son schema de proprietes, son libelle pour l editeur, sa
 * categorie, et le module metier qui le rend disponible. Ajouter un bloc se
 * fait ici et nulle part ailleurs.
 */

export interface BlockDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  type: string;
  version: number;
  label: string;
  /** Description orientee client, sans vocabulaire technique. */
  description: string;
  icon: string;
  category: 'structure' | 'contenu' | 'preuve' | 'conversion' | 'metier';
  /** Module requis pour proposer ce bloc. `null` = toujours disponible. */
  requiresModule: string | null;
  /** Un seul exemplaire par page (hero, par exemple). */
  singleton?: boolean;
  schema: TSchema;
  defaults: z.input<TSchema>;
}

function define<TSchema extends z.ZodTypeAny>(
  definition: BlockDefinition<TSchema>,
): BlockDefinition<TSchema> {
  return definition;
}

const text = (max: number) => z.string().max(max).default('');

/* -------------------------------------------------------------------------- */

export const heroBlock = define({
  type: 'hero',
  version: 1,
  label: 'Bannière principale',
  description: 'La première chose que voit un visiteur : votre promesse en une phrase.',
  icon: 'layout-panel-top',
  category: 'structure',
  requiresModule: null,
  singleton: true,
  schema: z.object({
    eyebrow: text(60),
    title: text(160),
    subtitle: text(400),
    media: mediaRefSchema.nullable().default(null),
    actions: z.array(linkSchema).max(2).default([]),
    layout: z.enum(['centered', 'split', 'overlay', 'minimal']).default('centered'),
    highlights: z.array(z.string().max(60)).max(4).default([]),
  }),
  defaults: {
    eyebrow: '',
    title: 'Votre titre principal',
    subtitle: 'Décrivez en une phrase ce que vous faites et pour qui.',
    media: null,
    actions: [],
    layout: 'centered',
    highlights: [],
  },
});

export const introBlock = define({
  type: 'intro',
  version: 1,
  label: 'Présentation',
  description: 'Un paragraphe d’introduction accompagné d’une image.',
  icon: 'align-left',
  category: 'contenu',
  requiresModule: null,
  schema: z.object({
    title: text(120),
    body: z.array(richParagraphSchema).max(10).default([]),
    media: mediaRefSchema.nullable().default(null),
    mediaPosition: z.enum(['left', 'right', 'none']).default('right'),
    action: linkSchema.nullable().default(null),
  }),
  defaults: {
    title: 'Qui sommes-nous',
    body: [],
    media: null,
    mediaPosition: 'right',
    action: null,
  },
});

export const sectionHeadingBlock = define({
  type: 'section-heading',
  version: 1,
  label: 'Titre de section',
  description: 'Un titre et un sous-titre pour introduire une section.',
  icon: 'heading',
  category: 'structure',
  requiresModule: null,
  schema: z.object({
    eyebrow: text(60),
    title: text(120),
    subtitle: text(300),
  }),
  defaults: { eyebrow: '', title: 'Titre de section', subtitle: '' },
});

export const richTextBlock = define({
  type: 'rich-text',
  version: 1,
  label: 'Texte',
  description: 'Du texte libre, avec titres, listes et citations.',
  icon: 'text',
  category: 'contenu',
  requiresModule: null,
  schema: z.object({
    blocks: z.array(richParagraphSchema).max(60).default([]),
  }),
  defaults: { blocks: [] },
});

export const galleryBlock = define({
  type: 'gallery',
  version: 1,
  label: 'Galerie photos',
  description: 'Vos plus belles photos, en grille ou en mosaïque.',
  icon: 'images',
  category: 'preuve',
  requiresModule: 'gallery',
  schema: z.object({
    title: text(120),
    items: z.array(mediaRefSchema).max(40).default([]),
    layout: z.enum(['grid', 'mosaic', 'carousel', 'strip']).default('grid'),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  }),
  defaults: { title: '', items: [], layout: 'grid', columns: 3 },
});

export const featuresBlock = define({
  type: 'features',
  version: 1,
  label: 'Points forts',
  description: 'Trois à six arguments qui rassurent vos visiteurs.',
  icon: 'sparkles',
  category: 'preuve',
  requiresModule: null,
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    items: z
      .array(
        z.object({
          icon: z.string().max(40).default('check'),
          title: z.string().max(80),
          description: z.string().max(400).default(''),
        }),
      )
      .max(9)
      .default([]),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  }),
  defaults: { title: '', subtitle: '', items: [], columns: 3 },
});

export const trustBlock = define({
  type: 'trust',
  version: 1,
  label: 'Gages de confiance',
  description: 'Certifications, assurances, années d’expérience, zone couverte.',
  icon: 'badge-check',
  category: 'preuve',
  requiresModule: null,
  schema: z.object({
    items: z
      .array(
        z.object({
          label: z.string().max(60),
          value: z.string().max(60).default(''),
          icon: z.string().max(40).default('shield-check'),
        }),
      )
      .max(6)
      .default([]),
  }),
  defaults: { items: [] },
});

export const processBlock = define({
  type: 'process',
  version: 1,
  label: 'Comment ça se passe',
  description: 'Les étapes de votre intervention, du premier contact à la fin.',
  icon: 'list-ordered',
  category: 'contenu',
  requiresModule: null,
  schema: z.object({
    title: text(120),
    steps: z
      .array(
        z.object({
          title: z.string().max(80),
          description: z.string().max(400).default(''),
        }),
      )
      .max(8)
      .default([]),
  }),
  defaults: { title: 'Comment ça se passe', steps: [] },
});

export const servicesBlock = define({
  type: 'services',
  version: 1,
  label: 'Prestations',
  description: 'Vos prestations avec leurs tarifs et leurs durées.',
  icon: 'list-checks',
  category: 'metier',
  requiresModule: 'services',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    /** Vide = toutes les prestations visibles. */
    categoryFilter: z.array(z.string().max(60)).max(20).default([]),
    layout: z.enum(['list', 'cards', 'table']).default('cards'),
    showPrices: z.boolean().default(true),
    showDurations: z.boolean().default(true),
    showBookingButton: z.boolean().default(false),
  }),
  defaults: {
    title: 'Nos prestations',
    subtitle: '',
    categoryFilter: [],
    layout: 'cards',
    showPrices: true,
    showDurations: true,
    showBookingButton: false,
  },
});

export const pricingBlock = define({
  type: 'pricing',
  version: 1,
  label: 'Tarifs',
  description: 'Des formules comparées côte à côte.',
  icon: 'euro',
  category: 'conversion',
  requiresModule: null,
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    plans: z
      .array(
        z.object({
          name: z.string().max(60),
          price: z.string().max(40).default(''),
          period: z.string().max(30).default(''),
          description: z.string().max(200).default(''),
          features: z.array(z.string().max(120)).max(12).default([]),
          highlighted: z.boolean().default(false),
          action: linkSchema.nullable().default(null),
        }),
      )
      .max(4)
      .default([]),
  }),
  defaults: { title: 'Nos tarifs', subtitle: '', plans: [] },
});

export const testimonialsBlock = define({
  type: 'testimonials',
  version: 1,
  label: 'Avis clients',
  description: 'Les témoignages de vos clients satisfaits.',
  icon: 'quote',
  category: 'preuve',
  requiresModule: 'testimonials',
  schema: z.object({
    title: text(120),
    items: z
      .array(
        z.object({
          quote: z.string().max(800),
          author: z.string().max(80),
          role: z.string().max(80).default(''),
          rating: z.number().int().min(1).max(5).nullable().default(null),
          media: mediaRefSchema.nullable().default(null),
          date: z.string().max(20).default(''),
        }),
      )
      .max(20)
      .default([]),
    layout: z.enum(['cards', 'carousel', 'single']).default('cards'),
  }),
  defaults: { title: 'Ils nous font confiance', items: [], layout: 'cards' },
});

export const faqBlock = define({
  type: 'faq',
  version: 1,
  label: 'Questions fréquentes',
  description: 'Les réponses aux questions que l’on vous pose le plus souvent.',
  icon: 'help-circle',
  category: 'contenu',
  requiresModule: 'faq',
  schema: z.object({
    title: text(120),
    items: z
      .array(z.object({ question: z.string().max(200), answer: z.string().max(2000) }))
      .max(30)
      .default([]),
  }),
  defaults: { title: 'Questions fréquentes', items: [] },
});

export const ctaBlock = define({
  type: 'cta',
  version: 1,
  label: 'Invitation à agir',
  description: 'Une invitation claire à vous contacter ou à réserver.',
  icon: 'megaphone',
  category: 'conversion',
  requiresModule: null,
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    actions: z.array(linkSchema).max(2).default([]),
    media: mediaRefSchema.nullable().default(null),
  }),
  defaults: { title: 'Parlons de votre projet', subtitle: '', actions: [], media: null },
});

export const contactBlock = define({
  type: 'contact',
  version: 1,
  label: 'Formulaire de contact',
  description: 'Vos visiteurs vous écrivent, vous recevez tout dans votre espace.',
  icon: 'mail',
  category: 'conversion',
  requiresModule: 'contact',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    formSlug: z.string().max(60).default('contact'),
    showCoordinates: z.boolean().default(true),
    showMap: z.boolean().default(false),
  }),
  defaults: {
    title: 'Contactez-nous',
    subtitle: '',
    formSlug: 'contact',
    showCoordinates: true,
    showMap: false,
  },
});

export const quoteFormBlock = define({
  type: 'quote-form',
  version: 1,
  label: 'Demande de devis',
  description: 'Un formulaire structuré pour recevoir des demandes précises.',
  icon: 'file-text',
  category: 'conversion',
  requiresModule: 'quotes',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    formSlug: z.string().max(60).default('devis'),
  }),
  defaults: { title: 'Demander un devis gratuit', subtitle: '', formSlug: 'devis' },
});

export const mapBlock = define({
  type: 'map',
  version: 1,
  label: 'Plan d’accès',
  description: 'Votre adresse sur une carte, avec l’itinéraire.',
  icon: 'map-pin',
  category: 'contenu',
  requiresModule: null,
  schema: z.object({
    title: text(120),
    zoom: z.number().int().min(8).max(19).default(15),
    showDirectionsLink: z.boolean().default(true),
  }),
  defaults: { title: 'Nous trouver', zoom: 15, showDirectionsLink: true },
});

export const openingHoursBlock = define({
  type: 'opening-hours',
  version: 1,
  label: 'Horaires',
  description: 'Vos horaires d’ouverture et vos fermetures exceptionnelles.',
  icon: 'clock',
  category: 'metier',
  requiresModule: 'opening-hours',
  schema: z.object({
    title: text(120),
    showCurrentStatus: z.boolean().default(true),
    showClosures: z.boolean().default(true),
  }),
  defaults: { title: 'Horaires d’ouverture', showCurrentStatus: true, showClosures: true },
});

export const teamBlock = define({
  type: 'team',
  version: 1,
  label: 'Équipe',
  description: 'Les visages de votre entreprise.',
  icon: 'users',
  category: 'preuve',
  requiresModule: 'team',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    layout: z.enum(['grid', 'row', 'cards']).default('grid'),
    showContact: z.boolean().default(false),
  }),
  defaults: { title: 'Notre équipe', subtitle: '', layout: 'grid', showContact: false },
});

export const menuBlock = define({
  type: 'menu',
  version: 1,
  label: 'Carte',
  description: 'Votre carte, organisée par catégories, avec les allergènes.',
  icon: 'utensils',
  category: 'metier',
  requiresModule: 'restaurant-menu',
  schema: z.object({
    title: text(120),
    menuGroups: z
      .array(
        z.enum([
          'main',
          'lunch',
          'dinner',
          'drinks',
          'wine',
          'dessert',
          'brunch',
          'set_menu',
          'kids',
        ]),
      )
      .max(9)
      .default(['main']),
    layout: z.enum(['columns', 'list', 'tabs']).default('tabs'),
    showImages: z.boolean().default(false),
    showAllergens: z.boolean().default(true),
  }),
  defaults: {
    title: 'Notre carte',
    menuGroups: ['main'],
    layout: 'tabs',
    showImages: false,
    showAllergens: true,
  },
});

export const menuPreviewBlock = define({
  type: 'menu-preview',
  version: 1,
  label: 'Aperçu de la carte',
  description: 'Quelques plats mis en avant, avec un lien vers la carte complète.',
  icon: 'utensils-crossed',
  category: 'metier',
  requiresModule: 'restaurant-menu',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    limit: z.number().int().min(2).max(9).default(6),
    onlySignature: z.boolean().default(true),
    action: linkSchema.nullable().default(null),
  }),
  defaults: {
    title: 'Quelques suggestions',
    subtitle: '',
    limit: 6,
    onlySignature: true,
    action: null,
  },
});

export const bookingBlock = define({
  type: 'booking',
  version: 1,
  label: 'Réservation',
  description: 'Vos clients réservent en ligne, vous validez depuis votre espace.',
  icon: 'calendar-check',
  category: 'metier',
  requiresModule: 'booking',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    bookingServiceId: z.string().uuid().nullable().default(null),
    showTeamSelection: z.boolean().default(false),
    showPartySize: z.boolean().default(true),
  }),
  defaults: {
    title: 'Réserver',
    subtitle: '',
    bookingServiceId: null,
    showTeamSelection: false,
    showPartySize: true,
  },
});

export const productsBlock = define({
  type: 'products',
  version: 1,
  label: 'Produits',
  description: 'Votre catalogue, avec ou sans achat en ligne.',
  icon: 'package',
  category: 'metier',
  requiresModule: 'products',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    categoryId: z.string().uuid().nullable().default(null),
    limit: z.number().int().min(2).max(48).default(12),
    onlyFeatured: z.boolean().default(false),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    showAddToCart: z.boolean().default(true),
  }),
  defaults: {
    title: 'Notre sélection',
    subtitle: '',
    categoryId: null,
    limit: 12,
    onlyFeatured: false,
    columns: 3,
    showAddToCart: true,
  },
});

export const cartBlock = define({
  type: 'cart',
  version: 1,
  label: 'Panier',
  description: 'Le récapitulatif de commande et le paiement.',
  icon: 'shopping-cart',
  category: 'metier',
  requiresModule: 'orders',
  singleton: true,
  schema: z.object({
    title: text(120),
  }),
  defaults: { title: 'Votre commande' },
});

export const propertiesBlock = define({
  type: 'properties',
  version: 1,
  label: 'Biens',
  description: 'Vos annonces immobilières avec surface, DPE et photos.',
  icon: 'building-2',
  category: 'metier',
  requiresModule: 'properties',
  schema: z.object({
    title: text(120),
    transactionKind: z.enum(['all', 'sale', 'rent', 'seasonal']).default('all'),
    limit: z.number().int().min(2).max(48).default(9),
    columns: z.union([z.literal(2), z.literal(3)]).default(3),
  }),
  defaults: { title: 'Nos biens', transactionKind: 'all', limit: 9, columns: 3 },
});

export const searchPropertiesBlock = define({
  type: 'search-properties',
  version: 1,
  label: 'Recherche de biens',
  description: 'Un moteur de recherche simple par type, ville et budget.',
  icon: 'search',
  category: 'metier',
  requiresModule: 'properties',
  schema: z.object({
    title: text(120),
    targetPath: z.string().max(200).default('/nos-biens'),
  }),
  defaults: { title: 'Trouvez votre bien', targetPath: '/nos-biens' },
});

export const roomsBlock = define({
  type: 'rooms',
  version: 1,
  label: 'Chambres',
  description: 'Vos hébergements, leurs équipements et leurs tarifs.',
  icon: 'bed-double',
  category: 'metier',
  requiresModule: 'rooms',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    showPrices: z.boolean().default(true),
    showBookingButton: z.boolean().default(true),
  }),
  defaults: { title: 'Nos chambres', subtitle: '', showPrices: true, showBookingButton: true },
});

export const portfolioBlock = define({
  type: 'portfolio',
  version: 1,
  label: 'Réalisations',
  description: 'Vos chantiers et projets terminés.',
  icon: 'layout-grid',
  category: 'preuve',
  requiresModule: 'portfolio',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    limit: z.number().int().min(2).max(36).default(9),
    columns: z.union([z.literal(2), z.literal(3)]).default(3),
  }),
  defaults: { title: 'Nos réalisations', subtitle: '', limit: 9, columns: 3 },
});

export const beforeAfterBlock = define({
  type: 'before-after',
  version: 1,
  label: 'Avant / après',
  description: 'Deux photos comparées : la preuve la plus convaincante.',
  icon: 'columns-2',
  category: 'preuve',
  requiresModule: 'portfolio',
  schema: z.object({
    title: text(120),
    items: z
      .array(
        z.object({
          label: z.string().max(80).default(''),
          before: mediaRefSchema,
          after: mediaRefSchema,
        }),
      )
      .max(12)
      .default([]),
  }),
  defaults: { title: 'Avant / après', items: [] },
});

export const serviceAreaBlock = define({
  type: 'service-area',
  version: 1,
  label: 'Zones d’intervention',
  description: 'Les communes que vous couvrez — essentiel pour être trouvé.',
  icon: 'map-pin',
  category: 'metier',
  requiresModule: 'service-area',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    layout: z.enum(['tags', 'columns', 'map']).default('tags'),
  }),
  defaults: { title: 'Zones d’intervention', subtitle: '', layout: 'tags' },
});

export const eventsBlock = define({
  type: 'events',
  version: 1,
  label: 'Événements',
  description: 'Votre agenda et vos prochaines dates.',
  icon: 'calendar-days',
  category: 'metier',
  requiresModule: 'events',
  schema: z.object({
    title: text(120),
    limit: z.number().int().min(1).max(24).default(6),
    showPast: z.boolean().default(false),
  }),
  defaults: { title: 'Nos événements', limit: 6, showPast: false },
});

export const articlesBlock = define({
  type: 'articles',
  version: 1,
  label: 'Actualités',
  description: 'Vos derniers articles, bons pour votre référencement.',
  icon: 'newspaper',
  category: 'metier',
  requiresModule: 'blog',
  schema: z.object({
    title: text(120),
    limit: z.number().int().min(1).max(24).default(3),
    columns: z.union([z.literal(2), z.literal(3)]).default(3),
  }),
  defaults: { title: 'Actualités', limit: 3, columns: 3 },
});

export const newsletterBlock = define({
  type: 'newsletter',
  version: 1,
  label: 'Newsletter',
  description: 'Collectez des inscriptions avec un consentement explicite.',
  icon: 'send',
  category: 'conversion',
  requiresModule: 'newsletter',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    consentText: z
      .string()
      .max(400)
      .default(
        'J’accepte de recevoir des actualités par e-mail. Je peux me désinscrire à tout moment.',
      ),
  }),
  defaults: { title: 'Restez informé', subtitle: '', consentText: '' },
});

export const donationBlock = define({
  type: 'donation',
  version: 1,
  label: 'Don',
  description: 'Recevez des dons ponctuels, directement sur votre compte.',
  icon: 'heart',
  category: 'metier',
  requiresModule: 'donations',
  schema: z.object({
    title: text(120),
    subtitle: text(300),
    presetAmountsCents: z
      .array(z.number().int().min(100).max(1_000_000))
      .max(6)
      .default([1000, 2500, 5000]),
    allowCustomAmount: z.boolean().default(true),
  }),
  defaults: {
    title: 'Soutenez notre action',
    subtitle: '',
    presetAmountsCents: [1000, 2500, 5000],
    allowCustomAmount: true,
  },
});

export const statsBlock = define({
  type: 'stats',
  version: 1,
  label: 'Chiffres clés',
  description: 'Vos chiffres vérifiables : années d’activité, projets, équipe.',
  icon: 'bar-chart-3',
  category: 'preuve',
  requiresModule: null,
  schema: z.object({
    items: z
      .array(
        z.object({
          value: z.string().max(20),
          label: z.string().max(60),
          suffix: z.string().max(10).default(''),
        }),
      )
      .max(4)
      .default([]),
  }),
  defaults: { items: [] },
});

export const logosBlock = define({
  type: 'logos',
  version: 1,
  label: 'Partenaires',
  description: 'Les logos de vos partenaires, labels ou certifications.',
  icon: 'badge',
  category: 'preuve',
  requiresModule: null,
  schema: z.object({
    title: text(120),
    items: z.array(mediaRefSchema).max(20).default([]),
    grayscale: z.boolean().default(true),
  }),
  defaults: { title: '', items: [], grayscale: true },
});

export const embedBlock = define({
  type: 'embed',
  version: 1,
  label: 'Contenu intégré',
  description: 'Une vidéo ou une carte provenant d’un service approuvé.',
  icon: 'code',
  category: 'contenu',
  requiresModule: null,
  schema: z.object({
    title: text(120),
    /**
     * Allowlist stricte : seuls ces fournisseurs sont acceptes. Un client ne
     * peut PAS coller une iframe arbitraire — ce serait ouvrir l execution de
     * code tiers sur son propre domaine.
     */
    provider: z.enum(['youtube', 'vimeo', 'openstreetmap', 'google-maps', 'calendly']),
    /** Identifiant chez le fournisseur, jamais une URL libre. */
    resourceId: z
      .string()
      .max(200)
      .regex(/^[A-Za-z0-9_\-/.,+%:?=&]*$/, 'Identifiant invalide.'),
    aspectRatio: z.enum(['16:9', '4:3', '1:1']).default('16:9'),
  }),
  defaults: { title: '', provider: 'youtube', resourceId: '', aspectRatio: '16:9' },
});

export const legalNoticeBlock = define({
  type: 'legal-notice',
  version: 1,
  label: 'Mentions légales',
  description:
    'Vos mentions légales, rédigées automatiquement à partir des informations de « Mon entreprise ».',
  icon: 'scale',
  category: 'structure',
  requiresModule: null,
  singleton: true,
  schema: z.object({
    /** Complement libre : credits photo, conditions particulieres… */
    extra: z.array(richParagraphSchema).max(30).default([]),
  }),
  defaults: { extra: [] },
});

export const privacyNoticeBlock = define({
  type: 'privacy-notice',
  version: 1,
  label: 'Politique de confidentialité',
  description:
    'Votre politique de confidentialité, adaptée automatiquement aux fonctionnalités de votre site.',
  icon: 'shield-check',
  category: 'structure',
  requiresModule: null,
  singleton: true,
  schema: z.object({
    extra: z.array(richParagraphSchema).max(30).default([]),
  }),
  defaults: { extra: [] },
});

export const salesTermsBlock = define({
  type: 'sales-terms',
  version: 1,
  label: 'Conditions générales de vente',
  description:
    'Les conditions de vente de votre boutique, avec les mentions obligatoires pour vendre à des particuliers.',
  icon: 'file-text',
  category: 'structure',
  requiresModule: 'orders',
  singleton: true,
  schema: z.object({
    /** Delai de livraison ou de retrait annonce, en jours. */
    deliveryDays: z.number().int().min(1).max(30).default(7),
    /** Produits perissables ou personnalises : pas de droit de retractation. */
    perishable: z.boolean().default(false),
    extra: z.array(richParagraphSchema).max(40).default([]),
  }),
  defaults: { deliveryDays: 7, perishable: false, extra: [] },
});

/* -------------------------------------------------------------------------- */

export const BLOCK_DEFINITIONS = [
  heroBlock,
  introBlock,
  sectionHeadingBlock,
  richTextBlock,
  galleryBlock,
  featuresBlock,
  trustBlock,
  processBlock,
  servicesBlock,
  pricingBlock,
  testimonialsBlock,
  faqBlock,
  ctaBlock,
  contactBlock,
  quoteFormBlock,
  mapBlock,
  openingHoursBlock,
  teamBlock,
  menuBlock,
  menuPreviewBlock,
  bookingBlock,
  productsBlock,
  cartBlock,
  propertiesBlock,
  searchPropertiesBlock,
  roomsBlock,
  portfolioBlock,
  beforeAfterBlock,
  serviceAreaBlock,
  eventsBlock,
  articlesBlock,
  newsletterBlock,
  donationBlock,
  statsBlock,
  logosBlock,
  embedBlock,
  legalNoticeBlock,
  privacyNoticeBlock,
  salesTermsBlock,
] as const satisfies readonly BlockDefinition[];

export type BlockType = (typeof BLOCK_DEFINITIONS)[number]['type'];

const BLOCK_INDEX = new Map<string, BlockDefinition>(
  BLOCK_DEFINITIONS.map((definition) => [definition.type, definition as BlockDefinition]),
);

export function getBlockDefinition(type: string): BlockDefinition | undefined {
  return BLOCK_INDEX.get(type);
}

export function isKnownBlockType(type: string): type is BlockType {
  return BLOCK_INDEX.has(type);
}

/** Blocs proposables dans l editeur pour un ensemble de modules actifs. */
export function availableBlocks(enabledModules: readonly string[]): BlockDefinition[] {
  const modules = new Set(enabledModules);
  return BLOCK_DEFINITIONS.filter(
    (definition) => definition.requiresModule === null || modules.has(definition.requiresModule),
  ) as BlockDefinition[];
}

export interface ParsedBlock {
  id: string;
  type: string;
  version: number;
  props: Record<string, unknown>;
  settings: z.infer<typeof blockSettingsSchema>;
}

export interface BlockParseResult {
  block: ParsedBlock | null;
  errors: string[];
}

/**
 * Valide un bloc a l ECRITURE et a la LECTURE.
 *
 * Revalider a la lecture protege contre un contenu ecrit par une version
 * anterieure du schema ou altere par une voie inattendue : un bloc invalide
 * est ignore au rendu plutot que d etre affiche tel quel.
 */
export function parseBlock(input: {
  id?: string;
  type: string;
  version?: number;
  props?: unknown;
  settings?: unknown;
}): BlockParseResult {
  const definition = getBlockDefinition(input.type);
  if (!definition) {
    return { block: null, errors: [`Type de bloc inconnu : ${input.type}`] };
  }

  const props = definition.schema.safeParse(input.props ?? {});
  const settings = blockSettingsSchema.safeParse(input.settings ?? {});

  if (!props.success) {
    return {
      block: null,
      errors: props.error.issues.map((i) => `${input.type}.${i.path.join('.')}: ${i.message}`),
    };
  }

  return {
    block: {
      id: input.id ?? '',
      type: definition.type,
      version: definition.version,
      props: props.data as Record<string, unknown>,
      settings: settings.success ? settings.data : blockSettingsSchema.parse({}),
    },
    errors: [],
  };
}

/** Bloc pret a inserer, rempli avec ses valeurs par defaut. */
/**
 * Contenu de depart d une section ajoutee depuis l editeur.
 *
 * La bibliotheque promet « un contenu d exemple que vous remplacerez » : une
 * section Questions fréquentes sans aucune question ne s afficherait meme pas
 * en ligne, et le client croirait que l ajout a echoue.
 *
 * Deux regles : les textes sont vrais pour presque tout le monde, ou
 * signales comme textes d exemple avant publication (voir
 * publication-checks.ts) ; et JAMAIS de faux avis, de faux chiffres ni de
 * faux logos de clients — ceux-la restent vides tant que le client ne les a
 * pas saisis.
 */
export const STARTER_PLACEHOLDER = 'Remplacez ce texte';

const STARTERS: Record<string, Record<string, unknown>> = {
  intro: {
    body: [
      {
        kind: 'paragraph',
        text:
          'Présentez votre histoire, votre équipe et ce qui fait votre différence. ' +
          'Un texte sincère vaut mieux qu’un discours générique.',
      },
    ],
  },
  'rich-text': {
    blocks: [
      {
        kind: 'paragraph',
        text: `${STARTER_PLACEHOLDER} par le vôtre : cliquez dessus pour l’écrire.`,
      },
    ],
  },
  features: {
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
        icon: 'handshake',
        title: 'Conseil personnalisé',
        description: 'Nous prenons le temps de comprendre votre besoin.',
      },
    ],
  },
  process: {
    steps: [
      { title: 'Vous nous contactez', description: 'Par téléphone ou avec le formulaire.' },
      { title: 'Nous en parlons', description: 'Nous faisons le point sur votre besoin.' },
      {
        title: 'Nous nous occupons de tout',
        description: 'Et vous tenons informé à chaque étape.',
      },
    ],
  },
  faq: {
    items: [
      {
        question: 'Comment vous contacter ?',
        answer:
          'Par téléphone, par e-mail ou avec le formulaire de contact de ce site. ' +
          'Nous vous répondons rapidement.',
      },
      {
        question: 'Où vous trouver ?',
        answer: 'Notre adresse et nos horaires sont indiqués sur la page Contact.',
      },
    ],
  },
  cta: { subtitle: 'Écrivez-nous ou appelez-nous : nous vous répondons rapidement.' },
};

/** Section prete a etre ajoutee par le client, avec son contenu de depart. */
export function createStarterBlock(type: string): ParsedBlock | null {
  const definition = getBlockDefinition(type);
  if (!definition) return null;
  const starter = STARTERS[type];
  if (!starter) return createBlock(type);
  const parsed = definition.schema.safeParse({
    ...(definition.defaults as Record<string, unknown>),
    ...starter,
  });
  if (!parsed.success) return createBlock(type);
  return {
    id: '',
    type: definition.type,
    version: definition.version,
    props: parsed.data as Record<string, unknown>,
    settings: blockSettingsSchema.parse({}),
  };
}

export function createBlock(type: string): ParsedBlock | null {
  const definition = getBlockDefinition(type);
  if (!definition) return null;
  const props = definition.schema.parse(definition.defaults);
  return {
    id: '',
    type: definition.type,
    version: definition.version,
    props: props as Record<string, unknown>,
    settings: blockSettingsSchema.parse({}),
  };
}
