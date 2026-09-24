import { readEnv } from '@stax/config';
import { timingSafeEqual } from '@stax/security';

/**
 * Authentification des webhooks entrants (GitHub, Cloudflare).
 *
 * Un webhook non authentifie est refuse AVANT toute lecture de son contenu.
 * Et meme authentifie, son contenu n'est qu'un signal : l'etat qui fait foi
 * (commit, deploiement) est relu aupres de l'API du fournisseur.
 */

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * GitHub signe chaque livraison : `X-Hub-Signature-256: sha256=<hmac hex>`,
 * calcule sur le corps BRUT avec le secret du webhook de l'application.
 */
export async function verifyGitHubSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined = readEnv('GITHUB_APP_WEBHOOK_SECRET'),
): Promise<boolean> {
  if (!secret || secret.length < 16 || !header) return false;
  const match = header.trim().match(/^sha256=([0-9a-f]{64})$/i);
  if (!match?.[1]) return false;
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected, match[1].toLowerCase());
}

/**
 * Cloudflare (notifications vers une destination webhook) transmet le secret
 * configure sur la destination dans l'en-tete `cf-webhook-auth`.
 */
export function verifyCloudflareWebhook(
  header: string | null,
  secret: string | undefined = readEnv('CLOUDFLARE_WEBHOOK_SECRET'),
): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  return timingSafeEqual(header.trim(), secret);
}

/** Secret des taches de fond (`Authorization: Bearer <CRON_SECRET>`). */
export function verifyCronSecret(
  header: string | null,
  secret: string | undefined = readEnv('CRON_SECRET'),
): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  const match = header.trim().match(/^Bearer\s+(.+)$/i);
  return Boolean(match?.[1] && timingSafeEqual(match[1], secret));
}
