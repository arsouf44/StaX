import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createCustomerWithPaidOrder,
  createStaffAccount,
  type CustomerSite,
  resetRateLimits,
  serviceClient,
  uniqueSuffix,
} from './support/stack';
import {
  CLOUDFLARE_ACCOUNT,
  completeDeliveryChecklist,
  createSiteInfrastructure,
  failNextDeployment,
  liveContent,
  repositoryState,
  type SiteInfrastructure,
} from './support/external-site';
import { userClient } from './support/stack';

/**
 * Le cycle complet d'un site StaX, par l'interface :
 *
 *   COMMANDE -> SITE DEVELOPPE HORS DE STAX (depot GitHub, projet Cloudflare)
 *   -> RATTACHEMENT PAR L'EQUIPE -> CONTRAT D'EDITION -> CHECKLIST -> LIVRAISON
 *   -> BROUILLON DU CLIENT -> PUBLIER -> COMMIT GITHUB -> DEPLOIEMENT CLOUDFLARE
 *   -> EN LIGNE
 *
 * GitHub et Cloudflare sont les faux fournisseurs de la pile (memes API) : ce
 * qui est « en ligne » se lit sur le dernier deploiement de production reussi,
 * comme une requete HTTP sur le vrai site.
 */

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const BUSINESS = `Boulangerie Lumière ${suffix}`;
const INITIAL_TITLE = `Le pain de Lumière ${suffix}`;
const PUBLISHED_TITLE = `Fournée du matin ${suffix}`;
const FAILED_TITLE = `Titre jamais publié ${suffix}`;

let customer: CustomerSite;
let infra: SiteInfrastructure;

test.beforeAll(async () => {
  customer = await createCustomerWithPaidOrder({
    businessName: BUSINESS,
    subdomain: `lumiere-${suffix}`,
    planSlug: 'premium',
    delivered: false,
  });
  infra = await createSiteInfrastructure(serviceClient(), {
    slug: `lumiere-${suffix}`,
    siteName: BUSINESS,
    title: INITIAL_TITLE,
  });
});

async function login(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
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
  await page.waitForURL(/\/(app|admin|bienvenue)/);
  return page;
}

async function productionRelease(): Promise<{ version: number; commit: string | null }> {
  const { data, error } = await serviceClient()
    .from('sites')
    .select('production_release_id')
    .eq('id', customer.siteId)
    .single();
  if (error) throw new Error(error.message);
  const release = await serviceClient()
    .from('site_releases')
    .select('version_number, commit_sha')
    .eq('id', data.production_release_id)
    .single();
  return { version: release.data?.version_number ?? 0, commit: release.data?.commit_sha ?? null };
}

test('avant la livraison : le client suit son projet, sans éditeur', async ({ browser }) => {
  const page = await login(browser, customer.email, customer.password);
  await page.goto('/app');
  const main = page.locator('main');
  await expect(main).toContainText('Commande validée');
  await expect(main).toContainText('Livraison');
  await page.goto('/app/editeur');
  await expect(page.getByTestId('site-under-construction')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publier' })).toHaveCount(0);
  await page.context().close();
});

test('l’équipe rattache le dépôt, le projet Cloudflare et le contrat, puis livre', async ({
  browser,
}) => {
  const staff = await createStaffAccount('platform_owner');
  const page = await login(browser, staff.email, staff.password);
  await page.goto(`/admin/sites/${customer.siteId}/livraison`);

  await test.step('dépôt GitHub, choisi parmi ceux de l’application', async () => {
    await page.getByLabel('Installation GitHub').selectOption({ label: infra.accountLogin });
    await page.getByRole('button', { name: 'Lister les dépôts' }).click();
    await page.getByLabel('Dépôt du site').selectOption({ label: `${infra.repository} (privé)` });
    await page.getByRole('button', { name: 'Rattacher ce dépôt' }).click();
    await expect(page.getByText(`Dépôt ${infra.repository} rattaché`).first()).toBeVisible();
  });

  await test.step('projet Cloudflare Pages, lu chez Cloudflare', async () => {
    await page.getByLabel('Compte Cloudflare').fill(CLOUDFLARE_ACCOUNT);
    await page.getByLabel('Nom du projet Pages').fill(infra.project);
    await page.getByRole('button', { name: 'Rattacher ce projet' }).click();
    await expect(
      page.getByText(`Projet Cloudflare « ${infra.project} » rattaché`).first(),
    ).toBeVisible();
  });

  await test.step('contrat d’édition importé du dépôt, contenu initial = version 1', async () => {
    await page.getByRole('button', { name: 'Importer le manifeste du dépôt' }).click();
    await expect(page.getByText('manifeste valide, activé')).toBeVisible();
    await expect(page.getByText(/Contenu initial repris du commit/)).toBeVisible();
    expect((await productionRelease()).version).toBe(1);
  });

  await test.step('livraison refusée tant que la checklist est incomplète', async () => {
    await expect(page.getByRole('button', { name: 'Livrer le site au client' })).toBeDisabled();
  });

  await test.step('checklist complète, puis livraison', async () => {
    const staffDb = await userClient(staff.email, staff.password);
    await completeDeliveryChecklist(staffDb, serviceClient(), customer.siteId, infra);
    await page.reload();
    const deliver = page.getByRole('button', { name: 'Livrer le site au client' });
    await expect(deliver).toBeEnabled();
    await deliver.click();
    await expect(
      page.getByText(/Site livré : le client en a désormais la main/).first(),
    ).toBeVisible();
  });

  const site = await serviceClient()
    .from('sites')
    .select('status, delivered_at')
    .eq('id', customer.siteId)
    .single();
  expect(site.data?.status).toBe('live');
  expect(site.data?.delivered_at).not.toBeNull();
  await page.context().close();
});

test('le client publie : commit GitHub, déploiement Cloudflare, puis « en ligne »', async ({
  browser,
}) => {
  const page = await login(browser, customer.email, customer.password);
  await page.goto('/app/editeur');

  await test.step('l’aperçu encadre le projet Cloudflare, pas le domaine du client', async () => {
    await expect(page.getByTitle('Aperçu de votre site')).toHaveAttribute(
      'src',
      /^https:\/\/[a-z0-9-]+\.pages\.dev\//,
    );
  });

  await test.step('le brouillon ne change rien en ligne', async () => {
    await page
      .getByRole('navigation', { name: 'Zones modifiables' })
      .getByRole('button', { name: 'Bandeau d’accueil' })
      .click();
    const title = page.getByRole('complementary', { name: 'Champs' }).getByLabel('Titre');
    await expect(title).toHaveValue(INITIAL_TITLE);
    await title.fill(PUBLISHED_TITLE);
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await expect(page.getByText(/Brouillon enregistré à/)).toBeVisible();

    const live = await liveContent(infra.project);
    expect(JSON.stringify(live.content)).toContain(INITIAL_TITLE);
    expect(JSON.stringify(live.content)).not.toContain(PUBLISHED_TITLE);
  });

  await test.step('Publier : la version 2 n’est « en ligne » qu’une fois déployée', async () => {
    await page.getByRole('button', { name: 'Publier' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Publier la version 2' });
    await dialog.getByLabel('Qu’avez-vous changé ? (facultatif)').fill('Nouveau titre');
    await dialog.getByRole('button', { name: 'Publier' }).click();
    await expect(page.getByText('Version 2 en ligne').first()).toBeVisible({ timeout: 60_000 });
  });

  await test.step('le commit est dans le dépôt du site, en avance rapide', async () => {
    const repo = await repositoryState(infra.repository);
    const last = repo.writes.at(-1);
    expect(last?.branch).toBe('main');
    expect(last?.force).toBe(false);
    expect(last?.message).toMatch(/^stax: publication client/);
    const production = await productionRelease();
    expect(production.version).toBe(2);
    expect(production.commit).toBe(repo.branches['main']);

    const live = await liveContent(infra.project);
    expect(live.commit).toBe(production.commit);
    expect(JSON.stringify(live.content)).toContain(PUBLISHED_TITLE);
  });
  await page.context().close();
});

test('un déploiement en échec n’est jamais annoncé comme publié', async ({ browser }) => {
  const page = await login(browser, customer.email, customer.password);
  await failNextDeployment(infra.project);
  await page.goto('/app/editeur');
  await page
    .getByRole('navigation', { name: 'Zones modifiables' })
    .getByRole('button', { name: 'Bandeau d’accueil' })
    .click();
  await page.getByRole('complementary', { name: 'Champs' }).getByLabel('Titre').fill(FAILED_TITLE);
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText(/Brouillon enregistré à/)).toBeVisible();
  await page.getByRole('button', { name: 'Publier' }).first().click();
  await page
    .getByRole('dialog', { name: 'Publier la version 3' })
    .getByRole('button', { name: 'Publier' })
    .click();

  await expect(page.getByText('La version 3 n’a pas été publiée').first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Version 3 en ligne')).toHaveCount(0);

  // La production n'a pas bouge : la v2 reste en ligne.
  expect((await productionRelease()).version).toBe(2);
  const live = await liveContent(infra.project);
  expect(JSON.stringify(live.content)).toContain(PUBLISHED_TITLE);
  expect(JSON.stringify(live.content)).not.toContain(FAILED_TITLE);
  await page.context().close();
});

test('restaurer la version 1 la redéploie réellement', async ({ browser }) => {
  const page = await login(browser, customer.email, customer.password);
  await page.goto('/app/site/versions');

  const rows = page.getByTestId('release-row');
  await expect(rows.filter({ hasText: 'Version 2' })).toContainText(/Commit [0-9a-f]{7}/);
  await expect(rows.filter({ hasText: 'Version 3' })).toContainText(/échec|Échec/);

  await rows.filter({ hasText: 'Version 1' }).getByRole('button', { name: 'Restaurer' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurer' }).click();

  await expect
    .poll(async () => (await productionRelease()).version, { timeout: 60_000 })
    .toBeGreaterThan(3);
  const live = await liveContent(infra.project);
  expect(JSON.stringify(live.content)).toContain(INITIAL_TITLE);
  const repo = await repositoryState(infra.repository);
  expect(repo.writes.every((write) => !write.force || write.branch !== 'main')).toBe(true);
  await page.context().close();
});

test('une autre société ne voit ni le brouillon ni l’historique', async () => {
  const other = await createCustomerWithPaidOrder({
    businessName: `Autre société ${suffix}`,
    subdomain: `autre-${suffix}`,
    delivered: false,
  });
  const db = await userClient(other.email, other.password);
  const drafts = await db
    .from('site_content_drafts')
    .select('site_id')
    .eq('site_id', customer.siteId);
  expect(drafts.data ?? []).toEqual([]);
  const releases = await db.from('site_releases').select('id').eq('site_id', customer.siteId);
  expect(releases.data ?? []).toEqual([]);
  const save = await db.rpc('save_site_draft', {
    p_site: customer.siteId,
    p_content: {},
    p_expected_revision: null,
  });
  expect(save.error).not.toBeNull();
});
