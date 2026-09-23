import { expect, test, type Page } from '@playwright/test';
import {
  createCustomerWithPaidOrder,
  type CustomerSite,
  fetchPublicPage,
  fillLegalIdentity,
  firstHeading,
  resetRateLimits,
  solidPng,
  uniqueSuffix,
} from './support/stack';

/**
 * Parcours complet d un client ordinaire, sans aucune connaissance technique.
 *
 * Il modifie son site dans l editeur visuel, publie, et chaque etape est
 * verifiee par une VRAIE requete HTTP sur l adresse publique du site : c est
 * la seule preuve que le visiteur voit bien ce que le client a publie — et
 * rien de ce qu il n a pas publie.
 */

test.describe.configure({ mode: 'serial' });

let site: CustomerSite;
const suffix = uniqueSuffix();
const ORIGINAL_TITLE_PLACEHOLDER = '__original__';
let originalTitle = ORIGINAL_TITLE_PLACEHOLDER;
const PUBLISHED_TITLE = `Le bon pain de Lyon, cuit chaque matin ${suffix}`;
const DRAFT_TITLE = `Nouvelle fournée en préparation ${suffix}`;

test.beforeAll(async () => {
  site = await createCustomerWithPaidOrder({
    businessName: `Boulangerie Martin ${suffix}`,
    subdomain: `boulangerie-${suffix}`,
    // Le client saisit lui-meme ses mentions legales (etape 2).
    withLegalIdentity: false,
  });
});

async function login(page: Page, email: string, password: string): Promise<void> {
  await resetRateLimits();
  await page.goto('/connexion');
  await page
    .getByLabel(/e-mail/i)
    .first()
    .fill(email);
  await page
    .getByLabel(/mot de passe/i)
    .first()
    .fill(password);
  await page
    .getByRole('button', { name: /se connecter/i })
    .first()
    .click();
  await page.waitForURL(/\/app(\?|$|\/)/);
}

function editor(page: Page) {
  return page.getByTestId('visual-editor');
}

function previewFrame(page: Page) {
  return page.frameLocator('[data-testid="preview-frame"]');
}

/** L apercu a fini de se recharger (double tampon : aucun cadre en attente). */
async function previewReady(page: Page): Promise<void> {
  await expect(page.getByTestId('preview-viewport')).toHaveAttribute('data-loading', 'false');
}

/** Clic dans l apercu, comme le ferait le client : l element est d abord amene a l ecran. */
async function clickInPreview(page: Page, selector: string): Promise<void> {
  await previewReady(page);
  const target = previewFrame(page).locator(selector).first();
  await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await target.click();
}

async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
    timeout: 20_000,
  });
}

async function sectionTypes(page: Page): Promise<string[]> {
  return page
    .getByTestId('section-item')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-block-type') ?? ''));
}

async function publish(page: Page): Promise<number> {
  await page.getByTestId('open-publish').click();
  const dialog = page.getByTestId('publish-dialog');
  await expect(dialog).toHaveAttribute('data-step', /confirm|blocked/, { timeout: 30_000 });
  await expect(dialog, 'aucun probleme bloquant ne doit empecher la publication').toHaveAttribute(
    'data-step',
    'confirm',
  );
  await page.getByTestId('confirm-publish').click();
  const success = page.getByTestId('publish-success');
  await expect(success).toBeVisible({ timeout: 60_000 });
  const text = await success.innerText();
  const version = Number(/version (\d+)/.exec(text)?.[1]);
  await page.getByRole('button', { name: 'Continuer à modifier' }).click();
  return version;
}

test('un client modifie, publie et restaure son site sans aucune compétence technique', async ({
  page,
}) => {
  await test.step('1. le client se connecte', async () => {
    await login(page, site.email, site.password);
    await expect(page.getByTestId('my-site')).toBeVisible();
  });

  await test.step('2. il ouvre son site dans l’éditeur', async () => {
    await page.getByTestId('my-site').getByRole('link', { name: 'Modifier mon site' }).click();
    await expect(editor(page)).toBeVisible();
    await expect(page.getByTestId('section-item').first()).toBeVisible();
    originalTitle = (await previewFrame(page).locator('h1').first().innerText()).trim();
    expect(originalTitle.length).toBeGreaterThan(3);

    // Sans mentions legales, la publication est refusee — et le client sait
    // exactement quoi saisir, et ou.
    await page.getByTestId('open-publish').click();
    const dialog = page.getByTestId('publish-dialog');
    await expect(dialog).toHaveAttribute('data-step', 'blocked', { timeout: 30_000 });
    await expect(dialog).toContainText('mentions légales sont incomplètes');
    await expect(dialog).toContainText('Mon entreprise');
    await page.keyboard.press('Escape');

    await fillLegalIdentity(page, `Boulangerie Martin ${suffix}`);
    await page.goto('/app/editeur');
    await expect(editor(page)).toBeVisible();
    await previewReady(page);

    // Premiere mise en ligne : c est la « premiere version » vers laquelle le
    // client reviendra a la fin.
    const version = await publish(page);
    expect(version).toBe(1);
    const live = await fetchPublicPage(site.hostname);
    expect(live.status).toBe(200);
    expect(live.headers['x-stax-version']).toBe('1');
    expect(firstHeading(live.body)).toBe(originalTitle);
  });

  await test.step('3. il modifie le titre en cliquant dessus dans l’aperçu', async () => {
    await clickInPreview(page, 'h1');
    await expect(page.getByTestId('selected-section-label')).toHaveText('Bannière principale');
    const field = page.locator('[data-field="title"] input, [data-field="title"] textarea');
    await expect(field.first()).toBeFocused();
    await field.first().fill(PUBLISHED_TITLE);
    await waitSaved(page);
    await expect(previewFrame(page).locator('h1').first()).toHaveText(PUBLISHED_TITLE);
  });

  await test.step('4. il remplace la photo de la bannière', async () => {
    await page.locator('[data-field="media"]').getByRole('button', { name: /photo/i }).click();
    await page.getByTestId('media-upload-input').setInputFiles({
      name: 'devanture.png',
      mimeType: 'image/png',
      buffer: solidPng(320, 200, [196, 120, 60]),
    });
    await expect(page.locator('[data-field="media"] img')).toBeVisible({ timeout: 30_000 });
    await waitSaved(page);
    // La photo est reellement chargee, pas seulement presente dans la page.
    const image = previewFrame(page).locator('[data-stax-block] img').first();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  let added: string;
  await test.step('5. il ajoute une section « Questions fréquentes »', async () => {
    // La section est ajoutee sous celle qui est selectionnee.
    await page
      .getByTestId('section-item')
      .filter({ hasText: 'Avis clients' })
      .locator('button')
      .first()
      .click();
    const before = await sectionTypes(page);
    await page.getByTestId('open-section-library').click();
    await page.getByTestId('add-section-faq').click();
    await waitSaved(page);
    const after = await sectionTypes(page);
    expect(after.length).toBe(before.length + 1);
    expect(after).toContain('faq');
    added = 'faq';
    await expect(page.getByTestId('selected-section-label')).toHaveText(/Questions/);
  });

  await test.step('6. il déplace cette section vers le haut', async () => {
    const before = await sectionTypes(page);
    const index = before.indexOf(added);
    expect(index).toBeGreaterThan(0);
    await page.getByRole('button', { name: /^Monter la section Questions/ }).click();
    await waitSaved(page);
    const after = await sectionTypes(page);
    expect(after.indexOf(added)).toBe(index - 1);
  });

  await test.step('7. il supprime la section puis la restaure depuis la corbeille', async () => {
    const before = await sectionTypes(page);
    await page.getByTestId('properties-panel').getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
    await waitSaved(page);
    await expect(page.getByTestId('section-item')).toHaveCount(before.length - 1);
    expect(await sectionTypes(page)).not.toContain(added);

    const trash = page.getByTestId('trash');
    await trash.locator('summary').click();
    await expect(page.getByTestId('trash-item')).toHaveCount(1);
    await page.getByTestId('trash-item').getByRole('button', { name: 'Restaurer' }).click();
    await waitSaved(page);
    await expect(page.getByTestId('section-item')).toHaveCount(before.length);
    expect(await sectionTypes(page)).toEqual(before);
  });

  await test.step('8. il vérifie le rendu sur téléphone', async () => {
    await page.getByRole('button', { name: 'Aperçu téléphone' }).click();
    await expect(page.getByTestId('preview-viewport')).toHaveAttribute('data-viewport', 'mobile');
    const width = await previewFrame(page)
      .locator('body')
      .evaluate(() => window.innerWidth);
    expect(width).toBe(390);
    await expect(previewFrame(page).locator('h1').first()).toHaveText(PUBLISHED_TITLE);
    await page.getByRole('button', { name: 'Aperçu ordinateur' }).click();
  });

  await test.step('9. il publie ses modifications', async () => {
    const version = await publish(page);
    expect(version).toBe(2);
  });

  let live2: Awaited<ReturnType<typeof fetchPublicPage>>;
  await test.step('10. requête HTTP réelle sur l’adresse publique', async () => {
    live2 = await fetchPublicPage(site.hostname);
    expect(live2.status).toBe(200);
    // Et dans un vrai navigateur, sur le nom d hote public.
    await page.goto(`http://${site.hostname}/`);
    await expect(page.locator('h1').first()).toHaveText(PUBLISHED_TITLE);
    const photo = page.locator('img[src*="site-media"]').first();
    await expect
      .poll(() => photo.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.getByText('Questions fréquentes')).toBeVisible();
  });

  await test.step('10 bis. les mentions légales en ligne reprennent « Mon entreprise »', async () => {
    const legal = await fetchPublicPage(site.hostname, '/mentions-legales');
    expect(legal.status).toBe(200);
    expect(legal.body).toContain(`Boulangerie Martin ${suffix} SAS`);
    expect(legal.body).toContain('RCS Lyon 000 000 000');
    expect(legal.body).toContain('Directeur de la publication');
    expect(legal.body).not.toContain('à compléter');
    // Aucune police chargee depuis un service tiers : elles sont servies par le site.
    expect(legal.body).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    const privacy = await fetchPublicPage(site.hostname, '/confidentialite');
    expect(privacy.status).toBe(200);
    expect(privacy.body).toContain('CNIL');
  });

  await test.step('11. c’est bien la nouvelle version qui est servie', async () => {
    expect(live2.headers['x-stax-version']).toBe('2');
    expect(firstHeading(live2.body)).toBe(PUBLISHED_TITLE);
    expect(live2.body).toContain('Questions');
    expect(live2.body).toMatch(/site-media\/[^"']+\.png/);
  });

  await test.step('12. nouvelle modification, sans publier', async () => {
    await page.goto('/app/editeur');
    await expect(editor(page)).toBeVisible();
    await clickInPreview(page, 'h1');
    const field = page.locator('[data-field="title"] input, [data-field="title"] textarea');
    await field.first().fill(DRAFT_TITLE);
    await waitSaved(page);
    await expect(previewFrame(page).locator('h1').first()).toHaveText(DRAFT_TITLE);
  });

  await test.step('13. le site public montre toujours la version publiée', async () => {
    const live = await fetchPublicPage(site.hostname);
    expect(live.status).toBe(200);
    expect(live.headers['x-stax-version']).toBe('2');
    expect(firstHeading(live.body)).toBe(PUBLISHED_TITLE);
    expect(live.body).not.toContain(DRAFT_TITLE);
  });

  await test.step('14. il publie cette nouvelle modification', async () => {
    const version = await publish(page);
    expect(version).toBe(3);
    const live = await fetchPublicPage(site.hostname);
    expect(live.headers['x-stax-version']).toBe('3');
    expect(firstHeading(live.body)).toBe(DRAFT_TITLE);
  });

  await test.step('15. il revient à la toute première version', async () => {
    await page.getByTestId('open-history').click();
    const panel = page.getByTestId('history-panel');
    const first = panel.locator(
      '[data-testid="history-entry"][data-kind="version"][data-number="1"]',
    );
    await expect(first).toBeVisible();
    await first.getByTestId('republish-version').click();
    await page.getByRole('button', { name: 'Republier cette version' }).last().click();
    await expect(
      panel.locator('[data-testid="history-entry"][data-kind="version"][data-number="4"]'),
    ).toBeVisible({ timeout: 30_000 });
    // Revenir en arriere n a rien detruit : les versions 2 et 3 sont toujours la.
    for (const number of ['2', '3']) {
      await expect(
        panel.locator(
          `[data-testid="history-entry"][data-kind="version"][data-number="${number}"]`,
        ),
      ).toBeVisible();
    }
  });

  await test.step('16. requête HTTP : la première version est de nouveau servie', async () => {
    const live = await fetchPublicPage(site.hostname);
    expect(live.status).toBe(200);
    expect(live.headers['x-stax-version']).toBe('4');
    expect(firstHeading(live.body)).toBe(originalTitle);
    expect(live.body).not.toContain(PUBLISHED_TITLE);
    expect(live.body).not.toContain(DRAFT_TITLE);
  });
});
