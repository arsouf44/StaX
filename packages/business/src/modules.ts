import type { DashboardEntry, ModuleDefinition, ModuleId } from './types';

/**
 * Registre des modules metier.
 *
 * Un module declare ce qu'il ouvre : des entrees de navigation dans l'espace
 * client et des types de blocs dans l'editeur. C'est ce qui permet a
 * l'interface de s'adapter au metier SANS aucune condition en dur dans les
 * composants — un plombier ne voit jamais « Carte du restaurant ».
 */

function entry(
  href: string,
  label: string,
  icon: string,
  capability: string,
  group: DashboardEntry['group'],
  sortOrder: number,
): DashboardEntry {
  return { href, label, icon, capability, group, sortOrder };
}

export const MODULES: Readonly<Record<ModuleId, ModuleDefinition>> = {
  contact: {
    id: 'contact',
    label: 'Formulaire de contact',
    description: 'Recevez les messages de vos visiteurs dans une boite de reception claire.',
    icon: 'mail',
    category: 'crm',
    requiredFeature: null,
    dashboardEntries: [
      entry('/app/messages', 'Messages', 'inbox', 'inbox.view', 'activite', 10),
      entry('/app/forms', 'Formulaires', 'clipboard-list', 'content.edit', 'site', 60),
    ],
    blockTypes: ['contact', 'map'],
    sortOrder: 10,
  },
  'opening-hours': {
    id: 'opening-hours',
    label: 'Horaires d’ouverture',
    description: 'Horaires reguliers, services midi et soir, fermetures exceptionnelles.',
    icon: 'clock',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [entry('/app/horaires', 'Horaires', 'clock', 'content.edit', 'activite', 60)],
    blockTypes: ['opening-hours'],
    sortOrder: 20,
  },
  gallery: {
    id: 'gallery',
    label: 'Galerie photos',
    description: 'Mettez en valeur votre lieu, vos produits et vos realisations.',
    icon: 'images',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [],
    blockTypes: ['gallery'],
    sortOrder: 30,
  },
  testimonials: {
    id: 'testimonials',
    label: 'Avis clients',
    description: 'Publiez les temoignages de vos clients satisfaits.',
    icon: 'quote',
    category: 'marketing',
    requiredFeature: null,
    dashboardEntries: [entry('/app/avis', 'Avis clients', 'star', 'content.edit', 'activite', 70)],
    blockTypes: ['testimonials'],
    sortOrder: 40,
  },
  faq: {
    id: 'faq',
    label: 'Questions frequentes',
    description: 'Repondez une fois aux questions recurrentes, gagnez du temps chaque semaine.',
    icon: 'help-circle',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [],
    blockTypes: ['faq'],
    sortOrder: 50,
  },
  team: {
    id: 'team',
    label: 'Equipe',
    description: 'Presentez les personnes qui font votre entreprise.',
    icon: 'users',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [entry('/app/equipe', 'Equipe', 'users', 'content.edit', 'activite', 50)],
    blockTypes: ['team'],
    sortOrder: 60,
  },
  services: {
    id: 'services',
    label: 'Prestations & tarifs',
    description: 'Detaillez vos prestations, leurs durees et leurs tarifs.',
    icon: 'list-checks',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [
      entry('/app/prestations', 'Prestations', 'list-checks', 'content.edit', 'activite', 20),
    ],
    blockTypes: ['services', 'pricing'],
    sortOrder: 70,
  },
  'service-area': {
    id: 'service-area',
    label: 'Zones d’intervention',
    description: 'Indiquez les communes et le rayon que vous couvrez.',
    icon: 'map-pin',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [
      entry('/app/zones', 'Zones d’intervention', 'map-pin', 'content.edit', 'activite', 55),
    ],
    blockTypes: ['service-area'],
    sortOrder: 80,
  },
  portfolio: {
    id: 'portfolio',
    label: 'Realisations',
    description: 'Un portfolio avant/apres qui prouve votre savoir-faire.',
    icon: 'layout-grid',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [
      entry('/app/realisations', 'Realisations', 'layout-grid', 'content.edit', 'activite', 40),
    ],
    blockTypes: ['portfolio', 'before-after'],
    sortOrder: 90,
  },
  quotes: {
    id: 'quotes',
    label: 'Demande de devis',
    description: 'Un formulaire structure qui qualifie vos demandes entrantes.',
    icon: 'file-text',
    category: 'crm',
    requiredFeature: null,
    dashboardEntries: [entry('/app/contacts', 'Prospects', 'contact', 'inbox.view', 'activite', 15)],
    blockTypes: ['quote-form'],
    sortOrder: 100,
  },
  'restaurant-menu': {
    id: 'restaurant-menu',
    label: 'Carte & menus',
    description: 'Categories, plats, prix, allergenes, formules du midi et du soir.',
    icon: 'utensils',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [entry('/app/carte', 'Carte', 'utensils', 'content.edit', 'activite', 20)],
    blockTypes: ['menu'],
    sortOrder: 110,
  },
  booking: {
    id: 'booking',
    label: 'Reservations',
    description: 'Creneaux, capacites, confirmations et rappels automatiques.',
    icon: 'calendar-check',
    category: 'booking',
    requiredFeature: 'bookings',
    dashboardEntries: [
      entry('/app/reservations', 'Reservations', 'calendar-check', 'inbox.view', 'activite', 12),
      entry('/app/disponibilites', 'Disponibilites', 'calendar-cog', 'content.edit', 'activite', 30),
    ],
    blockTypes: ['booking'],
    sortOrder: 120,
  },
  products: {
    id: 'products',
    label: 'Catalogue produits',
    description: 'Produits, variantes, categories et stock simplifie.',
    icon: 'package',
    category: 'commerce',
    requiredFeature: 'ecommerce',
    dashboardEntries: [
      entry('/app/produits', 'Produits', 'package', 'commerce.view', 'activite', 25),
    ],
    blockTypes: ['products'],
    sortOrder: 130,
  },
  orders: {
    id: 'orders',
    label: 'Commandes en ligne',
    description: 'Panier, commande et suivi pour vos clients.',
    icon: 'shopping-cart',
    category: 'commerce',
    requiredFeature: 'ecommerce',
    dashboardEntries: [
      entry('/app/commandes', 'Commandes', 'shopping-cart', 'commerce.view', 'activite', 14),
    ],
    blockTypes: ['products', 'cart'],
    sortOrder: 140,
  },
  payments: {
    id: 'payments',
    label: 'Paiement en ligne',
    description: 'Encaissez directement sur votre propre compte, sans intermediaire.',
    icon: 'credit-card',
    category: 'commerce',
    requiredFeature: 'online_payments',
    dashboardEntries: [
      entry('/app/paiements', 'Paiements', 'credit-card', 'billing.view', 'activite', 16),
    ],
    blockTypes: [],
    sortOrder: 150,
  },
  properties: {
    id: 'properties',
    label: 'Biens immobiliers',
    description: 'Annonces avec surface, DPE, photos et statut.',
    icon: 'building-2',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [entry('/app/biens', 'Biens', 'building-2', 'content.edit', 'activite', 20)],
    blockTypes: ['properties'],
    sortOrder: 160,
  },
  rooms: {
    id: 'rooms',
    label: 'Chambres & hebergements',
    description: 'Chambres, equipements, tarifs et demandes de sejour.',
    icon: 'bed-double',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [
      entry('/app/chambres', 'Chambres', 'bed-double', 'content.edit', 'activite', 20),
    ],
    blockTypes: ['rooms'],
    sortOrder: 170,
  },
  events: {
    id: 'events',
    label: 'Evenements',
    description: 'Agenda, dates et inscriptions a vos evenements.',
    icon: 'calendar-days',
    category: 'content',
    requiredFeature: null,
    dashboardEntries: [
      entry('/app/evenements', 'Evenements', 'calendar-days', 'content.edit', 'activite', 35),
    ],
    blockTypes: ['events'],
    sortOrder: 180,
  },
  blog: {
    id: 'blog',
    label: 'Actualites',
    description: 'Publiez vos nouvelles et alimentez votre referencement.',
    icon: 'newspaper',
    category: 'marketing',
    requiredFeature: 'blog',
    dashboardEntries: [
      entry('/app/actualites', 'Actualites', 'newspaper', 'content.edit', 'activite', 45),
    ],
    blockTypes: ['articles'],
    sortOrder: 190,
  },
  newsletter: {
    id: 'newsletter',
    label: 'Newsletter',
    description: 'Collectez des inscriptions avec un consentement explicite.',
    icon: 'send',
    category: 'marketing',
    requiredFeature: null,
    dashboardEntries: [],
    blockTypes: ['newsletter'],
    sortOrder: 200,
  },
  'customer-accounts': {
    id: 'customer-accounts',
    label: 'Comptes clients',
    description: 'Un espace personnel pour les clients de votre site.',
    icon: 'user-round-check',
    category: 'operations',
    requiredFeature: 'customer_accounts',
    dashboardEntries: [
      entry('/app/contacts', 'Clients', 'contact', 'inbox.view', 'activite', 15),
    ],
    blockTypes: [],
    sortOrder: 210,
  },
  donations: {
    id: 'donations',
    label: 'Dons',
    description: 'Recevez des dons ponctuels, directement sur votre compte.',
    icon: 'heart',
    category: 'commerce',
    requiredFeature: 'online_payments',
    dashboardEntries: [
      entry('/app/paiements', 'Dons recus', 'heart', 'billing.view', 'activite', 16),
    ],
    blockTypes: ['donation'],
    sortOrder: 220,
  },
};

export const ALL_MODULE_IDS = Object.keys(MODULES) as ModuleId[];

export function getModule(id: string): ModuleDefinition | undefined {
  return MODULES[id as ModuleId];
}

export function isModuleId(id: string): id is ModuleId {
  return id in MODULES;
}

/** Types de blocs rendus disponibles par un ensemble de modules. */
export function blockTypesForModules(moduleIds: readonly string[]): string[] {
  const types = new Set<string>();
  for (const id of moduleIds) {
    const mod = getModule(id);
    if (!mod) continue;
    for (const type of mod.blockTypes) types.add(type);
  }
  return [...types];
}
