import { randomBytes } from 'node:crypto';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  accessCodeHash,
  createCustomerWithPaidOrder,
  createStaffAccount,
  newAccessCode,
  passwordResetHash,
  randomPassword,
  resetRateLimits,
  serviceClient,
  uniqueSuffix,
  userClient,
  type CustomerSite,
} from './support/stack';

/**
 * Commande par virement, de bout en bout, par l'interface :
 *
 *   LE VISITEUR COMMANDE (aucun prix, aucun compte)
 *   -> L'ÉQUIPE ENVOIE LES MODALITÉS (montant convenu, RIB de la configuration)
 *   -> L'ÉQUIPE CONFIRME LE VIREMENT : espace créé, code d'accès émis
 *   -> LE CLIENT SAISIT SON CODE : session ouverte côté serveur, mot de passe choisi
 *   -> IL SE DÉCONNECTE, SE RECONNECTE, OUBLIE SON MOT DE PASSE, LE RÉINITIALISE
 *   -> CODES INVALIDE / EXPIRÉ / DÉSACTIVÉ / DÉJÀ UTILISÉ refusés
 *   -> UN AUTRE CLIENT RESTE INVISIBLE, MÊME EN FORGEANT SES COOKIES
 *
 * Sans clé Resend, la pile envoie les e-mails en mode « console » : rien ne
 * part, et l'administration affiche alors le code une seule fois pour qu'il
 * soit transmis à la main — c'est ce que lit ce test.
 */

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const COMPANY = `Boulangerie Virement ${suffix}`;
const CLIENT_EMAIL = `virement-${suffix}@exemple.test`;
const FIRST_PASSWORD = randomPassword();
const NEW_PASSWORD = randomPassword();

let reference = '';
let orderId = '';
let code = '';
let staff: { email: string; password: string; id: string };
let staffContext: BrowserContext;
let admin: Page;
let other: CustomerSite;

async function signIn(page: Page, email: string, password: string): Promise<void> {
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
}

async function submitCode(page: Page, value: string): Promise<void> {
  await page.goto('/acces');
  await page.getByLabel('Code d’accès').fill(value);
  await page.getByRole('button', { name: 'Accéder à mon site' }).click();
}

async function formAlert(page: Page): Promise<string> {
  const alert = page.getByRole('alert').filter({ hasText: /./ }).first();
  await expect(alert).toBeVisible();
  return (await alert.textContent()) ?? '';
}

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

test.beforeAll(async ({ browser }) => {
  await resetRateLimits();
  staff = await createStaffAccount('platform_admin');
  staffContext = await browser.newContext();
  admin = await staffContext.newPage();
  other = await createCustomerWithPaidOrder({
    businessName: `Société Voisine ${suffix}`,
    subdomain: `voisine-${suffix}`,
    delivered: false,
  });
});

test.afterAll(async () => {
  await staffContext?.close();
});

test('1. le visiteur commande, sans prix ni compte', async ({ page }) => {
  await resetRateLimits();
  await page.goto('/commander');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('activité');
  await expect(page.locator('main')).not.toContainText('€');
  await page.getByRole('button', { name: /Restauration/ }).click();
  await page.getByRole('button', { name: /^Restaurant$/ }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();

  await page.waitForURL(/\/commander\/informations/);
  await page.locator('[name="contactFirstName"]').fill('Jeanne');
  await page.locator('[name="contactLastName"]').fill('Martin');
  await page.locator('[name="organizationName"]').fill(COMPANY);
  await page.locator('[name="city"]').fill('Nîmes');
  await page.locator('[name="contactEmail"]').fill(CLIENT_EMAIL);
  for (const field of await page.locator('[name^="q_"][required]').all()) {
    const tag = await field.evaluate((element) => element.tagName);
    const type = await field.getAttribute('type');
    if (tag === 'SELECT') {
      const value = await field.locator('option').nth(1).getAttribute('value');
      await field.selectOption(value ?? '');
    } else if (type === 'checkbox' || type === 'radio') {
      await field.check();
    } else {
      await field.fill('Pain au levain et viennoiseries');
    }
  }
  await page.getByRole('button', { name: 'Continuer' }).click();

  await page.waitForURL(/\/commander\/adresse/);
  await page.locator('label', { has: page.locator('input[value="later"]') }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();

  await page.waitForURL(/\/commander\/recapitulatif/);
  const main = page.locator('main');
  await expect(main).toContainText('virement');
  await expect(main).not.toContainText('€');
  await expect(page.getByRole('button', { name: /payer/i })).toHaveCount(0);

  // Sans les deux cases, rien ne part.
  await page.getByRole('button', { name: 'Envoyer ma commande' }).click();
  await expect(page).toHaveURL(/\/commander\/recapitulatif/);

  await page.getByLabel(/besoins de mon activité professionnelle/).check();
  await page.getByLabel(/J’accepte les/).check();
  await page.getByRole('button', { name: 'Envoyer ma commande' }).click();
  await page.waitForURL(/\/commander\/merci\?reference=CMD-\d{4}-\d{5}/, { timeout: 30_000 });
  reference = new URL(page.url()).searchParams.get('reference') ?? '';
  await expect(page.getByRole('heading', { level: 1 })).toContainText('bien reçu votre commande');
  await expect(page.locator('main')).toContainText(reference);

  const row = await serviceClient()
    .from('site_orders')
    .select('id, status, amount_cents, contact_email, confirmation_email_status, terms_version')
    .eq('reference', reference)
    .single();
  expect(row.error).toBeNull();
  expect(row.data).toMatchObject({
    status: 'received',
    amount_cents: null,
    contact_email: CLIENT_EMAIL,
    // Mode console : l'accusé de réception est journalisé, rien n'est envoyé.
    confirmation_email_status: 'skipped',
  });
  expect(row.data?.terms_version).toBeTruthy();
  orderId = row.data?.id as string;
});

test('2. l’équipe envoie les modalités de paiement par virement', async () => {
  await signIn(admin, staff.email, staff.password);
  await admin.waitForURL(/\/(admin|app)/);
  await admin.goto('/admin/commandes');
  await expect(admin.locator('main')).toContainText(reference);
  await admin.goto(`/admin/commandes/${orderId}`);
  await expect(admin.getByRole('heading', { level: 1 })).toContainText(reference);

  await admin.getByLabel(/Montant à régler/).fill('1 250');
  await admin.getByLabel(/Message au client/).fill('Création du site et mise en ligne.');
  await admin.getByRole('button', { name: 'Envoyer les modalités de paiement' }).click();
  await expect(
    admin
      .getByRole('status')
      .filter({ hasText: /modalités/i })
      .first(),
  ).toBeVisible();

  const row = await serviceClient()
    .from('site_orders')
    .select('status, amount_cents, payment_request_count')
    .eq('id', orderId)
    .single();
  expect(row.data).toMatchObject({
    status: 'payment_requested',
    amount_cents: 125_000,
    payment_request_count: 1,
  });
});

test('3. virement reçu : l’espace est créé et le code émis (affiché une fois)', async () => {
  await admin.goto(`/admin/commandes/${orderId}`);
  // Sans la case de confirmation, rien n'est créé.
  await admin.getByRole('button', { name: 'Confirmer le paiement et envoyer le code' }).click();
  await expect(admin.getByTestId('access-code')).toHaveCount(0);

  await admin.getByLabel(/le virement est arrivé/).check();
  await admin.getByRole('button', { name: 'Confirmer le paiement et envoyer le code' }).click();
  const shown = admin.getByTestId('access-code');
  await expect(shown).toBeVisible({ timeout: 30_000 });
  code = ((await shown.textContent()) ?? '').trim();
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);

  const db = serviceClient();
  const row = await db
    .from('site_orders')
    .select('status, paid_amount_cents, organization_id, site_id')
    .eq('id', orderId)
    .single();
  expect(row.data).toMatchObject({ status: 'paid', paid_amount_cents: 125_000 });
  // Le code n'existe en base que sous forme d'empreinte.
  const codes = await db
    .from('activation_codes')
    .select('code_hash, code_hint, email_constraint')
    .eq('site_order_id', orderId);
  expect(codes.data).toHaveLength(1);
  expect(codes.data?.[0]?.code_hash).toBe(accessCodeHash(code));
  expect(JSON.stringify(codes.data)).not.toContain(code);
  expect(codes.data?.[0]?.email_constraint).toBe(CLIENT_EMAIL);

  // Recharger la page ne réaffiche jamais le code.
  await admin.reload();
  await expect(admin.getByTestId('access-code')).toHaveCount(0);
});

test('4. le client saisit son code, choisit son mot de passe et trouve son espace', async ({
  page,
}) => {
  await resetRateLimits();
  // Un code inventé, au bon format : refusé, sans rien révéler.
  await submitCode(page, newAccessCode());
  expect(await formAlert(page)).toMatch(/pas reconnu/);

  // Le lien de l'e-mail préremplit le code, sans le consommer.
  await page.goto(`/acces?code=${encodeURIComponent(code)}`);
  await expect(page.getByLabel('Code d’accès')).toHaveValue(code);
  await page.getByRole('button', { name: 'Accéder à mon site' }).click();

  await page.waitForURL(/\/acces\/mot-de-passe/, { timeout: 30_000 });
  await page.getByLabel('Nouveau mot de passe').fill(FIRST_PASSWORD);
  await page.getByLabel('Confirmez le mot de passe').fill(FIRST_PASSWORD);
  await page.getByRole('button', { name: /enregistrer|continuer|valider/i }).click();

  await page.waitForURL(/\/app\?bienvenue=1/, { timeout: 30_000 });
  await expect(page.getByText('Bienvenue dans votre espace')).toBeVisible();
  await expect(page.locator('body')).toContainText(COMPANY);

  await page.goto('/app/facturation');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ma commande');
  await expect(page.locator('main')).toContainText(reference);
  await expect(page.locator('main')).not.toContainText('Notes internes');
});

test('5. un code ne sert qu’une fois', async ({ browser }) => {
  const page = await freshPage(browser);
  await resetRateLimits();
  await submitCode(page, code);
  expect(await formAlert(page)).toMatch(/déjà servi/);
  expect(page.url()).toContain('/acces');
  await page.context().close();
});

test('6. déconnexion, puis reconnexion avec le mot de passe choisi', async ({ browser }) => {
  const page = await freshPage(browser);
  await signIn(page, CLIENT_EMAIL, FIRST_PASSWORD);
  await page.waitForURL(/\/app/);
  await page
    .getByRole('button', { name: /Jeanne|Mon compte/ })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
  await page.waitForURL(/\/connexion/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/connexion/);

  await signIn(page, CLIENT_EMAIL, FIRST_PASSWORD);
  await page.waitForURL(/\/app/);
  await expect(page.locator('body')).toContainText(COMPANY);
  await page.context().close();
});

test('7. mot de passe oublié : même réponse pour tous, lien unique, sessions fermées', async ({
  browser,
}) => {
  const page = await freshPage(browser);
  const db = serviceClient();
  const profile = await db.from('profiles').select('id').eq('email', CLIENT_EMAIL).single();
  const userId = profile.data?.id as string;

  await resetRateLimits();
  await page.goto('/mot-de-passe-oublie');
  await page.getByLabel('Adresse e-mail').fill(CLIENT_EMAIL);
  await page.getByRole('button', { name: /envoyer/i }).click();
  const status = page.getByRole('status');
  await expect(status).toContainText(/Si un compte correspond à cette adresse/);
  const known = (await status.textContent()) ?? '';

  // Le jeton est créé (haché) côté serveur, après la réponse.
  await expect
    .poll(
      async () =>
        (
          await db
            .from('password_reset_tokens')
            .select('id')
            .eq('user_id', userId)
            .is('used_at', null)
            .is('revoked_at', null)
        ).data?.length ?? 0,
      { timeout: 15_000 },
    )
    .toBe(1);

  // Adresse inconnue : exactement le même message.
  await page.goto('/mot-de-passe-oublie');
  await page.getByLabel('Adresse e-mail').fill(`inconnu-${suffix}@exemple.test`);
  await page.getByRole('button', { name: /envoyer/i }).click();
  await expect(page.getByRole('status')).toContainText(/Si un compte correspond/);
  expect((await page.getByRole('status').textContent()) ?? '').toBe(known);

  // Le lien de l'e-mail : jeton connu du test, inscrit par la même fonction
  // que le serveur (le précédent est alors remplacé).
  const token = randomBytes(32).toString('base64url');
  const created = await db.rpc('create_password_reset', {
    p_email: CLIENT_EMAIL,
    p_token_hash: passwordResetHash(token),
    p_ip_hash: null,
    p_valid_minutes: 60,
  });
  expect((created.data as { ok?: boolean }).ok).toBe(true);

  // Une session ouverte ailleurs, qui doit être fermée par la réinitialisation.
  const elsewhere = await freshPage(browser);
  await signIn(elsewhere, CLIENT_EMAIL, FIRST_PASSWORD);
  await elsewhere.waitForURL(/\/app/);

  await page.goto(`/nouveau-mot-de-passe?jeton=${token}`);
  await page.getByLabel('Nouveau mot de passe').fill(NEW_PASSWORD);
  await page.getByLabel('Confirmez le mot de passe').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: /enregistrer|changer|valider/i }).click();
  await page.waitForURL(/\/connexion\?reinitialise=1/, { timeout: 30_000 });
  await expect(page.locator('main')).toContainText('Votre mot de passe a été modifié');

  // Le lien ne sert qu'une fois.
  await page.goto(`/nouveau-mot-de-passe?jeton=${token}`);
  await expect(page.getByLabel('Nouveau mot de passe')).toHaveCount(0);
  await expect(page.locator('main')).toContainText(/déjà servi/);

  // L'ancien mot de passe ne fonctionne plus, le nouveau si.
  await signIn(page, CLIENT_EMAIL, FIRST_PASSWORD);
  await expect(page).toHaveURL(/\/connexion/);
  await signIn(page, CLIENT_EMAIL, NEW_PASSWORD);
  await page.waitForURL(/\/app/);

  // La session ouverte ailleurs a été fermée.
  await elsewhere.goto('/app');
  await expect(elsewhere).toHaveURL(/\/connexion/);
  await elsewhere.context().close();
  await page.context().close();
});

test('8. codes expirés et désactivés : messages clairs, rien ne s’ouvre', async ({ browser }) => {
  const staffDb = await userClient(staff.email, staff.password);
  const db = serviceClient();

  const expired = newAccessCode();
  const issued = await staffDb.rpc('issue_site_order_code', {
    p_order: orderId,
    p_code_hash: accessCodeHash(expired),
    p_code_hint: expired.slice(-4),
    p_valid_days: 30,
  });
  expect((issued.data as { ok?: boolean }).ok).toBe(true);
  await db
    .from('activation_codes')
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('code_hash', accessCodeHash(expired));

  const page = await freshPage(browser);
  await resetRateLimits();
  await submitCode(page, expired);
  expect(await formAlert(page)).toMatch(/expiré/);

  const revoked = newAccessCode();
  const second = await staffDb.rpc('issue_site_order_code', {
    p_order: orderId,
    p_code_hash: accessCodeHash(revoked),
    p_code_hint: revoked.slice(-4),
    p_valid_days: 30,
  });
  const codeId = (second.data as { codeId?: string }).codeId as string;
  await staffDb.rpc('revoke_access_code', { p_code: codeId });
  await submitCode(page, revoked);
  expect(await formAlert(page)).toMatch(/désactivé/);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/connexion/);
  await page.context().close();
});

test('9. un client ne voit jamais l’espace d’un autre, même en forgeant ses cookies', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, CLIENT_EMAIL, NEW_PASSWORD);
  await page.waitForURL(/\/app/);

  await context.addCookies([
    { name: 'nemasus_org', value: other.organizationId, url: 'http://127.0.0.1:3100' },
    { name: 'nemasus_site', value: other.siteId, url: 'http://127.0.0.1:3100' },
  ]);
  for (const path of ['/app', '/app/facturation', '/app/projet']) {
    await page.goto(path);
    const body = (await page.locator('body').textContent()) ?? '';
    expect(body, path).not.toContain(other.businessName);
  }
  await page.goto('/app');
  await expect(page.locator('body')).toContainText(COMPANY);

  // Et par l'API : la commande de l'autre société reste invisible.
  const db = await userClient(CLIENT_EMAIL, NEW_PASSWORD);
  const theirs = await db.rpc('site_order_for_organization', { p_org: other.organizationId });
  expect(theirs.data ?? null).toBeNull();
  const sites = await db.from('sites').select('id').eq('id', other.siteId);
  expect(sites.data ?? []).toHaveLength(0);
  await context.close();
});
