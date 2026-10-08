import 'server-only';
import { createSessionClient } from '@nemasus/auth';
import { tryCreateServiceClient } from '@nemasus/database';
import { passwordResetEmail, sendEmail } from '@nemasus/emails';
import { hmacHex, randomToken } from '@nemasus/security';
import { absolutePlatformUrl } from './action-guard';

/**
 * Mot de passe oublié, de bout en bout côté serveur, e-mail envoyé par Resend.
 *
 *  1. Un jeton aléatoire de 256 bits est tiré ; la base n'en garde que
 *     l'empreinte HMAC, avec une durée de vie d'une heure (`create_password_reset`).
 *     Un seul lien est valable à la fois : le dernier envoyé.
 *  2. Le lien mène à une page qui AFFICHE le formulaire sans rien consommer :
 *     un antivirus de messagerie qui visite le lien ne le brûle pas.
 *  3. À l'envoi du formulaire, le jeton est consommé, le mot de passe est
 *     changé par le service d'authentification, puis TOUTES les sessions du
 *     compte sont fermées : un intrus éventuel perd l'accès sur-le-champ.
 *
 * Aucune réponse ne révèle si une adresse a un compte : c'est l'appelant qui
 * affiche toujours le même message.
 */

export const PASSWORD_RESET_VALID_MINUTES = 60;

async function tokenHash(token: string): Promise<string> {
  return hmacHex(token, 'password-reset');
}

/** Envoie le lien si un compte existe. Ne dit jamais s'il en existe un. */
export async function requestPasswordReset(email: string, ipHash: string | null): Promise<void> {
  const service = tryCreateServiceClient();
  if (service === null) {
    console.error('[nemasus:password-reset] cle de service absente : aucun lien envoye');
    return;
  }

  const token = randomToken(32);
  const { data, error } = await service.rpc('create_password_reset', {
    p_email: email.trim().toLowerCase(),
    p_token_hash: await tokenHash(token),
    p_ip_hash: ipHash,
    p_valid_minutes: PASSWORD_RESET_VALID_MINUTES,
  });
  if (error) {
    console.error('[nemasus:password-reset] enregistrement', error.code, error.message);
    return;
  }
  const result = (data ?? {}) as { ok?: boolean; email?: string; firstName?: string | null };
  if (!result.ok || !result.email) return;

  const sent = await sendEmail(
    passwordResetEmail({
      to: result.email,
      firstName: result.firstName ?? null,
      resetUrl: absolutePlatformUrl(`/nouveau-mot-de-passe?jeton=${encodeURIComponent(token)}`),
      validForMinutes: PASSWORD_RESET_VALID_MINUTES,
    }),
    { db: service },
  ).catch((sendError: unknown) => ({
    ok: false,
    error: sendError instanceof Error ? sendError.message : 'envoi impossible',
  }));
  if (!sent.ok) console.error('[nemasus:password-reset] e-mail', sent.error);
}

export type ResetLinkState = 'ok' | 'invalid' | 'expired' | 'used' | 'replaced' | 'unavailable';

/** État d'un lien, sans le consommer : pour afficher le bon écran. */
export async function inspectPasswordReset(token: string): Promise<ResetLinkState> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return 'invalid';
  const service = tryCreateServiceClient();
  if (service === null) return 'unavailable';
  const { data, error } = await service.rpc('peek_password_reset', {
    p_token_hash: await tokenHash(token),
  });
  if (error) return 'unavailable';
  const reason = ((data ?? {}) as { reason?: string }).reason;
  return reason === 'ok' || reason === 'expired' || reason === 'used' || reason === 'replaced'
    ? reason
    : 'invalid';
}

export type ResetOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: 'invalid' | 'expired' | 'used' | 'weak_password' | 'unavailable';
    };

/** Session jetable, tenue en mémoire : elle ne touche jamais aux cookies du navigateur. */
function memorySession() {
  const jar = new Map<string, string>();
  return createSessionClient({
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (list) => {
      for (const cookie of list) jar.set(cookie.name, cookie.value);
    },
  });
}

export async function resetPassword(token: string, password: string): Promise<ResetOutcome> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return { ok: false, reason: 'invalid' };
  const service = tryCreateServiceClient();
  if (service === null) return { ok: false, reason: 'unavailable' };

  const { data, error } = await service.rpc('consume_password_reset', {
    p_token_hash: await tokenHash(token),
  });
  if (error) {
    console.error('[nemasus:password-reset] consommation', error.code, error.message);
    return { ok: false, reason: 'unavailable' };
  }
  const consumed = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    userId?: string;
    email?: string;
    tokenId?: string;
  };
  if (!consumed.ok || !consumed.userId || !consumed.email || !consumed.tokenId) {
    const reason = consumed.reason;
    return {
      ok: false,
      reason: reason === 'expired' ? 'expired' : reason === 'used' ? 'used' : 'invalid',
    };
  }

  const release = async () => {
    await service.rpc('release_password_reset', { p_token: consumed.tokenId });
  };

  // Une session du compte, ouverte côté serveur et jamais confiée au
  // navigateur : elle sert à changer le mot de passe par l'API standard (qui
  // applique la politique de mots de passe du projet), puis à fermer toutes
  // les sessions du compte.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: consumed.email,
  });
  const hashed = link?.properties?.hashed_token;
  if (linkError || !hashed) {
    console.error('[nemasus:password-reset] session', linkError?.message);
    await release();
    return { ok: false, reason: 'unavailable' };
  }

  const client = memorySession();
  const { data: verified, error: verifyError } = await client.auth.verifyOtp({
    type: 'magiclink',
    token_hash: hashed,
  });
  if (verifyError || verified.user?.id !== consumed.userId) {
    console.error('[nemasus:password-reset] verification', verifyError?.message);
    await release();
    return { ok: false, reason: 'unavailable' };
  }

  const { error: updateError } = await client.auth.updateUser({
    password,
    data: { needs_password: false },
  });
  if (updateError) {
    await client.auth.signOut({ scope: 'local' });
    await release();
    if (updateError.code === 'weak_password' || updateError.code === 'same_password') {
      return { ok: false, reason: 'weak_password' };
    }
    console.error('[nemasus:password-reset] mise a jour', updateError.message);
    return { ok: false, reason: 'unavailable' };
  }

  // Toutes les sessions du compte, celle-ci comprise.
  await client.auth.signOut({ scope: 'global' });
  await service.rpc('complete_password_reset', { p_user: consumed.userId });
  return { ok: true };
}
