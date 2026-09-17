import type { Cents, ConnectStatus, Currency, UUID } from '@stax/types';
import { platformUrl } from '@stax/config';
import { getStripe, idempotencyKey, type Stripe } from './stripe-client';

/**
 * Stripe Connect — paiements encaisses SUR les sites des clients.
 *
 * Principe non negociable : l'argent d'un consommateur qui reserve une table
 * ou achete un produit chez un client de StaX ne transite JAMAIS par les
 * revenus de la plateforme. On utilise des charges DIRECTES sur le compte
 * connecte du professionnel : les fonds lui appartiennent des l'encaissement,
 * et StaX n'est pas dans le flux financier.
 *
 * Une commission plateforme est architecturalement possible
 * (`application_fee_amount`), mais elle vaut zero : aucune commission n'est
 * prelevee aujourd'hui, et aucune ne le sera sans decision commerciale
 * explicite et information prealable du client.
 */

export const PLATFORM_APPLICATION_FEE_BPS = 0;

export interface CreateConnectedAccountInput {
  organizationId: UUID;
  email: string;
  businessName: string;
  country?: string;
}

export async function createConnectedAccount(
  input: CreateConnectedAccountInput,
): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.accounts.create(
    {
      type: 'express',
      country: input.country ?? 'FR',
      email: input.email,
      business_profile: { name: input.businessName },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { stax_organization_id: input.organizationId },
    },
    { idempotencyKey: idempotencyKey('connect-account', input.organizationId) },
  );
  return account.id;
}

/** Lien d'onboarding Stripe (KYC). Toujours a usage unique et de courte duree. */
export async function createOnboardingLink(
  stripeAccountId: string,
  returnPath = '/app/payments',
): Promise<string> {
  const stripe = getStripe();
  const base = platformUrl();
  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${base}${returnPath}?stripe=refresh`,
    return_url: `${base}${returnPath}?stripe=retour`,
    type: 'account_onboarding',
    collection_options: { fields: 'eventually_due' },
  });
  return link.url;
}

/** Lien vers le tableau de bord Express du professionnel. */
export async function createLoginLink(stripeAccountId: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accounts.createLoginLink(stripeAccountId);
  return link.url;
}

export interface ConnectAccountSnapshot {
  status: ConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  disabledReason: string | null;
  defaultCurrency: Currency;
  country: string;
}

export function summarizeAccount(account: Stripe.Account): ConnectAccountSnapshot {
  const requirements = account.requirements;
  const due = [
    ...(requirements?.currently_due ?? []),
    ...(requirements?.past_due ?? []),
  ];
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;
  const detailsSubmitted = account.details_submitted === true;

  let status: ConnectStatus;
  if (requirements?.disabled_reason) {
    status = 'disabled';
  } else if (chargesEnabled && payoutsEnabled) {
    status = 'active';
  } else if (chargesEnabled && !payoutsEnabled) {
    status = 'restricted';
  } else if (detailsSubmitted) {
    status = 'pending_verification';
  } else {
    status = 'onboarding';
  }

  return {
    status,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsDue: [...new Set(due)],
    disabledReason: requirements?.disabled_reason ?? null,
    defaultCurrency: (account.default_currency?.toUpperCase() as Currency) ?? 'EUR',
    country: account.country ?? 'FR',
  };
}

export async function retrieveAccount(stripeAccountId: string): Promise<ConnectAccountSnapshot> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(stripeAccountId);
  return summarizeAccount(account);
}

/**
 * Le compte connecte peut-il encaisser ? Verifie cote serveur avant d'exposer
 * le moindre bouton de paiement sur un site client.
 */
export function canAcceptPayments(snapshot: ConnectAccountSnapshot): boolean {
  return snapshot.status === 'active' && snapshot.chargesEnabled;
}

export interface ConnectPaymentInput {
  stripeAccountId: string;
  amountCents: Cents;
  currency: Currency;
  /** Identifiant metier StaX, pour la reconciliation et l'idempotence. */
  referenceId: UUID;
  description: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

/**
 * Cree un PaymentIntent en charge DIRECTE sur le compte du professionnel.
 * Les fonds ne transitent pas par le compte Stripe de la plateforme.
 */
export async function createConnectPaymentIntent(
  input: ConnectPaymentInput,
): Promise<{ id: string; clientSecret: string }> {
  const stripe = getStripe();
  const applicationFee =
    PLATFORM_APPLICATION_FEE_BPS > 0
      ? Math.trunc((input.amountCents * PLATFORM_APPLICATION_FEE_BPS) / 10_000)
      : 0;

  const intent = await stripe.paymentIntents.create(
    {
      amount: input.amountCents,
      currency: input.currency.toLowerCase(),
      description: input.description,
      ...(input.customerEmail ? { receipt_email: input.customerEmail } : {}),
      automatic_payment_methods: { enabled: true },
      ...(applicationFee > 0 ? { application_fee_amount: applicationFee } : {}),
      metadata: { stax_reference_id: input.referenceId, ...(input.metadata ?? {}) },
    },
    {
      // En-tete Stripe-Account : la requete s'execute AU NOM du compte connecte.
      stripeAccount: input.stripeAccountId,
      idempotencyKey: idempotencyKey('connect-pi', input.referenceId),
    },
  );

  if (!intent.client_secret) {
    throw new Error('Stripe n’a pas renvoye de client_secret pour ce paiement.');
  }
  return { id: intent.id, clientSecret: intent.client_secret };
}

/** Session de paiement hebergee, sur le compte du professionnel. */
export async function createConnectCheckoutSession(params: {
  stripeAccountId: string;
  amountCents: Cents;
  currency: Currency;
  referenceId: UUID;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.currency.toLowerCase(),
            unit_amount: params.amountCents,
            product_data: { name: params.productName },
          },
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      locale: 'fr',
      ...(params.customerEmail ? { customer_email: params.customerEmail } : {}),
      client_reference_id: params.referenceId,
      metadata: { stax_reference_id: params.referenceId, ...(params.metadata ?? {}) },
    },
    {
      stripeAccount: params.stripeAccountId,
      idempotencyKey: idempotencyKey('connect-checkout', params.referenceId),
    },
  );
  if (!session.url) throw new Error('Stripe n’a pas renvoye d’URL de paiement.');
  return { id: session.id, url: session.url };
}

export const CONNECT_STATUS_LABELS: Record<ConnectStatus, string> = {
  not_started: 'Non configure',
  onboarding: 'Configuration en cours',
  pending_verification: 'Verification Stripe en cours',
  active: 'Actif',
  restricted: 'Limite',
  disabled: 'Desactive',
};

export const CONNECT_STATUS_HELP: Record<ConnectStatus, string> = {
  not_started:
    'Activez les paiements pour encaisser directement sur votre compte bancaire.',
  onboarding:
    'Terminez votre inscription Stripe pour pouvoir encaisser des paiements.',
  pending_verification:
    'Stripe verifie vos informations. Cela prend generalement moins de 24 heures.',
  active: 'Vous pouvez encaisser des paiements. Les fonds arrivent sur votre compte bancaire.',
  restricted:
    'Vos encaissements fonctionnent, mais vos virements sont bloques. Completez les informations demandees par Stripe.',
  disabled:
    'Votre compte Stripe est desactive. Consultez les informations demandees pour le reactiver.',
};
