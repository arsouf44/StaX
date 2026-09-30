import { pageViewSignal } from '@nemasus/analytics';
import { createServiceClient } from '@nemasus/database';
import { visitorHash } from '@nemasus/security';
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
    // Robots ecartes, chemin sans requete ni fragment, source reduite a un hote.
    const signal = pageViewSignal({
      path: body.path,
      referrer: body.ref,
      userAgent: request.headers.get('user-agent'),
      ownHosts: [site.hostname.hostname],
    });
    if (!signal) return new Response(null, { status: 204 });

    const hash = await visitorHash({
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
      siteId: site.siteId,
    });

    await createServiceClient().rpc('record_page_view', {
      p_site: site.siteId,
      p_path: signal.path,
      p_visitor_hash: hash,
      p_referrer_host: signal.referrerHost,
      p_country: request.headers.get('cf-ipcountry'),
      p_kind: 'pageview',
      p_device: signal.device,
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
