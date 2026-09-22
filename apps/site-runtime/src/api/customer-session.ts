import { hmacHex, randomToken, timingSafeEqual } from '@stax/security';

/**
 * Session d'un client du site.
 *
 * Le cookie porte l'identifiant du compte et une echeance, signes AVEC
 * L'IDENTIFIANT DU SITE. Un cookie emis par le site A ne vaut donc rien sur le
 * site B, meme si les deux tournent sur le meme Worker : la signature ne
 * correspond plus. C'est la meme regle que partout ailleurs — le tenant n'est
 * jamais choisi par le navigateur.
 *
 * Il n'y a pas de mot de passe a proteger : la connexion se fait par lien a
 * usage unique. Le cookie est donc le seul secret, et il est de courte duree.
 */

const COOKIE_NAME = '__stax_customer';
/** Trente jours : assez pour ne pas relancer un e-mail a chaque visite. */
const SESSION_DAYS = 30;

export interface CustomerSession {
  customerId: string;
  expiresAt: number;
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (key) out[key] = part.slice(index + 1).trim();
  }
  return out;
}

export async function readCustomerSession(
  request: Request,
  siteId: string,
): Promise<CustomerSession | null> {
  const cookie = parseCookies(request.headers.get('cookie'))[COOKIE_NAME];
  if (!cookie) return null;

  const separator = cookie.lastIndexOf('.');
  if (separator === -1) return null;

  const body = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);
  const expected = await hmacHex(`${siteId}.${body}`, 'customer-session');
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    const decoded: unknown = JSON.parse(atob(body));
    if (typeof decoded !== 'object' || decoded === null) return null;
    const session = decoded as Partial<CustomerSession>;
    if (typeof session.customerId !== 'string' || typeof session.expiresAt !== 'number') {
      return null;
    }
    if (session.expiresAt <= Date.now()) return null;
    return { customerId: session.customerId, expiresAt: session.expiresAt };
  } catch {
    return null;
  }
}

export async function customerSessionCookie(siteId: string, customerId: string): Promise<string> {
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;
  const body = btoa(JSON.stringify({ customerId, expiresAt }));
  const signature = await hmacHex(`${siteId}.${body}`, 'customer-session');
  return [
    `${COOKIE_NAME}=${body}.${signature}`,
    'Path=/',
    // `Lax` et non `Strict` : le client arrive depuis le lien de son e-mail,
    // et un cookie `Strict` ne serait pas envoye sur cette premiere navigation.
    'SameSite=Lax',
    'HttpOnly',
    'Secure',
    `Max-Age=${SESSION_DAYS * 86_400}`,
  ].join('; ');
}

export function clearedCustomerCookie(): string {
  return [`${COOKIE_NAME}=`, 'Path=/', 'SameSite=Lax', 'HttpOnly', 'Secure', 'Max-Age=0'].join(
    '; ',
  );
}

/** Jeton de connexion : aleatoire, transmis une fois, stocke en empreinte. */
export function newLoginToken(): string {
  return randomToken(32);
}

export async function loginTokenHash(token: string): Promise<string> {
  return hmacHex(token, 'customer-login');
}
