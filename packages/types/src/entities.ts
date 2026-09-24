import type {
  BookingStatus,
  ConnectStatus,
  ContactStatus,
  Currency,
  DomainKind,
  DomainStatus,
  Locale,
  MaintenanceState,
  OrderStatus,
  OrgRole,
  PaymentStatus,
  PlatformRole,
  ProjectStatus,
  QuoteStatus,
  RefundRequestStatus,
  ShopOrderStatus,
  SiteStatus,
  SslStatus,
  SubmissionStatus,
  SubscriptionStatus,
  TicketPriority,
  TicketStatus,
} from './enums';

export type UUID = string;
/** Horodatage ISO 8601 en UTC. Toute date stockee est en UTC. */
export type Timestamp = string;
/** Montant en unites mineures entieres. Jamais un flottant. */
export type Cents = number;
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/* -------------------------------------------------------------------------- */
/*  Identite                                                                   */
/* -------------------------------------------------------------------------- */

export interface Profile {
  id: UUID;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  locale: Locale;
  timezone: string;
  platform_role: PlatformRole | null;
  mfa_enforced: boolean;
  /**
   * Compte interne StaX. Ces quatre colonnes ne s ecrivent que par le script
   * d approvisionnement (cle de service) : l interface les LIT pour adapter
   * ses libelles, mais c est la base qui decide (app.create_internal_order).
   */
  account_type: 'customer' | 'internal';
  billing_exempt: boolean;
  unlimited_sites: boolean;
  all_features: boolean;
  marketing_opt_in: boolean;
  onboarding_step: string | null;
  last_seen_at: Timestamp | null;
  disabled_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  legal_name: string | null;
  siret: string | null;
  vat_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  website: string | null;
  sector_slug: string | null;
  business_type_slug: string | null;
  billing_email: string | null;
  stripe_customer_id: string | null;
  status: 'active' | 'suspended' | 'archived';
  is_demo: boolean;
  /** Organisation interne StaX : aucune facturation, toutes les fonctionnalites. */
  account_type: 'customer' | 'internal';
  billing_exempt: boolean;
  all_features: boolean;
  suspended_at: Timestamp | null;
  suspension_reason: string | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface OrganizationMember {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: OrgRole;
  invited_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface OrganizationInvitation {
  id: UUID;
  organization_id: UUID;
  email: string;
  role: Exclude<OrgRole, 'owner'>;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
  accepted_by: UUID | null;
  revoked_at: Timestamp | null;
  created_by: UUID | null;
  created_at: Timestamp;
}

/* -------------------------------------------------------------------------- */
/*  Catalogue                                                                  */
/* -------------------------------------------------------------------------- */

export interface BusinessSectorRow {
  slug: string;
  label: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

export interface BusinessTypeRow {
  slug: string;
  sector_slug: string;
  label: string;
  plural_label: string | null;
  description: string | null;
  icon: string;
  schema_org_type: string;
  sort_order: number;
  is_active: boolean;
  config: Record<string, Json>;
}

export interface BusinessModuleRow {
  slug: string;
  label: string;
  description: string | null;
  icon: string;
  category: 'content' | 'commerce' | 'booking' | 'crm' | 'marketing' | 'operations';
  required_feature: string | null;
  sort_order: number;
  is_active: boolean;
}

/** Periodicite d'une facturation recurrente. */
export type BillingInterval = 'year' | 'month';

export type PlanHighlight = 'none' | 'popular' | 'signature';

export interface PlanRow {
  id: UUID;
  slug: string;
  version: number;
  name: string;
  tagline: string | null;
  description: string | null;
  badge: string | null;
  setup_price_cents: Cents;
  maintenance_price_cents: Cents;
  /** `month` pour les offres en vigueur ; `year` subsiste pour les contrats
   *  vendus avant la maintenance mensuelle. La colonne existe pour ne pas
   *  supposer la periodicite dans le code qui affiche un prix. */
  billing_interval: BillingInterval;
  currency: Currency;
  vat_rate_bps: number;
  prices_include_vat: boolean;
  is_quote_only: boolean;
  is_active: boolean;
  is_public: boolean;
  sort_order: number;
  /** Mise en avant de la carte : `popular` (recommandee), `signature`
   *  (categorie superieure). Lue, jamais deduite du nom de l'offre. */
  highlight: PlanHighlight;
  /** Delai annonce en semaines, a compter de la reception des elements. */
  delivery_weeks_min: number | null;
  delivery_weeks_max: number | null;
  stripe_setup_price_id: string | null;
  stripe_maintenance_price_id: string | null;
  stripe_product_id: string | null;
  valid_from: Timestamp;
  valid_until: Timestamp | null;
}

export interface PlanFeatureRow {
  plan_id: UUID;
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
}

export interface FeatureRow {
  key: string;
  label: string;
  description: string | null;
  category: string;
  kind: 'boolean' | 'limit';
  unit: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Sites                                                                      */
/* -------------------------------------------------------------------------- */

export interface Site {
  id: UUID;
  organization_id: UUID;
  name: string;
  slug: string;
  status: SiteStatus;
  business_type_slug: string | null;
  plan_id: UUID | null;
  plan_slug: string | null;
  template_slug: string | null;
  published_version_id: UUID | null;
  first_published_at: Timestamp | null;
  last_published_at: Timestamp | null;
  default_locale: Locale;
  enabled_locales: Locale[];
  timezone: string;
  is_demo: boolean;
  suspended_at: Timestamp | null;
  suspension_reason: string | null;
  archived_at: Timestamp | null;
  /**
   * Date a laquelle StaX a confie le site a son client. `null` : site en
   * construction, que seule l'equipe StaX peut modifier (verifie en base).
   */
  delivered_at: Timestamp | null;
  delivered_by: UUID | null;
  /**
   * `external_repository` : site concu et developpe individuellement, dans son
   * propre depot GitHub, deploye par son propre projet Cloudflare, gere depuis
   * StaX apres livraison. `legacy_engine` : site anterieur, rendu par l'ancien
   * moteur multi-tenant.
   */
  architecture: SiteArchitecture;
  /** Version de contenu actuellement en production (sites independants). */
  production_release_id: UUID | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type SiteArchitecture = 'external_repository' | 'legacy_engine';

export interface SiteDomain {
  id: UUID;
  site_id: UUID;
  organization_id: UUID;
  hostname: string;
  kind: DomainKind;
  status: DomainStatus;
  is_primary: boolean;
  verification_token: string;
  verification_method: string;
  verified_at: Timestamp | null;
  last_checked_at: Timestamp | null;
  check_attempts: number;
  last_error: string | null;
  ssl_status: SslStatus;
  ssl_issued_at: Timestamp | null;
  cf_hostname_id: string | null;
  purchased_by_stax: boolean;
  purchase_cost_cents: Cents | null;
  purchased_at: Timestamp | null;
  registrar: string | null;
  expires_at: Timestamp | null;
  detached_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SitePage {
  id: UUID;
  site_id: UUID;
  parent_id: UUID | null;
  path: string;
  title: string;
  kind: string;
  locale: Locale;
  seo_title: string | null;
  seo_description: string | null;
  og_image_media_id: UUID | null;
  robots_indexable: boolean;
  is_visible_in_nav: boolean;
  sort_order: number;
  is_published: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface PageBlockRow {
  id: UUID;
  page_id: UUID;
  site_id: UUID;
  type: string;
  version: number;
  props: Record<string, Json>;
  settings: Record<string, Json>;
  sort_order: number;
  is_visible: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SiteVersion {
  id: UUID;
  site_id: UUID;
  version_number: number;
  label: string | null;
  snapshot: Record<string, Json>;
  content_hash: string;
  published_at: Timestamp | null;
  published_by: UUID | null;
  scheduled_for: Timestamp | null;
  created_by: UUID | null;
  created_at: Timestamp;
}

export interface MediaAsset {
  id: UUID;
  organization_id: UUID;
  site_id: UUID | null;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  checksum: string | null;
  alt_text: string | null;
  caption: string | null;
  folder: string;
  is_public: boolean;
  uploaded_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* -------------------------------------------------------------------------- */
/*  Commerce plateforme                                                        */
/* -------------------------------------------------------------------------- */

export interface Order {
  id: UUID;
  reference: string;
  organization_id: UUID | null;
  site_id: UUID | null;
  created_by: UUID | null;
  status: OrderStatus;
  plan_id: UUID | null;
  plan_slug: string | null;
  plan_version: number | null;
  setup_price_cents: Cents;
  maintenance_price_cents: Cents;
  discount_cents: Cents;
  vat_rate_bps: number;
  vat_cents: Cents;
  total_cents: Cents;
  currency: Currency;
  coupon_code: string | null;
  sector_slug: string | null;
  business_type_slug: string | null;
  questionnaire: Record<string, Json>;
  requested_domain: string | null;
  domain_handling: 'none' | 'customer_owned' | 'stax_purchase' | 'subdomain_only';
  customer_notes: string | null;
  terms_version: string | null;
  terms_accepted_at: Timestamp | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Project {
  id: UUID;
  reference: string;
  organization_id: UUID;
  site_id: UUID | null;
  order_id: UUID | null;
  quote_id: UUID | null;
  status: ProjectStatus;
  title: string;
  summary: string | null;
  assigned_to: UUID | null;
  internal_notes: string | null;
  checklist: ProjectChecklistItem[];
  due_at: Timestamp | null;
  started_at: Timestamp | null;
  delivered_at: Timestamp | null;
  published_at: Timestamp | null;
  go_live_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ProjectChecklistItem {
  key: string;
  label: string;
  done: boolean;
  done_at?: Timestamp | null;
}

export interface Quote {
  id: UUID;
  reference: string;
  organization_id: UUID | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  company_name: string | null;
  sector_slug: string | null;
  business_type_slug: string | null;
  brief: Record<string, Json>;
  status: QuoteStatus;
  subtotal_cents: Cents;
  discount_cents: Cents;
  vat_rate_bps: number;
  vat_cents: Cents;
  total_cents: Cents;
  maintenance_price_cents: Cents;
  currency: Currency;
  notes: string | null;
  internal_notes: string | null;
  expires_at: Timestamp | null;
  sent_at: Timestamp | null;
  viewed_at: Timestamp | null;
  accepted_at: Timestamp | null;
  rejected_at: Timestamp | null;
  rejection_reason: string | null;
  created_by: UUID | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Subscription {
  id: UUID;
  organization_id: UUID;
  site_id: UUID | null;
  order_id: UUID | null;
  status: SubscriptionStatus;
  maintenance_state: MaintenanceState;
  plan_id: UUID | null;
  plan_slug: string | null;
  maintenance_price_cents: Cents;
  /** Periodicite du contrat. Lue, jamais supposee : « / mois » sur un contrat
   *  annuel annonce un prix douze fois trop eleve. */
  billing_interval: BillingInterval;
  vat_rate_bps: number;
  currency: Currency;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  current_period_start: Timestamp | null;
  current_period_end: Timestamp | null;
  cancel_at_period_end: boolean;
  cancel_requested_at: Timestamp | null;
  cancel_reason: string | null;
  canceled_at: Timestamp | null;
  ended_at: Timestamp | null;
  grace_period_ends_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Payment {
  id: UUID;
  organization_id: UUID | null;
  site_id: UUID | null;
  order_id: UUID | null;
  subscription_id: UUID | null;
  shop_order_id: UUID | null;
  scope: 'platform' | 'connect';
  status: PaymentStatus;
  kind: string;
  amount_cents: Cents;
  amount_refunded_cents: Cents;
  currency: Currency;
  application_fee_cents: Cents;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  stripe_account_id: string | null;
  payment_method_brand: string | null;
  payment_method_last4: string | null;
  failure_code: string | null;
  failure_message: string | null;
  description: string | null;
  succeeded_at: Timestamp | null;
  failed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface RefundRequest {
  id: UUID;
  organization_id: UUID;
  site_id: UUID | null;
  order_id: UUID | null;
  payment_id: UUID | null;
  requested_by: UUID | null;
  requested_at: Timestamp;
  customer_reason: string | null;
  go_live_at: Timestamp | null;
  deadline_at: Timestamp | null;
  domain_purchased: boolean;
  domain_cost_cents: Cents;
  eligible: boolean | null;
  eligibility_reason: string | null;
  amount_paid_cents: Cents;
  deduction_cents: Cents;
  refund_amount_cents: Cents;
  currency: Currency;
  status: RefundRequestStatus;
  stripe_refund_id: string | null;
  admin_notes: string | null;
  reviewed_by: UUID | null;
  reviewed_at: Timestamp | null;
  processed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ConnectedAccount {
  id: UUID;
  organization_id: UUID;
  stripe_account_id: string;
  status: ConnectStatus;
  country: string;
  default_currency: Currency;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_due: string[];
  disabled_reason: string | null;
  onboarding_started_at: Timestamp | null;
  activated_at: Timestamp | null;
  last_synced_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* -------------------------------------------------------------------------- */
/*  Modules metier                                                             */
/* -------------------------------------------------------------------------- */

export interface FormSubmission {
  id: UUID;
  form_id: UUID;
  site_id: UUID;
  organization_id: UUID;
  contact_id: UUID | null;
  data: Record<string, Json>;
  status: SubmissionStatus;
  spam_score: number;
  referrer_host: string | null;
  replied_at: Timestamp | null;
  internal_note: string | null;
  read_at: Timestamp | null;
  archived_at: Timestamp | null;
  created_at: Timestamp;
}

export interface Contact {
  id: UUID;
  organization_id: UUID;
  site_id: UUID | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string;
  status: ContactStatus;
  tags: string[];
  notes: string | null;
  marketing_consent: boolean;
  last_contacted_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Booking {
  id: UUID;
  site_id: UUID;
  organization_id: UUID;
  booking_service_id: UUID | null;
  team_member_id: UUID | null;
  contact_id: UUID | null;
  reference: string;
  starts_at: Timestamp;
  ends_at: Timestamp;
  party_size: number;
  status: BookingStatus;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_note: string | null;
  internal_note: string | null;
  confirmed_at: Timestamp | null;
  cancelled_at: Timestamp | null;
  cancellation_reason: string | null;
  source: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface ShopOrder {
  id: UUID;
  site_id: UUID;
  organization_id: UUID;
  contact_id: UUID | null;
  reference: string;
  status: ShopOrderStatus;
  subtotal_cents: Cents;
  shipping_cents: Cents;
  discount_cents: Cents;
  vat_cents: Cents;
  total_cents: Cents;
  currency: Currency;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  fulfillment_method: 'pickup' | 'delivery' | 'shipping' | 'digital';
  customer_note: string | null;
  payment_id: UUID | null;
  stripe_account_id: string | null;
  paid_at: Timestamp | null;
  fulfilled_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/* -------------------------------------------------------------------------- */
/*  Operations                                                                 */
/* -------------------------------------------------------------------------- */

export interface AppNotification {
  id: UUID;
  recipient_id: UUID;
  organization_id: UUID | null;
  site_id: UUID | null;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  level: 'info' | 'success' | 'warning' | 'danger';
  read_at: Timestamp | null;
  created_at: Timestamp;
}

export interface SupportTicket {
  id: UUID;
  reference: string;
  organization_id: UUID | null;
  site_id: UUID | null;
  opened_by: UUID | null;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigned_to: UUID | null;
  first_response_at: Timestamp | null;
  resolved_at: Timestamp | null;
  closed_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AuditLogEntry {
  id: UUID;
  actor_id: UUID | null;
  actor_email: string | null;
  actor_type: 'user' | 'platform_staff' | 'system' | 'webhook' | 'anonymous';
  impersonated_by: UUID | null;
  organization_id: UUID | null;
  site_id: UUID | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata_safe: Record<string, Json>;
  created_at: Timestamp;
}

export interface DailySiteMetrics {
  site_id: UUID;
  day: string;
  pageviews: number;
  visitors: number;
  sessions: number;
  form_submissions: number;
  bookings: number;
  orders: number;
  revenue_cents: Cents;
  avg_duration_ms: number;
  bounce_rate_bps: number;
  breakdown: Record<string, Json>;
}

export interface SystemHealthRow {
  key: string;
  label: string;
  status: 'unknown' | 'healthy' | 'degraded' | 'failing' | 'not_configured';
  detail: string | null;
  observed_at: Timestamp | null;
  metadata: Record<string, Json>;
  updated_at: Timestamp;
}
