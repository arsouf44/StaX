import type { UUID } from '@stax/types';
import { appError, err, ok, type Result } from '@stax/types';
import { hmacHex, randomToken, timingSafeEqual } from '@stax/security';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Assistance client : « voir comme ce client ».
 *
 * Conception volontairement conservatrice. StaX n emet PAS de jeton de session
 * au nom du client : le membre de l equipe reste authentifie sous SA propre
 * identite, et l interface lui presente les donnees du client, auxquelles son
 * role plateforme lui donne deja acces en lecture.
 *
 * Consequences directes :
 *  - aucun identifiant client n est emprunte ni fabrique ;
 *  - chaque action reste attribuee a son auteur reel dans le journal d audit ;
 *  - la fin de session est immediate, sans revocation de jeton a propager.
 *
 * Contraintes appliquees : motif obligatoire, duree limitee, banniere visible
 * en permanence, journalisation d ouverture et de fermeture, et interdiction
 * absolue des operations financieres et des secrets de paiement du client.
 */

export const IMPERSONATION_MAX_MINUTES = 60;
export const IMPERSONATION_COOKIE = 'stax_support_view';

/** Operations interdites pendant une session d assistance, sans exception. */
export const IMPERSONATION_FORBIDDEN_ACTIONS = [
  'billing.change_payment_method',
  'billing.view_stripe_secrets',
  'subscription.cancel',
  'subscription.change_plan',
  'refund.request',
  'refund.approve',
  'organization.delete',
  'member.invite',
  'member.role_change',
  'domain.delete',
  'data.export_full',
  'activation_code.create',
  'mfa.disable',
  'password.change',
] as const;

export type ForbiddenImpersonationAction = (typeof IMPERSONATION_FORBIDDEN_ACTIONS)[number];

export function isForbiddenDuringImpersonation(action: string): boolean {
  return (IMPERSONATION_FORBIDDEN_ACTIONS as readonly string[]).includes(action);
}

export interface StartImpersonationInput {
  staffId: UUID;
  organizationId: UUID;
  targetUserId?: UUID | null;
  /** Motif obligatoire : 10 caracteres minimum, conserve dans le journal. */
  reason: string;
  ticketId?: UUID | null;
  durationMinutes?: number;
}

export interface ImpersonationSession {
  id: UUID;
  token: string;
  organizationId: UUID;
  expiresAt: string;
  reason: string;
}

export async function startImpersonation(
  db: SupabaseClient,
  input: StartImpersonationInput,
): Promise<Result<ImpersonationSession>> {
  const reason = input.reason.trim();
  if (reason.length < 10) {
    return err(
      appError(
        'validation',
        'Indiquez un motif précis (10 caractères minimum) avant de continuer.',
      ),
    );
  }

  const minutes = Math.min(Math.max(input.durationMinutes ?? 30, 5), IMPERSONATION_MAX_MINUTES);
  const token = randomToken(32);
  const tokenHash = await hmacHex(token, 'impersonation');
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();

  const { data, error } = await db
    .from('impersonation_sessions')
    .insert({
      staff_id: input.staffId,
      target_user_id: input.targetUserId ?? null,
      organization_id: input.organizationId,
      reason,
      ticket_id: input.ticketId ?? null,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single();

  if (error || !data) {
    return err(
      appError('internal', 'Impossible d ouvrir la session d assistance.', { cause: error }),
    );
  }

  await db.rpc('write_audit', {
    p_action: 'client.impersonation_started',
    p_org: input.organizationId,
    p_site: null,
    p_target_type: 'organization',
    p_target_id: input.organizationId,
    p_metadata: { reason, duration_minutes: minutes },
  });

  return ok({
    id: data.id as UUID,
    token,
    organizationId: input.organizationId,
    expiresAt: data.expires_at as string,
    reason,
  });
}

export interface ActiveImpersonation {
  id: UUID;
  organizationId: UUID;
  reason: string;
  expiresAt: string;
  staffId: UUID;
}

export async function verifyImpersonation(
  db: SupabaseClient,
  token: string | null,
  staffId: UUID,
): Promise<ActiveImpersonation | null> {
  if (!token) return null;
  const tokenHash = await hmacHex(token, 'impersonation');

  const { data, error } = await db
    .from('impersonation_sessions')
    .select('id, organization_id, reason, expires_at, staff_id, token_hash, ended_at')
    .eq('staff_id', staffId)
    .is('ended_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .limit(5);

  if (error || !data) return null;

  const match = data.find((row) => timingSafeEqual(row.token_hash as string, tokenHash));
  if (!match) return null;

  return {
    id: match.id as UUID,
    organizationId: match.organization_id as UUID,
    reason: match.reason as string,
    expiresAt: match.expires_at as string,
    staffId: match.staff_id as UUID,
  };
}

export async function endImpersonation(
  db: SupabaseClient,
  sessionId: UUID,
  reason: 'manual' | 'expired' | 'forced' = 'manual',
): Promise<void> {
  const { data } = await db
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString(), ended_reason: reason })
    .eq('id', sessionId)
    .is('ended_at', null)
    .select('organization_id')
    .maybeSingle();

  if (data) {
    await db.rpc('write_audit', {
      p_action: 'client.impersonation_ended',
      p_org: data.organization_id,
      p_site: null,
      p_target_type: 'impersonation_session',
      p_target_id: sessionId,
      p_metadata: { reason },
    });
  }
}
