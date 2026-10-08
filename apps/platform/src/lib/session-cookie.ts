/**
 * Espaces qui exigent une session : l'espace client, l'administration, et le
 * choix du premier mot de passe qui suit l'accès par code.
 */
const PROTECTED = /^\/(app|admin|acces\/mot-de-passe)(\/|$)/;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED.test(pathname);
}

/**
 * Presence d'un cookie de session Supabase (`sb-<projet>-auth-token`, coupe en
 * `.0`, `.1`… quand il est long). Son ABSENCE prouve qu'il n'y a pas de
 * session ; sa presence ne prouve rien : chaque page verifie ensuite la
 * session aupres de Supabase.
 */
export function hasSessionCookie(cookies: ReadonlyArray<{ name: string }>): boolean {
  return cookies.some(
    (cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token'),
  );
}

/** Adresse de connexion qui ramene ensuite a la page demandee. */
export function loginRedirect(requestUrl: string, pathname: string, search: string): URL {
  const login = new URL('/connexion', requestUrl);
  login.searchParams.set('suivant', `${pathname}${search}`);
  return login;
}
