import type { ModuleId, OnboardingQuestion, PageBlueprint, SectorDefinition } from './types.js';

/**
 * Secteurs d'activite. Chaque secteur porte des defauts (modules, pages,
 * questions d'onboarding, direction artistique) dont chaque metier herite.
 * Ajouter un metier ne demande donc qu'une ligne de configuration.
 */

const COMMON_MODULES: readonly ModuleId[] = ['contact', 'gallery', 'testimonials', 'faq'];

function page(
  path: string,
  title: string,
  kind: string,
  blocks: string[],
  showInNav = true,
): PageBlueprint {
  return { path, title, kind, blocks, showInNav };
}

const HOME = (blocks: string[]) => page('/', 'Accueil', 'home', blocks);
const CONTACT_PAGE = page('/contact', 'Contact', 'contact', [
  'section-heading',
  'contact',
  'opening-hours',
  'map',
]);

/** Questions posees a tous les metiers, quelle que soit l'activite. */
export const COMMON_ONBOARDING: readonly OnboardingQuestion[] = [
  {
    id: 'business_name',
    label: 'Quel est le nom de votre entreprise ?',
    type: 'text',
    required: true,
    placeholder: 'Tel qu’il doit apparaitre sur le site',
  },
  {
    id: 'city',
    label: 'Dans quelle ville exercez-vous ?',
    type: 'text',
    required: true,
    help: 'Determinant pour votre referencement local.',
  },
  {
    id: 'phone',
    label: 'Numero de telephone affiche sur le site',
    type: 'text',
    required: true,
  },
  {
    id: 'email',
    label: 'Adresse e-mail de contact',
    type: 'text',
    required: true,
    help: 'C’est ici que vous recevrez les messages de vos visiteurs.',
  },
  {
    id: 'pitch',
    label: 'En une phrase, que faites-vous ?',
    type: 'textarea',
    required: true,
    help: 'Cette phrase servira d’accroche principale. Nous la retravaillerons avec vous.',
  },
  {
    id: 'differentiator',
    label: 'Qu’est-ce qui vous distingue de vos concurrents ?',
    type: 'textarea',
    required: false,
  },
  {
    id: 'has_logo',
    label: 'Disposez-vous d’un logo ?',
    type: 'boolean',
    required: true,
  },
  {
    id: 'has_photos',
    label: 'Disposez-vous de photos de votre activite ?',
    type: 'boolean',
    required: true,
    help: 'Sinon, nous vous guiderons ou proposerons une alternative visuelle.',
  },
  {
    id: 'existing_website',
    label: 'Avez-vous deja un site internet ?',
    type: 'url',
    required: false,
    placeholder: 'https://',
  },
];

export const SECTORS: readonly SectorDefinition[] = [
  {
    id: 'restauration',
    label: 'Restauration',
    description: 'Restaurants, bars, boulangeries, traiteurs et metiers de bouche.',
    icon: 'utensils',
    sortOrder: 10,
    defaultModules: [...COMMON_MODULES, 'opening-hours', 'restaurant-menu'],
    defaultPages: [
      HOME(['hero', 'intro', 'menu-preview', 'gallery', 'opening-hours', 'testimonials', 'cta']),
      page('/carte', 'La carte', 'menu', ['section-heading', 'menu']),
      page('/le-restaurant', 'Le restaurant', 'standard', [
        'section-heading',
        'rich-text',
        'gallery',
        'team',
      ]),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'cuisine_type',
        label: 'Quel type de cuisine proposez-vous ?',
        type: 'text',
        required: true,
        placeholder: 'Bistronomique, italienne, cuisine du marche…',
      },
      {
        id: 'seats',
        label: 'Combien de couverts pouvez-vous accueillir ?',
        type: 'number',
        required: false,
      },
      {
        id: 'accepts_bookings',
        label: 'Souhaitez-vous recevoir des reservations depuis le site ?',
        type: 'boolean',
        required: true,
      },
      {
        id: 'has_terrace',
        label: 'Disposez-vous d’une terrasse ?',
        type: 'boolean',
        required: false,
      },
    ],
    theme: { preset: 'ember', fontHeading: 'fraunces', fontBody: 'geist', accent: '#C2703A' },
  },
  {
    id: 'beaute-bien-etre',
    label: 'Beaute & bien-etre',
    description: 'Coiffure, esthetique, spa, massage et soins du corps.',
    icon: 'sparkles',
    sortOrder: 20,
    defaultModules: [...COMMON_MODULES, 'opening-hours', 'services', 'team'],
    defaultPages: [
      HOME(['hero', 'intro', 'services', 'gallery', 'team', 'testimonials', 'cta']),
      page('/prestations', 'Prestations & tarifs', 'services', ['section-heading', 'services']),
      page('/equipe', 'L’equipe', 'team', ['section-heading', 'team']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'accepts_bookings',
        label: 'Souhaitez-vous recevoir des rendez-vous depuis le site ?',
        type: 'boolean',
        required: true,
      },
      {
        id: 'team_size',
        label: 'Combien de personnes composent votre equipe ?',
        type: 'number',
        required: false,
      },
      {
        id: 'brands',
        label: 'Quelles marques ou produits utilisez-vous ?',
        type: 'text',
        required: false,
      },
    ],
    theme: { preset: 'lumen', fontHeading: 'instrument-serif', fontBody: 'geist', accent: '#B08D6A' },
  },
  {
    id: 'artisanat',
    label: 'Artisanat & batiment',
    description: 'Metiers du batiment, de la renovation et de l’artisanat.',
    icon: 'hammer',
    sortOrder: 30,
    defaultModules: [...COMMON_MODULES, 'services', 'service-area', 'portfolio', 'quotes'],
    defaultPages: [
      HOME(['hero', 'trust', 'services', 'portfolio', 'service-area', 'testimonials', 'quote-form']),
      page('/prestations', 'Nos prestations', 'services', ['section-heading', 'services']),
      page('/realisations', 'Realisations', 'standard', ['section-heading', 'portfolio']),
      page('/devis', 'Demander un devis', 'contact', ['section-heading', 'quote-form']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'intervention_area',
        label: 'Quelles communes couvrez-vous ?',
        type: 'textarea',
        required: true,
        help: 'Determinant pour apparaitre dans les recherches locales.',
      },
      {
        id: 'emergency',
        label: 'Proposez-vous des interventions d’urgence ?',
        type: 'boolean',
        required: true,
      },
      {
        id: 'certifications',
        label: 'Avez-vous des certifications ou labels (RGE, Qualibat…) ?',
        type: 'text',
        required: false,
      },
      {
        id: 'insurance',
        label: 'Assurance decennale a mentionner ?',
        type: 'text',
        required: false,
      },
    ],
    theme: { preset: 'graphite', fontHeading: 'geist', fontBody: 'geist', accent: '#3B82F6' },
  },
  {
    id: 'commerce',
    label: 'Commerce & boutique',
    description: 'Commerces de proximite, boutiques et vente en ligne.',
    icon: 'shopping-bag',
    sortOrder: 40,
    defaultModules: [...COMMON_MODULES, 'opening-hours', 'products', 'orders', 'payments'],
    defaultPages: [
      HOME(['hero', 'intro', 'products', 'gallery', 'opening-hours', 'testimonials', 'cta']),
      page('/boutique', 'Boutique', 'products', ['section-heading', 'products']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'sells_online',
        label: 'Souhaitez-vous vendre en ligne ?',
        type: 'boolean',
        required: true,
      },
      {
        id: 'catalog_size',
        label: 'Combien de produits environ ?',
        type: 'number',
        required: false,
        showIf: { field: 'sells_online', equals: true },
      },
      {
        id: 'delivery',
        label: 'Quels modes de retrait ou de livraison proposez-vous ?',
        type: 'multiselect',
        required: false,
        options: [
          { value: 'pickup', label: 'Retrait en boutique' },
          { value: 'delivery', label: 'Livraison locale' },
          { value: 'shipping', label: 'Expedition postale' },
        ],
        showIf: { field: 'sells_online', equals: true },
      },
    ],
    theme: { preset: 'graphite', fontHeading: 'geist', fontBody: 'geist', accent: '#7C5CFF' },
  },
  {
    id: 'services-professionnels',
    label: 'Services professionnels',
    description: 'Conseil, expertise, professions liberales et cabinets.',
    icon: 'briefcase',
    sortOrder: 50,
    defaultModules: [...COMMON_MODULES, 'services', 'team', 'quotes'],
    defaultPages: [
      HOME(['hero', 'trust', 'services', 'process', 'team', 'testimonials', 'cta']),
      page('/expertises', 'Nos expertises', 'services', ['section-heading', 'services']),
      page('/equipe', 'L’equipe', 'team', ['section-heading', 'team']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'clientele',
        label: 'Qui sont vos clients ?',
        type: 'select',
        required: true,
        options: [
          { value: 'b2b', label: 'Des entreprises' },
          { value: 'b2c', label: 'Des particuliers' },
          { value: 'both', label: 'Les deux' },
        ],
      },
      {
        id: 'appointments',
        label: 'Souhaitez-vous recevoir des prises de rendez-vous ?',
        type: 'boolean',
        required: true,
      },
      {
        id: 'credentials',
        label: 'Diplomes, ordres professionnels ou agrements a mentionner ?',
        type: 'text',
        required: false,
      },
    ],
    theme: { preset: 'graphite', fontHeading: 'geist', fontBody: 'geist', accent: '#2563EB' },
  },
  {
    id: 'immobilier',
    label: 'Immobilier',
    description: 'Agences, mandataires, gestion locative et diagnostic.',
    icon: 'building-2',
    sortOrder: 60,
    defaultModules: [...COMMON_MODULES, 'properties', 'team', 'quotes'],
    defaultPages: [
      HOME(['hero', 'search-properties', 'properties', 'trust', 'team', 'testimonials', 'cta']),
      page('/nos-biens', 'Nos biens', 'listing', ['section-heading', 'properties']),
      page('/estimation', 'Estimation gratuite', 'contact', ['section-heading', 'quote-form']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'transaction_types',
        label: 'Quelles transactions traitez-vous ?',
        type: 'multiselect',
        required: true,
        options: [
          { value: 'sale', label: 'Vente' },
          { value: 'rent', label: 'Location' },
          { value: 'seasonal', label: 'Location saisonniere' },
        ],
      },
      {
        id: 'card_number',
        label: 'Numero de carte professionnelle',
        type: 'text',
        required: false,
        help: 'Mention obligatoire pour les professionnels de l’immobilier.',
      },
    ],
    theme: { preset: 'slate', fontHeading: 'geist', fontBody: 'geist', accent: '#0EA5E9' },
  },
  {
    id: 'hebergement-tourisme',
    label: 'Hebergement & tourisme',
    description: 'Hotels, chambres d’hotes, gites et activites touristiques.',
    icon: 'bed-double',
    sortOrder: 70,
    defaultModules: [...COMMON_MODULES, 'opening-hours', 'rooms', 'services'],
    defaultPages: [
      HOME(['hero', 'intro', 'rooms', 'gallery', 'services', 'testimonials', 'cta']),
      page('/chambres', 'Nos chambres', 'listing', ['section-heading', 'rooms']),
      page('/services', 'Services', 'services', ['section-heading', 'services']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'room_count',
        label: 'Combien de chambres ou d’hebergements proposez-vous ?',
        type: 'number',
        required: true,
      },
      {
        id: 'booking_mode',
        label: 'Comment souhaitez-vous recevoir les reservations ?',
        type: 'select',
        required: true,
        options: [
          { value: 'request', label: 'Demandes de sejour a valider' },
          { value: 'instant', label: 'Reservation directe avec acompte' },
          { value: 'external', label: 'Je passe par une plateforme externe' },
        ],
      },
      { id: 'breakfast', label: 'Le petit-dejeuner est-il inclus ?', type: 'boolean', required: false },
    ],
    theme: { preset: 'lumen', fontHeading: 'fraunces', fontBody: 'geist', accent: '#0F766E' },
  },
  {
    id: 'sante',
    label: 'Sante & paramedical',
    description: 'Praticiens, cabinets et professions de sante.',
    icon: 'stethoscope',
    sortOrder: 80,
    defaultModules: [...COMMON_MODULES, 'opening-hours', 'services', 'team'],
    defaultPages: [
      HOME(['hero', 'intro', 'services', 'team', 'opening-hours', 'faq', 'cta']),
      page('/le-cabinet', 'Le cabinet', 'standard', ['section-heading', 'rich-text', 'gallery']),
      page('/soins', 'Soins proposes', 'services', ['section-heading', 'services']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'appointments',
        label: 'Souhaitez-vous recevoir des demandes de rendez-vous ?',
        type: 'boolean',
        required: true,
      },
      {
        id: 'conventioned',
        label: 'Etes-vous conventionne ?',
        type: 'select',
        required: false,
        options: [
          { value: 'sector1', label: 'Secteur 1' },
          { value: 'sector2', label: 'Secteur 2' },
          { value: 'none', label: 'Non conventionne' },
        ],
      },
      {
        id: 'rpps',
        label: 'Numero RPPS ou ADELI a afficher',
        type: 'text',
        required: false,
      },
    ],
    theme: { preset: 'lumen', fontHeading: 'geist', fontBody: 'geist', accent: '#0D9488' },
  },
  {
    id: 'automobile',
    label: 'Automobile & mobilite',
    description: 'Garages, carrosseries, concessions et mobilite.',
    icon: 'car',
    sortOrder: 90,
    defaultModules: [...COMMON_MODULES, 'opening-hours', 'services', 'team', 'quotes'],
    defaultPages: [
      HOME(['hero', 'services', 'trust', 'gallery', 'testimonials', 'quote-form']),
      page('/prestations', 'Nos prestations', 'services', ['section-heading', 'services']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'vehicle_types',
        label: 'Quels vehicules prenez-vous en charge ?',
        type: 'text',
        required: false,
      },
      {
        id: 'courtesy_car',
        label: 'Proposez-vous un vehicule de courtoisie ?',
        type: 'boolean',
        required: false,
      },
    ],
    theme: { preset: 'graphite', fontHeading: 'geist', fontBody: 'geist', accent: '#EF4444' },
  },
  {
    id: 'sport',
    label: 'Sport & loisirs',
    description: 'Salles, clubs, coachs et activites sportives.',
    icon: 'dumbbell',
    sortOrder: 100,
    defaultModules: [...COMMON_MODULES, 'opening-hours', 'services', 'team'],
    defaultPages: [
      HOME(['hero', 'intro', 'services', 'gallery', 'team', 'testimonials', 'cta']),
      page('/activites', 'Nos activites', 'services', ['section-heading', 'services']),
      page('/tarifs', 'Tarifs', 'standard', ['section-heading', 'pricing']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'disciplines',
        label: 'Quelles disciplines proposez-vous ?',
        type: 'text',
        required: true,
      },
      {
        id: 'memberships',
        label: 'Vendez-vous des abonnements ?',
        type: 'boolean',
        required: false,
      },
    ],
    theme: { preset: 'graphite', fontHeading: 'sora', fontBody: 'geist', accent: '#22C55E' },
  },
  {
    id: 'evenementiel',
    label: 'Evenementiel',
    description: 'Organisation, prestation et location evenementielle.',
    icon: 'party-popper',
    sortOrder: 110,
    defaultModules: [...COMMON_MODULES, 'portfolio', 'services', 'quotes'],
    defaultPages: [
      HOME(['hero', 'portfolio', 'services', 'process', 'testimonials', 'quote-form']),
      page('/realisations', 'Realisations', 'standard', ['section-heading', 'portfolio']),
      page('/devis', 'Demander un devis', 'contact', ['section-heading', 'quote-form']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'event_types',
        label: 'Quels types d’evenements traitez-vous ?',
        type: 'text',
        required: true,
      },
      { id: 'coverage', label: 'Quelle zone geographique couvrez-vous ?', type: 'text', required: false },
    ],
    theme: { preset: 'nocturne', fontHeading: 'sora', fontBody: 'geist', accent: '#A855F7' },
  },
  {
    id: 'education',
    label: 'Education & formation',
    description: 'Ecoles, formateurs, soutien scolaire et auto-ecoles.',
    icon: 'graduation-cap',
    sortOrder: 120,
    defaultModules: [...COMMON_MODULES, 'services', 'team', 'opening-hours'],
    defaultPages: [
      HOME(['hero', 'intro', 'services', 'trust', 'team', 'faq', 'cta']),
      page('/formations', 'Nos formations', 'services', ['section-heading', 'services']),
      CONTACT_PAGE,
    ],
    onboarding: [
      { id: 'audience', label: 'A qui s’adressent vos formations ?', type: 'text', required: true },
      {
        id: 'certification',
        label: 'Etes-vous certifie Qualiopi ou equivalent ?',
        type: 'boolean',
        required: false,
      },
    ],
    theme: { preset: 'slate', fontHeading: 'geist', fontBody: 'geist', accent: '#6366F1' },
  },
  {
    id: 'associations',
    label: 'Associations',
    description: 'Associations, clubs et structures a but non lucratif.',
    icon: 'heart-handshake',
    sortOrder: 130,
    defaultModules: [...COMMON_MODULES, 'blog', 'events', 'newsletter'],
    defaultPages: [
      HOME(['hero', 'intro', 'articles', 'events', 'cta']),
      page('/actualites', 'Actualites', 'blog', ['section-heading', 'articles']),
      page('/adherer', 'Adherer', 'standard', ['section-heading', 'rich-text', 'contact']),
      CONTACT_PAGE,
    ],
    onboarding: [
      { id: 'mission', label: 'Quelle est la mission de l’association ?', type: 'textarea', required: true },
      { id: 'members', label: 'Combien d’adherents comptez-vous ?', type: 'number', required: false },
      { id: 'donations', label: 'Souhaitez-vous recevoir des dons en ligne ?', type: 'boolean', required: false },
    ],
    theme: { preset: 'lumen', fontHeading: 'geist', fontBody: 'geist', accent: '#F59E0B' },
  },
  {
    id: 'autre',
    label: 'Autre activite',
    description: 'Votre metier n’apparait pas ? Nous l’ajoutons pour vous.',
    icon: 'circle-ellipsis',
    sortOrder: 999,
    defaultModules: [...COMMON_MODULES, 'services'],
    defaultPages: [
      HOME(['hero', 'intro', 'services', 'gallery', 'testimonials', 'cta']),
      CONTACT_PAGE,
    ],
    onboarding: [
      {
        id: 'activity_description',
        label: 'Decrivez votre activite en quelques lignes',
        type: 'textarea',
        required: true,
      },
    ],
    theme: { preset: 'graphite', fontHeading: 'geist', fontBody: 'geist', accent: '#7C5CFF' },
  },
];

const SECTOR_INDEX = new Map(SECTORS.map((s) => [s.id, s]));

export function getSector(id: string): SectorDefinition | undefined {
  return SECTOR_INDEX.get(id);
}

export function listSectors(): readonly SectorDefinition[] {
  return [...SECTORS].sort((a, b) => a.sortOrder - b.sortOrder);
}
