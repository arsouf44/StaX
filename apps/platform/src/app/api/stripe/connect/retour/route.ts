import { NextResponse } from 'next/server';
import { platformUrl } from '@stax/config';
import { createServiceClient, unwrapMaybe } from '@stax/database';
import { completeConnectOAuth, retrieveAccount } from '@stax/payments';
import { verifyConnectState } from '~/lib/stripe-connect-state';
import { getWorkspace } from '~/lib/workspace';

/**
 * Retour de Stripe apres « relier mon compte existant ».
 *
 * Trois verrous avant d'enregistrer quoi que ce soit :
 *  1. l'etat est signe par StaX, recent, et designe une organisation ;
 *  2. la personne connectee est celle qui a lance la liaison ;
 *  3. elle a toujours le droit de gerer l'encaissement de cette organisation.
 *
 * Un compte deja actif n'est jamais remplace silencieusement : il faut d'abord
 * le deconnecter depuis Stripe.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function back(outcome: string): NextResponse {
  return NextResponse.redirect(`${platformUrl()}/app/paiements?stripe=${outcome}`, 303);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.searchParams.get('error')) return back('annule');

  const state = await verifyConnectState(url.searchParams.get('state'));
  const code = url.searchParams.get('code');
  if (!state || !code) return back('lien-invalide');

  const { workspace, userId } = await getWorkspace();
  if (
    userId !== state.userId ||
    workspace.organization.id !== state.organizationId ||
    !workspace.capabilities.includes('payments.connect')
  ) {
    return back('lien-invalide');
  }

  const service = createServiceClient();
  const existing = unwrapMaybe<{ stripe_account_id: string; status: string }>(
    (await service
      .from('connected_accounts')
      .select('stripe_account_id, status')
      .eq('organization_id', state.organizationId)
      .maybeSingle()) as never,
  );

  let accountId: string;
  try {
    accountId = await completeConnectOAuth(code);
  } catch (error) {
    console.error('[stax:connect] liaison refusee par Stripe', error);
    return back('echec');
  }

  if (existing && existing.status === 'active' && existing.stripe_account_id !== accountId) {
    return back('deja-relie');
  }

  const snapshot = await retrieveAccount(accountId).catch(() => null);
  const row = {
    organization_id: state.organizationId,
    stripe_account_id: accountId,
    status: snapshot?.status ?? 'pending_verification',
    charges_enabled: snapshot?.chargesEnabled ?? false,
    payouts_enabled: snapshot?.payoutsEnabled ?? false,
    details_submitted: snapshot?.detailsSubmitted ?? false,
    requirements_due: snapshot?.requirementsDue ?? [],
    disabled_reason: snapshot?.disabledReason ?? null,
    onboarding_started_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
  };
  const { error } = await service
    .from('connected_accounts')
    .upsert(row, { onConflict: 'organization_id' });
  if (error) {
    console.error('[stax:connect] compte relie mais non enregistre', error.message);
    return back('echec');
  }

  await service.rpc('write_audit', {
    p_action: 'payments.stripe_account_linked',
    p_org: state.organizationId,
    p_site: null,
    p_target_type: 'connected_account',
    p_target_id: accountId,
    p_metadata: { method: 'oauth' },
  });

  return back('relie');
}
