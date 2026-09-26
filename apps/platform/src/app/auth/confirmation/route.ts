import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSessionClient } from '@stax/auth';
import { absolutePlatformUrl } from '~/lib/action-guard';
import { safeRedirectTarget } from '~/lib/session';

/**
 * Retour des liens envoyés par e-mail (confirmation d'inscription,
 * réinitialisation du mot de passe).
 *
 * Supabase renvoie ici avec un `code` (échange PKCE) ou un `token_hash`
 * (vérification directe, gabarits d'e-mail personnalisés). Sans cette route,
 * le lien confirmait l'adresse sans ouvrir de session : la personne tombait
 * sur la page de connexion, et le lien de réinitialisation du mot de passe ne
 * pouvait jamais aboutir.
 *
 * La destination est toujours un chemin interne (`safeRedirectTarget`).
 */

export const dynamic = 'force-dynamic';

const OTP_TYPES: ReadonlySet<string> = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const next = safeRedirectTarget(url.searchParams.get('suivant'));
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  const store = await cookies();
  const client = createSessionClient({
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list) => {
      for (const cookie of list) store.set(cookie.name, cookie.value, cookie.options ?? {});
    },
  });

  let opened = false;
  try {
    if (code) {
      opened = !(await client.auth.exchangeCodeForSession(code)).error;
    } else if (tokenHash && type && OTP_TYPES.has(type)) {
      opened = !(await client.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType }))
        .error;
    }
  } catch {
    opened = false;
  }

  if (opened) {
    return NextResponse.redirect(absolutePlatformUrl(next));
  }

  // Lien expiré, déjà utilisé, ou ouvert sur un autre appareil que celui qui
  // l'a demandé : l'adresse est souvent déjà confirmée, il suffit de se
  // connecter. Un lien de réinitialisation, lui, doit être redemandé.
  const fallback =
    next === '/nouveau-mot-de-passe'
      ? '/mot-de-passe-oublie?lien=expire'
      : `/connexion?confirme=1&suivant=${encodeURIComponent(next)}`;
  return NextResponse.redirect(absolutePlatformUrl(fallback));
}
