/**
 * Resolution du tenant a partir du nom d'hote.
 *
 * C'est le point d'entree du multi-tenant : toute requete publique arrive sur
 * la meme infrastructure, et c'est le hostname — jamais un parametre fourni
 * par le navigateur — qui determine le site a servir.
 */

export type HostnameKind = 'platform' | 'platform-subdomain' | 'preview' | 'custom' | 'invalid';

export interface ResolvedHostname {
  kind: HostnameKind;
  /** Nom d'hote normalise : minuscules, sans port, sans point final. */
  hostname: string;
  /** Sous-domaine du tenant, pour `client.sites.stax.fr`. */
  subdomain: string | null;
  isPreview: boolean;
}

const HOSTNAME_PATTERN = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Normalise un en-tete Host : minuscules, port retire, point final retire. */
export function normalizeHostname(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  // Retire un eventuel port, en preservant les adresses IPv6 entre crochets.
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    if (close === -1) return null;
    host = host.slice(0, close + 1);
  } else {
    const colon = host.indexOf(':');
    if (colon !== -1) host = host.slice(0, colon);
  }
  host = host.replace(/\.$/, '');
  if (host.length === 0 || host.length > 253) return null;
  return host;
}

export function isValidHostname(host: string): boolean {
  return HOSTNAME_PATTERN.test(host);
}

export interface HostnameConfig {
  /** Hote de l'application StaX, par exemple `stax.fr`. */
  platformHost: string;
  /** Domaine parent des sous-domaines clients, par exemple `sites.stax.fr`. */
  sitesDomain: string;
  /** Domaine des apercus, par exemple `preview.sites.stax.fr`. */
  previewDomain: string;
}

export function resolveHostname(raw: string | null, config: HostnameConfig): ResolvedHostname {
  const hostname = normalizeHostname(raw);
  if (!hostname) {
    return { kind: 'invalid', hostname: '', subdomain: null, isPreview: false };
  }

  const platformHost = normalizeHostname(config.platformHost) ?? '';
  const sitesDomain = normalizeHostname(config.sitesDomain) ?? '';
  const previewDomain = normalizeHostname(config.previewDomain) ?? '';

  if (platformHost && (hostname === platformHost || hostname === `www.${platformHost}`)) {
    return { kind: 'platform', hostname, subdomain: null, isPreview: false };
  }

  if (previewDomain && hostname === previewDomain) {
    return { kind: 'preview', hostname, subdomain: null, isPreview: true };
  }

  if (sitesDomain && hostname.endsWith(`.${sitesDomain}`)) {
    const subdomain = hostname.slice(0, -(sitesDomain.length + 1));
    // Un sous-domaine de tenant est toujours d'un seul niveau : `a.b.sites.fr`
    // n'est pas un tenant valide, ce qui ecarte toute confusion de portee.
    if (!subdomain || subdomain.includes('.') || !SUBDOMAIN_PATTERN.test(subdomain)) {
      return { kind: 'invalid', hostname, subdomain: null, isPreview: false };
    }
    return { kind: 'platform-subdomain', hostname, subdomain, isPreview: false };
  }

  if (!isValidHostname(hostname)) {
    return { kind: 'invalid', hostname, subdomain: null, isPreview: false };
  }

  return { kind: 'custom', hostname, subdomain: null, isPreview: false };
}

/**
 * Cle de cache edge d'une page publiee.
 *
 * Elle incorpore le hostname ET l'empreinte de la version : deux tenants ne
 * peuvent jamais partager une entree de cache, et une publication invalide
 * mecaniquement les entrees precedentes puisque l'empreinte change.
 */
export function buildCacheKey(params: {
  hostname: string;
  path: string;
  contentHash: string;
  locale?: string;
}): string {
  const locale = params.locale ?? 'fr';
  const path = params.path.startsWith('/') ? params.path : `/${params.path}`;
  const host = normalizeHostname(params.hostname);
  if (!host) throw new Error('Cle de cache : nom d’hote invalide.');
  if (!/^[0-9a-f]{8,128}$/.test(params.contentHash)) {
    throw new Error('Cle de cache : empreinte de version invalide.');
  }
  return `https://cache.stax.internal/v1/${host}/${params.contentHash}/${locale}${path}`;
}

/** Sous-domaine propose lors de la creation d'un site, a partir de son nom. */
export function suggestSubdomain(businessName: string): string {
  const base = businessName
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return base.length >= 3 ? base : `site-${base || 'client'}`;
}

/** Sous-domaines interdits : reserves a l'infrastructure ou trompeurs. */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www', 'app', 'admin', 'api', 'preview', 'staging', 'dev', 'test', 'mail', 'smtp',
  'imap', 'pop', 'ftp', 'cdn', 'assets', 'static', 'status', 'support', 'help',
  'blog', 'docs', 'account', 'accounts', 'login', 'signup', 'billing', 'pay',
  'stripe', 'webhook', 'webhooks', 'cloudflare', 'supabase', 'stax', 'security',
  'abuse', 'postmaster', 'hostmaster', 'webmaster', 'ns', 'ns1', 'ns2', 'mx',
]);

export function isSubdomainAvailable(subdomain: string): boolean {
  if (RESERVED_SUBDOMAINS.has(subdomain)) return false;
  return /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/.test(subdomain);
}
