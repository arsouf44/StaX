import 'server-only';
import type { z } from 'zod';
import {
  ALLERGENS,
  DIETARY_TAGS,
  availabilityRuleSchema,
  bookingServiceSchema,
  closureSchema,
  contactSchema,
  contentEntrySchema,
  menuCategorySchema,
  menuItemSchema,
  openingHourSchema,
  productCategorySchema,
  productSchema,
  propertySchema,
  roomSchema,
  serviceAreaSchema,
  serviceSchema,
  teamMemberSchema,
} from '@stax/validation';
import type { FeatureKey, OrgCapability } from '@stax/types';
import type { ModuleId } from '@stax/business';

/**
 * Registre des collections de l'espace client.
 *
 * Toutes les pages « liste d'elements » du metier — carte, prestations,
 * produits, biens, chambres, realisations, avis… — partagent UNE implementation.
 * Chaque collection ne declare que ce qui lui est propre : sa table, son schema
 * de validation, ses champs, ses droits.
 *
 * Ce choix n'est pas cosmetique. Il concentre en un seul endroit les trois
 * regles qui doivent etre vraies partout :
 *
 *  1. le schema Zod est une LISTE BLANCHE — aucune colonne non declaree ne peut
 *     etre ecrite, meme si le navigateur la poste (mass assignment) ;
 *  2. `site_id` et `organization_id` sont TOUJOURS imposes par le serveur a
 *     partir de la session, jamais lus dans le formulaire ;
 *  3. l'ecriture passe par le client Supabase porteur du JWT, donc par la RLS.
 *
 * Une collection ajoutee ici herite de ces trois garanties par construction.
 */

export type CollectionFieldKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'reference'
  | 'time'
  | 'date'
  | 'email'
  | 'tel';

export interface CollectionFieldOption {
  value: string;
  label: string;
}

export interface CollectionField {
  /** Cle du schema Zod (camelCase). */
  name: string;
  /** Colonne PostgreSQL (snake_case). */
  column: string;
  label: string;
  kind: CollectionFieldKind;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  options?: readonly CollectionFieldOption[];
  /** Pour `reference` : table lue pour construire la liste deroulante. */
  reference?: { table: string; labelColumn: string; orderColumn?: string };
  /** Type attendu par le schema Zod pour une liste deroulante. */
  valueType?: 'number';
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  rows?: number;
  /** Colonne affichee dans le tableau recapitulatif. */
  inList?: boolean;
  /** Occupe toute la largeur du formulaire. */
  wide?: boolean;
}

export interface CollectionDescriptor {
  id: CollectionId;
  table: string;
  /** Page de l'espace client qui affiche cette collection. */
  route: string;
  /** Module metier requis. `null` = disponible pour tous les sites. */
  module: ModuleId | null;
  /** Fonctionnalite d'offre requise. `null` = incluse partout. */
  feature: FeatureKey | null;
  viewCapability: OrgCapability;
  writeCapability: OrgCapability;
  /**
   * Portee de la collection :
   *  - `site` : la table ne porte que `site_id` ;
   *  - `site+org` : les deux colonnes, et les deux sont filtrees ;
   *  - `org` : la collection appartient a l'organisation et suit la personne
   *    d'un site a l'autre (un contact reste un contact).
   */
  scope: 'site' | 'site+org' | 'org';
  /** Rattache la ligne creee au site courant, sans filtrer les lectures dessus. */
  attachSiteOnCreate?: boolean;
  title: string;
  description: string;
  singular: string;
  addLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: string;
  schema: z.ZodType;
  fields: readonly CollectionField[];
  order: readonly { column: string; ascending: boolean }[];
  /** Champ source du slug, quand la table en exige un. */
  slugFrom?: string;
  /** Colonnes imposees par le serveur a la creation (jamais par le client). */
  fixed?: Record<string, string>;
  /** Colonne de rang manuel, quand la collection est reordonnable. */
  sortColumn?: string;
  /** Colonne de visibilite publique, pour l'interrupteur de la liste. */
  visibilityColumn?: string;
  /** Limite d'offre associee, pour l'affichage du quota. */
  limitKey?: 'max_products' | 'max_team_members';
}

const YES_NO_HELP = 'Visible signifie : affiché sur votre site public.';

function option(value: string, label: string): CollectionFieldOption {
  return { value, label };
}

const MENU_GROUPS = [
  option('main', 'Carte principale'),
  option('lunch', 'Formule du midi'),
  option('dinner', 'Carte du soir'),
  option('drinks', 'Boissons'),
  option('wine', 'Carte des vins'),
  option('dessert', 'Desserts'),
  option('brunch', 'Brunch'),
  option('set_menu', 'Menus'),
  option('kids', 'Menu enfant'),
];

const ALLERGEN_LABELS: Record<(typeof ALLERGENS)[number], string> = {
  gluten: 'Gluten',
  crustaces: 'Crustacés',
  oeufs: 'Œufs',
  poissons: 'Poissons',
  arachides: 'Arachides',
  soja: 'Soja',
  lait: 'Lait',
  'fruits-a-coque': 'Fruits à coque',
  celeri: 'Céleri',
  moutarde: 'Moutarde',
  sesame: 'Sésame',
  sulfites: 'Sulfites',
  lupin: 'Lupin',
  mollusques: 'Mollusques',
};

const DIETARY_LABELS: Record<(typeof DIETARY_TAGS)[number], string> = {
  vegetarien: 'Végétarien',
  vegan: 'Vegan',
  'sans-gluten': 'Sans gluten',
  'sans-lactose': 'Sans lactose',
  halal: 'Halal',
  'fait-maison': 'Fait maison',
  bio: 'Bio',
  local: 'Produit local',
};

const DAYS = [
  option('1', 'Lundi'),
  option('2', 'Mardi'),
  option('3', 'Mercredi'),
  option('4', 'Jeudi'),
  option('5', 'Vendredi'),
  option('6', 'Samedi'),
  option('0', 'Dimanche'),
];

const SERVICES_OF_DAY = [
  option('all_day', 'Toute la journée'),
  option('morning', 'Matin'),
  option('lunch', 'Midi'),
  option('afternoon', 'Après-midi'),
  option('dinner', 'Soir'),
  option('night', 'Nuit'),
];

const CONTENT_BASE_FIELDS: readonly CollectionField[] = [
  {
    name: 'title',
    column: 'title',
    label: 'Titre',
    kind: 'text',
    required: true,
    maxLength: 160,
    inList: true,
  },
  {
    name: 'excerpt',
    column: 'excerpt',
    label: 'Résumé',
    kind: 'textarea',
    hint: 'Deux ou trois phrases. C’est ce que les visiteurs lisent avant de cliquer.',
    maxLength: 400,
    rows: 3,
    wide: true,
  },
  {
    name: 'publishedAt',
    column: 'published_at',
    label: 'Date de publication',
    kind: 'date',
    hint: 'Laissez vide pour garder ce contenu en brouillon.',
    inList: true,
  },
  { name: 'isVisible', column: 'is_visible', label: 'Visible', kind: 'boolean', hint: YES_NO_HELP },
];

export const COLLECTIONS = {
  /* --- Restauration ------------------------------------------------------ */
  'menu-categories': {
    id: 'menu-categories',
    route: '/app/carte',
    table: 'menu_categories',
    module: 'restaurant-menu',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site',
    title: 'Catégories de la carte',
    description: 'Les sections de votre carte : entrées, plats, desserts, boissons…',
    singular: 'Catégorie',
    addLabel: 'Ajouter une catégorie',
    emptyTitle: 'Votre carte n’a pas encore de sections',
    emptyDescription:
      'Commencez par créer une section — « Entrées », « Plats », « Desserts » — puis ajoutez-y vos plats.',
    icon: 'layers',
    schema: menuCategorySchema,
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'name', ascending: true },
    ],
    fields: [
      {
        name: 'name',
        column: 'name',
        label: 'Nom de la section',
        kind: 'text',
        required: true,
        maxLength: 80,
        placeholder: 'Entrées',
        inList: true,
      },
      {
        name: 'menuGroup',
        column: 'menu_group',
        label: 'Apparaît sur',
        kind: 'select',
        options: MENU_GROUPS,
        inList: true,
      },
      {
        name: 'description',
        column: 'description',
        label: 'Description',
        kind: 'textarea',
        maxLength: 400,
        rows: 2,
        wide: true,
      },
      {
        name: 'isVisible',
        column: 'is_visible',
        label: 'Visible',
        kind: 'boolean',
        hint: YES_NO_HELP,
      },
    ],
  },

  'menu-items': {
    id: 'menu-items',
    route: '/app/carte',
    table: 'menu_items',
    module: 'restaurant-menu',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site',
    title: 'Plats et boissons',
    description:
      'Chaque plat, son prix et ses allergènes. L’affichage des allergènes est une obligation légale en France.',
    singular: 'Plat',
    addLabel: 'Ajouter un plat',
    emptyTitle: 'Aucun plat pour le moment',
    emptyDescription: 'Créez d’abord une section, puis ajoutez-y vos plats.',
    icon: 'utensils',
    schema: menuItemSchema,
    sortColumn: 'sort_order',
    visibilityColumn: 'is_available',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'name', ascending: true },
    ],
    fields: [
      {
        name: 'categoryId',
        column: 'category_id',
        label: 'Section',
        kind: 'reference',
        required: true,
        reference: { table: 'menu_categories', labelColumn: 'name', orderColumn: 'sort_order' },
        inList: true,
      },
      {
        name: 'name',
        column: 'name',
        label: 'Nom du plat',
        kind: 'text',
        required: true,
        maxLength: 120,
        inList: true,
      },
      {
        name: 'priceCents',
        column: 'price_cents',
        label: 'Prix',
        kind: 'money',
        hint: 'Laissez vide pour afficher « selon arrivage ».',
        inList: true,
      },
      {
        name: 'description',
        column: 'description',
        label: 'Description',
        kind: 'textarea',
        maxLength: 600,
        rows: 2,
        wide: true,
      },
      {
        name: 'allergens',
        column: 'allergens',
        label: 'Allergènes',
        kind: 'multiselect',
        hint: 'Les quatorze allergènes à déclaration obligatoire (règlement INCO).',
        options: ALLERGENS.map((value) => option(value, ALLERGEN_LABELS[value])),
        wide: true,
      },
      {
        name: 'dietaryTags',
        column: 'dietary_tags',
        label: 'Régimes et mentions',
        kind: 'multiselect',
        options: DIETARY_TAGS.map((value) => option(value, DIETARY_LABELS[value])),
        wide: true,
      },
      {
        name: 'isSignature',
        column: 'is_signature',
        label: 'Spécialité de la maison',
        kind: 'boolean',
      },
      {
        name: 'isAvailable',
        column: 'is_available',
        label: 'Disponible',
        kind: 'boolean',
        hint: 'Décochez pour retirer temporairement ce plat de la carte, sans le supprimer.',
      },
    ],
  },

  /* --- Prestations, équipe, zones ---------------------------------------- */
  services: {
    id: 'services',
    route: '/app/prestations',
    table: 'services',
    module: 'services',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site+org',
    title: 'Prestations',
    description: 'Ce que vous proposez, à quel prix et en combien de temps.',
    singular: 'Prestation',
    addLabel: 'Ajouter une prestation',
    emptyTitle: 'Aucune prestation',
    emptyDescription:
      'Décrivez vos interventions une par une : les visiteurs qui savent ce qu’ils achètent appellent davantage.',
    icon: 'wrench',
    schema: serviceSchema,
    slugFrom: 'name',
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'name', ascending: true },
    ],
    fields: [
      {
        name: 'name',
        column: 'name',
        label: 'Nom de la prestation',
        kind: 'text',
        required: true,
        maxLength: 120,
        placeholder: 'Dépannage plomberie',
        inList: true,
      },
      {
        name: 'category',
        column: 'category',
        label: 'Famille',
        kind: 'text',
        maxLength: 60,
        hint: 'Sert à regrouper vos prestations sur le site. Exemple : « Dépannage ».',
        inList: true,
      },
      { name: 'priceCents', column: 'price_cents', label: 'Prix', kind: 'money', inList: true },
      {
        name: 'priceFrom',
        column: 'price_from',
        label: 'Afficher « à partir de »',
        kind: 'boolean',
      },
      {
        name: 'priceSuffix',
        column: 'price_suffix',
        label: 'Unité affichée après le prix',
        kind: 'text',
        maxLength: 30,
        placeholder: '/ heure',
      },
      {
        name: 'durationMinutes',
        column: 'duration_minutes',
        label: 'Durée (minutes)',
        kind: 'number',
        min: 5,
        max: 1440,
      },
      {
        name: 'description',
        column: 'description',
        label: 'Description',
        kind: 'textarea',
        maxLength: 1500,
        rows: 4,
        wide: true,
      },
      {
        name: 'isEmergency',
        column: 'is_emergency',
        label: 'Intervention d’urgence',
        kind: 'boolean',
      },
      {
        name: 'isBookable',
        column: 'is_bookable',
        label: 'Réservable en ligne',
        kind: 'boolean',
      },
      {
        name: 'isVisible',
        column: 'is_visible',
        label: 'Visible',
        kind: 'boolean',
        hint: YES_NO_HELP,
      },
    ],
  },

  team: {
    id: 'team',
    route: '/app/equipe',
    table: 'team_members',
    module: 'team',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site+org',
    title: 'Votre équipe',
    description: 'Les personnes que vos clients rencontreront.',
    singular: 'Membre',
    addLabel: 'Ajouter une personne',
    emptyTitle: 'Aucune personne présentée',
    emptyDescription:
      'Montrer des visages rassure. Ajoutez au moins les personnes en contact avec la clientèle.',
    icon: 'users',
    schema: teamMemberSchema,
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    limitKey: 'max_team_members',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'full_name', ascending: true },
    ],
    fields: [
      {
        name: 'fullName',
        column: 'full_name',
        label: 'Nom et prénom',
        kind: 'text',
        required: true,
        maxLength: 100,
        inList: true,
      },
      {
        name: 'roleLabel',
        column: 'role_label',
        label: 'Fonction',
        kind: 'text',
        maxLength: 80,
        placeholder: 'Chef de cuisine',
        inList: true,
      },
      { name: 'email', column: 'email', label: 'E-mail', kind: 'email', maxLength: 180 },
      { name: 'phone', column: 'phone', label: 'Téléphone', kind: 'tel', maxLength: 30 },
      {
        name: 'bio',
        column: 'bio',
        label: 'Présentation',
        kind: 'textarea',
        maxLength: 1500,
        rows: 4,
        wide: true,
      },
      {
        name: 'acceptsBookings',
        column: 'accepts_bookings',
        label: 'Peut recevoir des rendez-vous',
        kind: 'boolean',
      },
      {
        name: 'isVisible',
        column: 'is_visible',
        label: 'Visible',
        kind: 'boolean',
        hint: YES_NO_HELP,
      },
    ],
  },

  'service-areas': {
    id: 'service-areas',
    route: '/app/zones',
    table: 'service_areas',
    module: 'service-area',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site',
    title: 'Zones d’intervention',
    description:
      'Les communes que vous desservez. Elles nourrissent votre référencement local et évitent les appels hors zone.',
    singular: 'Zone',
    addLabel: 'Ajouter une zone',
    emptyTitle: 'Aucune zone déclarée',
    emptyDescription:
      'Indiquez les villes où vous intervenez : c’est souvent la première question que se pose un visiteur.',
    icon: 'map-pin',
    schema: serviceAreaSchema,
    sortColumn: 'sort_order',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'label', ascending: true },
    ],
    fields: [
      {
        name: 'label',
        column: 'label',
        label: 'Libellé',
        kind: 'text',
        required: true,
        maxLength: 80,
        placeholder: 'Lyon et périphérie',
        inList: true,
      },
      { name: 'city', column: 'city', label: 'Ville', kind: 'text', maxLength: 80, inList: true },
      {
        name: 'postalCode',
        column: 'postal_code',
        label: 'Code postal',
        kind: 'text',
        maxLength: 12,
        inList: true,
      },
      {
        name: 'radiusKm',
        column: 'radius_km',
        label: 'Rayon (km)',
        kind: 'number',
        min: 1,
        max: 500,
        inList: true,
      },
    ],
  },

  /* --- Horaires ---------------------------------------------------------- */
  'opening-hours': {
    id: 'opening-hours',
    route: '/app/horaires',
    table: 'opening_hours',
    module: 'opening-hours',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site',
    title: 'Horaires d’ouverture',
    description:
      'Une ligne par créneau. Pour une coupure le midi, créez deux lignes sur la même journée.',
    singular: 'Créneau',
    addLabel: 'Ajouter un créneau',
    emptyTitle: 'Aucun horaire renseigné',
    emptyDescription:
      'Vos horaires sont l’information la plus consultée d’un site local. Renseignez-les en premier.',
    icon: 'clock',
    schema: openingHourSchema,
    sortColumn: 'sort_order',
    order: [
      { column: 'day_of_week', ascending: true },
      { column: 'opens_at', ascending: true },
    ],
    fields: [
      {
        name: 'dayOfWeek',
        column: 'day_of_week',
        label: 'Jour',
        kind: 'select',
        valueType: 'number',
        required: true,
        options: DAYS,
        inList: true,
      },
      {
        name: 'opensAt',
        column: 'opens_at',
        label: 'Ouverture',
        kind: 'time',
        required: true,
        inList: true,
      },
      {
        name: 'closesAt',
        column: 'closes_at',
        label: 'Fermeture',
        kind: 'time',
        required: true,
        inList: true,
      },
      {
        name: 'service',
        column: 'service',
        label: 'Service',
        kind: 'select',
        options: SERVICES_OF_DAY,
        inList: true,
      },
      {
        name: 'label',
        column: 'label',
        label: 'Mention affichée',
        kind: 'text',
        maxLength: 40,
        placeholder: 'Dernière commande à 21h30',
      },
    ],
  },

  closures: {
    id: 'closures',
    route: '/app/horaires',
    table: 'closures',
    module: 'opening-hours',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site',
    title: 'Fermetures exceptionnelles',
    description: 'Congés, jours fériés, travaux. Affichés sur votre site pendant la période.',
    singular: 'Fermeture',
    addLabel: 'Déclarer une fermeture',
    emptyTitle: 'Aucune fermeture prévue',
    emptyDescription:
      'Déclarez vos congés à l’avance : votre site l’annoncera et, si vous acceptez des réservations, les créneaux seront bloqués.',
    icon: 'calendar-off',
    schema: closureSchema,
    order: [{ column: 'starts_on', ascending: false }],
    fields: [
      {
        name: 'startsOn',
        column: 'starts_on',
        label: 'Du',
        kind: 'date',
        required: true,
        inList: true,
      },
      {
        name: 'endsOn',
        column: 'ends_on',
        label: 'Au',
        kind: 'date',
        required: true,
        hint: 'Dernier jour de fermeture inclus.',
        inList: true,
      },
      {
        name: 'reason',
        column: 'reason',
        label: 'Motif affiché',
        kind: 'text',
        maxLength: 120,
        placeholder: 'Congés annuels',
        inList: true,
      },
      {
        name: 'blocksBooking',
        column: 'blocks_booking',
        label: 'Bloquer aussi les réservations',
        kind: 'boolean',
      },
    ],
  },

  /* --- Réservations ------------------------------------------------------ */
  'booking-services': {
    id: 'booking-services',
    route: '/app/disponibilites',
    table: 'booking_services',
    module: 'booking',
    feature: 'bookings',
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site+org',
    title: 'Prestations réservables',
    description:
      'Ce que vos clients peuvent réserver en ligne, et les règles associées : durée, capacité, délai de prévenance.',
    singular: 'Prestation réservable',
    addLabel: 'Ajouter une prestation réservable',
    emptyTitle: 'Rien n’est réservable pour l’instant',
    emptyDescription:
      'Créez une prestation réservable, puis déclarez vos plages horaires juste en dessous.',
    icon: 'calendar-check',
    schema: bookingServiceSchema,
    sortColumn: 'sort_order',
    visibilityColumn: 'is_active',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'name', ascending: true },
    ],
    fields: [
      {
        name: 'name',
        column: 'name',
        label: 'Nom',
        kind: 'text',
        required: true,
        maxLength: 120,
        placeholder: 'Table pour le dîner',
        inList: true,
      },
      {
        name: 'durationMinutes',
        column: 'duration_minutes',
        label: 'Durée (minutes)',
        kind: 'number',
        min: 5,
        max: 1440,
        inList: true,
      },
      {
        name: 'bufferMinutes',
        column: 'buffer_minutes',
        label: 'Battement après (minutes)',
        kind: 'number',
        min: 0,
        max: 240,
        hint: 'Temps de remise en état entre deux rendez-vous.',
      },
      {
        name: 'capacityPerSlot',
        column: 'capacity_per_slot',
        label: 'Places par créneau',
        kind: 'number',
        min: 1,
        max: 500,
        inList: true,
      },
      {
        name: 'leadTimeHours',
        column: 'lead_time_hours',
        label: 'Délai minimum (heures)',
        kind: 'number',
        min: 0,
        max: 720,
        hint: 'On ne peut pas réserver moins de X heures à l’avance.',
      },
      {
        name: 'horizonDays',
        column: 'horizon_days',
        label: 'Réservable jusqu’à (jours)',
        kind: 'number',
        min: 1,
        max: 730,
      },
      { name: 'priceCents', column: 'price_cents', label: 'Prix', kind: 'money' },
      {
        name: 'depositCents',
        column: 'deposit_cents',
        label: 'Acompte demandé',
        kind: 'money',
        hint: 'Nécessite l’encaissement en ligne. Laissez vide pour ne rien demander.',
      },
      {
        name: 'description',
        column: 'description',
        label: 'Description',
        kind: 'textarea',
        maxLength: 800,
        rows: 3,
        wide: true,
      },
      {
        name: 'requiresApproval',
        column: 'requires_approval',
        label: 'Je valide chaque demande',
        kind: 'boolean',
        hint: 'Décochez pour confirmer automatiquement les réservations.',
      },
      {
        name: 'isActive',
        column: 'is_active',
        label: 'Actif',
        kind: 'boolean',
        hint: YES_NO_HELP,
      },
    ],
  },

  availability: {
    id: 'availability',
    route: '/app/disponibilites',
    table: 'availability_rules',
    module: 'booking',
    feature: 'bookings',
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site',
    title: 'Plages de disponibilité',
    description:
      'Les heures pendant lesquelles vous acceptez des réservations. Sans plage déclarée, aucun créneau n’est proposé.',
    singular: 'Plage',
    addLabel: 'Ajouter une plage',
    emptyTitle: 'Aucune plage déclarée',
    emptyDescription:
      'Déclarez vos plages jour par jour. Tant qu’aucune plage n’existe, votre site n’affiche aucun créneau libre.',
    icon: 'calendar-range',
    schema: availabilityRuleSchema,
    order: [
      { column: 'day_of_week', ascending: true },
      { column: 'starts_at', ascending: true },
    ],
    fields: [
      {
        name: 'bookingServiceId',
        column: 'booking_service_id',
        label: 'Prestation concernée',
        kind: 'reference',
        reference: { table: 'booking_services', labelColumn: 'name' },
        hint: 'Laissez vide pour appliquer cette plage à toutes les prestations.',
        inList: true,
      },
      {
        name: 'dayOfWeek',
        column: 'day_of_week',
        label: 'Jour',
        kind: 'select',
        valueType: 'number',
        required: true,
        options: DAYS,
        inList: true,
      },
      {
        name: 'startsAt',
        column: 'starts_at',
        label: 'De',
        kind: 'time',
        required: true,
        inList: true,
      },
      {
        name: 'endsAt',
        column: 'ends_at',
        label: 'À',
        kind: 'time',
        required: true,
        inList: true,
      },
      {
        name: 'slotIntervalMinutes',
        column: 'slot_interval_minutes',
        label: 'Un créneau toutes les (minutes)',
        kind: 'number',
        min: 5,
        max: 240,
        inList: true,
      },
      {
        name: 'capacity',
        column: 'capacity',
        label: 'Places sur cette plage',
        kind: 'number',
        min: 1,
        max: 500,
        hint: 'Laissez vide pour reprendre la capacité de la prestation.',
      },
      { name: 'validFrom', column: 'valid_from', label: 'Valable à partir du', kind: 'date' },
      { name: 'validUntil', column: 'valid_until', label: 'Valable jusqu’au', kind: 'date' },
    ],
  },

  /* --- Boutique ---------------------------------------------------------- */
  'product-categories': {
    id: 'product-categories',
    route: '/app/produits',
    table: 'product_categories',
    module: 'products',
    feature: 'ecommerce',
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site',
    title: 'Rayons',
    description: 'Le classement de votre boutique, tel que vos clients le verront.',
    singular: 'Rayon',
    addLabel: 'Ajouter un rayon',
    emptyTitle: 'Aucun rayon',
    emptyDescription:
      'Les rayons ne sont pas obligatoires, mais au-delà d’une dizaine de produits ils rendent la navigation beaucoup plus simple.',
    icon: 'layers',
    schema: productCategorySchema,
    slugFrom: 'name',
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'name', ascending: true },
    ],
    fields: [
      {
        name: 'name',
        column: 'name',
        label: 'Nom du rayon',
        kind: 'text',
        required: true,
        maxLength: 80,
        inList: true,
      },
      {
        name: 'description',
        column: 'description',
        label: 'Description',
        kind: 'textarea',
        maxLength: 400,
        rows: 2,
        wide: true,
      },
      {
        name: 'isVisible',
        column: 'is_visible',
        label: 'Visible',
        kind: 'boolean',
        hint: YES_NO_HELP,
      },
    ],
  },

  products: {
    id: 'products',
    route: '/app/produits',
    table: 'products',
    module: 'products',
    feature: 'ecommerce',
    viewCapability: 'commerce.view',
    writeCapability: 'commerce.manage',
    scope: 'site+org',
    title: 'Produits',
    description: 'Votre catalogue. Les prix sont enregistrés au centime, sans arrondi.',
    singular: 'Produit',
    addLabel: 'Ajouter un produit',
    emptyTitle: 'Votre boutique est vide',
    emptyDescription:
      'Ajoutez un premier produit : nom, prix, description. Vous pourrez compléter les photos ensuite.',
    icon: 'package',
    schema: productSchema,
    slugFrom: 'name',
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    limitKey: 'max_products',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'name', ascending: true },
    ],
    fields: [
      {
        name: 'name',
        column: 'name',
        label: 'Nom du produit',
        kind: 'text',
        required: true,
        maxLength: 150,
        inList: true,
      },
      {
        name: 'categoryId',
        column: 'category_id',
        label: 'Rayon',
        kind: 'reference',
        reference: { table: 'product_categories', labelColumn: 'name', orderColumn: 'sort_order' },
        inList: true,
      },
      {
        name: 'priceCents',
        column: 'price_cents',
        label: 'Prix de vente (TTC)',
        kind: 'money',
        required: true,
        inList: true,
      },
      {
        name: 'compareAtPriceCents',
        column: 'compare_at_price_cents',
        label: 'Prix barré',
        kind: 'money',
        hint: 'Doit être supérieur au prix de vente. Laissez vide s’il n’y a pas de promotion.',
      },
      {
        name: 'vatRateBps',
        column: 'vat_rate_bps',
        label: 'TVA',
        kind: 'select',
        valueType: 'number',
        options: [
          option('2000', '20 % — taux normal'),
          option('1000', '10 % — taux intermédiaire'),
          option('550', '5,5 % — taux réduit'),
          option('210', '2,1 % — taux particulier'),
          option('0', '0 % — non applicable'),
        ],
        hint: 'En cas de doute, demandez à votre comptable : le taux engage votre facturation.',
      },
      { name: 'sku', column: 'sku', label: 'Référence interne', kind: 'text', maxLength: 60 },
      {
        name: 'description',
        column: 'description',
        label: 'Accroche',
        kind: 'textarea',
        maxLength: 600,
        rows: 2,
        wide: true,
      },
      {
        name: 'longDescription',
        column: 'long_description',
        label: 'Description détaillée',
        kind: 'textarea',
        maxLength: 8000,
        rows: 6,
        wide: true,
      },
      {
        name: 'trackInventory',
        column: 'track_inventory',
        label: 'Suivre le stock',
        kind: 'boolean',
      },
      {
        name: 'stockQuantity',
        column: 'stock_quantity',
        label: 'Quantité en stock',
        kind: 'number',
        min: 0,
        max: 1_000_000,
        inList: true,
      },
      {
        name: 'allowBackorder',
        column: 'allow_backorder',
        label: 'Accepter les commandes en rupture',
        kind: 'boolean',
      },
      {
        name: 'weightGrams',
        column: 'weight_grams',
        label: 'Poids (grammes)',
        kind: 'number',
        min: 0,
        max: 1_000_000,
        hint: 'Utile si vous expédiez : sert au calcul des frais de port.',
      },
      { name: 'isFeatured', column: 'is_featured', label: 'Mis en avant', kind: 'boolean' },
      {
        name: 'isVisible',
        column: 'is_visible',
        label: 'En vente',
        kind: 'boolean',
        hint: 'Décochez pour retirer le produit de la boutique sans le supprimer.',
      },
    ],
  },

  /* --- Immobilier et hébergement ----------------------------------------- */
  properties: {
    id: 'properties',
    route: '/app/biens',
    table: 'properties',
    module: 'properties',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site+org',
    title: 'Biens',
    description:
      'Vos annonces. Les diagnostics énergétiques sont obligatoires dans toute annonce immobilière en France.',
    singular: 'Bien',
    addLabel: 'Ajouter un bien',
    emptyTitle: 'Aucun bien publié',
    emptyDescription: 'Créez votre première annonce : titre, prix, surface, classe énergétique.',
    icon: 'home',
    schema: propertySchema,
    slugFrom: 'title',
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'created_at', ascending: false },
    ],
    fields: [
      {
        name: 'title',
        column: 'title',
        label: 'Titre de l’annonce',
        kind: 'text',
        required: true,
        maxLength: 150,
        placeholder: 'Appartement 3 pièces avec balcon',
        inList: true,
      },
      {
        name: 'reference',
        column: 'reference',
        label: 'Référence',
        kind: 'text',
        maxLength: 40,
        inList: true,
      },
      {
        name: 'transactionKind',
        column: 'transaction_kind',
        label: 'Type de transaction',
        kind: 'select',
        options: [
          option('sale', 'Vente'),
          option('rent', 'Location'),
          option('seasonal', 'Location saisonnière'),
        ],
        inList: true,
      },
      {
        name: 'propertyKind',
        column: 'property_kind',
        label: 'Type de bien',
        kind: 'select',
        options: [
          option('apartment', 'Appartement'),
          option('house', 'Maison'),
          option('land', 'Terrain'),
          option('commercial', 'Local commercial'),
          option('parking', 'Parking / box'),
          option('building', 'Immeuble'),
          option('other', 'Autre'),
        ],
      },
      { name: 'priceCents', column: 'price_cents', label: 'Prix', kind: 'money', inList: true },
      {
        name: 'surfaceM2',
        column: 'surface_m2',
        label: 'Surface habitable (m²)',
        kind: 'number',
        min: 1,
        max: 100_000,
        step: 0.01,
        inList: true,
      },
      {
        name: 'landSurfaceM2',
        column: 'land_surface_m2',
        label: 'Surface du terrain (m²)',
        kind: 'number',
        min: 1,
        max: 10_000_000,
        step: 0.01,
      },
      { name: 'rooms', column: 'rooms', label: 'Pièces', kind: 'number', min: 0, max: 100 },
      { name: 'bedrooms', column: 'bedrooms', label: 'Chambres', kind: 'number', min: 0, max: 100 },
      {
        name: 'bathrooms',
        column: 'bathrooms',
        label: 'Salles de bain',
        kind: 'number',
        min: 0,
        max: 50,
      },
      { name: 'floor', column: 'floor', label: 'Étage', kind: 'number', min: -5, max: 200 },
      { name: 'city', column: 'city', label: 'Ville', kind: 'text', maxLength: 80, inList: true },
      {
        name: 'postalCode',
        column: 'postal_code',
        label: 'Code postal',
        kind: 'text',
        maxLength: 12,
      },
      {
        name: 'energyClass',
        column: 'energy_class',
        label: 'Classe énergie (DPE)',
        kind: 'select',
        options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((letter) => option(letter, letter)),
        hint: 'Obligatoire dans toute annonce, sauf exemption légale.',
      },
      {
        name: 'ghgClass',
        column: 'ghg_class',
        label: 'Classe climat (GES)',
        kind: 'select',
        options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((letter) => option(letter, letter)),
      },
      {
        name: 'description',
        column: 'description',
        label: 'Description',
        kind: 'textarea',
        maxLength: 8000,
        rows: 6,
        wide: true,
      },
      {
        name: 'status',
        column: 'status',
        label: 'État',
        kind: 'select',
        options: [
          option('available', 'Disponible'),
          option('under_offer', 'Sous compromis'),
          option('sold', 'Vendu'),
          option('rented', 'Loué'),
          option('draft', 'Brouillon'),
        ],
        inList: true,
      },
      {
        name: 'isVisible',
        column: 'is_visible',
        label: 'Visible',
        kind: 'boolean',
        hint: YES_NO_HELP,
      },
    ],
  },

  rooms: {
    id: 'rooms',
    route: '/app/chambres',
    table: 'rooms',
    module: 'rooms',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site+org',
    title: 'Chambres et hébergements',
    description: 'Ce que vous louez, pour combien de personnes et à quel tarif de base.',
    singular: 'Hébergement',
    addLabel: 'Ajouter un hébergement',
    emptyTitle: 'Aucun hébergement',
    emptyDescription: 'Décrivez vos chambres : capacité, literie, surface, tarif de base.',
    icon: 'bed',
    schema: roomSchema,
    slugFrom: 'name',
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'name', ascending: true },
    ],
    fields: [
      {
        name: 'name',
        column: 'name',
        label: 'Nom',
        kind: 'text',
        required: true,
        maxLength: 100,
        placeholder: 'Chambre Prestige vue jardin',
        inList: true,
      },
      {
        name: 'capacity',
        column: 'capacity',
        label: 'Capacité (personnes)',
        kind: 'number',
        min: 1,
        max: 50,
        inList: true,
      },
      {
        name: 'quantity',
        column: 'quantity',
        label: 'Nombre d’unités identiques',
        kind: 'number',
        min: 1,
        max: 500,
        hint: 'Si vous avez trois chambres identiques, indiquez 3 plutôt que de créer trois fiches.',
      },
      {
        name: 'basePriceCents',
        column: 'base_price_cents',
        label: 'Tarif de base par nuit',
        kind: 'money',
        inList: true,
      },
      {
        name: 'bedConfiguration',
        column: 'bed_configuration',
        label: 'Literie',
        kind: 'text',
        maxLength: 120,
        placeholder: '1 lit double + 1 lit simple',
      },
      {
        name: 'surfaceM2',
        column: 'surface_m2',
        label: 'Surface (m²)',
        kind: 'number',
        min: 1,
        max: 1000,
        step: 0.01,
      },
      {
        name: 'description',
        column: 'description',
        label: 'Description',
        kind: 'textarea',
        maxLength: 3000,
        rows: 5,
        wide: true,
      },
      {
        name: 'isVisible',
        column: 'is_visible',
        label: 'Visible',
        kind: 'boolean',
        hint: YES_NO_HELP,
      },
    ],
  },

  /* --- Contenus éditoriaux ----------------------------------------------- */
  portfolio: {
    id: 'portfolio',
    route: '/app/realisations',
    table: 'content_entries',
    module: 'portfolio',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site+org',
    title: 'Réalisations',
    description: 'Vos chantiers, projets et références. La preuve par l’exemple.',
    singular: 'Réalisation',
    addLabel: 'Ajouter une réalisation',
    emptyTitle: 'Aucune réalisation publiée',
    emptyDescription:
      'Une photo avant / après et trois phrases suffisent. C’est souvent ce qui décide un visiteur hésitant.',
    icon: 'hammer',
    schema: contentEntrySchema,
    slugFrom: 'title',
    fixed: { collection: 'portfolio' },
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'published_at', ascending: false },
    ],
    fields: [
      ...CONTENT_BASE_FIELDS,
      {
        name: 'clientName',
        column: 'attributes.clientName',
        label: 'Client',
        kind: 'text',
        maxLength: 120,
        hint: 'Ne publiez un nom de client qu’avec son accord.',
        inList: true,
      },
      {
        name: 'location',
        column: 'attributes.location',
        label: 'Lieu',
        kind: 'text',
        maxLength: 120,
      },
    ],
  },

  articles: {
    id: 'articles',
    route: '/app/actualites',
    table: 'content_entries',
    module: 'blog',
    feature: 'blog',
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site+org',
    title: 'Actualités',
    description:
      'Vos publications. Un site qui vit est mieux référencé qu’un site figé — mais mieux vaut trois bons articles que trente vides.',
    singular: 'Article',
    addLabel: 'Écrire un article',
    emptyTitle: 'Aucun article',
    emptyDescription:
      'Racontez une nouveauté, un chantier, une recette. Sans date de publication, l’article reste en brouillon.',
    icon: 'newspaper',
    schema: contentEntrySchema,
    slugFrom: 'title',
    fixed: { collection: 'article' },
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    order: [{ column: 'published_at', ascending: false }],
    fields: [...CONTENT_BASE_FIELDS],
  },

  events: {
    id: 'events',
    route: '/app/evenements',
    table: 'content_entries',
    module: 'events',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site+org',
    title: 'Événements',
    description: 'Vos dates : concerts, portes ouvertes, soirées à thème.',
    singular: 'Événement',
    addLabel: 'Ajouter un événement',
    emptyTitle: 'Aucun événement annoncé',
    emptyDescription: 'Annoncez vos prochaines dates : c’est ce qui fait revenir les habitués.',
    icon: 'calendar-days',
    schema: contentEntrySchema,
    slugFrom: 'title',
    fixed: { collection: 'event' },
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    order: [{ column: 'published_at', ascending: false }],
    fields: [
      ...CONTENT_BASE_FIELDS,
      {
        name: 'startsOn',
        column: 'attributes.startsOn',
        label: 'Date de l’événement',
        kind: 'date',
        inList: true,
      },
      {
        name: 'location',
        column: 'attributes.location',
        label: 'Lieu',
        kind: 'text',
        maxLength: 120,
        inList: true,
      },
    ],
  },

  testimonials: {
    id: 'testimonials',
    route: '/app/avis',
    table: 'content_entries',
    module: 'testimonials',
    feature: null,
    viewCapability: 'content.view',
    writeCapability: 'content.edit',
    scope: 'site+org',
    title: 'Avis clients',
    description:
      'Les retours que vous avez réellement reçus. Un avis inventé est une pratique commerciale trompeuse : ne publiez que du vrai.',
    singular: 'Avis',
    addLabel: 'Ajouter un avis',
    emptyTitle: 'Aucun avis publié',
    emptyDescription:
      'Recopiez ici un avis reçu par e-mail, SMS ou sur une plateforme, avec l’accord de son auteur.',
    icon: 'quote',
    schema: contentEntrySchema,
    slugFrom: 'title',
    fixed: { collection: 'testimonial' },
    sortColumn: 'sort_order',
    visibilityColumn: 'is_visible',
    order: [
      { column: 'sort_order', ascending: true },
      { column: 'created_at', ascending: false },
    ],
    fields: [
      {
        name: 'title',
        column: 'title',
        label: 'Titre de l’avis',
        kind: 'text',
        required: true,
        maxLength: 160,
        placeholder: 'Intervention rapide et soignée',
        inList: true,
      },
      {
        name: 'excerpt',
        column: 'excerpt',
        label: 'Texte de l’avis',
        kind: 'textarea',
        maxLength: 400,
        rows: 4,
        wide: true,
      },
      {
        name: 'authorName',
        column: 'attributes.authorName',
        label: 'Signature',
        kind: 'text',
        maxLength: 80,
        hint: 'Prénom et initiale suffisent : « Claire M. ».',
        inList: true,
      },
      {
        name: 'rating',
        column: 'attributes.rating',
        label: 'Note sur 5',
        kind: 'number',
        min: 1,
        max: 5,
        inList: true,
      },
      {
        name: 'publishedAt',
        column: 'published_at',
        label: 'Date de l’avis',
        kind: 'date',
        inList: true,
      },
      {
        name: 'isVisible',
        column: 'is_visible',
        label: 'Visible',
        kind: 'boolean',
        hint: YES_NO_HELP,
      },
    ],
  },

  /* --- Relation client --------------------------------------------------- */
  contacts: {
    id: 'contacts',
    route: '/app/contacts',
    table: 'contacts',
    module: null,
    feature: null,
    viewCapability: 'inbox.view',
    writeCapability: 'inbox.manage',
    scope: 'org',
    attachSiteOnCreate: true,
    title: 'Mes contacts',
    description:
      'Les personnes qui vous ont écrit, réservé ou commandé, plus celles que vous ajoutez vous-même. Elles restent les vôtres : vous pouvez les exporter à tout moment.',
    singular: 'Contact',
    addLabel: 'Ajouter un contact',
    emptyTitle: 'Aucun contact',
    emptyDescription:
      'Chaque message reçu depuis votre site crée automatiquement un contact. Vous pouvez aussi en ajouter un à la main.',
    icon: 'contact',
    schema: contactSchema,
    order: [{ column: 'created_at', ascending: false }],
    fields: [
      {
        name: 'lastName',
        column: 'last_name',
        label: 'Nom',
        kind: 'text',
        maxLength: 60,
        inList: true,
      },
      {
        name: 'firstName',
        column: 'first_name',
        label: 'Prénom',
        kind: 'text',
        maxLength: 60,
        inList: true,
      },
      {
        name: 'email',
        column: 'email',
        label: 'E-mail',
        kind: 'email',
        maxLength: 180,
        inList: true,
      },
      {
        name: 'phone',
        column: 'phone',
        label: 'Téléphone',
        kind: 'tel',
        maxLength: 30,
        inList: true,
      },
      {
        name: 'company',
        column: 'company',
        label: 'Société',
        kind: 'text',
        maxLength: 120,
      },
      {
        name: 'status',
        column: 'status',
        label: 'Suivi',
        kind: 'select',
        options: [
          option('new', 'Nouveau'),
          option('contacted', 'Contacté'),
          option('qualified', 'Intéressé'),
          option('won', 'Client'),
          option('lost', 'Sans suite'),
        ],
        inList: true,
      },
      {
        name: 'notes',
        column: 'notes',
        label: 'Notes internes',
        kind: 'textarea',
        hint: 'Visible uniquement par votre équipe. Jamais affiché sur votre site.',
        maxLength: 4000,
        rows: 4,
        wide: true,
      },
    ],
  },
} as const satisfies Record<string, Omit<CollectionDescriptor, 'id'> & { id: string }>;

export type CollectionId = keyof typeof COLLECTIONS;

export function isCollectionId(value: unknown): value is CollectionId {
  return typeof value === 'string' && Object.hasOwn(COLLECTIONS, value);
}

export function getCollection(id: CollectionId): CollectionDescriptor {
  return COLLECTIONS[id] as unknown as CollectionDescriptor;
}
