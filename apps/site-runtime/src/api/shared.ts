import { createServiceClient, PostgresRateLimitStore } from '@stax/database';
import {
  enforceRateLimit,
  hashIp,
  isTrustedOrigin,
  rateLimitIdentity,
  verifyCsrfToken,
  verifyTurnstile,
  type RateLimitName,
} from '@stax/security';
import { jsonResponse } from '../responses';
import type { ResolvedSite } from '../resolve';
import { siteOrigin } from '../context';

/**
 * Garde commune a toutes les routes publiques mutantes.
 *
 * Quatre verifications, dans cet ordre — de la moins couteuse a la plus :
 *  1. origine de la requete (aucun appel depuis un autre site) ;
 *  2. jeton anti-CSRF signe et lie au nom d hote ;
 *  3. limitation de debit, comptee sur une empreinte d IP jamais conservee en clair ;
 *  4. Turnstile, uniquement lorsqu il est configure.
 *
 * Aucune de ces etapes ne prend d identifiant de tenant depuis le corps de la
 * requete : le site provient du nom d hote et de lui seul.
 */

export interface GuardResult {
  ok: boolean;
  response?: Response;
  ipHash: string | null;
  payload: Record<string, unknown>;
}

const MAX_BODY_BYTES = 128 * 1024;

export function clientIp(request: Request): string | null {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}

async function readPayload(request: Request): Promise<Record<string, unknown> | null> {
  const type = request.headers.get('content-type') ?? '';
  const length = Number.parseInt(request.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;

  try {
    if (type.includes('application/json')) {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return null;
      const parsed: unknown = JSON.parse(raw);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    }
    if (type.includes('form')) {
      const form = await request.formData();
      const payload: Record<string, unknown> = {};
      for (const [key, value] of form.entries()) {
        payload[key] = typeof value === 'string' ? value : value.name;
      }
      return payload;
    }
  } catch {
    return null;
  }
  return null;
}

export function refuse(message: string, status = 400, code = 'invalid_request'): Response {
  return jsonResponse({ ok: false, code, message }, status);
}

export async function guardPublicWrite(
  request: Request,
  site: ResolvedSite,
  limit: RateLimitName,
): Promise<GuardResult> {
  const origin = siteOrigin(request);
  if (!isTrustedOrigin(request, [origin])) {
    return {
      ok: false,
      ipHash: null,
      payload: {},
      response: refuse('Requête refusée : origine non reconnue.', 403, 'bad_origin'),
    };
  }

  const payload = await readPayload(request);
  if (!payload) {
    return {
      ok: false,
      ipHash: null,
      payload: {},
      response: refuse('Requête illisible ou trop volumineuse.', 413, 'bad_payload'),
    };
  }

  const token = typeof payload['_token'] === 'string' ? (payload['_token'] as string) : null;
  if (!(await verifyCsrfToken(site.hostname.hostname, token))) {
    return {
      ok: false,
      ipHash: null,
      payload,
      response: refuse(
        'Votre session de formulaire a expiré. Rechargez la page et réessayez.',
        403,
        'bad_token',
      ),
    };
  }

  const ipHash = await hashIp(clientIp(request));

  // Le compteur est partage entre toutes les instances du Worker, donc en base.
  // S il est injoignable, on laisse passer : un visiteur legitime ne doit pas
  // etre bloque parce qu un compteur est en panne. L incident est journalise.
  try {
    const decision = await enforceRateLimit(
      new PostgresRateLimitStore(createServiceClient()),
      limit,
      rateLimitIdentity({ ipHash: `${site.siteId}:${ipHash ?? 'anonymous'}` }),
    );
    if (!decision.allowed) {
      return {
        ok: false,
        ipHash,
        payload,
        response: jsonResponse(
          {
            ok: false,
            code: 'rate_limited',
            message: decision.error?.message ?? 'Trop de requêtes.',
          },
          429,
          { 'retry-after': String(decision.retryAfterSeconds) },
        ),
      };
    }
  } catch (error) {
    console.error('[stax:rate-limit] compteur indisponible', error);
  }

  const captcha =
    typeof payload['cf-turnstile-response'] === 'string'
      ? (payload['cf-turnstile-response'] as string)
      : null;
  const turnstile = await verifyTurnstile(captcha, clientIp(request));
  if (!turnstile.success) {
    return {
      ok: false,
      ipHash,
      payload,
      response: refuse('La vérification anti-robot a échoué. Rechargez la page.', 403, 'captcha'),
    };
  }

  return { ok: true, ipHash, payload };
}

/** Lit une chaine bornee depuis une charge utile non fiable. */
export function field(payload: Record<string, unknown>, key: string, max = 500): string | null {
  const value = payload[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}

export function intField(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
