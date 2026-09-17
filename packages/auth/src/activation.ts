import type { OrgRole, UUID } from '@stax/types';
import { appError, err, ok, type Result } from '@stax/types';
import {
  activationCodeHint,
  generateActivationCode,
  hashActivationCode,
  normalizeActivationCode,
} from '@stax/security';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Codes d activation a usage unique.
 *
 * Usage : StaX construit un site pour un client, puis lui transmet un code qui
 * lui donne la propriete de son espace. Le code en clair n existe QU UNE FOIS,
 * a l ecran, au moment de sa creation. La base ne stocke que son HMAC.
 */

export interface IssueActivationCodeInput {
  organizationId: UUID;
  siteId?: UUID | null;
  /** Lie le code a une adresse precise. Fortement recommande. */
  emailConstraint?: string | null;
  grantedRole?: Extract<OrgRole, 'owner' | 'admin' | 'editor'>;
  expiresInDays?: number;
}

export interface IssuedActivationCode {
  id: UUID;
  /** Affiche une seule fois. Jamais relisible, jamais journalise. */
  code: string;
  hint: string;
  expiresAt: string;
}

export const ACTIVATION_CODE_DEFAULT_TTL_DAYS = 30;

export async function issueActivationCode(
  db: SupabaseClient,
  input: IssueActivationCodeInput,
): Promise<Result<IssuedActivationCode>> {
  const code = generateActivationCode();
  const codeHash = await hashActivationCode(code);
  const ttlDays = Math.min(
    Math.max(input.expiresInDays ?? ACTIVATION_CODE_DEFAULT_TTL_DAYS, 1),
    180,
  );
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000).toISOString();

  const { data, error } = await db
    .from('activation_codes')
    .insert({
      organization_id: input.organizationId,
      site_id: input.siteId ?? null,
      code_hash: codeHash,
      code_hint: activationCodeHint(code),
      granted_role: input.grantedRole ?? 'owner',
      email_constraint: input.emailConstraint?.trim().toLowerCase() || null,
      expires_at: expiresAt,
    })
    .select('id, code_hint, expires_at')
    .single();

  if (error || !data) {
    return err(
      appError('internal', 'Impossible de générer le code d activation.', { cause: error }),
    );
  }

  return ok({
    id: data.id as UUID,
    code,
    hint: data.code_hint as string,
    expiresAt: data.expires_at as string,
  });
}

export type ActivationFailureReason =
  'invalid' | 'expired' | 'revoked' | 'already_used' | 'email_mismatch' | 'too_many_attempts';

export interface ActivationSuccess {
  organizationId: UUID;
  siteId: UUID | null;
  grantedRole: OrgRole;
}

/**
 * Messages destines au client.
 *
 * `invalid`, `expired`, `revoked` et `already_used` partagent volontairement
 * une formulation proche : un attaquant qui teste des codes au hasard ne doit
 * pas apprendre lesquels ont existe.
 */
export const ACTIVATION_MESSAGES: Record<ActivationFailureReason, string> = {
  invalid: 'Ce code n est pas validé. Vérifiez la saisie ou contactez-nous.',
  expired: 'Ce code n est plus validé. Contactez-nous pour en recevoir un nouveau.',
  revoked: 'Ce code n est plus validé. Contactez-nous pour en recevoir un nouveau.',
  already_used: 'Ce code a déjà ete utilise. Connectez-vous avec votre compte existant.',
  email_mismatch:
    'Ce code est réservé a une autre adresse e-mail. Utilisez celle a laquelle il vous a ete envoyé.',
  too_many_attempts:
    'Trop de tentatives sur ce code. Patientez ou contactez-nous pour en recevoir un nouveau.',
};

/**
 * Consomme un code. La transaction atomique se trouve en base
 * (app.redeem_activation_code) : verification, creation de l appartenance et
 * marquage du code ne peuvent pas se desynchroniser.
 *
 * Appelee avec le client de SERVICE : l utilisateur n a pas encore de droits
 * sur l organisation qu il s apprete a rejoindre.
 */
export async function redeemActivationCode(
  serviceDb: SupabaseClient,
  params: { code: string; userId: UUID; email: string },
): Promise<Result<ActivationSuccess>> {
  const codeHash = await hashActivationCode(params.code);

  const { data, error } = await serviceDb.rpc('redeem_activation_code', {
    p_code_hash: codeHash,
    p_user_id: params.userId,
    p_email: params.email.trim().toLowerCase(),
  });

  if (error) {
    return err(
      appError('internal', 'Impossible de valider ce code pour le moment.', { cause: error }),
    );
  }

  const result = data as {
    ok: boolean;
    reason: ActivationFailureReason;
    organization_id: UUID | null;
    site_id: UUID | null;
    granted_role: OrgRole | null;
  } | null;

  if (!result || !result.ok) {
    const reason = result?.reason ?? 'invalid';
    return err(appError('forbidden', ACTIVATION_MESSAGES[reason] ?? ACTIVATION_MESSAGES.invalid));
  }

  return ok({
    organizationId: result.organization_id as UUID,
    siteId: result.site_id,
    grantedRole: (result.granted_role ?? 'owner') as OrgRole,
  });
}

export async function revokeActivationCode(
  db: SupabaseClient,
  codeId: UUID,
  revokedBy: UUID,
): Promise<Result<true>> {
  const { error } = await db
    .from('activation_codes')
    .update({ revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq('id', codeId)
    .is('used_at', null);

  if (error) return err(appError('internal', 'Révocation impossible.', { cause: error }));
  return ok(true);
}

/** Format d affichage du code, pret a etre copie ou dicte. */
export function formatActivationCode(code: string): string {
  return normalizeActivationCode(code);
}
