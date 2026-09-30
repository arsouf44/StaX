import { describe, expect, it } from 'vitest';
import { runQualityAudit } from '@nemasus/infrastructure';

/**
 * Bilan qualité d'un site livré : chaque contrôle mesure la vraie page, et
 * une page injoignable donne un bilan en échec — jamais un bilan vide ou
 * flatteur.
 */

type Route = { status: number; body?: string; headers?: Record<string, string> };

function fakeFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const route = routes[url];
    if (!route) return new Response('introuvable', { status: 404 });
    return new Response(route.body ?? '', { status: route.status, headers: route.headers });
  }) as typeof fetch;
}

const GOOD_PAGE = `<!doctype html><html lang="fr"><head>
<title>Boulangerie Martin — pain au levain à Lyon</title>
<meta name="description" content="Pain au levain, viennoiseries et pâtisseries faits chaque matin dans notre fournil du 7e arrondissement de Lyon.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="Boulangerie Martin"><meta property="og:image" content="https://boulangerie.example/og.jpg">
<link rel="icon" href="/favicon.svg"></head>
<body><h1>Boulangerie Martin</h1><img src="https://boulangerie.example/pain.jpg" alt="Pain au levain"></body></html>`;

describe('bilan qualité', () => {
  it('un site soigné obtient la note maximale, preuve à l’appui', async () => {
    const report = await runQualityAudit(
      'https://boulangerie.example/',
      fakeFetch({
        'https://boulangerie.example/': {
          status: 200,
          body: GOOD_PAGE,
          headers: { 'strict-transport-security': 'max-age=31536000' },
        },
        'http://boulangerie.example/': {
          status: 301,
          headers: { location: 'https://boulangerie.example/' },
        },
        'https://boulangerie.example/robots.txt': {
          status: 200,
          body: 'User-agent: *\nAllow: /\nSitemap: https://boulangerie.example/sitemap.xml',
        },
        'https://boulangerie.example/sitemap.xml': { status: 200, body: '<urlset/>' },
      }),
    );
    const failing = report.checks.filter((check) => check.status !== 'pass');
    expect(failing).toEqual([]);
    expect(report.score).toBe(report.maxScore);
    expect(report.checks.every((check) => check.advice === null)).toBe(true);
  });

  it('dit ce qui ne va pas, et quoi faire', async () => {
    const page = `<html><head><title>Accueil</title><meta name="robots" content="noindex"></head>
<body><h1>A</h1><h1>B</h1><img src="http://cdn.example/x.jpg"><script src="http://cdn.example/app.js"></script></body></html>`;
    const report = await runQualityAudit(
      'https://mal.example/',
      fakeFetch({ 'https://mal.example/': { status: 200, body: page } }),
    );
    const byKey = Object.fromEntries(report.checks.map((check) => [check.key, check]));
    expect(byKey['indexable']?.status).toBe('fail');
    expect(byKey['description']?.status).toBe('fail');
    expect(byKey['mobile']?.status).toBe('fail');
    expect(byKey['mixed_content']?.status).toBe('fail');
    expect(byKey['mixed_content']?.detail).toContain('2 ressource');
    expect(byKey['title']?.status).toBe('warn');
    expect(byKey['h1']?.status).toBe('warn');
    expect(byKey['images_alt']?.status).toBe('warn');
    expect(byKey['http_redirect']?.status).toBe('warn');
    expect(byKey['indexable']?.advice).toBeTruthy();
    expect(report.score).toBeLessThan(report.maxScore / 2);
  });

  it('un site injoignable donne un bilan en échec, pas un bilan vide', async () => {
    const report = await runQualityAudit(
      'https://panne.example/',
      fakeFetch({ 'https://panne.example/': { status: 503, body: 'indisponible' } }),
    );
    expect(report.score).toBe(0);
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0]?.status).toBe('fail');
  });

  it('refuse d’interroger une adresse interne (SSRF)', async () => {
    const report = await runQualityAudit('https://127.0.0.1/', fakeFetch({}));
    expect(report.checks[0]?.status).toBe('fail');
    expect(report.score).toBe(0);
  });
});
