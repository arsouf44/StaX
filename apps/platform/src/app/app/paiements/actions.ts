'use server';

import { redirect } from 'next/navigation';
import { createServiceClient, unwrapMaybe } from '@stax/database';
import { createConnectedAccount, createLoginLink, createOnboardingLink } from '@stax/payments';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace } from '~/lib/workspace';

/**
 * Activation de l'encaissement sur le site d'un client.
 *
 * Un compte Stripe connecte est cree AU NOM de l'organisation, jamais au nom de
 * StaX : l'argent va directement sur le compte bancaire du professionnel, sans
 * transiter par nous.
 *
 * L'ecriture dans `connected_accounts` utilise la cle de service, parce que la
 * RLS reserve cette table a la plateforme : un client ne doit pas pouvoir
 * declarer lui-meme que son compte est actif. La capacite est donc verifiee
 * ICI, avant, et l'organisation vient de la session — jamais du formulaire.
 *
 * Aucune donnee KYC (piece d'identite, IBAN, chiffre d'affaires) ne transite
 * par StaX : elle est saisie sur les pages hebergees par Stripe.
 */

async function requireBillingManager() {
  const context = await getWorkspace();
  if (!context.workspace.capabilities.includes('payments.connect')) {
    return null;
  }
  return context;
}

export async function startConnectOnboardingAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const context = await requireBillingManager();
  if (!context) {
    return {
      status: 'error',
      message: 'Seul un propriétaire de votre organisation peut activer l’encaissement en ligne.',
    };
  }

  const guard = await guardAction({ limit: 'apiWrite', userId: context.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const organizationId = context.workspace.organization.id;
  const service = createServiceClient();

  const existing = unwrapMaybe<{ stripe_account_id: string }>(
    (await service
      .from('connected_accounts')
      .select('stripe_account_id')
      .eq('organization_id', organizationId)
      .maybeSingle()) as never,
  );

  let stripeAccountId = existing?.stripe_account_id ?? null;
  let link: string;

  try {
    if (!stripeAccountId) {
      stripeAccountId = await createConnectedAccount({
        organizationId,
        email: context.workspace.profile.email,
        businessName: context.workspace.organization.name,
      });

      const { error } = await service.from('connected_accounts').insert({
        organization_id: organizationId,
        stripe_account_id: stripeAccountId,
        status: 'onboarding',
        onboarding_started_at: new Date().toISOString(),
      });

      if (error) {
        console.error('[stax:connect] compte cree chez Stripe mais non enregistre', error.message);
        return {
          status: 'error',
          message:
            'Votre compte a été créé chez Stripe mais nous n’avons pas pu l’enregistrer. Contactez-nous avant de réessayer.',
        };
      }
    }

    link = await createOnboardingLink(stripeAccountId);
  } catch (error) {
    console.error('[stax:connect] onboarding indisponible', error);
    return {
      status: 'error',
      message:
        'Le service de paiement est momentanément indisponible. Réessayez dans quelques minutes.',
    };
  }

  // Redirection vers une page hebergee par Stripe : le lien est a usage unique
  // et de courte duree, il n'est donc jamais mis en cache ni stocke.
  redirect(link);
}

export async function openStripeDashboardAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const context = await requireBillingManager();
  if (!context) {
    return { status: 'error', message: 'Votre rôle ne donne pas accès à ce tableau de bord.' };
  }

  const service = createServiceClient();
  const account = unwrapMaybe<{ stripe_account_id: string }>(
    (await service
      .from('connected_accounts')
      .select('stripe_account_id')
      .eq('organization_id', context.workspace.organization.id)
      .maybeSingle()) as never,
  );

  if (!account) {
    return { status: 'error', message: 'Aucun compte de paiement n’est encore configuré.' };
  }

  let link: string;
  try {
    link = await createLoginLink(account.stripe_account_id);
  } catch (error) {
    console.error('[stax:connect] lien de connexion indisponible', error);
    return {
      status: 'error',
      message: 'Stripe est momentanément injoignable. Réessayez dans quelques minutes.',
    };
  }

  redirect(link);
}
