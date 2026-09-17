import type { AppError } from '@stax/types';
import { appError } from '@stax/types';

/**
 * Limitation de debit.
 *
 * L'implementation concrete est injectee : la base PostgreSQL en
 * developpement et pour les actions rares, un KV/Durable Object Cloudflare
 * pour les chemins a fort trafic. Les regles, elles, sont definies une seule
 * fois ici, pour ne pas diverger entre les deux.
 */

export interface RateLimitRule {
  /** Identifiant du seau, par exemple `auth.login`. */
  bucket: string;
  /** Fenetre glissante, en secondes. */
  windowSeconds: number;
  /** Nombre de requetes autorisees dans la fenetre. */
  max: number;
  /** Message affiche lorsque la limite est atteinte. */
  message: string;
}

export const RATE_LIMITS = {
  login: {
    bucket: 'auth.login',
    windowSeconds: 300,
    max: 10,
    message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
  },
  signup: {
    bucket: 'auth.signup',
    windowSeconds: 3600,
    max: 5,
    message: 'Trop de creations de compte depuis cette connexion. Réessayez plus tard.',
  },
  passwordReset: {
    bucket: 'auth.password_reset',
    windowSeconds: 3600,
    max: 5,
    message: 'Trop de demandes de reinitialisation. Réessayez dans une heure.',
  },
  activation: {
    bucket: 'auth.activation',
    windowSeconds: 900,
    max: 8,
    message: 'Trop de tentatives d’activation. Réessayez dans quinze minutes.',
  },
  contactForm: {
    bucket: 'public.contact_form',
    windowSeconds: 3600,
    max: 10,
    message: 'Vous avez envoyé trop de messages. Réessayez dans une heure.',
  },
  quoteForm: {
    bucket: 'public.quote_form',
    windowSeconds: 3600,
    max: 5,
    message: 'Vous avez envoyé trop de demandes de devis. Réessayez plus tard.',
  },
  booking: {
    bucket: 'public.booking',
    windowSeconds: 3600,
    max: 12,
    message: 'Trop de demandes de réservation. Réessayez dans une heure.',
  },
  checkout: {
    bucket: 'commerce.checkout',
    windowSeconds: 600,
    max: 10,
    message: 'Trop de tentatives de paiement. Patientez quelques minutes.',
  },
  adminSensitive: {
    bucket: 'admin.sensitive',
    windowSeconds: 300,
    max: 20,
    message: 'Trop d’opérations sensibles en peu de temps.',
  },
  apiWrite: {
    bucket: 'api.write',
    windowSeconds: 60,
    max: 60,
    message: 'Trop de requêtes. Ralentissez le rythme.',
  },
  mediaUpload: {
    bucket: 'media.upload',
    windowSeconds: 3600,
    max: 200,
    message: 'Trop de fichiers envoyés. Réessayez dans une heure.',
  },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Contrat que doit remplir tout magasin de compteurs. */
export interface RateLimitStore {
  increment(
    bucket: string,
    identifier: string,
    windowSeconds: number,
    max: number,
  ): Promise<RateLimitDecision>;
}

export async function enforceRateLimit(
  store: RateLimitStore,
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitDecision & { error?: AppError }> {
  const rule = RATE_LIMITS[name];
  const decision = await store.increment(rule.bucket, identifier, rule.windowSeconds, rule.max);
  if (decision.allowed) return decision;
  return { ...decision, error: appError('rate_limited', rule.message) };
}

/**
 * Magasin en memoire. Utilise en developpement et dans les tests uniquement :
 * un Worker edge est multi-instance, la memoire locale n'y ferait pas autorite.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();

  async increment(
    bucket: string,
    identifier: string,
    windowSeconds: number,
    max: number,
  ): Promise<RateLimitDecision> {
    const key = `${bucket}:${identifier}`;
    const now = Date.now();
    const existing = this.counters.get(key);

    if (!existing || existing.resetAt <= now) {
      this.counters.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
    }

    existing.count += 1;
    const allowed = existing.count <= max;
    return {
      allowed,
      remaining: Math.max(max - existing.count, 0),
      retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  reset(): void {
    this.counters.clear();
  }
}

/**
 * Identifiant de limitation. Prefere l'utilisateur authentifié a l'adresse IP :
 * un NAT d'entreprise partage une IP entre de nombreuses personnes.
 */
export function rateLimitIdentity(params: {
  userId?: string | null;
  ipHash?: string | null;
}): string {
  if (params.userId) return `u:${params.userId}`;
  if (params.ipHash) return `i:${params.ipHash}`;
  return 'anonymous';
}
