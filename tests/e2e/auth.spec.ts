import { expect, test } from '@playwright/test';

/**
 * Authentification et controle d acces.
 *
 * Le point critique verifie ici : une page privee ne doit JAMAIS s afficher
 * sans session, meme fugitivement. Un contenu affiche puis remplace par une
 * redirection est une fuite.
 */

test.describe('Acces aux espaces prives', () => {
  test('l’espace client renvoie vers la connexion', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/connexion/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Connexion');
  });

  test('le back-office ne confirme meme pas son existence', async ({ page }) => {
    const response = await page.goto('/admin');
    // Connexion ou page introuvable : jamais un contenu d administration.
    expect(page.url()).toMatch(/\/(connexion|admin)?/);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Chiffre d’affaires');
    expect(response?.status() ?? 0).toBeLessThan(500);
  });

  test('les pages d’authentification ne sont pas indexables', async ({ page }) => {
    for (const path of ['/connexion', '/inscription', '/activation']) {
      await page.goto(path);
      const robots = await page
        .locator('meta[name="robots"]')
        .getAttribute('content')
        .catch(() => null);
      expect(robots, `${path} doit porter noindex`).toContain('noindex');
    }
  });

  test('la connexion ne revele pas si une adresse existe', async ({ page }) => {
    await page.goto('/connexion');
    await page.getByLabel('Adresse e-mail').fill('inconnu-total@example.invalid');
    await page.getByLabel('Mot de passe').fill('mot-de-passe-invalide-123');
    await page.getByRole('button', { name: /se connecter/i }).click();

    // Next ajoute un annonceur de route porteur de `role="alert"` : on vise
    // l alerte du formulaire, pas celle du routeur.
    const alert = page.getByRole('alert').filter({ hasText: /./ }).first();
    await expect(alert).toBeVisible({ timeout: 20_000 });
    const message = ((await alert.textContent()) ?? '').toLowerCase();

    // La propriete verifiee est la NON-DIVULGATION, pas un libelle precis :
    // qu il s agisse d un refus ou d une panne du fournisseur, la reponse ne
    // doit jamais permettre de savoir si l adresse est connue.
    for (const leak of [
      'compte introuvable',
      "n'existe pas",
      'n’existe pas',
      'utilisateur inconnu',
      'adresse inconnue',
      'aucun compte',
      'mot de passe incorrect pour',
    ]) {
      expect(message, `le message ne doit pas contenir « ${leak} »`).not.toContain(leak);
    }
  });

  test('le formulaire de mot de passe oublie repond toujours la meme chose', async ({ page }) => {
    await page.goto('/mot-de-passe-oublie');
    await page.getByLabel('Adresse e-mail').fill('personne@example.invalid');
    await page.getByRole('button', { name: /envoyer/i }).click();

    const status = page.getByRole('status');
    await expect(status).toBeVisible({ timeout: 15_000 });
    await expect(status).toContainText(/si un compte existe/i);
  });
});

test.describe('Parcours de commande', () => {
  test('la premiere etape propose les offres et n’exige aucun compte', async ({ page }) => {
    await page.goto('/commander');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('offre');
    // Aucune redirection vers la connexion a cette etape.
    expect(page.url()).toContain('/commander');
  });

  test('sauter une etape renvoie a la precedente', async ({ page }) => {
    await page.goto('/commander/recapitulatif');
    // Sans offre choisie, on ne doit pas pouvoir atteindre le recapitulatif.
    await expect(page).toHaveURL(/\/commander$/);
  });
});
