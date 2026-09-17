import type { Cents, UUID } from '@stax/types';

/**
 * Agregation quotidienne.
 *
 * Les evenements bruts ont une duree de vie courte : ils sont agreges chaque
 * nuit dans daily_site_metrics puis purges. Le client conserve son historique,
 * la plateforme ne conserve pas de trace individuelle.
 */

export const RAW_EVENT_RETENTION_DAYS = 45;

export interface RawEvent {
  visitor_hash: string;
  session_hash: string | null;
  kind: string;
  path: string;
  referrer_host: string | null;
  utm_source: string | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface DailyRollup {
  siteId: UUID;
  day: string;
  pageviews: number;
  visitors: number;
  sessions: number;
  formSubmissions: number;
  bookings: number;
  orders: number;
  revenueCents: Cents;
  avgDurationMs: number;
  bounceRateBps: number;
  breakdown: {
    topPages: Array<{ path: string; views: number }>;
    sources: Array<{ source: string; visits: number }>;
    devices: Record<string, number>;
    browsers: Record<string, number>;
    countries: Record<string, number>;
  };
}

function topN(counts: Map<string, number>, limit: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

export function rollupDay(
  siteId: UUID,
  day: string,
  events: readonly RawEvent[],
  revenueCents: Cents = 0,
): DailyRollup {
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  const pageCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();
  const browserCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const viewsPerSession = new Map<string, number>();

  let pageviews = 0;
  let formSubmissions = 0;
  let bookings = 0;
  let orders = 0;
  let durationTotal = 0;
  let durationSamples = 0;

  for (const event of events) {
    visitors.add(event.visitor_hash);
    const sessionKey = event.session_hash ?? event.visitor_hash;
    sessions.add(sessionKey);

    if (event.kind === 'pageview') {
      pageviews += 1;
      pageCounts.set(event.path, (pageCounts.get(event.path) ?? 0) + 1);
      viewsPerSession.set(sessionKey, (viewsPerSession.get(sessionKey) ?? 0) + 1);
    }
    if (event.kind === 'form_submit') formSubmissions += 1;
    if (event.kind === 'booking') bookings += 1;
    if (event.kind === 'purchase') orders += 1;

    const source = event.utm_source ?? event.referrer_host ?? 'direct';
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
    if (event.device) deviceCounts.set(event.device, (deviceCounts.get(event.device) ?? 0) + 1);
    if (event.browser)
      browserCounts.set(event.browser, (browserCounts.get(event.browser) ?? 0) + 1);
    if (event.country)
      countryCounts.set(event.country, (countryCounts.get(event.country) ?? 0) + 1);

    if (typeof event.duration_ms === 'number') {
      durationTotal += event.duration_ms;
      durationSamples += 1;
    }
  }

  // Une session a une seule page vue est consideree comme un rebond.
  const bounced = [...viewsPerSession.values()].filter((count) => count <= 1).length;
  const bounceRateBps =
    viewsPerSession.size > 0 ? Math.round((bounced / viewsPerSession.size) * 10_000) : 0;

  return {
    siteId,
    day,
    pageviews,
    visitors: visitors.size,
    sessions: sessions.size,
    formSubmissions,
    bookings,
    orders,
    revenueCents,
    avgDurationMs: durationSamples > 0 ? Math.round(durationTotal / durationSamples) : 0,
    bounceRateBps,
    breakdown: {
      topPages: topN(pageCounts, 20).map((e) => ({ path: e.key, views: e.value })),
      sources: topN(sourceCounts, 15).map((e) => ({ source: e.key, visits: e.value })),
      devices: Object.fromEntries(deviceCounts),
      browsers: Object.fromEntries(browserCounts),
      countries: Object.fromEntries(countryCounts),
    },
  };
}

export interface MetricsSeriesPoint {
  day: string;
  pageviews: number;
  visitors: number;
  formSubmissions: number;
  bookings: number;
  orders: number;
  revenueCents: Cents;
}

export interface MetricsSummary {
  range: { from: string; to: string; days: number };
  totals: {
    pageviews: number;
    visitors: number;
    formSubmissions: number;
    bookings: number;
    orders: number;
    revenueCents: Cents;
  };
  /** Variation par rapport a la periode precedente, en points de base. */
  deltas: {
    pageviews: number | null;
    visitors: number | null;
    formSubmissions: number | null;
  };
  series: MetricsSeriesPoint[];
}

function sum(points: readonly MetricsSeriesPoint[], key: keyof MetricsSeriesPoint): number {
  return points.reduce((total, point) => total + (point[key] as number), 0);
}

/** Variation en points de base. `null` quand la periode precedente est vide. */
function delta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10_000);
}

export function summarize(
  current: readonly MetricsSeriesPoint[],
  previous: readonly MetricsSeriesPoint[],
  range: { from: string; to: string },
): MetricsSummary {
  return {
    range: { ...range, days: current.length },
    totals: {
      pageviews: sum(current, 'pageviews'),
      visitors: sum(current, 'visitors'),
      formSubmissions: sum(current, 'formSubmissions'),
      bookings: sum(current, 'bookings'),
      orders: sum(current, 'orders'),
      revenueCents: sum(current, 'revenueCents'),
    },
    deltas: {
      pageviews: delta(sum(current, 'pageviews'), sum(previous, 'pageviews')),
      visitors: delta(sum(current, 'visitors'), sum(previous, 'visitors')),
      formSubmissions: delta(sum(current, 'formSubmissions'), sum(previous, 'formSubmissions')),
    },
    series: [...current],
  };
}

/** Comble les jours sans donnee, pour un graphique continu et honnete. */
export function fillMissingDays(
  points: readonly MetricsSeriesPoint[],
  from: Date,
  to: Date,
): MetricsSeriesPoint[] {
  const index = new Map(points.map((point) => [point.day, point]));
  const result: MetricsSeriesPoint[] = [];
  const cursor = new Date(from);

  while (cursor <= to) {
    const day = cursor.toISOString().slice(0, 10);
    result.push(
      index.get(day) ?? {
        day,
        pageviews: 0,
        visitors: 0,
        formSubmissions: 0,
        bookings: 0,
        orders: 0,
        revenueCents: 0,
      },
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
