import { describe, expect, it } from 'vitest';
import { audienceScript, pageViewSignal, sourceHost } from '@nemasus/analytics';
import {
  daySeries,
  deltaBps,
  deviceSplit,
  niceMax,
  parsePeriod,
  sourceLabel,
  topPages,
  topSources,
  totalsOf,
  type MetricsRow,
} from '~/lib/audience';

/**
 * Statistiques des sites (audit du 2026-09-30).
 *
 * La mesure ne retient que le chemin, l'hôte du référent et le type
 * d'appareil ; un robot n'est pas un visiteur ; la page du client relit le
 * détail JSON sans lui faire confiance et ne fabrique aucune variation.
 */

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const GOOGLEBOT =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

describe('ce que la mesure retient d’une visite', () => {
  it('écarte les robots et les appels sans navigateur', () => {
    const base = { path: '/', referrer: null, ownHosts: ['boulangerie.example'] };
    expect(pageViewSignal({ ...base, userAgent: GOOGLEBOT })).toBeNull();
    expect(pageViewSignal({ ...base, userAgent: 'curl/8.5.0' })).toBeNull();
    expect(pageViewSignal({ ...base, userAgent: null })).toBeNull();
  });

  it('classe l’appareil sans garder le navigateur', () => {
    const base = { path: '/', referrer: null, ownHosts: [] };
    expect(pageViewSignal({ ...base, userAgent: CHROME_ANDROID })?.device).toBe('mobile');
    expect(pageViewSignal({ ...base, userAgent: SAFARI_MAC })?.device).toBe('desktop');
    expect(pageViewSignal({ ...base, userAgent: IPAD })?.device).toBe('tablet');
  });

  it('ne garde jamais la requête ni le fragment d’une adresse', () => {
    const signal = pageViewSignal({
      path: '/merci?email=jeanne%40example.com#confirmation',
      referrer: null,
      userAgent: SAFARI_MAC,
      ownHosts: [],
    });
    expect(signal?.path).toBe('/merci');
    expect(
      pageViewSignal({
        path: 'javascript:alert(1)',
        referrer: null,
        userAgent: SAFARI_MAC,
        ownHosts: [],
      })?.path,
    ).toBe('/');
  });

  it('réduit le référent à un hôte et ignore le site lui-même', () => {
    expect(sourceHost('https://www.google.fr/search?q=pain', [])).toBe('google.fr');
    expect(sourceHost('L.Facebook.com', [])).toBe('l.facebook.com');
    expect(sourceHost('https://www.boulangerie.example/carte', ['boulangerie.example'])).toBeNull();
    expect(sourceHost('pas un hote', [])).toBeNull();
    expect(sourceHost(42, [])).toBeNull();
  });
});

describe('script de mesure des sites indépendants', () => {
  const script = audienceScript('https://api.example/v1/sites/pk_site_x/collect');

  it('n’écrit ni cookie ni stockage, et ne mesure pas l’aperçu de l’éditeur', () => {
    expect(script).not.toMatch(/document\.cookie|localStorage|sessionStorage|indexedDB/);
    expect(script).toContain('w.self !== w.top');
    expect(script).toContain('globalPrivacyControl');
    expect(script).toContain('"https://api.example/v1/sites/pk_site_x/collect"');
  });

  it('échappe l’adresse de collecte', () => {
    expect(audienceScript('https://a.example/"</script>')).toContain('\\"</script>');
  });
});

function row(day: string, extra: Partial<MetricsRow> = {}): MetricsRow {
  return {
    day,
    pageviews: 0,
    visitors: 0,
    form_submissions: 0,
    bookings: 0,
    orders: 0,
    revenue_cents: 0,
    breakdown: {},
    ...extra,
  };
}

describe('lecture des statistiques dans l’espace client', () => {
  it('fusionne les pages et les sources de plusieurs jours', () => {
    const rows = [
      row('2026-09-29', {
        breakdown: {
          top_pages: [
            { path: '/', views: 4 },
            { path: '/carte', views: 2 },
          ],
          sources: [{ source: 'google.fr', visits: 3 }],
        },
      }),
      row('2026-09-30', {
        breakdown: {
          top_pages: [{ path: '/carte', views: 5 }],
          sources: [
            { source: 'google.fr', visits: 1 },
            { source: 'instagram.com', visits: 2 },
          ],
        },
      }),
    ];
    expect(topPages(rows)).toEqual([
      { path: '/carte', views: 7 },
      { path: '/', views: 4 },
    ]);
    expect(topSources(rows).map((s) => [s.label, s.visits])).toEqual([
      ['Google', 4],
      ['Instagram', 2],
    ]);
  });

  it('ignore un détail JSON mal formé au lieu d’échouer', () => {
    const rows = [
      row('2026-09-30', { breakdown: { top_pages: 'oups', sources: [null, { source: 3 }] } }),
      row('2026-09-30', { breakdown: null }),
      row('2026-09-30', { breakdown: { devices: { mobile: 'beaucoup', desktop: 2 } } }),
    ];
    expect(topPages(rows)).toEqual([]);
    expect(topSources(rows)).toEqual([]);
    expect(deviceSplit(rows)).toEqual([
      { key: 'desktop', label: 'Ordinateur', visitors: 2, share: 1 },
    ]);
  });

  it('additionne les prises de contact et l’encaissé', () => {
    const totals = totalsOf([
      row('2026-09-29', { form_submissions: 2, bookings: 1, orders: 1, revenue_cents: 4500 }),
      row('2026-09-30', { visitors: 10, pageviews: 30, orders: 2, revenue_cents: 1000 }),
    ]);
    expect(totals).toEqual({
      pageviews: 30,
      visitors: 10,
      contacts: 6,
      orders: 3,
      revenueCents: 5500,
    });
  });

  it('n’affiche pas de variation sans mesure précédente', () => {
    expect(deltaBps(10, 0, false)).toBeNull();
    expect(deltaBps(10, 0, true)).toBeNull();
    expect(deltaBps(15, 10, true)).toBe(5000);
    expect(deltaBps(5, 10, true)).toBe(-5000);
  });

  it('produit une série continue et une période connue', () => {
    expect(daySeries('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
    expect(parsePeriod('7')).toBe(7);
    expect(parsePeriod(['90'])).toBe(90);
    expect(parsePeriod('365')).toBe(30);
    expect(parsePeriod(undefined)).toBe(30);
  });

  it('nomme les grandes sources et garde l’adresse des autres', () => {
    expect(sourceLabel('google.fr')).toBe('Google');
    expect(sourceLabel('m.facebook.com')).toBe('Facebook');
    expect(sourceLabel('t.co')).toBe('X (Twitter)');
    expect(sourceLabel('mairie-exemple.fr')).toBe('mairie-exemple.fr');
  });

  it('arrondit l’axe à une graduation lisible', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(420)).toBe(500);
    expect(niceMax(1000)).toBe(1000);
  });
});
