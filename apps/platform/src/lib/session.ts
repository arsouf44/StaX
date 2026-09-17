import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  hasPlatformRole,
  resolveSession,
  type AuthenticatedUser,
  type SessionContext,
} from '@stax/auth';
import type { Profile } from '@stax/types';

/**
 * Session de la requete en cours.
 *
 * `cache()` deduplique la resolution a l interieur d un meme rendu : une page
 * qui verifie ses droits dans la mise en page ET dans un composant ne
 * revalide pas le jeton deux fois.
 *
 * La resolution s appuie sur `getUser()`, qui REVALIDE le jeton aupres de
 * Supabase. Un cookie forge ne suffit donc jamais a obtenir une session.
 */
export const getSession = cache(async (): Promise<SessionContext> => {
  const store = await cookies();
  return resolveSession({
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list) => {
      for (const cookie of list) {
        try {
          store.set(cookie.name, cookie.value, cookie.options ?? {});
        } catch {
          // Un composant serveur en lecture seule ne peut pas ecrire de
          // cookie : le rafraichissement aura lieu au prochain passage par un
          // middleware ou une action serveur.
        }
      }
    },
  });
});

export interface AuthenticatedSession extends SessionContext {
  user: AuthenticatedUser;
  profile: Profile;
}

/**
 * Exige une session valide. Redirige vers la connexion en conservant la page
 * demandee, pour y revenir apres authentification.
 */
export async function requireSession(): Promise<AuthenticatedSession> {
  const session = await getSession();
  if (!session.user || !session.profile) {
    redirect(`/connexion?suivant=${encodeURIComponent(await currentPath())}`);
  }
  if (session.profile.disabled_at) {
    redirect('/compte-desactive');
  }
  return session as AuthenticatedSession;
}

/**
 * Exige un role de la plateforme.
 *
 * Deux verifications distinctes et cumulatives :
 *  1. le role vient de `profiles.platform_role`, ecrit uniquement cote serveur ;
 *  2. le second facteur doit etre reellement valide (`aal2`), et pas seulement
 *     configure — sans quoi un vol de mot de passe suffirait.
 *
 * Posseder l adresse e-mail d administration ne donne aucun droit : elle
 * n intervient nulle part dans cette decision.
 */
export async function requirePlatformStaff(): Promise<AuthenticatedSession> {
  const session = await requireSession();

  if (!hasPlatformRole(session.profile, 'support')) {
    // Meme reponse qu une page inexistante : on ne confirme pas l existence
    // du back-office a un compte qui n y a pas droit.
    redirect('/app');
  }

  if (session.profile.mfa_enforced && session.user.assuranceLevel !== 'aal2') {
    redirect('/mfa?raison=obligatoire');
  }

  return session;
}

/** Chemin courant, pour revenir a la bonne page apres connexion. */
async function currentPath(): Promise<string> {
  const store = await headers();
  const path = store.get('x-stax-pathname') ?? store.get('x-invoke-path') ?? '/app';
  return path.startsWith('/') ? path : '/app';
}

/**
 * Destination apres connexion.
 * Seuls les chemins internes sont acceptes : une URL absolue permettrait une
 * redirection ouverte vers un site de hameconnage.
 */
export function safeRedirectTarget(value: string | null | undefined, fallback = '/app'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\') || value.includes('\n') || value.includes('\r')) return fallback;
  return value;
}
