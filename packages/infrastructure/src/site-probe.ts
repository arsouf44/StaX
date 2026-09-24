import { guardOutboundUrl, isPrivateHost } from '@stax/security';
import type { ProviderDeployment } from './cloudflare-sites';

/**
 * Verifications REELLES d'un site avant sa livraison, et sa surveillance
 * ensuite. Chaque controle interroge le site en ligne et renvoie sa preuve
 * (codes HTTP, temps de reponse, balises trouvees) : la checklist de
 * livraison n'est jamais cochee sur parole.
 *
 * Les requetes sortantes passent par `guardOutboundUrl` : HTTPS uniquement,
 * jamais une adresse interne (protection SSRF), redirections suivies une a
 * une et reverifiees.
 */

type FetchImpl = typeof fetch;

export interface ProbeResult {
  url: string;
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  redirects: string[];
  responseMs: number | null;
  error: string | null;
  headers: Record<string, string>;
  body: string | null;
}

const MAX_BODY = 400_000;

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  while (text.length < MAX_BODY) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text.slice(0, MAX_BODY);
}

/** Interroge une adresse en suivant (et en reverifiant) chaque redirection. */
export async function probeUrl(
  url: string,
  options: {
    fetchImpl?: FetchImpl;
    timeoutMs?: number;
    readBody?: boolean;
    allowHttp?: boolean;
  } = {},
): Promise<ProbeResult> {
  const fetcher = options.fetchImpl ?? fetch;
  const redirects: string[] = [];
  const started = Date.now();
  let current = url;

  for (let hop = 0; hop <= 5; hop += 1) {
    let target: URL;
    if (options.allowHttp && hop === 0 && current.startsWith('http://')) {
      target = new URL(current);
      if (isPrivateHost(target.hostname) || target.port || target.username || target.password) {
        return failure(url, redirects, 'Adresse interne refusée.');
      }
    } else {
      const guard = guardOutboundUrl(current);
      if (!guard.allowed || !guard.url)
        return failure(url, redirects, guard.reason ?? 'Adresse refusée.');
      target = guard.url;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    try {
      const response = await fetcher(target.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'StaX-Verification/1.0 (+https://stax.fr)',
          accept: 'text/html,*/*',
        },
        cache: 'no-store',
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location)
          return failure(url, redirects, `Redirection ${response.status} sans destination.`);
        current = new URL(location, target).toString();
        redirects.push(current);
        await response.body?.cancel().catch(() => undefined);
        continue;
      }
      const headers: Record<string, string> = {};
      for (const key of [
        'content-type',
        'strict-transport-security',
        'x-robots-tag',
        'server',
        'cf-ray',
      ]) {
        const value = response.headers.get(key);
        if (value) headers[key] = value.slice(0, 300);
      }
      const body = options.readBody ? await readLimited(response) : null;
      if (!options.readBody) await response.body?.cancel().catch(() => undefined);
      return {
        url,
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        finalUrl: target.toString(),
        redirects,
        responseMs: Date.now() - started,
        error: response.status >= 400 ? `Le site répond ${response.status}.` : null,
        headers,
        body,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return failure(
        url,
        redirects,
        aborted
          ? 'Délai dépassé : le site ne répond pas.'
          : `Connexion impossible${error instanceof Error && error.message ? ` (${error.message.slice(0, 160)})` : ''}.`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  return failure(url, redirects, 'Trop de redirections.');
}

function failure(url: string, redirects: string[], error: string): ProbeResult {
  return {
    url,
    ok: false,
    status: null,
    finalUrl: null,
    redirects,
    responseMs: null,
    error,
    headers: {},
    body: null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Lecture du HTML (sans moteur de rendu)                                     */
/* -------------------------------------------------------------------------- */

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function metaTags(html: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags.slice(0, 200)) {
    const attributes: Record<string, string> = {};
    for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      const name = match[1];
      if (name) attributes[name.toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? '';
    }
    out.push(attributes);
  }
  return out;
}

export interface SeoAnalysis {
  title: string | null;
  description: string | null;
  lang: string | null;
  viewport: boolean;
  noindex: boolean;
  canonical: string | null;
  h1: number;
}

export function analyzeHtml(html: string): SeoAnalysis {
  const head = html.slice(0, 200_000);
  const title = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metas = metaTags(head);
  const description = metas.find((meta) => meta['name']?.toLowerCase() === 'description')?.[
    'content'
  ];
  const robots = metas
    .filter((meta) => ['robots', 'googlebot'].includes(meta['name']?.toLowerCase() ?? ''))
    .map((meta) => meta['content'] ?? '')
    .join(',');
  const canonical = head
    .match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0]
    .match(/href=["']([^"']+)["']/i)?.[1];
  return {
    title: title ? decodeEntities(title) || null : null,
    description: description ? decodeEntities(description) || null : null,
    lang: head.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1] ?? null,
    viewport: metas.some((meta) => meta['name']?.toLowerCase() === 'viewport'),
    noindex: /noindex/i.test(robots),
    canonical: canonical ?? null,
    h1: (html.match(/<h1\b/gi) ?? []).length,
  };
}

/** `Disallow: /` pour tous les robots ? */
export function robotsBlocksAll(robots: string): boolean {
  let applies = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [key, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(key ?? '')) applies = value === '*';
    else if (applies && /^disallow$/i.test(key ?? '') && value === '/') return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/*  Controles de livraison                                                     */
/* -------------------------------------------------------------------------- */

export interface CheckOutcome {
  passed: boolean;
  evidence: Record<string, unknown>;
}

export interface DeliveryProbeInput {
  productionUrl: string;
  primaryDomain: string | null;
  /** Etat du domaine dans le projet Cloudflare du site. */
  domainStatus: 'pending' | 'active' | 'error' | null;
  latestProduction: ProviderDeployment | null;
  fetchImpl?: FetchImpl;
}

export interface DeliveryProbeResult {
  deployed: CheckOutcome;
  domain: CheckOutcome;
  https: CheckOutcome;
  seo: CheckOutcome;
}

function summarize(probe: ProbeResult) {
  return {
    url: probe.url,
    status: probe.status,
    finalUrl: probe.finalUrl,
    redirects: probe.redirects.length,
    responseMs: probe.responseMs,
    error: probe.error,
  };
}

export async function runDeliveryProbes(input: DeliveryProbeInput): Promise<DeliveryProbeResult> {
  const fetchImpl = input.fetchImpl;
  const production = await probeUrl(input.productionUrl, { fetchImpl });
  const deployment = input.latestProduction;

  const deployed: CheckOutcome = {
    passed: deployment?.status === 'success' && production.ok,
    evidence: {
      deployment: deployment
        ? {
            id: deployment.providerDeploymentId,
            status: deployment.status,
            commit: deployment.commitSha,
            finishedAt: deployment.finishedAt,
          }
        : null,
      production: summarize(production),
    },
  };

  const domainUrl = input.primaryDomain ? `https://${input.primaryDomain}/` : null;
  const onDomain = domainUrl ? await probeUrl(domainUrl, { fetchImpl, readBody: true }) : null;
  const domain: CheckOutcome = {
    passed: Boolean(onDomain?.ok) && input.domainStatus === 'active',
    evidence: {
      hostname: input.primaryDomain,
      cloudflare: input.domainStatus,
      probe: onDomain ? summarize(onDomain) : null,
      problem: !input.primaryDomain
        ? 'Aucun domaine principal rattaché au site.'
        : input.domainStatus !== 'active'
          ? 'Le domaine n’est pas encore actif dans le projet Cloudflare.'
          : (onDomain?.error ?? null),
    },
  };

  // HTTPS : certificat valide sur l'adresse publique, et redirection de http.
  const publicUrl = domainUrl ?? input.productionUrl;
  const secure = onDomain ?? (await probeUrl(publicUrl, { fetchImpl, readBody: true }));
  const plain = await probeUrl(publicUrl.replace(/^https:/, 'http:'), {
    fetchImpl,
    allowHttp: true,
  });
  const httpRedirects =
    plain.redirects.length > 0
      ? (plain.redirects[0] ?? '').startsWith('https://')
      : plain.status === null
        ? null
        : false;
  const https: CheckOutcome = {
    passed: secure.ok && httpRedirects !== false,
    evidence: {
      url: publicUrl,
      tls: secure.ok || (secure.status !== null && secure.status < 500),
      status: secure.status,
      httpRedirectsToHttps: httpRedirects,
      hsts: secure.headers['strict-transport-security'] ?? null,
      error: secure.error,
    },
  };

  // SEO minimum : titre, description, pas de noindex, plan du site, robots.txt.
  const html = secure.body ?? '';
  const analysis = analyzeHtml(html);
  const origin = new URL(publicUrl).origin;
  const [sitemap, robots] = await Promise.all([
    probeUrl(`${origin}/sitemap.xml`, { fetchImpl, readBody: true }),
    probeUrl(`${origin}/robots.txt`, { fetchImpl, readBody: true }),
  ]);
  const robotsText = robots.ok ? (robots.body ?? '') : '';
  const sitemapDeclared = /^\s*sitemap\s*:/im.test(robotsText);
  const blocked = robots.ok && robotsBlocksAll(robotsText);
  const noindexHeader = /noindex/i.test(secure.headers['x-robots-tag'] ?? '');
  const seoProblems: string[] = [];
  if (!analysis.title) seoProblems.push('Balise <title> absente.');
  if (!analysis.description) seoProblems.push('Meta description absente.');
  if (analysis.noindex || noindexHeader)
    seoProblems.push('La page d’accueil interdit l’indexation (noindex).');
  if (!sitemap.ok && !sitemapDeclared) seoProblems.push('Aucun plan du site (sitemap.xml).');
  if (blocked) seoProblems.push('robots.txt bloque tous les moteurs de recherche.');
  if (!analysis.lang) seoProblems.push('Langue de la page non déclarée (<html lang>).');
  const seo: CheckOutcome = {
    passed: secure.ok && seoProblems.length === 0,
    evidence: {
      url: publicUrl,
      title: analysis.title,
      description: analysis.description,
      lang: analysis.lang,
      viewport: analysis.viewport,
      h1: analysis.h1,
      canonical: analysis.canonical,
      sitemap: sitemap.ok ? sitemap.status : sitemapDeclared ? 'declared' : null,
      robots: robots.ok,
      problems: seoProblems,
    },
  };

  return { deployed, domain, https, seo };
}

/** Surveillance : le site repond-il, en HTTPS, en moins de 10 secondes ? */
export async function checkSiteHealth(url: string, fetchImpl?: FetchImpl) {
  const probe = await probeUrl(url, { fetchImpl, timeoutMs: 10_000 });
  return { ok: probe.ok, status: probe.status, responseMs: probe.responseMs, error: probe.error };
}
