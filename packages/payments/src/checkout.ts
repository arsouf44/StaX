import type { Cents, Currency, UUID } from '@stax/types';
import { platformUrl, readEnv } from '@stax/config';
import { getStripe, idempotencyKey, type Stripe } from './stripe-client';

/**
 * Parcours de paiement de la plateforme.
 *
 * Une seule session de paiement couvre les deux engagements, pour qu'aucun
 * cout ne soit cache : le paiement initial de creation ET l'abonnement
 * annuel de maintenance apparaissent dans le meme recapitulatif Stripe.
 *
 * La maintenance ne demarre PAS le jour de la commande : une periode sans
 * facturation (MAINTENANCE_TRIAL_DAYS, 30 jours par defaut) laisse le temps
 * de construire et de mettre le site en ligne. L'administration peut ensuite
 * aligner precisement le debut de la maintenance sur la mise en ligne reelle.
 */

export interface CheckoutPlanPrices {
  planSlug: string;
  planName: string;
  setupPriceCents: Cents;
  maintenancePriceCents: Cents;
  currency: Currency;
  stripeSetupPriceId: string | null;
  stripeMaintenancePriceId: string | null;
}

export interface CreateCheckoutInput {
  orderId: UUID;
  orderReference: string;
  organizationId: UUID;
  customerEmail: string;
  stripeCustomerId?: string | null;
  plan: CheckoutPlanPrices;
  /** Remise deja calculee cote serveur, en centimes. */
  discountCents?: Cents;
  couponCode?: string | null;
  locale?: 'fr' | 'en';
}

export function maintenanceTrialDays(): number {
  const raw = Number.parseInt(readEnv('MAINTENANCE_TRIAL_DAYS') ?? '30', 10);
  return Number.isFinite(raw) && raw >= 0 && raw <= 730 ? raw : 30;
}

function lineItemForSetup(
  plan: CheckoutPlanPrices,
  discountCents: Cents,
): Stripe.Checkout.SessionCreateParams.LineItem {
  const amount = Math.max(plan.setupPriceCents - discountCents, 0);
  if (plan.stripeSetupPriceId && discountCents === 0) {
    return { price: plan.stripeSetupPriceId, quantity: 1 };
  }
  // Une remise serveur se materialise par un prix ad hoc : le montant envoye a
  // Stripe reste celui calcule par la base, jamais celui fourni par le client.
  return {
    quantity: 1,
    price_data: {
      currency: plan.currency.toLowerCase(),
      unit_amount: amount,
      product_data: {
        name: `Création de votre site — offre ${plan.planName}`,
        description: 'Conception, developpement, mise en ligne et accompagnement.',
      },
    },
  };
}

function lineItemForMaintenance(
  plan: CheckoutPlanPrices,
): Stripe.Checkout.SessionCreateParams.LineItem | null {
  if (plan.maintenancePriceCents <= 0) return null;
  if (plan.stripeMaintenancePriceId) {
    return { price: plan.stripeMaintenancePriceId, quantity: 1 };
  }
  return {
    quantity: 1,
    price_data: {
      currency: plan.currency.toLowerCase(),
      unit_amount: plan.maintenancePriceCents,
      recurring: { interval: 'year' },
      product_data: {
        name: `Maintenance annuelle — offre ${plan.planName}`,
        description:
          'Hébergement, certificat HTTPS, sauvegardes, mises a jour de sécurité et support.',
      },
    },
  };
}

export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripe();
  const base = platformUrl();
  const discountCents = input.discountCents ?? 0;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    lineItemForSetup(input.plan, discountCents),
  ];
  const maintenance = lineItemForMaintenance(input.plan);
  const hasSubscription = maintenance !== null;
  if (maintenance) lineItems.push(maintenance);

  const metadata: Stripe.MetadataParam = {
    stax_order_id: input.orderId,
    stax_order_reference: input.orderReference,
    stax_organization_id: input.organizationId,
    stax_plan_slug: input.plan.planSlug,
    ...(input.couponCode ? { stax_coupon: input.couponCode } : {}),
  };

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: hasSubscription ? 'subscription' : 'payment',
    line_items: lineItems,
    locale: input.locale ?? 'fr',
    currency: input.plan.currency.toLowerCase(),
    client_reference_id: input.orderId,
    metadata,
    success_url: `${base}/app/commande/${input.orderId}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/commander/paiement?order=${input.orderId}&annule=1`,
    automatic_tax: { enabled: false },
    billing_address_collection: 'required',
    // Le consentement CGV est deja recueilli et horodate cote StaX ; Stripe
    // le redemande pour que la preuve existe aussi chez le prestataire.
    consent_collection: { terms_of_service: 'required' },
    custom_text: {
      terms_of_service_acceptance: {
        message: `J’accepte les conditions generales de vente de StaX disponibles sur ${base}/cgv.`,
      },
    },
  };

  if (input.stripeCustomerId) {
    params.customer = input.stripeCustomerId;
    params.customer_update = { address: 'auto', name: 'auto' };
  } else {
    params.customer_email = input.customerEmail;
    params.customer_creation = hasSubscription ? undefined : 'always';
  }

  if (hasSubscription) {
    const trialDays = maintenanceTrialDays();
    params.subscription_data = {
      metadata,
      description: `Maintenance du site — commande ${input.orderReference}`,
      ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
    };
  } else {
    params.payment_intent_data = { metadata };
  }

  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey: idempotencyKey('checkout', input.orderId),
  });

  if (!session.url) {
    throw new Error('Stripe n’a pas renvoye d’URL de paiement.');
  }
  return { sessionId: session.id, url: session.url };
}

/**
 * Portail client Stripe : moyen de paiement, factures, resiliation.
 * Delegue a Stripe plutot que de reimplementer une surface sensible.
 */
export async function createBillingPortalSession(
  stripeCustomerId: string,
  returnPath = '/app/facturation',
): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${platformUrl()}${returnPath}`,
    locale: 'fr',
  });
  return session.url;
}

/** Cree ou retrouve le client Stripe d'une organisation. */
export async function ensureStripeCustomer(params: {
  organizationId: UUID;
  organizationName: string;
  email: string;
  existingCustomerId?: string | null;
}): Promise<string> {
  const stripe = getStripe();
  if (params.existingCustomerId) {
    return params.existingCustomerId;
  }
  const customer = await stripe.customers.create(
    {
      email: params.email,
      name: params.organizationName,
      metadata: { stax_organization_id: params.organizationId },
      preferred_locales: ['fr'],
    },
    { idempotencyKey: idempotencyKey('customer', params.organizationId) },
  );
  return customer.id;
}

/**
 * Aligne le debut de la facturation de maintenance sur la mise en ligne reelle.
 * Appele par l'administration au moment de la publication.
 */
export async function alignMaintenanceStart(
  stripeSubscriptionId: string,
  goLiveAt: Date,
): Promise<void> {
  const stripe = getStripe();
  const trialEnd = Math.floor(goLiveAt.getTime() / 1000);
  if (trialEnd <= Math.floor(Date.now() / 1000)) {
    await stripe.subscriptions.update(stripeSubscriptionId, { trial_end: 'now' });
    return;
  }
  await stripe.subscriptions.update(stripeSubscriptionId, {
    trial_end: trialEnd,
    proration_behavior: 'none',
  });
}

export async function cancelSubscriptionAtPeriodEnd(
  stripeSubscriptionId: string,
  reason?: string,
): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
    ...(reason ? { metadata: { stax_cancel_reason: reason.slice(0, 500) } } : {}),
  });
}

export async function resumeSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: false });
}

/** Rembourse un paiement de la plateforme. Montant toujours en centimes. */
export async function refundPayment(params: {
  paymentIntentId: string;
  amountCents: Cents;
  refundRequestId: UUID;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
}): Promise<{ refundId: string; status: string }> {
  const stripe = getStripe();
  const refund = await stripe.refunds.create(
    {
      payment_intent: params.paymentIntentId,
      amount: params.amountCents,
      reason: params.reason ?? 'requested_by_customer',
      metadata: { stax_refund_request_id: params.refundRequestId },
    },
    { idempotencyKey: idempotencyKey('refund', params.refundRequestId) },
  );
  return { refundId: refund.id, status: refund.status ?? 'pending' };
}
