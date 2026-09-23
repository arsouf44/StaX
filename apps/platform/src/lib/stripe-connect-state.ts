import 'server-only';
import { hmacHex, randomHex, timingSafeEqual } from '@stax/security';

/**
 * Etat signe du parcours « relier mon compte Stripe existant ».
 *
 * Stripe renvoie le client vers StaX avec ce parametre intact. Il porte
 * l'organisation et la personne qui ont lance la liaison, une echeance courte
 * et un alea, le tout signe : un lien de retour fabrique ou rejoue ne peut pas
 * rattacher un compte Stripe a l'organisation d'un autre.
 */

const DOMAIN = 'stripe-connect-oauth';
const TTL_MS = 15 * 60 * 1000;

export interface ConnectState {
  organizationId: string;
  userId: string;
}

export async function signConnectState(input: ConnectState): Promise<string> {
  const payload = Buffer.from(
    JSON.stringify({
      o: input.organizationId,
      u: input.userId,
      e: Date.now() + TTL_MS,
      n: randomHex(8),
    }),
  ).toString('base64url');
  return `${payload}.${await hmacHex(payload, DOMAIN)}`;
}

export async function verifyConnectState(state: string | null): Promise<ConnectState | null> {
  if (!state || state.length > 1024) return null;
  const [payload, mac] = state.split('.');
  if (!payload || !mac) return null;
  if (!timingSafeEqual(mac, await hmacHex(payload, DOMAIN))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      o?: unknown;
      u?: unknown;
      e?: unknown;
    };
    if (typeof data.o !== 'string' || typeof data.u !== 'string' || typeof data.e !== 'number') {
      return null;
    }
    if (data.e < Date.now()) return null;
    return { organizationId: data.o, userId: data.u };
  } catch {
    return null;
  }
}
