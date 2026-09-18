import 'server-only';
import { headers } from 'next/headers';
import { createServiceClient, PostgresRateLimitStore } from '@stax/database';
import { platformUrl } from '@stax/config';
import {
  enforceRateLimit,
  hashIp,
  rateLimitIdentity,
  verifyTurnstile,
  type RateLimitName,
} from '@stax/security';

/**
 * Garde commune aux actions serveur publiques.
 *
 * Next.js verifie deja l origine des actions serveur : cette garde ajoute ce
 * qu il ne fait pas — limitation de debit par empreinte d IP (jamais l IP en
 * clair), champ piege et Turnstile.
 *
 * Elle est volontairement separee de la validation Zod : la validation dit ce
 * que la donnee doit etre, la garde dit si la requete a le droit d exister.
 */

export interface ActionGuardInput {
  limit: RateLimitName;
  /** Valeur du champ piege : doit rester vide. */
  honeypot?: unknown;
  turnstileToken?: unknown;
  /** Identifiant stable a preferer a l IP (utilisateur connecte). */
  userId?: string | null;
}

export type ActionGuardResult =
  { ok: true; ipHash: string | null } | { ok: false; message: string };

export async function guardAction(input: ActionGuardInput): Promise<ActionGuardResult> {
  // Le champ piege est invisible pour un humain : rempli, la requete vient
  // d un robot. On repond comme a une requete normale pour ne pas l informer.
  if (typeof input.honeypot === 'string' && input.honeypot.trim().length > 0) {
    return { ok: false, message: 'Votre demande n’a pas pu être traitée.' };
  }

  const store = await headers();
  const ip =
    store.get('cf-connecting-ip') ??
    store.get('x-real-ip') ??
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null;
  const ipHash = await hashIp(ip);

  // Le compteur est en base. S il est injoignable — base coupee, secret absent —
  // on laisse passer plutot que de bloquer tout le monde : la limitation de
  // debit protege contre l abus, elle ne doit pas devenir un point de panne.
  // L incident est journalise bruyamment.
  try {
    const decision = await enforceRateLimit(
      new PostgresRateLimitStore(createServiceClient()),
      input.limit,
      rateLimitIdentity({ userId: input.userId ?? null, ipHash }),
    );
    if (!decision.allowed) {
      return { ok: false, message: decision.error?.message ?? 'Trop de tentatives.' };
    }
  } catch (error) {
    console.error('[stax:rate-limit] compteur indisponible', error);
  }

  const turnstile = await verifyTurnstile(
    typeof input.turnstileToken === 'string' ? input.turnstileToken : null,
    ip,
  );
  if (!turnstile.success) {
    return {
      ok: false,
      message: 'La vérification anti-robot a échoué. Rechargez la page et réessayez.',
    };
  }

  return { ok: true, ipHash };
}

/** Origine canonique de la plateforme, pour les liens envoyes par e-mail. */
export function absolutePlatformUrl(path: string): string {
  const base = platformUrl().replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
