import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertServerOnly, publicEnv, readEnv } from '@stax/config';
import type { Profile, UUID } from '@stax/types';

/**
 * Sessions Supabase cote serveur.
 *
 * Le paquet reste independant du framework : l appelant fournit un adaptateur
 * de cookies. Next.js, un Worker ou un script d exploitation peuvent donc
 * partager exactement la meme logique d authentification.
 *
 * Les cookies de session sont toujours HttpOnly, Secure et SameSite=Lax :
 * ils ne sont jamais lisibles par du JavaScript de page.
 */

export interface SessionCookie {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

export interface CookieAdapter {
  getAll(): SessionCookie[] | Promise<SessionCookie[]>;
  setAll(cookies: SessionCookie[]): void | Promise<void>;
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: true,
  path: '/',
} as const;

export function createSessionClient(cookies: CookieAdapter): SupabaseClient {
  assertServerOnly('@stax/auth/session');
  const url = readEnv('SUPABASE_URL') ?? publicEnv().NEXT_PUBLIC_SUPABASE_URL;
  const key = readEnv('SUPABASE_ANON_KEY') ?? publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const adapter: CookieMethodsServer = {
    getAll: async () => {
      const all = await cookies.getAll();
      return all.map(({ name, value }) => ({ name, value }));
    },
    setAll: async (list) => {
      await cookies.setAll(
        list.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          options: { ...SESSION_COOKIE_OPTIONS, ...cookie.options },
        })),
      );
    },
  };

  return createServerClient(url, key, { cookies: adapter });
}

export interface AuthenticatedUser {
  id: UUID;
  email: string;
  emailVerified: boolean;
  /** Niveau d authentification atteint : `aal2` = second facteur valide. */
  assuranceLevel: 'aal1' | 'aal2' | null;
  accessToken: string;
}

export interface SessionContext {
  user: AuthenticatedUser | null;
  profile: Profile | null;
  client: SupabaseClient;
}

/**
 * Resout la session courante.
 *
 * `getUser()` est utilise volontairement plutot que `getSession()` : il
 * REVALIDE le jeton aupres de Supabase, alors que `getSession()` se contente
 * de lire le cookie — qui peut avoir ete forge.
 */
export async function resolveSession(cookies: CookieAdapter): Promise<SessionContext> {
  const client = createSessionClient(cookies);
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    return { user: null, profile: null, client };
  }

  const { data: sessionData } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? '';

  const aal = decodeAssuranceLevel(accessToken);

  const user: AuthenticatedUser = {
    id: data.user.id,
    email: data.user.email ?? '',
    emailVerified: Boolean(data.user.email_confirmed_at),
    assuranceLevel: aal,
    accessToken,
  };

  const { data: profile } = await client
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  return { user, profile: (profile as Profile | null) ?? null, client };
}

/**
 * Lit le niveau d assurance depuis la charge utile du JWT.
 * La signature a deja ete verifiee par Supabase lors de `getUser()` : on se
 * contente ici de lire une revendication non sensible.
 */
function decodeAssuranceLevel(accessToken: string): 'aal1' | 'aal2' | null {
  if (!accessToken) return null;
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1] as string;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(padded)) as { aal?: string };
    return decoded.aal === 'aal2' ? 'aal2' : 'aal1';
  } catch {
    return null;
  }
}

export async function signOut(cookies: CookieAdapter, scope: 'local' | 'global' = 'local') {
  const client = createSessionClient(cookies);
  await client.auth.signOut({ scope });
}
