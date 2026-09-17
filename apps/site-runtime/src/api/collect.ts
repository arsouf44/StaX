import { createServiceClient } from '@stax/database';
import { visitorHash } from '@stax/security';
import { jsonResponse } from '../responses';
import { clientIp } from './shared';
import type { ResolvedSite } from '../resolve';

/**
 * Mesure d audience respectueuse.
 *
 * Aucun cookie, aucun identifiant persistant, aucune adresse IP conservee.
 * L empreinte visiteur est un HMAC sale RECALCULE CHAQUE JOUR : elle permet de
 * distinguer deux visiteurs le meme jour, et rend structurellement impossible
 * le suivi d une personne d un jour sur l autre.
 *
 * La route repond toujours 204 : une erreur de mesure ne doit jamais apparaitre
 * dans la console d un visiteur ni ralentir sa navigation.
 */
export async function handleCollect(request: Request, site: ResolvedSite): Promise<Response> {
  if (!site.settings.analyticsEnabled) return new Response(null, { status: 204 });

  try {
    const raw: unknown = await request.json();
    const body = (raw ?? {}) as { path?: unknown; ref?: unknown };
    const path = typeof body.path === 'string' ? body.path.slice(0, 512) : '/';
    const referrer = typeof body.ref === 'string' ? body.ref.slice(0, 120) : null;

    const hash = await visitorHash({
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      siteId: site.siteId,
    });

    await createServiceClient().rpc('record_page_view', {
      p_site: site.siteId,
      p_path: path,
      p_visitor_hash: hash,
      // Un referent interne n est pas une source : on ne le compte pas.
      p_referrer_host: referrer === site.hostname.hostname ? null : referrer,
      p_country: request.headers.get('cf-ipcountry'),
      p_kind: 'pageview',
    });
  } catch {
    // Silencieux par conception.
  }

  return new Response(null, { status: 204 });
}

/** Repond a une requete `navigator.sendBeacon`, qui ne lit jamais la reponse. */
export function collectNoop(): Response {
  return jsonResponse({ ok: true }, 200);
}
