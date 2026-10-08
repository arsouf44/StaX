import 'server-only';
import { createSessionClient, type CookieAdapter } from '@nemasus/auth';
import { tryCreateServiceClient } from '@nemasus/database';
import { TERMS_OF_USE_VERSION } from '~/content/legal';
import { hashAccessCode } from './site-orders';

/**
 * Connexion par code d'accès personnel.
 *
 * Tout se passe ici, sur le serveur, avec la clé de service — jamais dans le
 * navigateur, qui n'envoie que le code saisi :
 *
 *  1. l'empreinte HMAC du code est vérifiée en base (`check_access_code`) :
 *     inconnu, expiré, désactivé, déjà utilisé, trop de tentatives ;
 *  2. le compte lié à l'adresse de la commande est retrouvé — ou créé,
 *     adresse confirmée : le code a été envoyé à cette adresse, le détenir
 *     prouve qu'on la lit ;
 *  3. la session de CE compte est ouverte (lien de connexion généré puis
 *     vérifié côté serveur : rien ne transite par une boîte e-mail) ;
 *  4. le code est consommé (`redeem_activation_code`) : le compte devient
 *     propriétaire de l'organisation du client, dans la même transaction.
 *
 * L'ordre compte : la session est ouverte AVANT de consommer le code, pour
 * qu'une panne du service d'authentification ne « brûle » jamais un code
 * valide. Si la consommation échoue ensuite (code utilisé entre-temps), la
 * session est refermée.
 *
 * Le client n'accède ensuite qu'à SES ressources : l'espace client lit tout
 * avec le jeton de la personne, sous RLS ; aucun identifiant envoyé par le
 * navigateur ne peut désigner l'organisation d'un autre client.
 */

export type AccessFailure =
  | 'invalid'
  | 'expired'
  | 'revoked'
  | 'already_used'
  | 'too_many_attempts'
  | 'account_unavailable'
  | 'unavailable';

export type AccessResult =
  | {
      ok: true;
      organizationId: string;
      siteId: string | null;
      /** Le compte n'a pas encore de mot de passe : on le lui fait choisir. */
      needsPassword: boolean;
      /** Un second facteur est enrôlé : il reste à le valider. */
      needsMfa: boolean;
    }
  | { ok: false; reason: AccessFailure };

export const ACCESS_MESSAGES: Record<AccessFailure, string> = {
  invalid:
    'Ce code n’est pas reconnu. Vérifiez-le dans l’e-mail reçu : 12 caractères, par exemple 7K2M-9QXP-4HTA.',
  expired: 'Ce code a expiré. Écrivez-nous : nous vous en envoyons un nouveau immédiatement.',
  revoked: 'Ce code a été désactivé. Si vous pensez qu’il s’agit d’une erreur, écrivez-nous.',
  already_used:
    'Ce code a déjà servi. Connectez-vous avec votre adresse e-mail et votre mot de passe, ou utilisez « Mot de passe oublié ».',
  too_many_attempts:
    'Ce code a fait l’objet de trop de tentatives et a été bloqué par sécurité. Écrivez-nous pour en recevoir un nouveau.',
  account_unavailable:
    'Ce code ne peut pas ouvrir ce compte. Écrivez-nous : nous vérifions la situation avec vous.',
  unavailable:
    'La vérification n’a pas pu aboutir. Votre code reste valable : réessayez dans quelques instants.',
};

const KNOWN_REASONS = new Set<AccessFailure>([
  'invalid',
  'expired',
  'revoked',
  'already_used',
  'too_many_attempts',
  'account_unavailable',
]);

function asFailure(reason: string | undefined): AccessFailure {
  if (reason === 'needs_account') return 'invalid';
  return reason && KNOWN_REASONS.has(reason as AccessFailure)
    ? (reason as AccessFailure)
    : 'invalid';
}

interface CheckedCode {
  ok: boolean;
  reason?: string;
  email?: string;
  userId?: string | null;
  organizationId?: string;
  siteId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}

export async function signInWithAccessCode(
  code: string,
  cookies: CookieAdapter,
): Promise<AccessResult> {
  const service = tryCreateServiceClient();
  if (service === null) return { ok: false, reason: 'unavailable' };

  const codeHash = await hashAccessCode(code);

  // 1. Le code, vérifié en base. La tentative est comptée.
  const { data: checkData, error: checkError } = await service.rpc('check_access_code', {
    p_code_hash: codeHash,
  });
  if (checkError) {
    console.error('[nemasus:access] verification', checkError.code, checkError.message);
    return { ok: false, reason: 'unavailable' };
  }
  const checked = (checkData ?? { ok: false }) as CheckedCode;
  if (!checked.ok || !checked.email || !checked.organizationId) {
    return { ok: false, reason: asFailure(checked.reason) };
  }
  const email = checked.email;

  // 2. Le compte de cette adresse, ou un compte neuf, adresse confirmée.
  let userId = checked.userId ?? null;
  let createdNow = false;
  let needsPassword = false;
  if (!userId) {
    const { data: created, error: createError } = await service.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name: checked.firstName ?? undefined,
        last_name: checked.lastName ?? undefined,
        phone: checked.phone ?? undefined,
        locale: 'fr',
        needs_password: true,
        terms_of_use_version: TERMS_OF_USE_VERSION,
        terms_accepted_at: new Date().toISOString(),
      },
    });
    if (createError || !created.user) {
      console.error('[nemasus:access] creation du compte', createError?.message);
      return { ok: false, reason: 'unavailable' };
    }
    userId = created.user.id;
    createdNow = true;
    needsPassword = true;
  } else {
    const { data: existing } = await service.auth.admin.getUserById(userId);
    needsPassword = existing.user?.user_metadata?.['needs_password'] === true;
  }

  // 3. La session de CE compte, ouverte côté serveur.
  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('[nemasus:access] lien de connexion', linkError?.message);
    if (createdNow) await service.auth.admin.deleteUser(userId);
    return { ok: false, reason: 'unavailable' };
  }

  const session = createSessionClient(cookies);
  const { data: verified, error: verifyError } = await session.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });
  if (verifyError || !verified.user || verified.user.id !== userId) {
    console.error('[nemasus:access] ouverture de session', verifyError?.message);
    if (verified?.user) await session.auth.signOut({ scope: 'local' });
    if (createdNow) await service.auth.admin.deleteUser(userId);
    return { ok: false, reason: 'unavailable' };
  }

  // 4. Le code est consommé ; le compte rejoint l'organisation du client.
  const { data: redeemed, error: redeemError } = await service.rpc('redeem_activation_code', {
    p_code_hash: codeHash,
    p_user_id: userId,
    p_email: email,
  });
  const outcome = (redeemed ?? null) as {
    ok?: boolean;
    reason?: string;
    organization_id?: string | null;
    site_id?: string | null;
  } | null;
  if (redeemError || !outcome?.ok || !outcome.organization_id) {
    await session.auth.signOut({ scope: 'local' });
    if (createdNow) await service.auth.admin.deleteUser(userId);
    if (redeemError) {
      console.error('[nemasus:access] consommation', redeemError.code, redeemError.message);
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: false, reason: asFailure(outcome?.reason) };
  }

  const { data: factors } = await session.auth.mfa.listFactors();
  const needsMfa = (factors?.totp ?? []).some((factor) => factor.status === 'verified');

  return {
    ok: true,
    organizationId: outcome.organization_id,
    siteId: outcome.site_id ?? checked.siteId ?? null,
    needsPassword,
    needsMfa,
  };
}
