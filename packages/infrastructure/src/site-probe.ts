import { guardOutboundUrl, isPrivateHost } from '@nemasus/security';
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
          'user-agent': 'Nemasus-Verification/1.0 (+https://nemasus.fr)',
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

/* -------------------------------------------------------------------------- */
/*  Bilan qualite d'un site livre (hebdomadaire, et a la demande)              */
/* -------------------------------------------------------------------------- */

export type QualityStatus = 'pass' | 'warn' | 'fail';

export interface QualityCheck {
  key: string;
  label: string;
  status: QualityStatus;
  /** Ce qui a ete constate, en francais courant. */
  detail: string;
  /** Ce qu'il faut faire, quand ce n'est pas bon. */
  advice: string | null;
}

export interface QualityReport {
  url: string;
  finalUrl: string | null;
  score: number;
  maxScore: number;
  responseMs: number | null;
  pageBytes: number | null;
  checks: QualityCheck[];
}

const POINTS: Record<QualityStatus, number> = { pass: 2, warn: 1, fail: 0 };

function check(
  key: string,
  label: string,
  status: QualityStatus,
  detail: string,
  advice: string | null = null,
): QualityCheck {
  return { key, label, status, detail, advice: status === 'pass' ? null : advice };
}

/** Balises <link> d'un type donne (icone, feuille de style…). */
function linkTags(html: string, rel: RegExp): string[] {
  return (html.match(/<link\b[^>]*>/gi) ?? []).filter((tag) =>
    rel.test(tag.match(/\brel=["']([^"']+)["']/i)?.[1] ?? ''),
  );
}

/**
 * Bilan d'une page d'accueil publiee : ce qu'un visiteur, un moteur de
 * recherche et un reseau social en voient. Chaque controle donne sa preuve
 * et, s'il echoue, ce qu'il faut faire. Aucun controle n'est « suppose » :
 * une page injoignable donne un bilan en echec, pas un bilan vide.
 */
export async function runQualityAudit(url: string, fetchImpl?: FetchImpl): Promise<QualityReport> {
  const page = await probeUrl(url, { fetchImpl, readBody: true, timeoutMs: 15_000 });
  const checks: QualityCheck[] = [];

  if (!page.ok) {
    checks.push(
      check(
        'reachable',
        'Le site répond en HTTPS',
        'fail',
        page.error ?? `Réponse ${page.status ?? 'absente'}.`,
        'Le site doit répondre en HTTPS avant tout autre contrôle : l’équipe Nemasus est prévenue.',
      ),
    );
    return {
      url,
      finalUrl: page.finalUrl,
      score: 0,
      maxScore: POINTS.pass,
      responseMs: page.responseMs,
      pageBytes: null,
      checks,
    };
  }

  const html = page.body ?? '';
  const bytes = new TextEncoder().encode(html).length;
  const seo = analyzeHtml(html);
  const origin = new URL(page.finalUrl ?? url).origin;
  const metas = metaTags(html.slice(0, 200_000));
  const property = (name: string) =>
    metas.find((meta) => (meta['property'] ?? meta['name'])?.toLowerCase() === name)?.['content'];

  const [plain, robots, sitemap] = await Promise.all([
    probeUrl(origin.replace(/^https:/, 'http:') + '/', { fetchImpl, allowHttp: true }),
    probeUrl(`${origin}/robots.txt`, { fetchImpl, readBody: true }),
    probeUrl(`${origin}/sitemap.xml`, { fetchImpl }),
  ]);

  checks.push(
    check('reachable', 'Le site répond en HTTPS', 'pass', `Réponse ${page.status} en HTTPS.`),
  );

  const redirectsToHttps = (plain.redirects[0] ?? '').startsWith('https://');
  checks.push(
    check(
      'http_redirect',
      'L’adresse sans « s » mène à la version sécurisée',
      redirectsToHttps ? 'pass' : 'warn',
      redirectsToHttps
        ? 'http:// redirige vers https://.'
        : 'http:// ne redirige pas vers https:// : un visiteur peut arriver sur une page non chiffrée.',
      'Activer « Always Use HTTPS » dans le projet Cloudflare du site.',
    ),
  );

  const hsts = page.headers['strict-transport-security'];
  checks.push(
    check(
      'hsts',
      'Le navigateur retient la connexion sécurisée (HSTS)',
      hsts ? 'pass' : 'warn',
      hsts ? `En-tête présent : ${hsts}.` : 'En-tête Strict-Transport-Security absent.',
      'Activer HSTS dans le projet Cloudflare du site (SSL/TLS → Edge Certificates).',
    ),
  );

  const ms = page.responseMs ?? 0;
  checks.push(
    check(
      'speed',
      'La page répond vite',
      ms < 800 ? 'pass' : ms < 2_000 ? 'warn' : 'fail',
      `Première réponse en ${ms} ms.`,
      'Réponse lente : vérifier le cache et le poids de la page d’accueil.',
    ),
  );

  checks.push(
    check(
      'weight',
      'La page d’accueil reste légère',
      bytes < 150_000 ? 'pass' : bytes < 400_000 ? 'warn' : 'fail',
      `${Math.round(bytes / 1024)} Ko de HTML.`,
      'Page lourde : alléger le HTML (scripts ou styles intégrés, contenus dupliqués).',
    ),
  );

  const titleLength = seo.title?.length ?? 0;
  checks.push(
    check(
      'title',
      'Titre de la page (affiché par Google)',
      !seo.title ? 'fail' : titleLength >= 10 && titleLength <= 65 ? 'pass' : 'warn',
      seo.title ? `« ${seo.title} » (${titleLength} caractères).` : 'Aucun titre.',
      seo.title
        ? 'Un titre de 10 à 65 caractères s’affiche en entier dans les résultats de recherche.'
        : 'Ajouter un titre à la page d’accueil (référencement de l’éditeur).',
    ),
  );

  const descriptionLength = seo.description?.length ?? 0;
  checks.push(
    check(
      'description',
      'Description (le texte sous le titre dans Google)',
      !seo.description
        ? 'fail'
        : descriptionLength >= 50 && descriptionLength <= 160
          ? 'pass'
          : 'warn',
      seo.description ? `${descriptionLength} caractères.` : 'Aucune description.',
      seo.description
        ? 'Une description de 50 à 160 caractères donne envie de cliquer sans être coupée.'
        : 'Écrire une description de la page d’accueil dans l’éditeur (référencement).',
    ),
  );

  checks.push(
    check(
      'h1',
      'Un titre principal unique',
      seo.h1 === 1 ? 'pass' : seo.h1 === 0 ? 'fail' : 'warn',
      seo.h1 === 0 ? 'Aucun titre <h1>.' : `${seo.h1} titre(s) <h1>.`,
      'Une page doit avoir exactement un titre principal (<h1>).',
    ),
  );

  checks.push(
    check(
      'mobile',
      'Adaptée aux téléphones',
      seo.viewport ? 'pass' : 'fail',
      seo.viewport ? 'Balise viewport présente.' : 'Balise viewport absente.',
      'Sans balise viewport, la page s’affiche en miniature sur téléphone.',
    ),
  );

  checks.push(
    check(
      'lang',
      'Langue déclarée',
      seo.lang ? 'pass' : 'warn',
      seo.lang ? `Langue : ${seo.lang}.` : 'Aucune langue déclarée.',
      'Déclarer la langue (<html lang="fr">) : lecteurs d’écran et moteurs de recherche s’en servent.',
    ),
  );

  const noindexHeader = /noindex/i.test(page.headers['x-robots-tag'] ?? '');
  const robotsText = robots.ok ? (robots.body ?? '') : '';
  const blocked = robots.ok && robotsBlocksAll(robotsText);
  const indexable = !seo.noindex && !noindexHeader && !blocked;
  checks.push(
    check(
      'indexable',
      'Visible dans les moteurs de recherche',
      indexable ? 'pass' : 'fail',
      indexable
        ? 'Aucune consigne n’interdit l’indexation.'
        : blocked
          ? 'robots.txt interdit l’accès à tous les moteurs.'
          : 'La page demande à ne pas être indexée (noindex).',
      'Le site n’apparaîtra pas dans Google tant que cette consigne reste en place.',
    ),
  );

  const sitemapDeclared = /^\s*sitemap\s*:/im.test(robotsText);
  checks.push(
    check(
      'sitemap',
      'Plan du site pour les moteurs',
      sitemap.ok || sitemapDeclared ? 'pass' : 'warn',
      sitemap.ok
        ? 'sitemap.xml disponible.'
        : sitemapDeclared
          ? 'Plan du site déclaré dans robots.txt.'
          : 'Aucun sitemap.xml trouvé.',
      'Publier un sitemap.xml aide les moteurs à trouver toutes les pages.',
    ),
  );

  const ogTitle = property('og:title');
  const ogImage = property('og:image');
  checks.push(
    check(
      'social',
      'Aperçu lors d’un partage (Facebook, WhatsApp, LinkedIn)',
      ogTitle && ogImage ? 'pass' : 'warn',
      ogTitle && ogImage
        ? 'Titre et image de partage présents.'
        : ogTitle
          ? 'Titre de partage présent, image absente.'
          : 'Aucune balise Open Graph.',
      'Ajouter une image de partage : un lien partagé sans image est bien moins cliqué.',
    ),
  );

  let favicon = linkTags(html, /(^|\s)(shortcut\s+)?icon(\s|$)|apple-touch-icon/i).length > 0;
  if (!favicon) favicon = (await probeUrl(`${origin}/favicon.ico`, { fetchImpl })).ok;
  checks.push(
    check(
      'favicon',
      'Icône dans l’onglet du navigateur',
      favicon ? 'pass' : 'warn',
      favicon ? 'Icône présente.' : 'Aucune icône (favicon).',
      'Ajouter une icône : elle identifie le site dans les onglets et les favoris.',
    ),
  );

  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const withoutAlt = images.filter((tag) => !/\balt\s*=/i.test(tag)).length;
  checks.push(
    check(
      'images_alt',
      'Images décrites pour les personnes malvoyantes',
      withoutAlt === 0 ? 'pass' : 'warn',
      images.length === 0
        ? 'Aucune image sur la page d’accueil.'
        : withoutAlt === 0
          ? `${images.length} image(s), toutes décrites.`
          : `${withoutAlt} image(s) sur ${images.length} sans texte alternatif.`,
      'Renseigner le texte alternatif de chaque photo dans l’éditeur.',
    ),
  );

  const insecure = (html.match(/\b(?:src|href)\s*=\s*["']http:\/\/[^"']+/gi) ?? []).filter(
    (attribute) => !/^href/i.test(attribute) || /\.(css|js)(\?|["']|$)/i.test(attribute),
  ).length;
  checks.push(
    check(
      'mixed_content',
      'Aucune ressource chargée sans chiffrement',
      insecure === 0 ? 'pass' : 'fail',
      insecure === 0
        ? 'Toutes les ressources sont en HTTPS.'
        : `${insecure} ressource(s) en http:// : le navigateur les bloque.`,
      'Remplacer les adresses http:// des images, scripts et styles par https://.',
    ),
  );

  const score = checks.reduce((total, item) => total + POINTS[item.status], 0);
  return {
    url,
    finalUrl: page.finalUrl,
    score,
    maxScore: checks.length * POINTS.pass,
    responseMs: page.responseMs,
    pageBytes: bytes,
    checks,
  };
}
