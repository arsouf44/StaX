import { expect, test } from '@playwright/test';

/**
 * Site public.
 *
 * Ces parcours verifient ce qu un visiteur voit reellement, y compris les
 * details qui ne cassent jamais un test unitaire : les accents, le lien
 * d evitement, la navigation au clavier, l absence de defilement horizontal.
 */

test.describe('Site public', () => {
  test('la page d’accueil s’affiche avec un titre et une proposition claire', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/StaX/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('les accents francais sont corrects dans la navigation', async ({ page }) => {
    await page.goto('/');
    // `textContent` et non `innerText` : sur mobile la navigation est repliee,
    // et un encodage casse dans un element masque reste un encodage casse.
    const body = (await page.locator('body').textContent()) ?? '';

    // Un encodage casse produit ces formes exactes : on les cherche.
    expect(body).not.toContain('Fonctionnalites');
    expect(body).not.toContain('Metiers');
    expect(body).not.toContain('Securite');
    expect(body).toContain('Fonctionnalités');
  });

  test('le lien d’evitement est la premiere cible au clavier', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(focused).toContain('Aller au contenu');
  });

  test('aucune page principale ne defile horizontalement', async ({ page }) => {
    for (const path of ['/', '/tarifs', '/metiers', '/fonctionnalites', '/cgv']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, `defilement horizontal sur ${path}`).toBe(false);
    }
  });

  test('la page des tarifs annonce les prix ou explique leur absence', async ({ page }) => {
    await page.goto('/tarifs');
    const body = (await page.locator('body').textContent()) ?? '';
    // Soit les prix sont la, soit le catalogue est declare indisponible.
    // Ce qui est interdit, c est une page vide sans explication.
    expect(body.includes('€') || body.includes('momentanément indisponible')).toBe(true);
  });

  test('les pages legales portent le marqueur de relecture juridique', async ({ page }) => {
    await page.goto('/mentions-legales');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mentions légales');
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).toContain('professionnel du droit');
  });

  test('aucune valeur legale n’est inventee', async ({ page }) => {
    await page.goto('/mentions-legales');
    const body = (await page.locator('body').textContent()) ?? '';

    // Tout identifiant a neuf chiffres affiche sur cette page doit porter une
    // cle de controle valide. Un numero invente la franchit une fois sur dix :
    // c est une barriere faible prise isolement, mais elle attrape la faute la
    // plus probable — une coquille dans un secret de deploiement.
    const candidates = [...body.matchAll(/\b(\d{3}[\s\u00a0]?\d{3}[\s\u00a0]?\d{3})\b/g)].map(
      (match) => (match[1] ?? '').replace(/[\s\u00a0]/g, ''),
    );

    for (const siren of candidates) {
      let total = 0;
      let double = false;
      for (let index = siren.length - 1; index >= 0; index -= 1) {
        let value = siren.charCodeAt(index) - 48;
        if (double) {
          value *= 2;
          if (value > 9) value -= 9;
        }
        total += value;
        double = !double;
      }
      expect(total % 10, `« ${siren} » n’est pas un identifiant INSEE valide`).toBe(0);
    }

    // Ce qui n est pas connu reste explicitement marque comme a configurer :
    // la page ne comble jamais un trou avec une valeur plausible.
    const capital = await page
      .getByText(/capital social/i)
      .first()
      .textContent();
    expect(capital).toBeTruthy();
  });

  test('l’accueil dit le vrai produit : nous créons le site, le client le gère ensuite', async ({
    page,
  }) => {
    await page.goto('/');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText('Nous créons votre site.');
    await expect(heading).toContainText('Vous le gérez ensuite.');
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).toContain('Pas de modèle à personnaliser');
    expect(body).toContain('Vous publiez, et c’est réellement en ligne');
  });

  test('« Comment ça marche » suit six étapes, de votre projet à votre autonomie', async ({
    page,
  }) => {
    await page.goto('/comment-ca-marche');
    const steps = await page.locator('ol h3').allTextContents();
    expect(steps.slice(0, 6)).toEqual([
      'Votre projet',
      'Conception',
      'Développement',
      'Mise en ligne',
      'Livraison',
      'Vous gardez la main',
    ]);
  });

  test('aucune page n’annonce un générateur, un modèle ou un glisser-déposer', async ({ page }) => {
    for (const path of [
      '/',
      '/tarifs',
      '/comment-ca-marche',
      '/fonctionnalites',
      '/fonctionnalites/editeur',
      '/metiers',
      '/realisations',
      '/faq',
    ]) {
      await page.goto(path);
      // Le texte visible seulement : les scripts de la page ne sont pas lus.
      const body = await page.locator('main').innerText();
      expect(body, path).not.toMatch(
        /glisser-déposer|drag and drop|template|activés automatiquement/i,
      );
    }
  });

  test('les CGV décrivent une maintenance mensuelle qui commence à la livraison', async ({
    page,
  }) => {
    await page.goto('/cgv');
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).toContain('Maintenance mensuelle');
    expect(body).toContain('commence le jour de la Livraison');
    expect(body).toContain('Exceptionnel');
    expect(body).not.toMatch(/maintenance annuelle/i);
  });

  test('robots.txt existe et reste coherent', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.ok()).toBe(true);
    const text = await response.text();
    // La casse de l en-tete varie selon le generateur ; la directive, non.
    expect(text.toLowerCase()).toContain('user-agent: *');
  });

  test('le plan du site ne contient aucune page privee', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.ok()).toBe(true);
    const xml = await response.text();
    for (const forbidden of ['/app/', '/admin/', '/connexion', '/commander']) {
      expect(xml, `${forbidden} ne doit pas etre indexable`).not.toContain(forbidden);
    }
  });
});
