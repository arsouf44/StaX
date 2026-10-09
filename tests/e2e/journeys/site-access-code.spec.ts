import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createStaffAccount, resetRateLimits, serviceClient, uniqueSuffix } from './support/stack';

/**
 * Un code par personne, émis par l'administration.
 *
 * L'équipe crée le site, puis remet à chaque personne son propre code
 * d'accès, à usage unique, lié à son adresse : c'est ce code qui, à
 * l'inscription, crée le compte et l'ouvre sur ce site. Émettre un nouveau
 * code pour la même adresse désactive celui qu'elle n'a pas encore utilisé :
 * une personne n'a jamais deux codes valables pour un même site.
 */

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const SITE_NAME = `Atelier Essai ${suffix}`;
const CLIENT_EMAIL = `cliente-${suffix}@exemple.test`;
const PASSWORD = `Mot-de-passe-${suffix}-solide`;

let staffContext: BrowserContext;
let admin: Page;
let siteId = '';
let firstCode = '';
let secondCode = '';

async function issueCode(page: Page): Promise<{ code: string; message: string }> {
  await page.getByRole('button', { name: 'Créer un code' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Adresse e-mail de la personne').fill(CLIENT_EMAIL);
  await dialog.getByRole('button', { name: 'Créer le code' }).click();
  const shown = dialog.getByTestId('issued-access-code');
  await expect(shown).toBeVisible({ timeout: 30_000 });
  const code = ((await shown.textContent()) ?? '').trim();
  const message = (await dialog.getByRole('status').textContent()) ?? '';
  await dialog.getByRole('button', { name: 'J’ai noté le code' }).click();
  return { code, message };
}

async function submitCode(page: Page, value: string): Promise<void> {
  await page.goto('/acces');
  await page.getByLabel('Code d’accès').fill(value);
  await page.getByRole('button', { name: 'Accéder à mon site' }).click();
}

test.beforeAll(async ({ browser }) => {
  await resetRateLimits();
  const staff = await createStaffAccount('platform_admin');
  staffContext = await browser.newContext();
  admin = await staffContext.newPage();
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
});

test.afterAll(async () => {
  await staffContext?.close();
});

test('1. l’équipe crée le site et remet un code à la personne', async () => {
  await admin.goto('/admin/sites');
  await admin.getByRole('button', { name: 'Créer un site' }).click();
  await admin.getByLabel(/Nom du site/).fill(SITE_NAME);
  await admin.getByRole('button', { name: 'Créer le site' }).click();
  await admin.waitForURL(/\/admin\/sites\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  siteId = admin.url().split('/').pop() ?? '';
  await expect(admin.locator('main')).toContainText('Codes d’accès — un par personne');

  const first = await issueCode(admin);
  firstCode = first.code;
  expect(firstCode).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  expect(first.message).not.toMatch(/désactivé/);
});

test('2. un nouveau code pour la même personne désactive le précédent', async () => {
  const second = await issueCode(admin);
  secondCode = second.code;
  expect(secondCode).not.toBe(firstCode);
  expect(second.message).toMatch(/n’avait pas encore utilisé est désactivé/);

  const rows = await serviceClient()
    .from('activation_codes')
    .select('email_constraint, used_at, revoked_at, granted_role')
    .eq('site_id', siteId)
    .order('created_at', { ascending: true });
  expect(rows.data).toHaveLength(2);
  expect(rows.data?.[0]?.revoked_at).not.toBeNull();
  expect(rows.data?.[1]?.revoked_at).toBeNull();
  expect(rows.data?.every((row) => row.email_constraint === CLIENT_EMAIL)).toBe(true);
  expect(rows.data?.[1]?.granted_role).toBe('owner');

  await admin.reload();
  await expect(admin.locator('main')).toContainText('Révoqué');
  await expect(admin.locator('main')).toContainText('Actif');
});

test('3. l’ancien code est refusé ; le nouveau crée le compte, une seule fois', async ({
  browser,
}) => {
  await resetRateLimits();
  const context = await browser.newContext();
  const page = await context.newPage();

  await submitCode(page, firstCode);
  await expect(page.getByRole('alert').filter({ hasText: /./ }).first()).toContainText('désactivé');

  await submitCode(page, secondCode);
  await page.waitForURL(/\/acces\/mot-de-passe/, { timeout: 30_000 });
  await page.getByLabel('Nouveau mot de passe').fill(PASSWORD);
  await page.getByLabel('Confirmez le mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: /enregistrer|continuer|valider/i }).click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
  await expect(page.locator('body')).toContainText(SITE_NAME);
  await context.close();

  // Le code a servi : il ne rouvre rien, même dans une autre session.
  const again = await browser.newContext();
  const retry = await again.newPage();
  await resetRateLimits();
  await submitCode(retry, secondCode);
  await expect(retry.getByRole('alert').filter({ hasText: /./ }).first()).toContainText(
    'déjà servi',
  );
  await again.close();

  // L'équipe garde la main : le compte apparaît, propriétaire de ce site.
  const db = serviceClient();
  const profile = await db.from('profiles').select('id').eq('email', CLIENT_EMAIL).single();
  const site = await db.from('sites').select('organization_id').eq('id', siteId).single();
  const membership = await db
    .from('organization_members')
    .select('role')
    .eq('user_id', profile.data?.id ?? '')
    .eq('organization_id', site.data?.organization_id ?? '')
    .single();
  expect(membership.data?.role).toBe('owner');
  await admin.goto(`/admin/utilisateurs?q=${encodeURIComponent(CLIENT_EMAIL)}`);
  await expect(admin.locator('main')).toContainText(CLIENT_EMAIL);
});
