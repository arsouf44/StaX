import { platformUrl } from '@stax/config';
import { createServiceClient } from '@stax/database';
import { renewalReminderEmail, sendEmail } from '@stax/emails';
import {
  formatMoney,
  redactEventPayload,
  verifyWebhook,
  WebhookVerificationError,
  type Stripe,
} from '@stax/payments';
import { provisionExistingSite } from '~/lib/site-provisioning';

/**
 * Webhook Stripe de la plateforme.
 *
 * C est ICI, et nulle part ailleurs, qu une commande devient payee. Un
 * visiteur peut atteindre la page de confirmation sans avoir paye ; il ne peut
 * pas fabriquer une signature Stripe.
 *
 * Trois proprietes tenues :
 *
 *  1. SIGNATURE — le corps brut est verifie avec WebCrypto avant toute lecture.
 *     Un evenement non signe, mal signe ou trop ancien est rejete sans etre lu.
 *
 *  2. IDEMPOTENCE — Stripe rejoue un evenement jusqu a trois jours. Chaque
 *     identifiant est enregistre dans `webhook_events` sous contrainte
 *     d unicite, et les fonctions SQL appliquees sont elles-memes idempotentes.
 *
 *  3. MONTANTS — aucun montant n est lu dans la charge utile pour decider de ce
 *     qui est credite. Le montant vient de la commande, figee a sa creation.
 *
 * La reponse est toujours 200 des lors que l evenement a ete PRIS EN CHARGE,
 * meme s il n est pas traite : un 500 ferait rejouer Stripe indefiniment sur
 * une erreur qui ne se resoudra pas d elle-meme. Les echecs reels sont
 * enregistres avec leur motif et rejoues par une tache de fond.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDER = 'stripe';

function ok(body: Record<string, unknown> = { received: true }): Response {
  return Response.json(body, { status: 200, headers: { 'cache-control': 'no-store' } });
}

function reject(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  // Le corps BRUT est indispensable : toute reserialisation invaliderait la
  // signature.
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = await verifyWebhook(rawBody, signature, 'platform');
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      // 400 : Stripe n a pas a rejouer un evenement dont la signature est
      // invalide — il le serait tout autant au second essai.
      return reject('Signature invalide.', error.reason === 'not_configured' ? 503 : 400);
    }
    return reject('Requête refusée.', 400);
  }

  const db = createServiceClient();

  const { data: accepted, error: registerError } = await db.rpc('begin_webhook_event', {
    p_provider: PROVIDER,
    p_event_id: event.id,
    p_event_type: event.type,
    p_account_id: event.account ?? null,
    p_signed_at: new Date(event.created * 1000).toISOString(),
    p_payload: redactEventPayload(event),
  });

  if (registerError) {
    // La base est indisponible : on demande a Stripe de rejouer plus tard.
    return reject('Indisponible.', 503);
  }
  if (accepted !== true) {
    return ok({ received: true, duplicate: true });
  }

  try {
    await handleEvent(db, event);
    await db.rpc('finish_webhook_event', {
      p_provider: PROVIDER,
      p_event_id: event.id,
      p_status: 'processed',
      p_error: null,
    });
    return ok();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    await db.rpc('finish_webhook_event', {
      p_provider: PROVIDER,
      p_event_id: event.id,
      p_status: 'failed',
      p_error: message,
    });
    console.error('[stax:webhook]', event.type, message);
    // L evenement est conserve avec son motif d echec et sera rejoue par la
    // tache de fond. On ne fait pas boucler Stripe dessus.
    return ok({ received: true, deferred: true });
  }
}

type Db = ReturnType<typeof createServiceClient>;

async function handleEvent(db: Db, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await onCheckoutCompleted(db, event.data.object as Stripe.Checkout.Session);
      return;

    case 'checkout.session.expired':
      await onCheckoutExpired(db, event.data.object as Stripe.Checkout.Session);
      return;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await onSubscriptionEvent(db, event.data.object as Stripe.Subscription);
      return;

    case 'invoice.paid':
    case 'invoice.payment_failed':
    case 'invoice.finalized':
      await onInvoiceEvent(db, event.data.object as Stripe.Invoice);
      return;

    case 'invoice.upcoming':
      await onUpcomingInvoice(db, event.data.object as Stripe.Invoice);
      return;

    case 'charge.refunded':
      await onChargeRefunded(db, event.data.object as Stripe.Charge);
      return;

    default:
      // Evenement non traite : deja journalise, rien a faire.
      return;
  }
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function toIso(seconds: number | null | undefined): string | null {
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null;
}

async function onCheckoutCompleted(db: Db, session: Stripe.Checkout.Session): Promise<void> {
  // Une session non payee ne vaut rien : `payment_status` fait foi, pas
  // l existence de la session.
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return;
  }

  const orderId = session.client_reference_id ?? session.metadata?.stax_order_id ?? null;
  if (!orderId) throw new Error('Session de paiement sans commande associee.');

  const { data, error } = await db.rpc('apply_order_paid', {
    p_order_id: orderId,
    p_payment_intent_id: asString(session.payment_intent),
    p_checkout_session_id: session.id,
    p_stripe_customer_id: asString(session.customer),
    p_charge_id: null,
    p_brand: null,
    p_last4: null,
  });

  if (error) throw new Error(error.message);
  const result = data as { ok: boolean; code?: string; siteId?: string } | null;
  if (!result?.ok) {
    throw new Error(`Commande non appliquee : ${result?.code ?? 'inconnu'}`);
  }

  // Le site est prepare DES le paiement : le client le trouve dans son espace,
  // avec des pages et des textes adaptes a son metier, pret a etre relu. Un
  // echec ici n annule pas la commande (elle est payee) : l espace client
  // propose « Préparer mon site » et la fonction SQL est idempotente.
  if (result.code === 'applied' && result.siteId) {
    await prepareOrderedSite(db, orderId, result.siteId).catch((error: unknown) => {
      console.error('[stax:webhook] preparation du site differee', error);
    });
  }

  // L abonnement de maintenance arrive aussi par `customer.subscription.created`,
  // mais l ordre des evenements n est pas garanti : on le rattache ici s il est
  // deja connu, et la fonction SQL reste idempotente dans les deux cas.
  const subscriptionId = asString(session.subscription);
  if (subscriptionId) {
    await db.rpc('upsert_subscription_from_stripe', {
      p_stripe_subscription_id: subscriptionId,
      p_stripe_customer_id: asString(session.customer),
      p_status: 'incomplete',
      p_period_start: null,
      p_period_end: null,
      p_cancel_at_period_end: false,
      p_order_id: orderId,
      p_price_id: null,
    });
  }
}

async function onCheckoutExpired(db: Db, session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.client_reference_id ?? session.metadata?.stax_order_id ?? null;
  if (!orderId) return;
  // Une session expiree ne annule pas la commande : le client peut relancer le
  // paiement. On la repasse simplement en brouillon.
  await db
    .from('orders')
    .update({ status: 'draft' })
    .eq('id', orderId)
    .eq('status', 'checkout_pending');
}

async function onSubscriptionEvent(db: Db, subscription: Stripe.Subscription): Promise<void> {
  const item = subscription.items?.data?.[0];
  const { error } = await db.rpc('upsert_subscription_from_stripe', {
    p_stripe_subscription_id: subscription.id,
    p_stripe_customer_id: asString(subscription.customer),
    p_status: subscription.status,
    p_period_start: toIso(item?.current_period_start),
    p_period_end: toIso(item?.current_period_end),
    p_cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    p_order_id: subscription.metadata?.stax_order_id ?? null,
    p_price_id: item?.price?.id ?? null,
  });
  if (error) throw new Error(error.message);
}

async function onInvoiceEvent(db: Db, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId =
    asString((invoice as unknown as { subscription?: unknown }).subscription) ??
    asString(invoice.lines?.data?.[0]?.subscription);
  if (!subscriptionId) return;

  const { error } = await db.rpc('record_invoice_event', {
    p_stripe_invoice_id: invoice.id,
    p_stripe_subscription_id: subscriptionId,
    p_status: invoice.status ?? 'open',
    p_amount_cents: invoice.amount_due ?? 0,
    p_currency: invoice.currency ?? 'eur',
    p_hosted_url: invoice.hosted_invoice_url ?? null,
    p_pdf_url: invoice.invoice_pdf ?? null,
    p_number: invoice.number ?? null,
    p_period_start: toIso(invoice.period_start),
    p_period_end: toIso(invoice.period_end),
  });
  if (error) throw new Error(error.message);
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

/**
 * Rappel de reconduction de la maintenance annuelle.
 *
 * Obligatoire envers un client non professionnel (article L215-1 du Code de la
 * consommation) : sans lui, il pourrait resilier a tout moment apres la
 * reconduction. Nous l'envoyons a tous les clients. Une maintenance deja
 * resiliee ne recoit rien : elle ne sera pas reconduite.
 */
async function onUpcomingInvoice(db: Db, invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId =
    asString((invoice as unknown as { subscription?: unknown }).subscription) ??
    asString(invoice.lines?.data?.[0]?.subscription);
  if (!subscriptionId) return;

  const { data: subscription } = await db
    .from('subscriptions')
    .select('organization_id, billing_interval, current_period_end, cancel_at_period_end, status')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();
  const row = subscription as {
    organization_id: string;
    billing_interval: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    status: string;
  } | null;
  if (!row || row.cancel_at_period_end || row.billing_interval !== 'year') return;
  if (row.status === 'canceled' || row.status === 'incomplete_expired') return;

  const renewal =
    row.current_period_end ?? toIso(invoice.next_payment_attempt) ?? toIso(invoice.period_end);
  if (!renewal) return;

  const { data: member } = await db
    .from('organization_members')
    .select('profiles ( email, first_name )')
    .eq('organization_id', row.organization_id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();
  const profile = (
    member as { profiles: { email: string; first_name: string | null } | null } | null
  )?.profiles;
  if (!profile?.email) return;

  const result = await sendEmail(
    renewalReminderEmail({
      to: profile.email,
      firstName: profile.first_name,
      renewalDate: LONG_DATE.format(new Date(renewal)),
      amount: formatMoney(invoice.amount_due ?? 0, 'EUR') + ' TTC',
      cancelUrl: `${platformUrl()}/app/abonnement`,
    }),
    { db, organizationId: row.organization_id },
  );
  // Un echec d'envoi est rejoue : le rappel est une obligation, pas un confort.
  if (!result.ok) throw new Error(`Rappel de reconduction non envoye : ${result.error ?? ''}`);
}

async function onChargeRefunded(db: Db, charge: Stripe.Charge): Promise<void> {
  const paymentIntentId = asString(charge.payment_intent);
  if (!paymentIntentId) return;

  const refunds = charge.refunds?.data ?? [];
  for (const refund of refunds) {
    const { error } = await db.rpc('apply_refund_settled', {
      p_stripe_refund_id: refund.id,
      p_payment_intent_id: paymentIntentId,
      p_amount_cents: refund.amount,
      p_status: refund.status ?? 'succeeded',
    });
    if (error) throw new Error(error.message);
  }
}

/** Prepare le site d une commande payee, a partir de son metier et de son offre. */
async function prepareOrderedSite(db: Db, orderId: string, siteId: string): Promise<void> {
  const { data: order } = await db
    .from('orders')
    .select('organization_id, business_type_slug, requested_domain, domain_handling, questionnaire')
    .eq('id', orderId)
    .maybeSingle();
  const { data: site } = await db.from('sites').select('id, name').eq('id', siteId).maybeSingle();
  if (!order || !site) return;

  const answers = (order.questionnaire ?? {}) as Record<string, unknown>;
  const features = new Map<string, boolean>();
  const hasFeature = (feature: string) => features.get(feature) === true;
  for (const feature of [
    'bookings',
    'ecommerce',
    'online_payments',
    'customer_accounts',
    'blog',
    'multi_language',
  ]) {
    // `site_has_feature` est la variante reservee a la cle de service : la
    // version publique ne repond qu aux membres de l organisation.
    const { data: enabled } = await db.rpc('site_has_feature', {
      p_site: siteId,
      p_feature: feature,
    });
    features.set(feature, enabled === true);
  }

  await provisionExistingSite(
    db,
    {
      id: site.id as string,
      name: site.name as string,
      businessTypeSlug: (order.business_type_slug as string | null) ?? null,
      organizationId: order.organization_id as string,
    },
    {
      hasFeature,
      subdomain:
        order.domain_handling === 'subdomain_only' && typeof order.requested_domain === 'string'
          ? order.requested_domain.split('.')[0]
          : null,
      details: {
        email: typeof answers['contactEmail'] === 'string' ? answers['contactEmail'] : null,
        phone: typeof answers['contactPhone'] === 'string' ? answers['contactPhone'] : null,
        city: typeof answers['city'] === 'string' ? answers['city'] : null,
        pitch: typeof answers['pitch'] === 'string' ? answers['pitch'] : null,
        description: typeof answers['pitch'] === 'string' ? answers['pitch'] : null,
      },
    },
  );
}
