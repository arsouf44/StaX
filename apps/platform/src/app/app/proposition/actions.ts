'use server';

import { redirect, unstable_rethrow } from 'next/navigation';
import { tryCreateServiceClient, unwrapMaybe } from '@stax/database';
import {
  createCheckoutSession,
  ensureStripeCustomer,
  isStripeConfigured,
  retrieveCheckoutSession,
} from '@stax/payments';
import { uuidSchema } from '@stax/validation';
import { TERMS_VERSION } from '~/content/legal';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace } from '~/lib/workspace';

/**
 * « Payer et récupérer mon site » : paiement d'une proposition.
 *
 * Même intégrité que le tunnel de commande : la commande est créée par la base
 * (`create_proposal_order`) avec les montants FIGÉS dans la proposition, sur
 * le site déjà construit ; la session Stripe part de ces montants ; rien n'est
 * « payé » avant le webhook signé. Une session encore ouverte est reprise
 * plutôt que dupliquée.
 */

const REFUSALS: Record<string, string> = {
  not_found: 'Cette proposition est introuvable.',
  already_paid: 'Cette proposition est déjà réglée : merci ! Votre site vous est confié.',
  withdrawn: 'Cette proposition n’est plus disponible. Écrivez-nous ci-dessous.',
  not_claimed: 'Cette proposition doit d’abord être récupérée avec votre code.',
  expired: 'Cette proposition a expiré. Écrivez-nous ci-dessous : nous la prolongeons volontiers.',
};

export async function startProposalCheckoutAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const professional = formData.get('professionalUse');
  if (professional !== 'on' && professional !== 'true') {
    return {
      status: 'error',
      message: 'Confirmez que vous achetez ce site pour votre activité professionnelle.',
    };
  }
  const accepted = formData.get('acceptTerms');
  if (accepted !== 'on' && accepted !== 'true') {
    return {
      status: 'error',
      message: 'Acceptez les conditions générales de vente pour continuer.',
    };
  }
  const proposalId = uuidSchema.safeParse(formData.get('proposalId'));
  if (!proposalId.success) return { status: 'error', message: 'Demande refusée.' };

  const { workspace, db, userId } = await getWorkspace();
  const guard = await guardAction({ limit: 'checkout', userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  if (!isStripeConfigured()) {
    return {
      status: 'error',
      message:
        'Le paiement en ligne n’est pas encore disponible. Écrivez-nous ci-dessous : nous ' +
        'finalisons avec vous.',
    };
  }

  const { data, error } = await db.rpc('create_proposal_order', {
    p_proposal: proposalId.data,
    p_terms_version: TERMS_VERSION,
    p_ip_hash: guard.ipHash,
  });
  const created = (data ?? {}) as { ok?: boolean; code?: string; orderId?: string };
  if (error || !created.ok || !created.orderId) {
    if (created.code === 'already_paid' && created.orderId) {
      redirect(`/app/commande/${created.orderId}/confirmation`);
    }
    return {
      status: 'error',
      message: REFUSALS[created.code ?? ''] ?? 'Le paiement n’a pas pu être préparé. Réessayez.',
    };
  }

  const order = unwrapMaybe<{
    id: string;
    reference: string;
    organization_id: string;
    plan_slug: string;
    setup_price_cents: number;
    maintenance_price_cents: number;
    currency: string;
    vat_rate_bps: number;
    stripe_checkout_session_id: string | null;
  }>(
    (await db
      .from('orders')
      .select(
        'id, reference, organization_id, plan_slug, setup_price_cents, maintenance_price_cents, ' +
          'currency, vat_rate_bps, stripe_checkout_session_id',
      )
      .eq('id', created.orderId)
      .single()) as never,
  );
  if (!order) return { status: 'error', message: 'Commande introuvable. Réessayez.' };

  let checkoutUrl: string;
  try {
    // Session déjà ouverte : on la reprend. Payée : on va à la confirmation.
    let attempt: number | undefined;
    if (order.stripe_checkout_session_id) {
      const existing = await retrieveCheckoutSession(order.stripe_checkout_session_id);
      if (existing.status === 'open' && existing.url) redirect(existing.url);
      if (existing.status === 'complete') redirect(`/app/commande/${order.id}/confirmation`);
      attempt = Date.now();
    }

    const plan = unwrapMaybe<{ name: string }>(
      (await db
        .from('plans')
        .select('name')
        .eq('slug', order.plan_slug)
        .limit(1)
        .maybeSingle()) as never,
    );
    const organization = unwrapMaybe<{ stripe_customer_id: string | null }>(
      (await db
        .from('organizations')
        .select('stripe_customer_id')
        .eq('id', order.organization_id)
        .maybeSingle()) as never,
    );
    const customerId = await ensureStripeCustomer({
      email: workspace.profile.email,
      organizationName: workspace.organization.name,
      organizationId: order.organization_id,
      existingCustomerId: organization?.stripe_customer_id ?? null,
    });
    if (!organization?.stripe_customer_id) {
      // La colonne est réservée au serveur (déclencheur) : écrite avec la clé
      // de service. À défaut, le webhook de paiement la renseignera.
      await tryCreateServiceClient()
        ?.from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', order.organization_id)
        .is('stripe_customer_id', null);
    }

    const checkout = await createCheckoutSession({
      orderId: order.id,
      orderReference: order.reference,
      organizationId: order.organization_id,
      customerEmail: workspace.profile.email,
      stripeCustomerId: customerId,
      plan: {
        planSlug: order.plan_slug,
        planName: plan?.name ?? order.plan_slug,
        setupPriceCents: order.setup_price_cents,
        maintenancePriceCents: order.maintenance_price_cents,
        currency: order.currency as 'EUR',
        stripeSetupPriceId: null,
        stripeMaintenancePriceId: null,
        vatRateBps: order.vat_rate_bps,
      },
      cancelPath: '/app?paiement=annule',
      attempt,
      locale: 'fr',
    });
    checkoutUrl = checkout.url;
    await db.rpc('attach_checkout_session', {
      p_order: order.id,
      p_session: checkout.sessionId,
    });
  } catch (checkoutError) {
    // `redirect()` lève une exception de contrôle : elle doit remonter telle quelle.
    unstable_rethrow(checkoutError);
    console.error('[stax:proposal-checkout]', checkoutError);
    return {
      status: 'error',
      message:
        'La page de paiement n’a pas pu s’ouvrir. Rien n’a été débité : réessayez dans un instant.',
    };
  }

  redirect(checkoutUrl);
}
