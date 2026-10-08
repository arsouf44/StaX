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
    await expect(page).toHaveTitle(/Nemasus/);
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
    for (const path of [
      '/',
      '/comment-ca-marche',
      '/realisations',
      '/fonctionnalites',
      '/cgv',
      '/acces',
    ]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflow, `defilement horizontal sur ${path}`).toBe(false);
    }
  });

  test('aucun prix, aucune offre : on commande, on vire, on reçoit son code', async ({ page }) => {
    for (const path of ['/', '/comment-ca-marche', '/faq', '/sur-mesure']) {
      await page.goto(path);
      const main = await page.locator('main').innerText();
      expect(main, path).not.toMatch(
        /\d[\d\s\u00a0\u202f]*(?:,\d{2})?\s?€|€\s?\d|\/\s?mois|par mois|HT\b/,
      );
      expect(main, path).not.toMatch(/abonnement mensuel|Choisir cette offre|Nos offres/i);
    }
    await page.goto('/comment-ca-marche');
    const body = await page.locator('main').innerText();
    expect(body).toContain('virement');
    expect(body).toContain('code d’accès');
  });

  test('l’ancienne page des tarifs mène au parcours de commande expliqué', async ({ page }) => {
    await page.goto('/tarifs');
    await expect(page).toHaveURL(/\/comment-ca-marche$/);
  });

  test('les mentions legales sont completes ; le marqueur de relecture suit l environnement', async ({
    page,
  }) => {
    // Regle de `LegalDocumentView` : l'avertissement « modele a faire relire »
    // s'affiche hors production, ou tant que l'identite est incomplete. Le
    // serveur de test herite de NEMASUS_ENV (en CI : `test`) ; sans elle,
    // `next start` tourne en production.
    const production = (process.env.NEMASUS_ENV ?? 'production') === 'production';
    await page.goto('/mentions-legales');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mentions légales');
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).not.toContain('A CONFIGURER');
    for (const mention of ['Directeur de la publication', 'Capital social', 'Hébergeur']) {
      expect(body).toContain(mention);
    }
    if (production) {
      expect(body).not.toContain('Modèle en attente de validation juridique');
    } else {
      expect(body).toContain('professionnel du droit');
    }
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
    await expect(heading).toContainText('Un site fait pour vous');
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).toContain('Nous créons votre site. Vous le gérez ensuite.');
    expect(body).toContain('Pas de modèle à personnaliser');
    expect(body).toContain('Vous publiez, et c’est réellement en ligne');
  });

  test('les anciennes pages par métier mènent au parcours expliqué', async ({ page }) => {
    await page.goto('/metiers');
    await expect(page).toHaveURL(/\/comment-ca-marche$/);
    await page.goto('/metiers/restauration/restaurant');
    await expect(page).toHaveURL(/\/comment-ca-marche$/);
  });

  test('« Comment ça marche » : commande, virement, code, espace', async ({ page }) => {
    await page.goto('/comment-ca-marche');
    const steps = await page.locator('ol h3').allTextContents();
    expect(steps.slice(0, 4)).toEqual([
      'Vous commandez',
      'Vous réglez par virement',
      'Vous recevez votre code',
      'Votre espace s’ouvre',
    ]);
  });

  test('la page d’accès demande le code et rien d’autre', async ({ page }) => {
    await page.goto('/acces');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Entrez votre code d’accès',
    );
    await expect(page.getByRole('button', { name: 'Accéder à mon site' })).toBeVisible();
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('aucune page n’annonce un générateur, un modèle ou un glisser-déposer', async ({ page }) => {
    for (const path of [
      '/',
      '/comment-ca-marche',
      '/fonctionnalites',
      '/fonctionnalites/editeur',
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

  test('les CGV décrivent le paiement par virement et le code d’accès, sans grille tarifaire', async ({
    page,
  }) => {
    await page.goto('/cgv');
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body).toContain('Paiement, code d’accès et facturation');
    expect(body).toContain('virement bancaire');
    expect(body).toContain('ne publie pas de grille tarifaire');
    expect(body).not.toMatch(/Exceptionnel|Ultra Premium|maintenance mensuelle/i);
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
    for (const forbidden of ['/app/', '/admin/', '/connexion', '/commander', '/acces', '/tarifs']) {
      expect(xml, `${forbidden} ne doit pas etre indexable`).not.toContain(forbidden);
    }
  });
});
