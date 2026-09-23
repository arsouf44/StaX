import type { Cents, Currency, UUID } from '@stax/types';
import { platformUrl } from '@stax/config';
import { formatMoney } from './money';
import { getStripe, idempotencyKey, type Stripe } from './stripe-client';

/**
 * Parcours de paiement de la plateforme.
 *
 * A la commande, le client paie la CREATION de son site, et rien d'autre.
 * Sa carte est enregistree chez Stripe (jamais chez StaX) pour la suite.
 *
 * La maintenance est MENSUELLE et ne commence qu'a la LIVRAISON du site :
 * c'est la livraison, confirmee par l'equipe apres la checklist, qui cree
 * l'abonnement (`startMaintenanceSubscription`). Aucun prelevement de
 * maintenance n'a lieu tant que le site n'est pas livre, et la base refuse
 * d'enregistrer un abonnement pour un site non livre.
 */

export interface CheckoutPlanPrices {
  planSlug: string;
  planName: string;
  setupPriceCents: Cents;
  maintenancePriceCents: Cents;
  currency: Currency;
  stripeSetupPriceId: string | null;
  stripeMaintenancePriceId: string | null;
  /**
   * Taux de TVA fige dans la commande, en points de base (2000 = 20 %).
   * Les prix du catalogue sont hors taxes : sans ce taux, Stripe encaisserait
   * le montant HT alors que le client a vu, et accepte, un total TTC.
   */
  vatRateBps: number;
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

/**
 * Taux de TVA Stripe correspondant au taux de la commande.
 *
 * Stripe ajoute la TVA au montant HT et la fait apparaitre sur la facture
 * (HT, taux, montant de TVA, TTC) : le montant encaisse est exactement le
 * total TTC affiche au client. Le taux est cree une fois puis reutilise ; il
 * est reconnu a sa marque `stax_vat`, jamais a son seul libelle.
 */
const vatRateCache = new Map<number, string>();

export async function ensureVatTaxRate(rateBps: number): Promise<string | null> {
  if (!Number.isInteger(rateBps) || rateBps <= 0) return null;
  const cached = vatRateCache.get(rateBps);
  if (cached) return cached;

  const stripe = getStripe();
  const percentage = rateBps / 100;
  for await (const rate of stripe.taxRates.list({ active: true, limit: 100 })) {
    if (
      !rate.inclusive &&
      rate.percentage === percentage &&
      rate.metadata?.['stax_vat'] === String(rateBps)
    ) {
      vatRateCache.set(rateBps, rate.id);
      return rate.id;
    }
  }

  const created = await stripe.taxRates.create(
    {
      display_name: 'TVA',
      description: `TVA ${percentage.toLocaleString('fr-FR')} %`,
      percentage,
      inclusive: false,
      country: 'FR',
      jurisdiction: 'FR',
      tax_type: 'vat',
      metadata: { stax_vat: String(rateBps) },
    },
    { idempotencyKey: idempotencyKey('vat-rate', String(rateBps)) },
  );
  vatRateCache.set(rateBps, created.id);
  return created.id;
}

function lineItemForSetup(
  plan: CheckoutPlanPrices,
  discountCents: Cents,
  taxRates: string[],
): Stripe.Checkout.SessionCreateParams.LineItem {
  const amount = Math.max(plan.setupPriceCents - discountCents, 0);
  if (plan.stripeSetupPriceId && discountCents === 0) {
    return { price: plan.stripeSetupPriceId, quantity: 1, tax_rates: taxRates };
  }
  // Une remise serveur se materialise par un prix ad hoc : le montant envoye a
  // Stripe reste celui calcule par la base, jamais celui fourni par le client.
  return {
    quantity: 1,
    tax_rates: taxRates,
    price_data: {
      currency: plan.currency.toLowerCase(),
      unit_amount: amount,
      tax_behavior: 'exclusive',
      product_data: {
        name: `Création de votre site — offre ${plan.planName}`,
        description: 'Conception, developpement, mise en ligne et accompagnement.',
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

  const vatRate = await ensureVatTaxRate(input.plan.vatRateBps);
  const taxRates = vatRate ? [vatRate] : [];
  const hasMaintenance = input.plan.maintenancePriceCents > 0;

  const metadata: Stripe.MetadataParam = {
    stax_order_id: input.orderId,
    stax_order_reference: input.orderReference,
    stax_organization_id: input.organizationId,
    stax_plan_slug: input.plan.planSlug,
    ...(input.couponCode ? { stax_coupon: input.couponCode } : {}),
  };

  const maintenanceNotice = hasMaintenance
    ? `Seule la création est payée aujourd’hui. La maintenance (${formatMoney(
        input.plan.maintenancePriceCents,
        input.plan.currency,
        { hideDecimalsWhenRound: true },
      )} HT par mois) ne démarre qu’à la livraison de votre site : votre carte est enregistrée par Stripe pour ce prélèvement mensuel, résiliable.`
    : null;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [lineItemForSetup(input.plan, discountCents, taxRates)],
    locale: input.locale ?? 'fr',
    currency: input.plan.currency.toLowerCase(),
    client_reference_id: input.orderId,
    metadata,
    success_url: `${base}/app/commande/${input.orderId}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/commander/paiement?order=${input.orderId}&annule=1`,
    automatic_tax: { enabled: false },
    billing_address_collection: 'required',
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `Création de votre site — commande ${input.orderReference}`,
        metadata,
      },
    },
    // Le consentement CGV est deja recueilli et horodate cote StaX ; Stripe
    // le redemande pour que la preuve existe aussi chez le prestataire.
    consent_collection: { terms_of_service: 'required' },
    custom_text: {
      terms_of_service_acceptance: {
        message: `J’accepte les conditions générales de vente de StaX disponibles sur ${base}/cgv.`,
      },
      ...(maintenanceNotice ? { submit: { message: maintenanceNotice } } : {}),
    },
    payment_intent_data: {
      metadata,
      description: `Création de votre site — commande ${input.orderReference}`,
      // La carte est conservee par Stripe pour la maintenance mensuelle, qui
      // ne sera prelevee qu'a partir de la livraison.
      ...(hasMaintenance ? { setup_future_usage: 'off_session' as const } : {}),
    },
  };

  if (input.stripeCustomerId) {
    params.customer = input.stripeCustomerId;
    params.customer_update = { address: 'auto', name: 'auto' };
  } else {
    params.customer_email = input.customerEmail;
    params.customer_creation = 'always';
  }

  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey: idempotencyKey('checkout-payment', input.orderId),
  });

  if (!session.url) {
    throw new Error('Stripe n’a pas renvoyé d’URL de paiement.');
  }
  return { sessionId: session.id, url: session.url };
}

/**
 * Apres le paiement : la carte utilisee devient le moyen de paiement par
 * defaut du client Stripe, pour la maintenance qui demarrera a la livraison.
 */
export async function rememberDefaultPaymentMethod(params: {
  stripeCustomerId: string;
  paymentIntentId: string;
}): Promise<string | null> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(params.paymentIntentId);
  const paymentMethod =
    typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id;
  if (!paymentMethod) return null;
  await stripe.customers.update(params.stripeCustomerId, {
    invoice_settings: { default_payment_method: paymentMethod },
  });
  return paymentMethod;
}

/* -------------------------------------------------------------------------- */
/*  Maintenance mensuelle : demarrage a la livraison                           */
/* -------------------------------------------------------------------------- */

export interface StartMaintenanceInput {
  orderId: UUID;
  orderReference: string;
  organizationId: UUID;
  siteId: UUID;
  stripeCustomerId: string;
  /** Paiement de la creation : sa carte sert si aucune carte par defaut n'est connue. */
  paymentIntentId?: string | null;
  plan: {
    planSlug: string;
    planName: string;
    maintenancePriceCents: Cents;
    currency: Currency;
    vatRateBps: number;
    stripeMaintenancePriceId: string | null;
  };
}

const productCache = new Map<string, string>();

/** Produit Stripe « Maintenance mensuelle — offre X », cree une fois puis reutilise. */
async function ensureMaintenanceProduct(planSlug: string, planName: string): Promise<string> {
  const cached = productCache.get(planSlug);
  if (cached) return cached;
  const stripe = getStripe();
  const found = await stripe.products.search({
    query: `metadata['stax_maintenance_plan']:'${planSlug.replace(/[^a-z0-9-]/g, '')}' AND active:'true'`,
    limit: 1,
  });
  const existing = found.data[0];
  if (existing) {
    productCache.set(planSlug, existing.id);
    return existing.id;
  }
  const created = await stripe.products.create(
    {
      name: `Maintenance mensuelle — offre ${planName}`,
      description:
        'Hébergement et diffusion Cloudflare, HTTPS, surveillance, sauvegardes, infrastructure de publication, mises à jour StaX, support et accès à l’éditeur.',
      metadata: { stax_maintenance_plan: planSlug },
    },
    { idempotencyKey: idempotencyKey('maintenance-product', planSlug) },
  );
  productCache.set(planSlug, created.id);
  return created.id;
}

/**
 * Cree l'abonnement de maintenance MENSUELLE, le jour de la livraison.
 * Premiere echeance : a la livraison, puis chaque mois. Idempotent par
 * commande : un second appel ne cree jamais un second abonnement.
 */
export async function startMaintenanceSubscription(input: StartMaintenanceInput): Promise<{
  subscriptionId: string;
  status: string;
  priceId: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}> {
  const stripe = getStripe();
  const vatRate = await ensureVatTaxRate(input.plan.vatRateBps);
  const customer = await stripe.customers.retrieve(input.stripeCustomerId);
  if ('deleted' in customer && customer.deleted) {
    throw new Error('Le client Stripe de cette commande a été supprimé.');
  }
  let defaultMethod: string | Stripe.PaymentMethod | null | undefined =
    customer.invoice_settings?.default_payment_method;
  // A defaut, la carte utilisee pour payer la creation.
  if (!defaultMethod && input.paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId);
    defaultMethod = intent.payment_method;
  }
  const metadata: Stripe.MetadataParam = {
    stax_order_id: input.orderId,
    stax_order_reference: input.orderReference,
    stax_organization_id: input.organizationId,
    stax_site_id: input.siteId,
    stax_plan_slug: input.plan.planSlug,
  };

  const item: Stripe.SubscriptionCreateParams.Item = input.plan.stripeMaintenancePriceId
    ? { price: input.plan.stripeMaintenancePriceId }
    : {
        price_data: {
          currency: input.plan.currency.toLowerCase(),
          product: await ensureMaintenanceProduct(input.plan.planSlug, input.plan.planName),
          unit_amount: input.plan.maintenancePriceCents,
          tax_behavior: 'exclusive',
          recurring: { interval: 'month' },
        },
      };

  const subscription = await stripe.subscriptions.create(
    {
      customer: input.stripeCustomerId,
      items: [item],
      ...(vatRate ? { default_tax_rates: [vatRate] } : {}),
      ...(defaultMethod
        ? {
            default_payment_method:
              typeof defaultMethod === 'string' ? defaultMethod : defaultMethod.id,
          }
        : {}),
      collection_method: 'charge_automatically',
      // Si la banque exige une authentification, l'abonnement reste
      // « incomplet » et Stripe envoie au client le lien pour la valider :
      // rien n'est suppose paye.
      payment_behavior: 'allow_incomplete',
      off_session: true,
      payment_settings: { save_default_payment_method: 'on_subscription' },
      description: `Maintenance mensuelle du site — commande ${input.orderReference}`,
      metadata,
    },
    { idempotencyKey: idempotencyKey('maintenance-start', input.orderId) },
  );
  const item0 = subscription.items.data[0];
  const iso = (seconds: number | null | undefined) =>
    typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null;
  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    priceId: item0?.price.id ?? null,
    periodStart: iso(item0?.current_period_start),
    periodEnd: iso(item0?.current_period_end),
  };
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
