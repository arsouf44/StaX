import { visitorHash } from '@stax/security';
import type { UUID } from '@stax/types';

/**
 * Statistiques respectueuses de la vie privee.
 *
 * Aucun cookie de mesure, aucune adresse IP conservee, aucun identifiant
 * stable d un jour sur l autre. L empreinte de visiteur est salee par jour ET
 * par site : elle permet de compter des visiteurs uniques sur une journee,
 * rien de plus. Aucun suivi inter-sites n est techniquement possible.
 *
 * Consequence : la mesure d audience de base ne releve pas du consentement
 * prealable au sens des lignes directrices de la CNIL sur les cookies, puisque
 * aucune information n est lue ni ecrite dans le terminal du visiteur.
 */

export type AnalyticsEventKind =
  'pageview' | 'form_submit' | 'booking' | 'purchase' | 'click' | 'outbound';

export interface AnalyticsEventInput {
  siteId: UUID;
  kind: AnalyticsEventKind;
  path: string;
  /** Utilisee uniquement pour calculer une empreinte, jamais stockee. */
  ip: string | null;
  userAgent: string | null;
  referrer: string | null;
  country?: string | null;
  durationMs?: number | null;
  /** Identifiant de session cote client, non persistant (sessionStorage). */
  sessionId?: string | null;
  metadata?: Record<string, string | number | boolean>;
}

export interface AnalyticsEventRow {
  site_id: string;
  visitor_hash: string;
  session_hash: string | null;
  kind: AnalyticsEventKind;
  path: string;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
}

/** Robots connus : leurs visites ne sont pas comptees comme du trafic humain. */
const BOT_PATTERN =
  /(bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|lighthouse|pingdom|headless|curl|wget|python-requests|axios|postman)/i;

export function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_PATTERN.test(userAgent);
}

/**
 * Famille de navigateur et systeme, sans empreinte fine.
 * On conserve volontairement peu de granularite : « Chrome sur Android »
 * suffit a un professionnel, et ne permet pas d isoler un individu.
 */
export function parseUserAgent(userAgent: string | null): {
  device: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
} {
  const ua = userAgent ?? '';
  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua);
  const isMobile = !isTablet && /Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua);

  let browser = 'Autre';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Samsung/i.test(ua)) browser = 'Samsung Internet';

  let os = 'Autre';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return { device: isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop', browser, os };
}

/** Hote du referent uniquement : jamais l URL complete, souvent porteuse de donnees. */
export function referrerHost(referrer: string | null, ownHost: string): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === ownHost.toLowerCase().replace(/^www\./, '')) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

export function parseUtm(rawUrl: string): {
  source: string | null;
  medium: string | null;
  campaign: string | null;
} {
  try {
    const url = new URL(rawUrl, 'https://placeholder.invalid');
    const clean = (value: string | null) =>
      value ? value.slice(0, 80).replace(/[^\w\s.-]/g, '') : null;
    return {
      source: clean(url.searchParams.get('utm_source')),
      medium: clean(url.searchParams.get('utm_medium')),
      campaign: clean(url.searchParams.get('utm_campaign')),
    };
  } catch {
    return { source: null, medium: null, campaign: null };
  }
}

/** Normalise un chemin : sans requete, sans fragment, longueur bornee. */
export function normalizeAnalyticsPath(path: string): string {
  const withoutQuery = path.split('?')[0]?.split('#')[0] ?? '/';
  const normalized = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '').slice(0, 300) : '/';
}

export async function buildAnalyticsEvent(
  input: AnalyticsEventInput,
  ownHost: string,
): Promise<AnalyticsEventRow | null> {
  if (isBot(input.userAgent)) return null;

  const hash = await visitorHash({
    ip: input.ip,
    userAgent: input.userAgent,
    siteId: input.siteId,
  });
  const agent = parseUserAgent(input.userAgent);
  const utm = parseUtm(input.path);

  return {
    site_id: input.siteId,
    visitor_hash: hash,
    session_hash: input.sessionId ? input.sessionId.slice(0, 64) : null,
    kind: input.kind,
    path: normalizeAnalyticsPath(input.path),
    referrer_host: referrerHost(input.referrer, ownHost),
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    device: agent.device,
    browser: agent.browser,
    os: agent.os,
    country: input.country ? input.country.slice(0, 2).toUpperCase() : null,
    duration_ms:
      typeof input.durationMs === 'number' && input.durationMs >= 0
        ? Math.min(Math.round(input.durationMs), 3_600_000)
        : null,
    metadata: input.metadata ?? {},
  };
}
