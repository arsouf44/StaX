import type { ResolvedTheme } from '../theme';
import type { RenderablePage, SiteSettingsView } from '../snapshot';

/**
 * Donnees dynamiques d un site.
 *
 * Le snapshot fige la STRUCTURE des pages ; ces collections portent le contenu
 * qui doit rester vivant (une carte, un stock, des horaires). Elles sont
 * chargees a la demande : une page sans bloc « carte » ne declenche aucune
 * lecture de la table des menus.
 */

export interface MediaImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface ServiceItem {
  id: string;
  category: string | null;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number | null;
  priceSuffix: string | null;
  priceFrom: boolean;
  durationMinutes: number | null;
  image: MediaImage | null;
  isBookable: boolean;
  isEmergency: boolean;
}

export interface MenuItemView {
  id: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  allergens: string[];
  dietaryTags: string[];
  isSignature: boolean;
  image: MediaImage | null;
}

export interface MenuCategoryView {
  id: string;
  name: string;
  description: string | null;
  menuGroup: string;
  items: MenuItemView[];
}

export interface TeamMemberView {
  id: string;
  fullName: string;
  roleLabel: string | null;
  bio: string | null;
  photo: MediaImage | null;
  email: string | null;
  phone: string | null;
}

export interface OpeningHourView {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  service: string;
  label: string | null;
}

export interface ClosureView {
  startsOn: string;
  endsOn: string;
  reason: string | null;
}

export interface ProductView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  currency: string;
  image: MediaImage | null;
  inStock: boolean;
  isFeatured: boolean;
}

export interface PropertyView {
  id: string;
  reference: string | null;
  title: string;
  slug: string;
  description: string | null;
  transactionKind: string;
  propertyKind: string;
  priceCents: number | null;
  currency: string;
  surfaceM2: number | null;
  rooms: number | null;
  bedrooms: number | null;
  energyClass: string | null;
  ghgClass: string | null;
  city: string | null;
  postalCode: string | null;
  status: string;
  image: MediaImage | null;
}

export interface RoomView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  capacity: number;
  bedConfiguration: string | null;
  surfaceM2: number | null;
  basePriceCents: number | null;
  currency: string;
  amenities: string[];
  image: MediaImage | null;
}

export interface ContentEntryView {
  id: string;
  collection: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover: MediaImage | null;
  attributes: Record<string, unknown>;
  tags: string[];
  publishedAt: string | null;
}

export interface ServiceAreaView {
  label: string;
  city: string | null;
  postalCode: string | null;
  radiusKm: number | null;
}

export interface BookingServiceView {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  capacityPerSlot: number;
  leadTimeHours: number;
  horizonDays: number;
  priceCents: number | null;
  depositCents: number | null;
}

export interface FormFieldView {
  name: string;
  label: string;
  type: string;
  placeholder: string | null;
  helpText: string | null;
  isRequired: boolean;
  options: Array<{ value: string; label: string }>;
}

export interface FormView {
  id: string;
  slug: string;
  name: string;
  kind: string;
  description: string | null;
  successMessage: string;
  honeypotField: string;
  requireCaptcha: boolean;
  fields: FormFieldView[];
}

export interface SiteData {
  services: ServiceItem[];
  serviceAreas: ServiceAreaView[];
  menu: MenuCategoryView[];
  team: TeamMemberView[];
  openingHours: OpeningHourView[];
  closures: ClosureView[];
  products: ProductView[];
  properties: PropertyView[];
  rooms: RoomView[];
  entries: ContentEntryView[];
  bookingServices: BookingServiceView[];
  forms: FormView[];
}

export function emptySiteData(): SiteData {
  return {
    services: [],
    serviceAreas: [],
    menu: [],
    team: [],
    openingHours: [],
    closures: [],
    products: [],
    properties: [],
    rooms: [],
    entries: [],
    bookingServices: [],
    forms: [],
  };
}

export interface RenderContext {
  origin: string;
  siteId: string;
  siteName: string;
  locale: string;
  timezone: string;
  /** Marque un site de demonstration : jamais presente comme un vrai client. */
  isDemo: boolean;
  /** Apercu prive : le site n est pas encore public. */
  isPreview: boolean;
  theme: ResolvedTheme;
  settings: SiteSettingsView;
  pages: RenderablePage[];
  currentPath: string;
  enabledModules: Set<string>;
  data: SiteData;
  /** Nonce CSP du document en cours de rendu. */
  nonce: string;
  /** Jeton anti-CSRF injecte dans les formulaires publics. */
  formToken: string;
  /** Cle publique Turnstile, ou null si la protection est desactivee. */
  turnstileSiteKey: string | null;
  /** Date de reference, injectee pour rester testable. */
  now: Date;
}
