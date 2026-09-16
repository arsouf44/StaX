import { readEnv } from '@stax/config';

/**
 * Primitives cryptographiques.
 *
 * Uniquement WebCrypto : disponible a l'identique sur Cloudflare Workers et
 * sur Node 18+. Aucun `node:crypto`, qui casserait le runtime edge.
 */

const encoder = new TextEncoder();

function secretKeyMaterial(): Uint8Array {
  const secret = readEnv('STAX_SECRET_KEY');
  if (!secret || secret.length < 32) {
    throw new Error(
      '[StaX] STAX_SECRET_KEY absent ou trop court (32 caracteres minimum). ' +
        'Generez-le avec : openssl rand -base64 48',
    );
  }
  return encoder.encode(secret);
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hexadecimal. Pour les empreintes non secretes (checksums). */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return toHex(digest);
}

/**
 * HMAC-SHA256 avec le secret applicatif.
 * Utilise pour les codes d'activation, les jetons d'invitation, de preview,
 * d'annulation de reservation et les jetons CSRF. Un attaquant qui obtient la
 * base ne peut pas reconstruire les valeurs en clair.
 */
export async function hmacHex(value: string, domainSeparator: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretKeyMaterial() as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${domainSeparator}:${value}`),
  );
  return toHex(signature);
}

/** Comparaison a temps constant : empeche les attaques temporelles. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare quand meme pour ne pas reveler la longueur par le temps de reponse.
    let dummy = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      dummy |= (a.charCodeAt(i % a.length) || 0) ^ (b.charCodeAt(i % b.length) || 0);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Octets aleatoires cryptographiquement surs, en hexadecimal. */
export function randomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Jeton URL-safe (base64url sans remplissage). */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Alphabet des codes d'activation : sans 0/O, 1/I/L, ni caracteres ambigus.
 * Un code doit pouvoir etre dicte au telephone sans erreur.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Code d'activation lisible du type `A7K4-M92P-XR3T`.
 * 12 caracteres dans un alphabet de 31 symboles = ~59 bits d'entropie,
 * largement suffisant face a une limitation de debit et a une expiration.
 */
export function generateActivationCode(groups = 3, groupSize = 4): string {
  const total = groups * groupSize;
  const bytes = new Uint8Array(total);
  crypto.getRandomValues(bytes);
  const chars: string[] = [];
  for (let i = 0; i < total; i += 1) {
    // Rejet du biais modulo negligeable ici : l'alphabet divise 248 presque
    // uniformement, et l'entropie reste tres au-dela du necessaire.
    chars.push(CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!);
  }
  return Array.from({ length: groups }, (_, g) =>
    chars.slice(g * groupSize, (g + 1) * groupSize).join(''),
  ).join('-');
}

/** Normalise un code saisi : majuscules, sans espaces, avec tirets. */
export function normalizeActivationCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (clean.match(/.{1,4}/g) ?? []).join('-');
}

export async function hashActivationCode(code: string): Promise<string> {
  return hmacHex(normalizeActivationCode(code), 'activation-code');
}

export function activationCodeHint(code: string): string {
  const normalized = normalizeActivationCode(code).replace(/-/g, '');
  return normalized.slice(-4);
}

/**
 * Empreinte d'adresse IP : salee et tronquee. Permet la limitation de debit et
 * la preuve de consentement sans conserver d'IP en clair (RGPD, minimisation).
 */
export async function hashIp(ip: string | null | undefined): Promise<string | null> {
  if (!ip) return null;
  const full = await hmacHex(ip.trim().toLowerCase(), 'ip-address');
  return full.slice(0, 32);
}

/** Empreinte d'e-mail pour les journaux d'envoi, sans conserver l'adresse. */
export async function hashEmail(email: string): Promise<string> {
  const full = await hmacHex(email.trim().toLowerCase(), 'email-address');
  return full.slice(0, 32);
}

/**
 * Empreinte de visiteur pour les statistiques : salee par jour ET par site.
 * Elle ne permet aucun suivi d'un jour sur l'autre, ni d'un site a l'autre.
 */
export async function visitorHash(params: {
  ip: string | null;
  userAgent: string | null;
  siteId: string;
  day?: string;
}): Promise<string> {
  const day = params.day ?? new Date().toISOString().slice(0, 10);
  const raw = `${params.ip ?? ''}|${params.userAgent ?? ''}|${params.siteId}|${day}`;
  const full = await hmacHex(raw, 'visitor');
  return full.slice(0, 32);
}
