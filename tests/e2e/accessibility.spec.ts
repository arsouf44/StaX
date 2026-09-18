import { expect, test } from '@playwright/test';

/**
 * Accessibilite.
 *
 * Ces verifications ne remplacent pas un audit : elles attrapent les regressions
 * les plus courantes et les plus penalisantes, celles qu un developpement
 * rapide reintroduit regulierement.
 */

const PAGES = ['/', '/tarifs', '/metiers', '/contact', '/cgv', '/connexion'];

test.describe('Accessibilite', () => {
  for (const path of PAGES) {
    test(`${path} — structure et libelles`, async ({ page }) => {
      await page.goto(path);

      // Exactement un titre de niveau 1 : zero desoriente, plusieurs aussi.
      const h1Count = await page.locator('h1').count();
      expect(h1Count, `${path} doit avoir un seul <h1>`).toBe(1);

      // La langue doit etre declaree, sinon les lecteurs d ecran lisent en
      // anglais un texte francais.
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang).toBe('fr');

      // Toute image porte un attribut alt, meme vide pour les images
      // decoratives : son absence force le lecteur d ecran a lire l URL.
      const imagesWithoutAlt = await page.locator('img:not([alt])').count();
      expect(imagesWithoutAlt, `${path} contient une image sans alt`).toBe(0);

      // Tout champ de saisie doit avoir un libelle accessible.
      const inputs = page.locator('input:not([type="hidden"]), textarea, select');
      const count = await inputs.count();
      for (let index = 0; index < count; index += 1) {
        const field = inputs.nth(index);
        const accessibleName =
          (await field.getAttribute('aria-label')) ??
          (await field.getAttribute('aria-labelledby')) ??
          (await field.getAttribute('id'));
        expect(accessibleName, `${path} : champ sans libelle`).not.toBeNull();
      }
    });
  }

  test('le focus reste visible au clavier', async ({ page }) => {
    await page.goto('/');
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('Tab');
      const hasVisibleFocus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return true;
        const style = getComputedStyle(element);
        return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
      });
      expect(hasVisibleFocus, `element ${index} sans focus visible`).toBe(true);
    }
  });

  test('le site reste lisible a 320 pixels de large', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
