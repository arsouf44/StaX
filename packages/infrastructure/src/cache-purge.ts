import { readEnv } from '@stax/config';

/**
 * Invalidation du cache Cloudflare apres une publication.
 *
 * Le moteur des sites relit la version publiee a CHAQUE requete : aucune page
 * n y reste figee. Mais une regle de cache posee sur la zone (« Cache
 * Everything »), un cache partage en aval ou l en-tete `s-maxage` peuvent
 * servir quelques secondes l ancienne page. Apres une publication, on demande
 * donc explicitement a Cloudflare d oublier les adresses du site : le client
 * voit sa nouvelle version tout de suite, pas « dans une minute ».
 *
 * Purge par URL (disponible sur toutes les offres Cloudflare), par lots de 30 :
 * c est la limite commune a toutes les offres.
 *
 * Sans configuration, la fonction le DIT (`skipped`) plutot que de pretendre
 * avoir vide un cache qu elle n a pas touche.
 */

export interface PurgeOutcome {
  status: 'purged' | 'skipped' | 'failed';
  urls: number;
  message: string | null;
}

const BATCH = 30;

export function cachePurgeConfigured(): boolean {
  return Boolean(
    readEnv('CLOUDFLARE_API_TOKEN') &&
    (readEnv('CLOUDFLARE_SITES_ZONE_ID') ?? readEnv('CLOUDFLARE_ZONE_ID')),
  );
}

/** Adresses a purger : chaque page publiee sur chaque nom d hote du site. */
export function purgeUrls(
  hostnames: readonly string[],
  paths: readonly string[],
  scheme = 'https',
): string[] {
  const unique = new Set<string>();
  for (const hostname of hostnames) {
    for (const path of ['/', ...paths, '/sitemap.xml', '/robots.txt']) {
      const clean = path.startsWith('/') ? path : `/${path}`;
      unique.add(`${scheme}://${hostname}${clean}`);
    }
  }
  return [...unique];
}

export async function purgeSiteCache(input: {
  hostnames: readonly string[];
  paths: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<PurgeOutcome> {
  const token = readEnv('CLOUDFLARE_API_TOKEN');
  const zone = readEnv('CLOUDFLARE_SITES_ZONE_ID') ?? readEnv('CLOUDFLARE_ZONE_ID');
  const urls = purgeUrls(input.hostnames, input.paths);

  if (!token || !zone) {
    return {
      status: 'skipped',
      urls: 0,
      message: 'Aucun cache Cloudflare configuré : le moteur sert déjà la nouvelle version.',
    };
  }
  if (urls.length === 0) return { status: 'skipped', urls: 0, message: 'Aucune adresse.' };

  const base = (
    readEnv('CLOUDFLARE_API_BASE_URL') ?? 'https://api.cloudflare.com/client/v4'
  ).replace(/\/+$/, '');
  const call = input.fetchImpl ?? fetch;

  for (let start = 0; start < urls.length; start += BATCH) {
    const files = urls.slice(start, start + BATCH);
    try {
      const response = await call(`${base}/zones/${encodeURIComponent(zone)}/purge_cache`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        errors?: Array<{ message?: string }>;
      };
      if (!response.ok || body.success === false) {
        return {
          status: 'failed',
          urls: start,
          message: body.errors?.[0]?.message ?? `Cloudflare a répondu ${response.status}.`,
        };
      }
    } catch (error) {
      return {
        status: 'failed',
        urls: start,
        message: error instanceof Error ? error.message : 'Cloudflare injoignable.',
      };
    }
  }

  return { status: 'purged', urls: urls.length, message: null };
}
