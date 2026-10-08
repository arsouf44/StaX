import { expect, test, type Page } from '@playwright/test';
import {
  createCustomerWithPaidOrder,
  createStaffAccount,
  provisionInternalAccount,
  resetRateLimits,
  serviceClient,
  uniqueSuffix,
  userClient,
} from './support/stack';
import {
  completeDeliveryChecklist,
  connectSiteInfrastructure,
  createSiteInfrastructure,
  liveContent,
} from './support/external-site';

/**
 * Compte interne Nemasus : une commande sans aucun paiement, qui
 * suit ensuite EXACTEMENT le parcours d'un client : Nemasus developpe le site hors
 * de Nemasus (depot GitHub, projet Cloudflare), le rattache, puis le livre a ce
 * compte, qui ne peut le modifier qu'a partir de ce moment. L'equipe garde la
 * main.
 *
 * Le compte est cree par le VRAI script de provisionnement
 * (`pnpm internal:bootstrap`), avec un mot de passe jetable lu dans
 * l environnement — jamais ecrit nulle part. Le privilege est verifie cote
 * serveur : un client ordinaire qui tente le meme appel est refuse par la base.
 */

test.describe.configure({ mode: 'serial' });

const INTERNAL_EMAIL = process.env.NEMASUS_E2E_INTERNAL_EMAIL ?? 'a.gomez@macrobot-ai.com';
const suffix = uniqueSuffix();
const PROJECT_SLUG = `resto-${suffix}`;
const TITLE = `La vraie cuisine lyonnaise ${suffix}`;

let account: { email: string; password: string };

test.beforeAll(() => {
  account = provisionInternalAccount(INTERNAL_EMAIL);
});

async function login(page: Page): Promise<void> {
  await resetRateLimits();
  await page.goto('/connexion');
  await page
    .getByLabel(/e-mail/i)
    .first()
    .fill(account.email);
  await page
    .getByLabel(/mot de passe/i)
    .first()
    .fill(account.password);
  await page
    .getByRole('button', { name: /se connecter/i })
    .first()
    .click();
  await page.waitForURL(/\/(app|bienvenue)/);
}

test('compte interne : commande sans paiement, site construit par Nemasus puis confié', async ({
  page,
  browser,
}) => {
  await test.step('connexion du compte interne', async () => {
    await login(page);
  });

  await test.step('commande dans le tunnel, sans offre à choisir', async () => {
    await page.goto('/commander');
    await expect(page.locator('main')).not.toContainText('€');
    await page.getByRole('button', { name: /Restauration/ }).click();
    await page.getByRole('button', { name: /^Restaurant$/ }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.waitForURL(/\/commander\/informations/);
    await page.locator('[name="contactFirstName"]').fill('Marie');
    await page.locator('[name="contactLastName"]').fill('Dupont');
    await page.locator('[name="organizationName"]').fill(`Chez Dupont ${suffix}`);
    await page.locator('[name="city"]').fill('Lyon');
    await page.locator('[name="contactEmail"]').fill(`contact-${suffix}@exemple.test`);
    for (const field of await page.locator('[name^="q_"][required]').all()) {
      const tag = await field.evaluate((element) => element.tagName);
      const type = await field.getAttribute('type');
      if (tag === 'SELECT') {
        const value = await field.locator('option').nth(1).getAttribute('value');
        await field.selectOption(value ?? '');
      } else if (type === 'checkbox' || type === 'radio') {
        await field.check();
      } else {
        await field.fill('Cuisine lyonnaise traditionnelle');
      }
    }
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.waitForURL(/\/commander\/adresse/);
    // Domaine choisi plus tard : le site sera d'abord en ligne sur l'adresse
    // technique de son projet Cloudflare, aucun sous-domaine Nemasus a saisir.
    await page.locator('label', { has: page.locator('input[value="later"]') }).click();
    await expect(page.locator('[name="subdomain"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.waitForURL(/\/commander\/recapitulatif/);
  });

  await test.step('récapitulatif : aucun paiement, et Nemasus construit le site', async () => {
    const main = page.locator('main');
    await expect(main).toContainText('Compte interne Nemasus');
    await expect(main).toContainText('Aucun paiement');
    await expect(main).not.toContainText('€');
    await expect(main).toContainText('développe le site hors de Nemasus');
    await expect(main).toContainText('Communiquée à la mise en ligne');
    await expect(main).toContainText('que lorsque l’administration le lui livre');
    await expect(main).not.toContainText(/créé tout de suite|avant de régler|après le paiement/);
    await expect(page.getByRole('button', { name: /payer|paiement sécurisé/i })).toHaveCount(0);
  });

  await test.step('commande enregistrée sans passer par Stripe', async () => {
    const stripeRequests: string[] = [];
    page.on('request', (request) => {
      if (/stripe\.com/.test(request.url())) stripeRequests.push(request.url());
    });
    await page.getByLabel(/Je confirme cette commande interne/).check();
    await page.getByRole('button', { name: 'Enregistrer la commande interne' }).click();
    await page.waitForURL(/\/app\?commande=interne/, { timeout: 30_000 });
    await expect(page.locator('main')).toContainText('Commande interne enregistrée');
    // Tableau de bord du PROJET : suivi des etapes, aucun ecran du site.
    await expect(page.getByTestId('project-dashboard')).toBeVisible();
    await expect(page.getByTestId('my-site')).toHaveCount(0);
    expect(stripeRequests).toEqual([]);
  });

  let siteId = '';
  await test.step('en base : commande interne à 0 €, site vide, non confié', async () => {
    const admin = serviceClient();
    const org = await admin
      .from('organizations')
      .select('id')
      .eq('name', `Chez Dupont ${suffix}`)
      .single();
    const order = await admin
      .from('orders')
      .select('id, status, billing_mode, total_cents, discount_cents, setup_price_cents, site_id')
      .eq('organization_id', org.data?.id ?? '')
      .single();
    expect(order.data).toMatchObject({
      status: 'internal',
      billing_mode: 'internal',
      total_cents: 0,
    });
    expect(order.data?.discount_cents).toBe(order.data?.setup_price_cents);
    siteId = order.data?.site_id as string;
    const payments = await admin.from('payments').select('id').eq('order_id', order.data?.id);
    expect(payments.data).toEqual([]);
    const pages = await admin.from('site_pages').select('id').eq('site_id', siteId);
    expect(pages.data).toEqual([]);
    const site = await admin.from('sites').select('delivered_at').eq('id', siteId).single();
    expect(site.data?.delivered_at).toBeNull();
  });

  await test.step('avant attribution, le client n’a pas accès au site', async () => {
    await expect(page.getByRole('link', { name: 'Modifier mon site' })).toHaveCount(0);
    await page.goto('/app/editeur');
    await expect(page.getByTestId('site-under-construction')).toBeVisible();
    await expect(page.getByTestId('visual-editor')).toHaveCount(0);
  });

  // L'administration : une personne de l'equipe Nemasus, dans son propre navigateur.
  const staff = await createStaffAccount('platform_owner');
  const staffContext = await browser.newContext();
  const admin = await staffContext.newPage();

  await test.step('Nemasus rattache le site développé hors de Nemasus', async () => {
    const staffDb = await userClient(staff.email, staff.password);
    const infra = await createSiteInfrastructure(serviceClient(), {
      slug: PROJECT_SLUG,
      siteName: `Chez Dupont ${suffix}`,
      title: TITLE,
    });
    await connectSiteInfrastructure(staffDb, siteId, infra);
    await completeDeliveryChecklist(staffDb, serviceClient(), siteId, infra);
    const live = await liveContent(infra.project);
    expect(JSON.stringify(live.content)).toContain(TITLE);
  });

  await test.step('Nemasus livre le site au compte interne, depuis l’administration', async () => {
    await resetRateLimits();
    await admin.goto('/connexion');
    await admin
      .getByLabel(/e-mail/i)
      .first()
      .fill(staff.email);
    await admin
      .getByLabel(/mot de passe/i)
      .first()
      .fill(staff.password);
    await admin
      .getByRole('button', { name: /se connecter/i })
      .first()
      .click();
    await admin.waitForURL(/\/(admin|app)/);

    await admin.goto(`/admin/sites/${siteId}/livraison`);
    const deliver = admin.getByRole('button', { name: 'Livrer le site au client' });
    await expect(deliver).toBeEnabled();
    await deliver.click();
    await expect(
      admin.getByText(/Site livré : le client en a désormais la main/).first(),
    ).toBeVisible();
  });

  await test.step('le client découvre son site et peut le modifier', async () => {
    await page.goto('/app');
    await expect(page.getByTestId('project-dashboard')).toHaveCount(0);
    await expect(page.getByTestId('managed-site-dashboard')).toBeVisible();
    await page.goto('/app/editeur');
    await expect(page.getByRole('navigation', { name: 'Zones modifiables' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier' }).first()).toBeVisible();
  });

  await staffContext.close();

  await test.step('sites illimités : une seconde commande interne', async () => {
    const db = await userClient(account.email, account.password);
    const plan = await serviceClient()
      .from('plans')
      .select('id')
      .eq('slug', 'site-nemasus')
      .eq('is_active', true)
      .is('valid_until', null)
      .single();
    const second = await db.rpc('create_internal_order', {
      p_plan_id: plan.data?.id,
      p_sector_slug: 'artisanat',
      p_business_type: 'plombier',
      p_organization_name: `Plomberie ${suffix}`,
      p_details: {},
    });
    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({ ok: true });
  });
});

test('le privilège interne est vérifié par la base, pas par l’interface', async () => {
  const customer = await createCustomerWithPaidOrder({
    businessName: `Client ordinaire ${suffix}`,
    subdomain: `ordinaire-${suffix}`,
  });
  const db = await userClient(customer.email, customer.password);
  const plan = await serviceClient()
    .from('plans')
    .select('id')
    .eq('slug', 'site-nemasus')
    .eq('is_active', true)
    .is('valid_until', null)
    .single();

  // Commande gratuite tentee par un client ordinaire : refusee.
  const attempt = await db.rpc('create_internal_order', {
    p_plan_id: plan.data?.id,
    p_sector_slug: 'restauration',
    p_business_type: 'restaurant',
    p_organization_name: 'Tentative',
    p_template: { pages: [] },
    p_hostname: `tentative-${suffix}.sites.nemasus.test`,
    p_details: {},
  });
  expect(attempt.error).not.toBeNull();

  // Et il ne peut pas s octroyer le privilege lui-meme.
  const own = await serviceClient()
    .from('profiles')
    .select('id')
    .eq('email', customer.email)
    .single();
  const escalation = await db
    .from('profiles')
    .update({ account_type: 'internal', billing_exempt: true, unlimited_sites: true })
    .eq('id', own.data?.id ?? '');
  expect(escalation.error).not.toBeNull();
  const profile = await serviceClient()
    .from('profiles')
    .select('account_type, billing_exempt')
    .eq('email', customer.email)
    .single();
  expect(profile.data).toMatchObject({ account_type: 'customer', billing_exempt: false });
});
