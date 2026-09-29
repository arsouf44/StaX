'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  endOfContractDeletionDate,
  maintenancePolicyConfig,
  type EndOfContractChoice,
} from '@nemasus/config';
import { tryCreateServiceClient, unwrapMaybe } from '@nemasus/database';
import { sendEmail, subscriptionCancelledEmail } from '@nemasus/emails';
import {
  cancelSubscriptionAtPeriodEnd,
  createBillingPortalSession,
  resumeSubscription,
} from '@nemasus/payments';
import { cancelSubscriptionSchema } from '@nemasus/validation';
import { absolutePlatformUrl, guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace, type WorkspaceContext } from '~/lib/workspace';

/**
 * Cycle de vie de l'abonnement de maintenance.
 *
 * La regle qui gouverne cet ecran : Nemasus ne DECLARE jamais l'etat d'un
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
    reason: formData.get('reason') ?? undefined,
    comment: formData.get('comment') || undefined,
    dataFate: formData.get('dataFate') ?? undefined,
    confirm: formData.get('confirm') === 'on',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Cochez la case de confirmation pour résilier.',
    };
  }

  const gate = await requireBillingManager(parsed.data.subscriptionId);
  if (!gate.ok) return gate.state;

  const label = parsed.data.reason
    ? (REASON_LABELS[parsed.data.reason] ?? parsed.data.reason)
    : 'Non précisée';

  try {
    await cancelSubscriptionAtPeriodEnd(
      gate.value.stripeSubscriptionId,
      `${label}${parsed.data.comment ? ` — ${parsed.data.comment}` : ''}`,
    );
  } catch (error) {
    console.error('[nemasus:subscription] resiliation impossible', error);
    return {
      status: 'error',
      message:
        'Votre demande n’a pas pu être transmise. Réessayez dans quelques minutes, ou écrivez-nous : nous la traiterons manuellement.',
    };
  }

  // Trace cote plateforme. L'etat de l'abonnement, lui, sera mis a jour par le
  // webhook Stripe : on n'ecrit pas « resilie » a la place de Stripe.
  // Sans cle de service, l'action reste faite ; seule la trace manque, et
  // `tryCreateServiceClient` l'a journalise.
  await tryCreateServiceClient()
    ?.from('audit_logs')
    .insert({
      actor_id: gate.value.userId,
      actor_email: gate.value.workspace.profile.email,
      actor_type: 'user',
      organization_id: gate.value.workspace.organization.id,
      action: 'subscription.cancel_requested',
      target_type: 'subscription',
      target_id: gate.value.subscriptionId,
      metadata_safe: { reason: parsed.data.reason ?? null },
    });

  // Instruction du Client sur le sort de ses donnees (RGPD art. 28 § 3 g),
  // enregistree comme une demande a traiter a date fixe dans « Demandes
  // RGPD » : la suppression promise par les CGV et l'accord de traitement a
  // une echeance visible, et n'attend pas qu'on s'en souvienne.
  const deletionDate = await recordEndOfContractInstruction(gate.value, parsed.data.dataFate);

  // Confirmation sur support durable (article L215-1-1 du Code de la
  // consommation) : la date de fin et ses effets, par e-mail.
  const confirmation = await sendCancellationConfirmation(
    gate.value,
    parsed.data.dataFate,
    deletionDate,
  );

  revalidatePath('/app/abonnement');
  return {
    status: 'success',
    message:
      'Votre résiliation est enregistrée. Votre site reste en ligne jusqu’à la fin de la période déjà réglée ; vous pouvez revenir en arrière jusque-là.' +
      (confirmation ? ' Une confirmation vous a été envoyée par e-mail.' : ''),
  };
}

const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

/** Marque des demandes creees par une resiliation, pour les retrouver a la reprise. */
const END_OF_CONTRACT_MARK = '[fin de contrat]';

const DATA_FATE_LABELS: Record<EndOfContractChoice, string> = {
  restitution: 'restitution puis suppression',
  suppression: 'suppression',
};

async function periodEnd(subscriptionId: string): Promise<Date | null> {
  const service = tryCreateServiceClient();
  if (!service) return null;
  const subscription = unwrapMaybe<{ current_period_end: string | null }>(
    (await service
      .from('subscriptions')
      .select('current_period_end')
      .eq('id', subscriptionId)
      .maybeSingle()) as never,
  );
  return subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
}

/**
 * Enregistre la demande de suppression a echeance : fin de la periode payee,
 * plus la periode de continuite, plus le delai d'export si le Client a choisi
 * la restitution. Une resiliation repetee remplace la demande precedente.
 */
async function recordEndOfContractInstruction(
  context: WorkspaceContext & { subscriptionId: string; userId: string },
  choice: EndOfContractChoice,
): Promise<Date | null> {
  const service = tryCreateServiceClient();
  if (!service) return null;
  const end = (await periodEnd(context.subscriptionId)) ?? new Date();
  const deletion = endOfContractDeletionDate(end, choice);
  const organizationId = context.workspace.organization.id;

  try {
    await service
      .from('privacy_requests')
      .update({
        status: 'refused',
        response_note: 'Remplacée par une nouvelle instruction du client.',
        completed_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .eq('kind', 'deletion')
      .in('status', ['received', 'verifying'])
      .like('details', `${END_OF_CONTRACT_MARK}%`);

    const { error } = await service.from('privacy_requests').insert({
      reference: `FIN-${deletion.toISOString().slice(0, 10).replaceAll('-', '')}-${crypto
        .randomUUID()
        .slice(0, 6)
        .toUpperCase()}`,
      requester_id: context.userId,
      requester_email: context.workspace.profile.email,
      organization_id: organizationId,
      kind: 'deletion',
      status: 'received',
      // L'identite est celle du titulaire connecte qui a resilie.
      identity_verified_at: new Date().toISOString(),
      due_at: deletion.toISOString(),
      details:
        `${END_OF_CONTRACT_MARK} Résiliation de la maintenance. Choix du client : ` +
        `${DATA_FATE_LABELS[choice]}. Supprimer toutes les données de l’organisation ` +
        `(site, médias, messages, contacts, réservations, commandes, comptes clients) le ` +
        `${LONG_DATE.format(deletion)} ; conserver uniquement factures et données ` +
        'd’identification légales du titulaire.',
    });
    if (error) throw error;
  } catch (error) {
    console.error('[nemasus:subscription] instruction de fin de contrat non enregistree', error);
  }
  return deletion;
}

async function sendCancellationConfirmation(
  context: WorkspaceContext & { subscriptionId: string },
  choice: EndOfContractChoice,
  deletionDate: Date | null,
): Promise<boolean> {
  const service = tryCreateServiceClient();
  if (!service) return false;
  const end = await periodEnd(context.subscriptionId);
  if (!end) return false;

  const grace = new Date(end.getTime() + maintenancePolicyConfig().gracePeriodDays * 86_400_000);
  try {
    const result = await sendEmail(
      subscriptionCancelledEmail({
        to: context.workspace.profile.email,
        firstName: context.workspace.profile.first_name ?? null,
        endDate: LONG_DATE.format(end),
        gracePeriodEnd: LONG_DATE.format(grace),
        billingUrl: absolutePlatformUrl('/app/abonnement'),
        dataFate: choice,
        deletionDate: LONG_DATE.format(deletionDate ?? endOfContractDeletionDate(end, choice)),
      }),
      { db: service, organizationId: context.workspace.organization.id },
    );
    return result.ok;
  } catch (error) {
    console.error('[nemasus:subscription] confirmation de resiliation non envoyee', error);
    return false;
  }
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
    console.error('[nemasus:subscription] reprise impossible', error);
    return {
      status: 'error',
      message: 'La reprise n’a pas pu être enregistrée. Réessayez dans quelques minutes.',
    };
  }

  // Sans cle de service, l'action reste faite ; seule la trace manque, et
  // `tryCreateServiceClient` l'a journalise.
  const service = tryCreateServiceClient();
  // La maintenance continue : la suppression programmee a la resiliation n'a
  // plus d'objet.
  await service
    ?.from('privacy_requests')
    .update({
      status: 'refused',
      response_note: 'Résiliation annulée par le client : aucune suppression.',
      completed_at: new Date().toISOString(),
    })
    .eq('organization_id', gate.value.workspace.organization.id)
    .eq('kind', 'deletion')
    .in('status', ['received', 'verifying'])
    .like('details', `${END_OF_CONTRACT_MARK}%`);
  await service?.from('audit_logs').insert({
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
 * Stripe : Nemasus ne voit jamais un numero de carte, et n'a donc aucune donnee
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
    console.error('[nemasus:subscription] portail indisponible', error);
    return {
      status: 'error',
      message: 'Le portail de facturation est momentanément indisponible. Réessayez plus tard.',
    };
  }

  redirect(url);
}
