/**
 * Lecture des statistiques d'un site (`daily_site_metrics`) pour l'espace
 * client.
 *
 * Le détail de chaque journée (`breakdown`) est du JSON écrit par la base :
 * il est relu défensivement, jamais supposé bien formé. Aucune valeur n'est
 * extrapolée : une journée sans ligne compte zéro, et une variation n'est
 * affichée que si la période précédente contient des mesures.
 */

export interface MetricsRow {
  day: string;
  pageviews: number;
  visitors: number;
  form_submissions: number;
  bookings: number;
  orders: number;
  revenue_cents: number;
  breakdown: unknown;
}

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export function parsePeriod(value: unknown): Period {
  const number = Number(Array.isArray(value) ? value[0] : value);
  return (PERIODS as readonly number[]).includes(number) ? (number as Period) : 30;
}

/** Jour AAAA-MM-JJ, `offset` jours avant `today`. */
export function dayOffset(today: string, offset: number): string {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/** Les `period` derniers jours, du plus ancien au plus récent, sans trou. */
export function daySeries(today: string, period: number): string[] {
  return Array.from({ length: period }, (_, index) => dayOffset(today, period - 1 - index));
}

export interface Totals {
  pageviews: number;
  visitors: number;
  contacts: number;
  orders: number;
  revenueCents: number;
}

export function totalsOf(rows: readonly MetricsRow[]): Totals {
  return rows.reduce<Totals>(
    (sum, row) => ({
      pageviews: sum.pageviews + safeInt(row.pageviews),
      visitors: sum.visitors + safeInt(row.visitors),
      contacts:
        sum.contacts + safeInt(row.form_submissions) + safeInt(row.bookings) + safeInt(row.orders),
      orders: sum.orders + safeInt(row.orders),
      revenueCents: sum.revenueCents + safeInt(row.revenue_cents),
    }),
    { pageviews: 0, visitors: 0, contacts: 0, orders: 0, revenueCents: 0 },
  );
}

/**
 * Variation en points de base par rapport à la période précédente. `null`
 * quand la période précédente n'a aucune mesure : « +100 % » depuis rien ne
 * veut rien dire.
 */
export function deltaBps(current: number, previous: number, previousMeasured: boolean) {
  if (!previousMeasured || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 10_000);
}

function safeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function entries(breakdown: unknown, key: string): Array<Record<string, unknown>> {
  if (typeof breakdown !== 'object' || breakdown === null) return [];
  const list = (breakdown as Record<string, unknown>)[key];
  return Array.isArray(list)
    ? list.filter(
        (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null,
      )
    : [];
}

function mergeRanked(
  rows: readonly MetricsRow[],
  key: string,
  nameKey: string,
  valueKey: string,
  limit: number,
): Array<{ name: string; value: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const entry of entries(row.breakdown, key)) {
      const name = entry[nameKey];
      if (typeof name !== 'string' || !name) continue;
      totals.set(name, (totals.get(name) ?? 0) + safeInt(entry[valueKey]));
    }
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function topPages(rows: readonly MetricsRow[], limit = 10) {
  return mergeRanked(rows, 'top_pages', 'path', 'views', limit).map((entry) => ({
    path: entry.name,
    views: entry.value,
  }));
}

export function topSources(rows: readonly MetricsRow[], limit = 8) {
  return mergeRanked(rows, 'sources', 'source', 'visits', limit).map((entry) => ({
    host: entry.name,
    label: sourceLabel(entry.name),
    visits: entry.value,
  }));
}

export function topCountries(rows: readonly MetricsRow[], limit = 6) {
  return mergeRanked(rows, 'countries', 'country', 'visitors', limit).map((entry) => ({
    code: entry.name,
    label: countryLabel(entry.name),
    visitors: entry.value,
  }));
}

export const DEVICE_LABELS = {
  mobile: 'Téléphone',
  desktop: 'Ordinateur',
  tablet: 'Tablette',
} as const;

export function deviceSplit(rows: readonly MetricsRow[]) {
  const totals = { mobile: 0, desktop: 0, tablet: 0 };
  for (const row of rows) {
    const breakdown = row.breakdown;
    if (typeof breakdown !== 'object' || breakdown === null) continue;
    const devices = (breakdown as Record<string, unknown>)['devices'];
    if (typeof devices !== 'object' || devices === null) continue;
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      totals[key] += safeInt((devices as Record<string, unknown>)[key]);
    }
  }
  const sum = totals.mobile + totals.desktop + totals.tablet;
  return (Object.keys(totals) as Array<keyof typeof totals>)
    .map((key) => ({
      key,
      label: DEVICE_LABELS[key],
      visitors: totals[key],
      share: sum > 0 ? totals[key] / sum : 0,
    }))
    .filter((entry) => entry.visitors > 0)
    .sort((a, b) => b.visitors - a.visitors);
}

/**
 * Nom lisible d'une source. Les grandes plateformes sont nommées ; un autre
 * site reste affiché par son adresse, qui est l'information utile.
 */
const KNOWN_SOURCES: Array<[RegExp, string]> = [
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)qwant\.com$/, 'Qwant'],
  [/(^|\.)ecosia\.org$/, 'Ecosia'],
  [/(^|\.)yahoo\.[a-z.]+$/, 'Yahoo'],
  [/(^|\.)(facebook\.com|fb\.me)$/, 'Facebook'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'LinkedIn'],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'X (Twitter)'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)pinterest\.[a-z.]+$/, 'Pinterest'],
  [/(^|\.)youtube\.com$/, 'YouTube'],
  [/(^|\.)(pagesjaunes\.fr|solocal\.com)$/, 'PagesJaunes'],
  [/(^|\.)tripadvisor\.[a-z.]+$/, 'Tripadvisor'],
  [/(^|\.)(maps\.apple\.com)$/, 'Plans (Apple)'],
  [/(^|\.)chatgpt\.com$|(^|\.)openai\.com$/, 'ChatGPT'],
  [/(^|\.)perplexity\.ai$/, 'Perplexity'],
];

export function sourceLabel(host: string): string {
  const value = host.toLowerCase();
  for (const [pattern, label] of KNOWN_SOURCES) if (pattern.test(value)) return label;
  return value;
}

const COUNTRY_NAMES = (() => {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' });
  } catch {
    return null;
  }
})();

export function countryLabel(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return COUNTRY_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Graduations « rondes » pour un axe partant de zéro : 1, 2, 5 × 10ⁿ. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const step of [1, 2, 5, 10]) {
    if (value <= step * base) return step * base;
  }
  return 10 * base;
}
