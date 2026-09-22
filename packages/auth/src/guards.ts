import type { OrgCapability, PlatformRole, Profile, UUID } from '@stax/types';
import { appError, type AppError } from '@stax/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Garde-fous d autorisation.
 *
 * Chaque garde interroge la BASE, jamais un etat cote client. Une interface
 * masquee n est pas une protection : ces fonctions sont appelees a l entree
 * de chaque page et de chaque action serveur, en plus de la RLS.
 */

export class AuthorizationError extends Error {
  constructor(readonly appError: AppError) {
    super(appError.message);
    this.name = 'AuthorizationError';
  }
}

export interface AuthContext {
  userId: UUID;
  email: string;
  profile: Profile;
  client: SupabaseClient;
}

export function requireAuthenticated(context: {
  user: { id: UUID; email: string } | null;
  profile: Profile | null;
  client: SupabaseClient;
}): AuthContext {
  if (!context.user || !context.profile) {
    throw new AuthorizationError(
      appError('unauthenticated', 'Vous devez être connecte pour acceder a cette page.'),
    );
  }
  if (context.profile.disabled_at) {
    throw new AuthorizationError(
      appError('forbidden', 'Votre compte a ete désactivé. Contactez le support.'),
    );
  }
  return {
    userId: context.user.id,
    email: context.user.email,
    profile: context.profile,
    client: context.client,
  };
}

/**
 * Verifie une capacite sur une organisation, en interrogeant la fonction SQL
 * qui fait autorite. Un appel distinct par capacite est volontaire : c est la
 * meme definition que celle appliquee par les policies RLS.
 */
export async function requireOrgCapability(
  context: AuthContext,
  organizationId: UUID,
  capability: OrgCapability,
): Promise<void> {
  const { data, error } = await context.client.rpc('org_can', {
    p_org: organizationId,
    p_capability: capability,
  });
  if (error || data !== true) {
    throw new AuthorizationError(
      appError('forbidden', "Vous n'avez pas les droits nécessaires pour cette action."),
    );
  }
}

export async function canOrg(
  context: AuthContext,
  organizationId: UUID,
  capability: OrgCapability,
): Promise<boolean> {
  const { data, error } = await context.client.rpc('org_can', {
    p_org: organizationId,
    p_capability: capability,
  });
  return !error && data === true;
}

/** Roles du personnel plateforme, du plus large au plus restreint. */
const PLATFORM_HIERARCHY: Record<PlatformRole, number> = {
  platform_owner: 100,
  platform_admin: 80,
  billing_admin: 60,
  developer: 50,
  designer: 40,
  support: 30,
};

export function hasPlatformRole(
  profile: Profile | null,
  minimum: PlatformRole = 'support',
): boolean {
  if (!profile?.platform_role) return false;
  return PLATFORM_HIERARCHY[profile.platform_role] >= PLATFORM_HIERARCHY[minimum];
}

/**
 * Acces au back-office.
 *
 * Trois conditions cumulatives, verifiees cote serveur :
 *  1. une session valide ;
 *  2. un role plateforme inscrit EN BASE — jamais deduit de l adresse e-mail ;
 *  3. un second facteur valide (aal2) SI le compte porte `mfa_enforced`.
 *
 * Le back-office donne acces aux donnees de tous les clients. Laisser
 * `mfa_enforced` a `false` sur un compte interne revient donc a les ouvrir
 * avec un mot de passe seul : c est un choix d exploitation, pris compte par
 * compte, et un appelant peut toujours exiger le second facteur quoi qu il
 * arrive via `requireMfa: true`.
 */
export function requirePlatformRole(
  context: AuthContext & { assuranceLevel?: 'aal1' | 'aal2' | null },
  minimum: PlatformRole = 'support',
  options: { requireMfa?: boolean } = {},
): void {
  if (!hasPlatformRole(context.profile, minimum)) {
    // Reponse volontairement identique a « page introuvable » : l existence
    // meme du back-office n a pas a etre confirmee a un compte non habilite.
    throw new AuthorizationError(appError('not_found', 'Page introuvable.'));
  }
  const mfaRequired = options.requireMfa ?? context.profile?.mfa_enforced === true;
  if (mfaRequired && context.assuranceLevel !== 'aal2') {
    throw new AuthorizationError(
      appError(
        'forbidden',
        'L accès au back-office exigé une authentification a deux facteurs active et validée.',
      ),
    );
  }
}

/** Le compte doit avoir valide son adresse e-mail avant toute action sensible. */
export function requireVerifiedEmail(user: { emailVerified: boolean }): void {
  if (!user.emailVerified) {
    throw new AuthorizationError(
      appError(
        'forbidden',
        'Confirmez votre adresse e-mail pour continuer. Vérifiez votre boîte de réception.',
      ),
    );
  }
}

/**
 * Reauthentification pour les operations critiques : resiliation, suppression,
 * changement de moyen de paiement, export complet des donnees.
 */
export const CRITICAL_ACTIONS = [
  'subscription.cancel',
  'organization.delete',
  'member.remove_owner',
  'billing.change_payment_method',
  'data.export_full',
  'mfa.disable',
] as const;
export type CriticalAction = (typeof CRITICAL_ACTIONS)[number];

/** Delai au-dela duquel une action critique exige une nouvelle saisie du mot de passe. */
export const REAUTH_WINDOW_SECONDS = 900;

export function requiresReauthentication(lastAuthenticatedAt: Date | null): boolean {
  if (!lastAuthenticatedAt) return true;
  return Date.now() - lastAuthenticatedAt.getTime() > REAUTH_WINDOW_SECONDS * 1000;
}
