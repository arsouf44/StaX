import { expect, test, type Page } from '@playwright/test';
import {
  createCustomerWithPaidOrder,
  type CustomerSite,
  fetchPublicPage,
  firstHeading,
  randomPassword,
  resetRateLimits,
  serviceClient,
  uniqueSuffix,
  userClient,
} from './support/stack';

/**
 * Tout est reversible : annuler, retablir, comparer, restaurer une version,
 * recuperer une page supprimee — et le client voit quand l equipe StaX est
 * intervenue sur son site.
 */

test.describe.configure({ mode: 'serial' });

let site: CustomerSite;
const suffix = uniqueSuffix();

test.beforeAll(async () => {
  site = await createCustomerWithPaidOrder({
    businessName: `Pâtisserie Lune ${suffix}`,
    subdomain: `patisserie-${suffix}`,
    businessType: 'patisserie',
  });
});

async function login(page: Page): Promise<void> {
  await resetRateLimits();
  await page.goto('/connexion');
  await page
    .getByLabel(/e-mail/i)
    .first()
    .fill(site.email);
  await page
    .getByLabel(/mot de passe/i)
    .first()
    .fill(site.password);
  await page
    .getByRole('button', { name: /se connecter/i })
    .first()
    .click();
  await page.waitForURL(/\/app(\?|$|\/)/);
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/app/editeur');
  await expect(page.getByTestId('visual-editor')).toBeVisible();
  await expect(page.getByTestId('preview-viewport')).toHaveAttribute('data-loading', 'false');
}

async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
    timeout: 20_000,
  });
}

function heroTitle(page: Page) {
  return page.frameLocator('[data-testid="preview-frame"]').locator('h1').first();
}

async function setHeroTitle(page: Page, title: string): Promise<void> {
  await page.getByTestId('section-item').first().locator('button').first().click();
  await page
    .locator('[data-field="title"] input, [data-field="title"] textarea')
    .first()
    .fill(title);
  await waitSaved(page);
}

test('annuler, rétablir, comparer, restaurer : rien n’est jamais perdu', async ({ page }) => {
  let original = '';

  await test.step('connexion et ouverture de l’éditeur', async () => {
    await login(page);
    await openEditor(page);
    original = (await heroTitle(page).innerText()).trim();
    expect(original).toBe('Des pâtisseries faites maison');
  });

  await test.step('annuler puis rétablir, avec les boutons et au clavier', async () => {
    await setHeroTitle(page, `Titre modifié ${suffix}`);
    const second = page.getByTestId('section-item').nth(1);
    const label = (await second.innerText()).trim().split('\n')[0] ?? '';
    await page.getByRole('button', { name: `Masquer la section ${label}` }).click();
    await waitSaved(page);
    await expect(second.locator('.line-through')).toHaveCount(1);

    await page.getByTestId('undo').click();
    await waitSaved(page);
    await expect(second.locator('.line-through')).toHaveCount(0);

    // Clavier : Ctrl+Z hors d un champ de saisie.
    await page.getByTestId('structure-panel').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await waitSaved(page);
    await expect(heroTitle(page)).toHaveText(original);

    await page.getByTestId('redo').click();
    await waitSaved(page);
    await expect(heroTitle(page)).toHaveText(`Titre modifié ${suffix}`);
  });

  await test.step('publication, puis comparaison avec le brouillon', async () => {
    await page.getByTestId('open-publish').click();
    await expect(page.getByTestId('publish-dialog')).toHaveAttribute('data-step', 'confirm', {
      timeout: 30_000,
    });
    await page.getByTestId('confirm-publish').click();
    await expect(page.getByTestId('publish-success')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Continuer à modifier' }).click();

    await setHeroTitle(page, `Brouillon ${suffix}`);
    await page.getByTestId('open-history').click();
    const version = page.locator('[data-testid="history-entry"][data-kind="version"]').first();
    await expect(version).toContainText('Vous');
    await version.getByRole('button', { name: 'Comparer' }).click();
    await expect(page.getByTestId('compare-list')).toContainText(/Bannière principale/);
    await page.keyboard.press('Escape');
  });

  await test.step('restaurer une version dans le brouillon, sans rien détruire', async () => {
    const version = page.locator('[data-testid="history-entry"][data-kind="version"]').first();
    await version.getByRole('button', { name: 'Restaurer' }).click();
    await page.getByRole('button', { name: 'Restaurer dans mon brouillon' }).click();
    await expect(heroTitle(page)).toHaveText(`Titre modifié ${suffix}`, { timeout: 20_000 });
    // Le brouillon remplace a ete mis de cote : il reste restaurable.
    await page.getByTestId('open-history').click();
    await expect(
      page
        .locator('[data-testid="history-entry"][data-kind="checkpoint"]')
        .filter({ hasText: 'Avant la restauration' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    // Et le site en ligne n a pas bouge.
    const live = await fetchPublicPage(site.hostname);
    expect(firstHeading(live.body)).toBe(`Titre modifié ${suffix}`);
  });
});

test('une page supprimée part à la corbeille et se restaure', async ({ page }) => {
  await login(page);
  await page.goto('/app/site/pages');
  const row = page.getByRole('row', { name: /Contact/ });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
  await expect(page.getByRole('row', { name: /Contact/ })).toHaveCount(0);

  const trash = page.locator('details', { hasText: 'Corbeille' });
  await trash.locator('summary').click();
  await trash.getByRole('button', { name: 'Restaurer' }).click();
  await expect(page.getByRole('row', { name: /Contact/ })).toBeVisible();
});

test('le client voit quand l’équipe StaX est intervenue sur son site', async ({ page }) => {
  // Une personne du support ouvre une session d assistance (motif obligatoire)
  // et publie le site du client.
  const admin = serviceClient();
  const email = `support-${suffix}@stax.test`;
  const password = randomPassword();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const staffId = created.data.user?.id ?? '';
  await admin.from('profiles').update({ platform_role: 'support' }).eq('id', staffId);

  const staff = await userClient(email, password);
  const refused = await staff.rpc('publish_site', { p_site: site.siteId });
  expect(refused.error, 'sans session, l’équipe ne publie pas').not.toBeNull();

  const session = await admin.from('impersonation_sessions').insert({
    staff_id: staffId,
    organization_id: site.organizationId,
    reason: 'Correction demandée par le client au téléphone',
    token_hash: `e2e-${suffix}`,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  expect(session.error).toBeNull();
  const published = await staff.rpc('publish_site', { p_site: site.siteId });
  expect(published.error).toBeNull();

  await login(page);
  await openEditor(page);
  await page.getByTestId('open-history').click();
  const latest = page.locator('[data-testid="history-entry"][data-kind="version"]').first();
  await expect(latest).toContainText('Équipe StaX');
});
