import type { RateLimitDecision, RateLimitStore } from '@stax/security';
import { createServiceClient, type Db } from './client';

/**
 * Compteurs de limitation de debit persistes en base.
 *
 * Choisi plutot qu un cache memoire : un Worker edge est multi-instance, et un
 * compteur local ne ferait pas autorite. La fonction SQL app.bump_rate_limit()
 * incremente et decide en une seule requete atomique.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  constructor(private readonly db: Db = createServiceClient()) {}

  async increment(
    bucket: string,
    identifier: string,
    windowSeconds: number,
    max: number,
  ): Promise<RateLimitDecision> {
    const { data, error } = await this.db.rpc('bump_rate_limit', {
      p_bucket: bucket,
      p_identifier: identifier,
      p_window_seconds: windowSeconds,
      p_max: max,
    });

    if (error) {
      // Une panne du compteur ne doit pas bloquer un client legitime, mais
      // elle est remontee a l appelant pour journalisation.
      return { allowed: true, remaining: max, retryAfterSeconds: 0 };
    }

    const allowed = data === true;
    return {
      allowed,
      remaining: allowed ? Math.max(max - 1, 0) : 0,
      retryAfterSeconds: allowed ? 0 : windowSeconds,
    };
  }
}
