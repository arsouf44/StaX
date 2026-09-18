'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServiceClient, unwrapMaybe } from '@stax/database';
import {
  cancelSubscriptionAtPeriodEnd,
  createBillingPortalSession,
  resumeSubscription,
} from '@stax/payments';
import { cancelSubscriptionSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace, type WorkspaceContext } from '~/lib/workspace';

/**
 * Cycle de vie de l'abonnement de maintenance.
 *
 * La regle qui gouverne cet ecran : StaX ne DECLARE jamais l'etat d'un
 * abonnement. Toute demande part vers Stripe ; c'est le webhook signe qui, en
 * revenant, met la base a jour. Entre les deux, l'ecran dit honnetement « pris
 * en compte », jamais « resilie ».
 *
 * La table `subscriptions` est en ecriture reservee a la plateforme : meme si
 * cette action etait contournee, un client ne pourrait pas se declarer a jour
 * de paiement ni prolonger sa maintenance.
 */

const REASON_LABELS: Record<string, string> = {
  too_expensive: 'Trop cher',
  no_longer_needed: 'Je n’en ai plus besoin',
  missing_features: 'Il manque des fonctionnalités',
  switching_provider: 'Je change de prestataire',
  business_closing: 'Mon activité s’arrête',
  other: 'Autre raison',
};

type Gate =
  | { ok: true; value: WorkspaceContext & { stripeSubscriptionId: string; subscriptionId: string } }
  | { ok: false; state: ActionState };

async function requireBillingManager(subscriptionId: unknown): Promise<Gate> {
  const context = await getWorkspace();

  if (!context.workspace.capabilities.includes('billing.manage')) {
    return {
      ok: false,
      state: {
        status: 'error',
        message: 'Seul un propriétaire de votre organisation peut modifier l’abonnement.',
      },
    };
  }

  const guard = await guardAction({ limit: 'apiWrite', userId: context.userId });
  if (!guard.ok) return { ok: false, state: { status: 'error', message: guard.message } };

  const subscription = unwrapMaybe<{ id: string; stripe_subscription_id: string | null }>(
    (await context.db
      .from('subscriptions')
      .select('id, stripe_subscription_id')
      .eq('id', typeof subscriptionId === 'string' ? subscriptionId : '')
      .eq('organization_id', context.workspace.organization.id)
      .maybeSingle()) as never,
  );

  if (!subscription?.stripe_subscription_id) {
    return {
      ok: false,
      state: {
        status: 'error',
        message:
          'Cet abonnement est introuvable ou n’est pas encore actif. Écrivez-nous si le problème persiste.',
      },
    };
  }

  return {
    ok: true,
    value: {
      ...context,
      subscriptionId: subscription.id,
      stripeSubscriptionId: subscription.stripe_subscription_id,
    },
  };
}

export async function requestCancellationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = cancelSubscriptionSchema.safeParse({
    subscriptionId: formData.get('subscriptionId'),
    reason: formData.get('reason'),
    comment: formData.get('comment') || undefined,
    confirm: formData.get('confirm') === 'on',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Indiquez la raison de votre résiliation et confirmez la case.',
    };
  }

  const gate = await requireBillingManager(parsed.data.subscriptionId);
  if (!gate.ok) return gate.state;

  const label = REASON_LABELS[parsed.data.reason] ?? parsed.data.reason;

  try {
    await cancelSubscriptionAtPeriodEnd(
      gate.value.stripeSubscriptionId,
      `${label}${parsed.data.comment ? ` — ${parsed.data.comment}` : ''}`,
    );
  } catch (error) {
    console.error('[stax:subscription] resiliation impossible', error);
    return {
      status: 'error',
      message:
        'Votre demande n’a pas pu être transmise. Réessayez dans quelques minutes, ou écrivez-nous : nous la traiterons manuellement.',
    };
  }

  // Trace cote plateforme. L'etat de l'abonnement, lui, sera mis a jour par le
  // webhook Stripe : on n'ecrit pas « resilie » a la place de Stripe.
  const service = createServiceClient();
  await service.from('audit_logs').insert({
    actor_id: gate.value.userId,
    actor_email: gate.value.workspace.profile.email,
    actor_type: 'user',
    organization_id: gate.value.workspace.organization.id,
    action: 'subscription.cancel_requested',
    target_type: 'subscription',
    target_id: gate.value.subscriptionId,
    metadata_safe: { reason: parsed.data.reason },
  });

  revalidatePath('/app/abonnement');
  return {
    status: 'success',
    message:
      'Votre demande est prise en compte. Votre site reste en ligne jusqu’à la fin de la période déjà réglée ; vous pouvez revenir en arrière jusque-là.',
  };
}

export async function resumeSubscriptionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const gate = await requireBillingManager(formData.get('subscriptionId'));
  if (!gate.ok) return gate.state;

  try {
    await resumeSubscription(gate.value.stripeSubscriptionId);
  } catch (error) {
    console.error('[stax:subscription] reprise impossible', error);
    return {
      status: 'error',
      message: 'La reprise n’a pas pu être enregistrée. Réessayez dans quelques minutes.',
    };
  }

  const service = createServiceClient();
  await service.from('audit_logs').insert({
    actor_id: gate.value.userId,
    actor_email: gate.value.workspace.profile.email,
    actor_type: 'user',
    organization_id: gate.value.workspace.organization.id,
    action: 'subscription.cancel_reverted',
    target_type: 'subscription',
    target_id: gate.value.subscriptionId,
    metadata_safe: {},
  });

  revalidatePath('/app/abonnement');
  return {
    status: 'success',
    message: 'Votre maintenance continue. La résiliation programmée est annulée.',
  };
}

/**
 * Portail de facturation Stripe.
 *
 * Moyen de paiement, factures et coordonnees de facturation sont geres par
 * Stripe : StaX ne voit jamais un numero de carte, et n'a donc aucune donnee
 * bancaire a proteger.
 */
export async function openBillingPortalAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const context = await getWorkspace();

  if (!context.workspace.capabilities.includes('billing.manage')) {
    return {
      status: 'error',
      message: 'Seul un propriétaire de votre organisation peut gérer le moyen de paiement.',
    };
  }

  const subscription = unwrapMaybe<{ stripe_customer_id: string | null }>(
    (await context.db
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', context.workspace.organization.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .maybeSingle()) as never,
  );

  if (!subscription?.stripe_customer_id) {
    return {
      status: 'error',
      message: 'Aucun dossier de facturation n’est encore ouvert pour votre organisation.',
    };
  }

  let url: string;
  try {
    url = await createBillingPortalSession(subscription.stripe_customer_id, '/app/abonnement');
  } catch (error) {
    console.error('[stax:subscription] portail indisponible', error);
    return {
      status: 'error',
      message: 'Le portail de facturation est momentanément indisponible. Réessayez plus tard.',
    };
  }

  redirect(url);
}
