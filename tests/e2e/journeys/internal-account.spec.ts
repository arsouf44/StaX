import { expect, test, type Page } from '@playwright/test';
import {
  createCustomerWithPaidOrder,
  fetchPublicPage,
  firstHeading,
  provisionInternalAccount,
  serviceClient,
  uniqueSuffix,
  userClient,
} from './support/stack';

/**
 * Compte interne StaX : un site Ultra Premium, sans aucun paiement.
 *
 * Le compte est cree par le VRAI script de provisionnement
 * (`pnpm internal:bootstrap`), avec un mot de passe jetable lu dans
 * l environnement — jamais ecrit nulle part. Le privilege est verifie cote
 * serveur : un client ordinaire qui tente le meme appel est refuse par la base.
 */

test.describe.configure({ mode: 'serial' });

const INTERNAL_EMAIL = process.env.STAX_E2E_INTERNAL_EMAIL ?? 'a.gomez@macrobot-ai.com';
const suffix = uniqueSuffix();
const SUBDOMAIN = `resto-${suffix}`;
const HOSTNAME = `${SUBDOMAIN}.sites.stax.test`;
const TITLE = `La vraie cuisine lyonnaise ${suffix}`;

let account: { email: string; password: string };

test.beforeAll(() => {
  account = provisionInternalAccount(INTERNAL_EMAIL);
});

async function login(page: Page): Promise<void> {
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

test('compte interne : site Ultra Premium créé sans paiement, modifié et publié', async ({
  page,
}) => {
  await test.step('connexion du compte interne', async () => {
    await login(page);
  });

  await test.step('commande Ultra Premium dans le tunnel', async () => {
    await page.goto('/commander');
    await page.locator('label', { has: page.locator('input[value="ultra-premium"]') }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.waitForURL(/\/commander\/metier/);
    await page.getByRole('button', { name: /Restauration/ }).click();
    await page.getByRole('button', { name: /^Restaurant$/ }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await page.waitForURL(/\/commander\/informations/);
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
    await page.locator('label', { has: page.locator('input[value="subdomain_only"]') }).click();
    await page.locator('[name="subdomain"]').fill(SUBDOMAIN);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.waitForURL(/\/commander\/recapitulatif/);
  });

  await test.step('récapitulatif : aucun paiement demandé', async () => {
    const main = page.locator('main');
    await expect(main).toContainText('Compte interne StaX');
    await expect(main).toContainText('Aucun paiement');
    await expect(main).toContainText('0,00 €');
    await expect(main).not.toContainText(/avant de régler|après le paiement/);
    await expect(page.getByRole('button', { name: /payer|paiement sécurisé/i })).toHaveCount(0);
  });

  await test.step('création immédiate du site, sans passer par Stripe', async () => {
    const stripeRequests: string[] = [];
    page.on('request', (request) => {
      if (/stripe\.com/.test(request.url())) stripeRequests.push(request.url());
    });
    await page.getByLabel(/Je confirme la création/).check();
    await page.getByRole('button', { name: 'Créer le site maintenant' }).click();
    await page.waitForURL(/\/app\?commande=interne/, { timeout: 30_000 });
    await expect(page.locator('main')).toContainText('Site créé, sans paiement');
    await expect(page.getByTestId('my-site')).toContainText(HOSTNAME);
    expect(stripeRequests).toEqual([]);
  });

  await test.step('en base : commande interne à 0 €, aucun encaissement, offre complète', async () => {
    const admin = serviceClient();
    const site = await admin
      .from('site_domains')
      .select('site_id, sites ( organization_id, plans ( slug ) )')
      .eq('hostname', HOSTNAME)
      .single();
    expect(site.error).toBeNull();
    const siteId = site.data?.site_id as string;
    const order = await admin
      .from('orders')
      .select('id, status, billing_mode, total_cents, discount_cents, setup_price_cents')
      .eq('site_id', siteId)
      .single();
    expect(order.data).toMatchObject({
      status: 'internal',
      billing_mode: 'internal',
      total_cents: 0,
    });
    expect(order.data?.discount_cents).toBe(order.data?.setup_price_cents);
    const payments = await admin.from('payments').select('id').eq('order_id', order.data?.id);
    expect(payments.data).toEqual([]);
    const project = await admin.from('projects').select('id').eq('site_id', siteId);
    expect(project.data?.length).toBe(1);
  });

  await test.step('édition du site puis publication réelle', async () => {
    await page.getByTestId('my-site').getByRole('link', { name: 'Modifier mon site' }).click();
    await expect(page.getByTestId('visual-editor')).toBeVisible();
    await expect(page.getByTestId('preview-viewport')).toHaveAttribute('data-loading', 'false');
    await page.getByTestId('section-item').first().locator('button').first().click();
    const field = page.locator('[data-field="title"] input, [data-field="title"] textarea');
    await field.first().fill(TITLE);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');

    await page.getByTestId('open-publish').click();
    await expect(page.getByTestId('publish-dialog')).toHaveAttribute('data-step', 'confirm', {
      timeout: 30_000,
    });
    await page.getByTestId('confirm-publish').click();
    await expect(page.getByTestId('publish-success')).toContainText('version 1', {
      timeout: 60_000,
    });
  });

  await test.step('requête HTTP réelle : le site est en ligne', async () => {
    const live = await fetchPublicPage(HOSTNAME);
    expect(live.status).toBe(200);
    expect(live.headers['x-stax-version']).toBe('1');
    expect(firstHeading(live.body)).toBe(TITLE);
  });

  await test.step('sites illimités : une seconde commande interne, autre offre', async () => {
    const db = await userClient(account.email, account.password);
    const plan = await serviceClient()
      .from('plans')
      .select('id')
      .eq('slug', 'essentiel')
      .eq('is_active', true)
      .is('valid_until', null)
      .single();
    const second = await db.rpc('create_internal_order', {
      p_plan_id: plan.data?.id,
      p_sector_slug: 'artisanat',
      p_business_type: 'plombier',
      p_organization_name: `Plomberie ${suffix}`,
      p_template: { pages: [] },
      p_hostname: `plomberie-${suffix}.sites.stax.test`,
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
    .eq('slug', 'ultra-premium')
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
    p_hostname: `tentative-${suffix}.sites.stax.test`,
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
