import { createServiceClient } from '@stax/database';
import {
  redactEventPayload,
  summarizeAccount,
  verifyWebhook,
  WebhookVerificationError,
  type Stripe,
} from '@stax/payments';

/**
 * Webhook Stripe Connect.
 *
 * Il concerne les encaissements realises SUR LES SITES DES CLIENTS, pas les
 * revenus de StaX. Deux consequences directes :
 *
 *  - l argent ne transite jamais par un compte StaX : il va directement sur le
 *    compte Stripe du client, ouvert a son nom ;
 *  - l evenement porte un `account` : c est lui qui identifie le client
 *    concerne. On ne fait JAMAIS confiance a un identifiant present dans la
 *    charge utile pour decider de quel tenant il s agit.
 *
 * Comme pour la plateforme, la signature est verifiee avant toute lecture et
 * chaque evenement est enregistre une seule fois.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDER = 'stripe_connect';

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = await verifyWebhook(rawBody, signature, 'connect');
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return Response.json(
        { error: 'Signature invalide.' },
        { status: error.reason === 'not_configured' ? 503 : 400 },
      );
    }
    return Response.json({ error: 'Requête refusée.' }, { status: 400 });
  }

  const accountId = event.account ?? null;
  const db = createServiceClient();

  const { data: accepted, error: registerError } = await db.rpc('begin_webhook_event', {
    p_provider: PROVIDER,
    p_event_id: event.id,
    p_event_type: event.type,
    p_account_id: accountId,
    p_signed_at: new Date(event.created * 1000).toISOString(),
    p_payload: redactEventPayload(event),
  });

  if (registerError) return Response.json({ error: 'Indisponible.' }, { status: 503 });
  if (accepted !== true) return Response.json({ received: true, duplicate: true });

  try {
    await handleConnectEvent(db, event, accountId);
    await db.rpc('finish_webhook_event', {
      p_provider: PROVIDER,
      p_event_id: event.id,
      p_status: 'processed',
      p_error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    await db.rpc('finish_webhook_event', {
      p_provider: PROVIDER,
      p_event_id: event.id,
      p_status: 'failed',
      p_error: message,
    });
    console.error('[stax:webhook:connect]', event.type, message);
  }

  return Response.json({ received: true });
}

type Db = ReturnType<typeof createServiceClient>;

async function handleConnectEvent(
  db: Db,
  event: Stripe.Event,
  accountId: string | null,
): Promise<void> {
  if (!accountId) return;

  switch (event.type) {
    case 'account.updated': {
      const snapshot = summarizeAccount(event.data.object as Stripe.Account);
      // Le compte est retrouve par son identifiant Stripe, qui a ete enregistre
      // au moment ou StaX l a cree pour ce client : la correspondance ne vient
      // jamais de la charge utile.
      const { error } = await db
        .from('connected_accounts')
        .update({
          status: snapshot.status,
          charges_enabled: snapshot.chargesEnabled,
          payouts_enabled: snapshot.payoutsEnabled,
          details_submitted: snapshot.detailsSubmitted,
          requirements_due: snapshot.requirementsDue,
          disabled_reason: snapshot.disabledReason,
          country: snapshot.country,
          default_currency: snapshot.defaultCurrency,
          activated_at: snapshot.status === 'active' ? new Date().toISOString() : null,
          last_synced_at: new Date().toISOString(),
        })
        .eq('stripe_account_id', accountId);
      if (error) throw new Error(error.message);
      return;
    }

    case 'account.application.deauthorized': {
      const { error } = await db
        .from('connected_accounts')
        .update({
          // L autorisation est retiree : le client ne peut plus encaisser tant
          // qu il n a pas reconnecte son compte.
          status: 'disabled',
          charges_enabled: false,
          payouts_enabled: false,
          disabled_reason: 'application_deauthorized',
          last_synced_at: new Date().toISOString(),
        })
        .eq('stripe_account_id', accountId);
      if (error) throw new Error(error.message);
      return;
    }

    case 'payment_intent.succeeded':
    case 'checkout.session.completed': {
      await recordConnectPayment(db, event, accountId);
      return;
    }

    default:
      return;
  }
}

/**
 * Trace un encaissement realise sur le site d un client.
 *
 * StaX ne prend aucune commission : `application_fee_cents` vaut zero. La ligne
 * sert au client pour son suivi, et a nous pour l assistance.
 */
async function recordConnectPayment(db: Db, event: Stripe.Event, accountId: string): Promise<void> {
  const object = event.data.object as Stripe.PaymentIntent | Stripe.Checkout.Session;
  const isSession = object.object === 'checkout.session';

  const amount = isSession
    ? ((object as Stripe.Checkout.Session).amount_total ?? 0)
    : (object as Stripe.PaymentIntent).amount_received;
  if (!amount || amount <= 0) return;

  const paymentIntentId = isSession
    ? typeof (object as Stripe.Checkout.Session).payment_intent === 'string'
      ? ((object as Stripe.Checkout.Session).payment_intent as string)
      : null
    : object.id;
  if (!paymentIntentId) return;

  const { data: account } = await db
    .from('connected_accounts')
    .select('organization_id')
    .eq('stripe_account_id', accountId)
    .maybeSingle();

  if (!account) return;

  const { error } = await db.from('payments').upsert(
    {
      organization_id: account.organization_id,
      scope: 'connect',
      status: 'succeeded',
      kind: 'shop_order',
      amount_cents: amount,
      currency: (object.currency ?? 'eur').toUpperCase(),
      application_fee_cents: 0,
      stripe_payment_intent_id: paymentIntentId,
      stripe_account_id: accountId,
      succeeded_at: new Date().toISOString(),
      description: 'Encaissement sur le site du client',
    },
    { onConflict: 'stripe_payment_intent_id', ignoreDuplicates: false },
  );
  if (error) throw new Error(error.message);
}
