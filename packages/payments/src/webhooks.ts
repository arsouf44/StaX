import { readEnv } from '@stax/config';
import { getStripe, getWebhookCryptoProvider, type Stripe } from './stripe-client.js';

/**
 * Reception des webhooks Stripe.
 *
 * La verite d'un paiement vient d'ICI, jamais de la redirection du navigateur.
 * Un utilisateur peut forger `?success=true` ; il ne peut pas forger une
 * signature Stripe.
 */

export class WebhookVerificationError extends Error {
  constructor(
    message: string,
    readonly reason: 'missing_signature' | 'bad_signature' | 'too_old' | 'not_configured',
  ) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/** Tolerance de rejeu, en secondes. Au-dela, l'evenement est refuse. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookSource = 'platform' | 'connect';

function secretFor(source: WebhookSource): string {
  const key =
    source === 'connect'
      ? (readEnv('STRIPE_CONNECT_WEBHOOK_SECRET') ?? readEnv('STRIPE_WEBHOOK_SECRET'))
      : readEnv('STRIPE_WEBHOOK_SECRET');
  if (!key) {
    throw new WebhookVerificationError(
      'Secret de webhook Stripe absent de la configuration.',
      'not_configured',
    );
  }
  return key;
}

/**
 * Verifie la signature et l'horodatage d'un webhook.
 * Utilise `constructEventAsync` avec WebCrypto : la version synchrone repose
 * sur le module `crypto` de Node, indisponible sur Cloudflare Workers.
 */
export async function verifyWebhook(
  rawBody: string,
  signatureHeader: string | null,
  source: WebhookSource = 'platform',
): Promise<Stripe.Event> {
  if (!signatureHeader) {
    throw new WebhookVerificationError('En-tete Stripe-Signature absent.', 'missing_signature');
  }
  const stripe = getStripe();
  try {
    return await stripe.webhooks.constructEventAsync(
      rawBody,
      signatureHeader,
      secretFor(source),
      WEBHOOK_TOLERANCE_SECONDS,
      getWebhookCryptoProvider(),
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const reason = message.toLowerCase().includes('timestamp') ? 'too_old' : 'bad_signature';
    throw new WebhookVerificationError(
      `Signature de webhook Stripe invalide : ${message}`,
      reason,
    );
  }
}

/** Evenements traites par la plateforme. Tout le reste est ignore et journalise. */
export const HANDLED_PLATFORM_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.paused',
  'customer.subscription.resumed',
  'customer.subscription.trial_will_end',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.finalized',
] as const;

export const HANDLED_CONNECT_EVENTS = [
  'account.updated',
  'account.application.deauthorized',
  'capability.updated',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'charge.refunded',
  'checkout.session.completed',
] as const;

export type HandledPlatformEvent = (typeof HANDLED_PLATFORM_EVENTS)[number];
export type HandledConnectEvent = (typeof HANDLED_CONNECT_EVENTS)[number];

export function isHandledEvent(type: string, source: WebhookSource): boolean {
  const list: readonly string[] =
    source === 'connect' ? HANDLED_CONNECT_EVENTS : HANDLED_PLATFORM_EVENTS;
  return list.includes(type);
}

/**
 * Reduit un evenement Stripe a une charge utile journalisable : identifiants,
 * montants et statuts uniquement. Jamais de secret, jamais de donnee de carte,
 * jamais d'information personnelle superflue.
 */
export function redactEventPayload(event: Stripe.Event): Record<string, unknown> {
  const object = event.data.object as unknown as Record<string, unknown>;
  const allowed = [
    'id',
    'object',
    'amount',
    'amount_total',
    'amount_refunded',
    'currency',
    'status',
    'payment_status',
    'mode',
    'customer',
    'subscription',
    'payment_intent',
    'invoice',
    'charge',
    'client_reference_id',
    'cancel_at_period_end',
    'current_period_end',
    'trial_end',
    'charges_enabled',
    'payouts_enabled',
    'details_submitted',
    'failure_code',
    'failure_message',
    'metadata',
  ];
  const safe: Record<string, unknown> = {};
  for (const key of allowed) {
    if (object[key] !== undefined && object[key] !== null) {
      safe[key] = object[key];
    }
  }
  return {
    event_type: event.type,
    livemode: event.livemode,
    api_version: event.api_version,
    object: safe,
  };
}
