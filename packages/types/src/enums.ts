/**
 * Unions miroir des types enumeres PostgreSQL du schema `app`.
 * Toute valeur ajoutee ici doit l'etre par une migration correspondante.
 */

export const ORG_ROLES = ['owner', 'admin', 'editor', 'billing', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PLATFORM_ROLES = [
  'platform_owner',
  'platform_admin',
  'support',
  'designer',
  'developer',
  'billing_admin',
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const SITE_STATUSES = [
  'draft',
  'building',
  'review',
  'ready',
  'live',
  'suspended',
  'archived',
] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const DOMAIN_STATUSES = [
  'pending',
  'verifying',
  'active',
  'failed',
  'expired',
  'detached',
] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

export type DomainKind = 'platform_subdomain' | 'custom';
export type SslStatus = 'none' | 'pending' | 'active' | 'failed';

export const ORDER_STATUSES = [
  'draft',
  'checkout_pending',
  'paid',
  'cancelled',
  'refunded',
  'partially_refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'refunded',
  'partially_refunded',
  'disputed',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = [
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'cancel_at_period_end',
  'canceled',
  'paused',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const MAINTENANCE_STATES = [
  'active',
  'cancel_at_period_end',
  'maintenance_ended',
  'grace_period',
  'suspended',
  'archived',
] as const;
export type MaintenanceState = (typeof MAINTENANCE_STATES)[number];

export const PROJECT_STATUSES = [
  'ordered',
  'questionnaire_pending',
  'assets_pending',
  'in_progress',
  'internal_review',
  'client_review',
  'changes_requested',
  'approved',
  'ready_to_publish',
  'published',
  'maintenance',
  'cancelled',
  'archived',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'rejected',
  'expired',
  'paid',
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const REFUND_REQUEST_STATUSES = [
  'requested',
  'under_review',
  'approved',
  'rejected',
  'processing',
  'refunded',
  'failed',
] as const;
export type RefundRequestStatus = (typeof REFUND_REQUEST_STATUSES)[number];

export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'seated',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type SubmissionStatus = 'unread' | 'read' | 'archived' | 'spam';
export type ContactStatus = 'new' | 'contacted' | 'qualified' | 'won' | 'lost';

export const TICKET_STATUSES = [
  'open',
  'waiting_customer',
  'waiting_support',
  'resolved',
  'closed',
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

export const SHOP_ORDER_STATUSES = [
  'pending',
  'awaiting_payment',
  'paid',
  'preparing',
  'fulfilled',
  'cancelled',
  'refunded',
] as const;
export type ShopOrderStatus = (typeof SHOP_ORDER_STATUSES)[number];

export const CONNECT_STATUSES = [
  'not_started',
  'onboarding',
  'pending_verification',
  'active',
  'restricted',
  'disabled',
] as const;
export type ConnectStatus = (typeof CONNECT_STATUSES)[number];

export type PrivacyRequestKind = 'export' | 'deletion' | 'rectification' | 'objection';
export type PrivacyRequestStatus =
  | 'received'
  | 'verifying'
  | 'in_progress'
  | 'completed'
  | 'refused';

export type WebhookStatus = 'received' | 'processing' | 'processed' | 'failed' | 'ignored';

export type Currency = 'EUR';
export type Locale = 'fr' | 'en';

/**
 * Capacites RBAC. Miroir exact de app.org_can() cote PostgreSQL : toute
 * capacite ajoutee ici doit l'etre dans la meme migration que la fonction SQL.
 */
export const ORG_CAPABILITIES = [
  'org.view',
  'org.manage',
  'org.delete',
  'members.manage',
  'content.view',
  'content.edit',
  'content.publish',
  'inbox.view',
  'inbox.manage',
  'commerce.view',
  'commerce.manage',
  'billing.view',
  'billing.manage',
  'analytics.view',
  'domain.manage',
  'media.manage',
  'payments.connect',
  'data.export',
  'support.manage',
] as const;
export type OrgCapability = (typeof ORG_CAPABILITIES)[number];

export const FEATURE_KEYS = [
  'custom_domain',
  'seo_tools',
  'content_editor',
  'scheduled_publishing',
  'version_history',
  'advanced_animations',
  'custom_design',
  'bookings',
  'ecommerce',
  'online_payments',
  'customer_accounts',
  'blog',
  'advanced_analytics',
  'multi_language',
  'team_collaboration',
  'priority_support',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = [
  'max_sites',
  'max_pages',
  'max_team_members',
  'max_products',
  'max_media_mb',
  'max_monthly_submissions',
  'max_forms',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export type PlanSlug = 'classique' | 'premium' | 'signature' | 'sur-mesure';
