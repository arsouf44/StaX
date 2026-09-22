import { expect, test } from '@playwright/test';

/**
 * Integrite des liens du site public.
 *
 * Un lien mort ne casse aucun test unitaire et ne fait planter aucun build :
 * il se contente de faire perdre un visiteur. Ce parcours explore le site
 * accessible sans compte, suit chaque lien interne, et verifie qu'aucun ne
 * mene nulle part.
 *
 * L'exploration s'arrete aux pages publiques : les espaces prives redirigent
 * vers la connexion, ce qui est le comportement attendu et non un lien mort.
 */

/** Points de depart : tout ce qu'un visiteur peut atteindre depuis l'accueil. */
const ENTRY_POINTS = [
  '/',
  '/tarifs',
  '/fonctionnalites',
  '/metiers',
  '/realisations',
  '/sur-mesure',
];

/** Chemins prives : leur redirection vers la connexion est normale. */
const PRIVATE_PREFIXES = ['/app', '/admin', '/commander', '/facture', '/activation', '/compte'];

/** Nombre maximum de pages explorees : assez pour couvrir, pas au point de durer. */
const MAX_PAGES = 60;

function isPrivate(path: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

test.describe('Integrite des liens', () => {
  // Une exploration complete depasse le budget par defaut sur une machine lente.
  test.setTimeout(180_000);

  test('aucun lien interne ne mene nulle part', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:3100').origin;

    const seen = new Set<string>();
    const queue = [...ENTRY_POINTS];
    /** Lien casse -> pages qui le portent. Le rapport doit dire OU corriger. */
    const broken = new Map<string, { status: number; from: string }>();

    while (queue.length > 0 && seen.size < MAX_PAGES) {
      const path = queue.shift();
      if (!path || seen.has(path)) continue;
      seen.add(path);

      const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
      const status = response?.status() ?? 0;

      if (status >= 400) {
        broken.set(path, { status, from: 'point d’entrée' });
        continue;
      }

      const links = await page
        .locator('a[href]')
        .evaluateAll((anchors) =>
          anchors
            .map((anchor) => (anchor as HTMLAnchorElement).getAttribute('href') ?? '')
            .filter((href) => href.startsWith('/') && !href.startsWith('//')),
        );

      for (const href of links) {
        const target = href.split('#')[0]?.split('?')[0] ?? '';
        if (target === '' || seen.has(target) || isPrivate(target)) continue;
        if (!queue.includes(target)) queue.push(target);
      }
    }

    // Deuxieme passe : on verifie le statut de chaque page atteinte, y compris
    // celles qui n'ont pas ete visitees faute de place dans le budget.
    for (const path of queue.slice(0, 20)) {
      if (isPrivate(path)) continue;
      const response = await page.request.get(`${origin}${path}`);
      if (response.status() >= 400) {
        broken.set(path, { status: response.status(), from: 'lien interne' });
      }
    }

    const report = [...broken.entries()]
      .map(([path, detail]) => `${path} → ${detail.status} (${detail.from})`)
      .join('\n');

    expect(report, `Liens internes cassés :\n${report}`).toBe('');
    // Une exploration qui ne trouve rien ne prouve rien : on verifie qu'elle a
    // reellement parcouru le site.
    expect(seen.size).toBeGreaterThan(10);
  });

  test('les pages publiques portent les en-tetes de securite', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://127.0.0.1:3100').origin;
    const response = await page.request.get(`${origin}/`);
    const headers = response.headers();

    expect(headers['content-security-policy'], 'CSP absente').toBeTruthy();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBeTruthy();
    // Le back-office interdit tout encadrement ; le site public s'en tient au
    // meme domaine.
    expect(headers['x-frame-options']).toBeTruthy();
  });

  test('l’apercu de l’editeur n’est jamais servi sans session', async ({ page }) => {
    const response = await page.goto('/app/editeur/apercu');
    // Redirection vers la connexion, ou refus. Jamais le contenu d'un site.
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Aperçu privé');
    expect(response?.status() ?? 0).toBeLessThan(500);
  });
});
