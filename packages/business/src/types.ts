import type { FeatureKey } from '@stax/types';

/** Identifiant d'un module metier. Miroir de public.business_modules.slug. */
export type ModuleId =
  | 'contact'
  | 'opening-hours'
  | 'gallery'
  | 'testimonials'
  | 'faq'
  | 'team'
  | 'services'
  | 'service-area'
  | 'portfolio'
  | 'quotes'
  | 'restaurant-menu'
  | 'booking'
  | 'products'
  | 'orders'
  | 'payments'
  | 'properties'
  | 'rooms'
  | 'events'
  | 'blog'
  | 'newsletter'
  | 'customer-accounts'
  | 'donations';

export type ModuleCategory =
  | 'content'
  | 'commerce'
  | 'booking'
  | 'crm'
  | 'marketing'
  | 'operations';

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  /** Formulation orientee benefice, affichee au client. */
  description: string;
  icon: string;
  category: ModuleCategory;
  /** Droit d'offre requis. `null` = disponible sur toutes les offres. */
  requiredFeature: FeatureKey | null;
  /** Entrees de navigation ouvertes dans l'espace client par ce module. */
  dashboardEntries: readonly DashboardEntry[];
  /** Types de blocs que ce module rend disponibles dans l'editeur. */
  blockTypes: readonly string[];
  sortOrder: number;
}

export interface DashboardEntry {
  /** Chemin sous /app. */
  href: string;
  label: string;
  icon: string;
  /** Capacite RBAC requise pour voir l'entree. */
  capability: string;
  group: DashboardGroup;
  sortOrder: number;
}

export type DashboardGroup = 'pilotage' | 'site' | 'activite' | 'entreprise';

export interface OnboardingQuestion {
  id: string;
  label: string;
  help?: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'boolean' | 'number' | 'url';
  required: boolean;
  options?: readonly { value: string; label: string }[];
  placeholder?: string;
  /** Affiche uniquement si un autre champ vaut une valeur donnee. */
  showIf?: { field: string; equals: string | boolean };
}

export interface PageBlueprint {
  path: string;
  title: string;
  kind: string;
  /** Blocs proposes par defaut, dans l'ordre. */
  blocks: readonly string[];
  showInNav: boolean;
}

export interface SeoDefaults {
  /** `{business}` et `{city}` sont remplaces a la generation. */
  titleTemplate: string;
  descriptionTemplate: string;
  keywords: readonly string[];
  schemaOrgType: string;
}

export interface ThemeRecommendation {
  preset: string;
  fontHeading: string;
  fontBody: string;
  accent: string;
}

export interface SectorDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  sortOrder: number;
  /** Modules actives pour tous les metiers du secteur. */
  defaultModules: readonly ModuleId[];
  defaultPages: readonly PageBlueprint[];
  onboarding: readonly OnboardingQuestion[];
  theme: ThemeRecommendation;
}

export interface BusinessDefinition {
  id: string;
  sector: string;
  name: string;
  pluralName: string;
  icon: string;
  /** Modules effectifs : defauts du secteur + ajouts propres au metier. */
  modules: readonly ModuleId[];
  recommendedPages: readonly PageBlueprint[];
  onboarding: readonly OnboardingQuestion[];
  seoDefaults: SeoDefaults;
  theme: ThemeRecommendation;
  /** Vocabulaire metier utilise dans l'interface client. */
  vocabulary: BusinessVocabulary;
  sortOrder: number;
}

/**
 * Le tableau de bord parle la langue du metier : un coiffeur lit
 * « prestations », un restaurateur lit « plats », un agent immobilier lit
 * « biens ». Aucun terme technique n'apparait cote client.
 */
export interface BusinessVocabulary {
  offering: string;
  offeringPlural: string;
  customer: string;
  customerPlural: string;
  booking?: string;
  bookingPlural?: string;
}
