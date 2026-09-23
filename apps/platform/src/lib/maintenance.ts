import 'server-only';
import { unwrapMaybe, type Db } from '@stax/database';
import { isStripeConfigured, startMaintenanceSubscription } from '@stax/payments';

/**
 * Demarrage de la maintenance MENSUELLE, le jour de la livraison.
 *
 * A la commande, seul le prix de creation est encaisse ; la commande porte
 * une maintenance « en attente de livraison ». C'est ICI, au moment ou
 * l'equipe livre le site (checklist complete, `deliver_site`), que
 * l'abonnement Stripe est cree. La base refuse d'enregistrer un abonnement
 * mensuel pour un site non livre : la regle ne repose pas sur ce seul code.
 *
 * Un echec (carte expiree, Stripe indisponible) n'annule pas la livraison :
 * la commande passe en « demarrage echoue », l'equipe le voit et relance.
 */

export type MaintenanceStart =
  | { status: 'started'; subscriptionStatus: string }
  | { status: 'not_applicable' }
  | { status: 'failed'; message: string };

interface PendingOrder {
  id: string;
  reference: string;
  organization_id: string;
  site_id: string;
  plan_id: string | null;
  plan_slug: string | null;
  maintenance_price_cents: number;
  billing_interval: string;
  vat_rate_bps: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  maintenance_status: string;
}

export async function startMaintenanceAtDelivery(
  service: Db,
  siteId: string,
): Promise<MaintenanceStart> {
  const order = unwrapMaybe<PendingOrder>(
    (await service
      .from('orders')
      .select(
        'id, reference, organization_id, site_id, plan_id, plan_slug, maintenance_price_cents, ' +
          'billing_interval, vat_rate_bps, currency, stripe_payment_intent_id, maintenance_status',
      )
      .eq('site_id', siteId)
      .in('status', ['paid', 'partially_refunded'])
      .in('maintenance_status', ['pending_delivery', 'failed'])
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as never,
  );
  if (!order || order.maintenance_price_cents <= 0) return { status: 'not_applicable' };

  const fail = async (message: string): Promise<MaintenanceStart> => {
    await service.rpc('mark_maintenance_start_failed', { p_order: order.id, p_reason: message });
    return { status: 'failed', message };
  };

  if (!isStripeConfigured()) {
    return fail('Stripe n’est pas configuré : l’abonnement de maintenance n’a pas pu être créé.');
  }

  const [organization, plan] = await Promise.all([
    unwrapMaybe<{ stripe_customer_id: string | null }>(
      (await service
        .from('organizations')
        .select('stripe_customer_id')
        .eq('id', order.organization_id)
        .maybeSingle()) as never,
    ),
    order.plan_id
      ? unwrapMaybe<{ name: string; stripe_maintenance_price_id: string | null }>(
          (await service
            .from('plans')
            .select('name, stripe_maintenance_price_id')
            .eq('id', order.plan_id)
            .maybeSingle()) as never,
        )
      : Promise.resolve(null),
  ]);
  if (!organization?.stripe_customer_id) {
    return fail('Aucun client Stripe n’est associé à cette commande.');
  }

  try {
    const started = await startMaintenanceSubscription({
      orderId: order.id,
      orderReference: order.reference,
      organizationId: order.organization_id,
      siteId,
      stripeCustomerId: organization.stripe_customer_id,
      paymentIntentId: order.stripe_payment_intent_id,
      plan: {
        planSlug: order.plan_slug ?? 'maintenance',
        planName: plan?.name ?? order.plan_slug ?? 'StaX',
        maintenancePriceCents: order.maintenance_price_cents,
        currency: (order.currency || 'EUR').toUpperCase() as 'EUR',
        vatRateBps: order.vat_rate_bps,
        // Le prix Stripe du catalogue n'est utilise que s'il est bien mensuel
        // et identique au prix fige dans la commande ; sinon un prix ad hoc.
        stripeMaintenancePriceId: null,
      },
    });
    // Enregistrement immediat (le webhook `customer.subscription.created`
    // arrive aussi : la fonction est idempotente).
    await service.rpc('upsert_subscription_from_stripe', {
      p_stripe_subscription_id: started.subscriptionId,
      p_stripe_customer_id: organization.stripe_customer_id,
      p_status: started.status,
      p_period_start: started.periodStart,
      p_period_end: started.periodEnd,
      p_cancel_at_period_end: false,
      p_order_id: order.id,
      p_price_id: started.priceId,
    });
    return { status: 'started', subscriptionStatus: started.status };
  } catch (error) {
    return fail(
      error instanceof Error ? error.message.slice(0, 300) : 'Stripe a refusé l’abonnement.',
    );
  }
}
