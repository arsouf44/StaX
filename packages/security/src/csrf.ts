import { hmacHex, randomToken, timingSafeEqual } from './crypto.js';

/**
 * Protection CSRF par jeton signe (double soumission).
 *
 * Next.js protege deja les actions serveur par une verification d'origine,
 * mais les routes API en POST et les formulaires publics des sites clients
 * ne beneficient pas de cette protection : ce module la fournit.
 */

const TOKEN_TTL_SECONDS = 7200;

export interface CsrfToken {
  value: string;
  expiresAt: number;
}

export async function issueCsrfToken(sessionId: string): Promise<CsrfToken> {
  const nonce = randomToken(16);
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const signature = await hmacHex(`${sessionId}.${nonce}.${expiresAt}`, 'csrf');
  return { value: `${nonce}.${expiresAt}.${signature}`, expiresAt };
}

export async function verifyCsrfToken(sessionId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [nonce, expiresRaw, signature] = parts as [string, string, string];
  const expiresAt = Number.parseInt(expiresRaw, 10);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacHex(`${sessionId}.${nonce}.${expiresAt}`, 'csrf');
  return timingSafeEqual(signature, expected);
}

/**
 * Verification d'origine : defense complementaire, independante du jeton.
 * Une requete mutante dont l'origine n'est pas reconnue est refusee.
 */
export function isTrustedOrigin(
  request: { headers: { get(name: string): string | null } },
  allowedOrigins: readonly string[],
): boolean {
  const origin = request.headers.get('origin');
  if (origin) return allowedOrigins.includes(origin);

  // Certains navigateurs omettent Origin sur une navigation de meme site :
  // on se rabat alors sur Referer.
  const referer = request.headers.get('referer');
  if (!referer) return false;
  try {
    return allowedOrigins.includes(new URL(referer).origin);
  } catch {
    return false;
  }
}
