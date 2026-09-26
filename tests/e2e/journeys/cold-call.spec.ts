import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createStaffAccount,
  randomPassword,
  resetRateLimits,
  serviceClient,
  signedWebhook,
  uniqueSuffix,
  userClient,
} from './support/stack';
import {
  completeDeliveryChecklist,
  connectSiteInfrastructure,
  createSiteInfrastructure,
  type SiteInfrastructure,
} from './support/external-site';

/**
 * Vente par téléphone, de bout en bout, par l'interface :
 *
 *   APPEL CONCLUANT -> SITE CONSTRUIT ET VÉRIFIÉ -> PROPOSITION (e-mail + code)
 *   -> LE PROSPECT SE CONNECTE ET RÉCUPÈRE SON SITE AVEC SON CODE
 *   -> IL VOIT SON SITE ET LE PRIX, NE PEUT RIEN MODIFIER, ÉCRIT À L'ÉQUIPE
 *   -> L'ÉQUIPE RÉPOND -> PAIEMENT (webhook Stripe signé)
 *   -> LIVRAISON AUTOMATIQUE : l'éditeur s'ouvre
 */

test.describe.configure({ mode: 'serial' });

const suffix = uniqueSuffix();
const COMPANY = `Boulangerie Soleil ${suffix}`;
const PROSPECT_EMAIL = `prospect-${suffix}@exemple.test`;
const PROSPECT_PASSWORD = randomPassword();

let siteId: string;
let infra: SiteInfrastructure;
let staff: { email: string; password: string; id: string };
let code = '';
let proposalId = '';

async function login(browser: Browser, email: string, password: string, next = ''): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await resetRateLimits();
  await page.goto(next ? `/connexion?suivant=${encodeURIComponent(next)}` : '/connexion');
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
  await page.waitForURL(/\/(app|admin|bienvenue|recuperer)/);
  return page;
}

test.beforeAll(async () => {
  staff = await createStaffAccount('platform_owner');
  const staffDb = await userClient(staff.email, staff.password);
  const essentiel = await serviceClient()
    .from('plans')
    .select('id')
    .eq('slug', 'essentiel')
    .eq('is_active', true)
    .is('valid_until', null)
    .single();
  const created = await staffDb.rpc('admin_create_site', {
    p_name: COMPANY,
    p_business_type: 'boulangerie',
    p_plan_id: essentiel.data?.id ?? null,
    p_city: 'Nantes',
  });
  if (created.error) throw new Error(created.error.message);
  siteId = (created.data as { siteId: string }).siteId;

  // Le site est développé hors de StaX, rattaché, et sa checklist est faite.
  infra = await createSiteInfrastructure(serviceClient(), {
    slug: `soleil-${suffix}`,
    siteName: COMPANY,
    title: `Le pain du Soleil ${suffix}`,
  });
  await connectSiteInfrastructure(staffDb, siteId, infra);
  await completeDeliveryChecklist(staffDb, serviceClient(), siteId, infra);

  const account = await serviceClient().auth.admin.createUser({
    email: PROSPECT_EMAIL,
    password: PROSPECT_PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: 'Sophie', last_name: 'Martin' },
  });
  if (account.error) throw new Error(account.error.message);
});

test('l’équipe envoie la proposition depuis l’administration', async ({ browser }) => {
  const page = await login(browser, staff.email, staff.password);
  const premium = await serviceClient()
    .from('plans')
    .select('id')
    .eq('slug', 'premium')
    .eq('is_active', true)
    .is('valid_until', null)
    .single();

  await page.goto(`/admin/propositions?site=${siteId}`);
  await page.getByLabel('Offre convenue au téléphone').selectOption({ value: premium.data!.id });
  await page.getByLabel('Adresse e-mail du prospect').fill(PROSPECT_EMAIL);
  await page.getByLabel('Nom de l’entreprise').fill(COMPANY);
  await page.getByLabel('Prénom du contact').fill('Sophie');
  await page.getByRole('button', { name: 'Envoyer la proposition' }).click();

  // Sans fournisseur d'e-mail dans la pile : le code est remis à l'équipe.
  const handOff = page.getByText(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(handOff).toBeVisible({ timeout: 30_000 });
  code = (await handOff.textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  const proposal = await serviceClient()
    .from('site_proposals')
    .select('id, status, total_cents')
    .eq('site_id', siteId)
    .single();
  expect(proposal.data?.status).toBe('sent');
  expect(proposal.data?.total_cents).toBe(66_000);
  proposalId = proposal.data!.id;
  await page.context().close();
});

test('un autre compte ne peut pas utiliser le code', async ({ browser }) => {
  const intruderEmail = `intrus-${suffix}@exemple.test`;
  const intruderPassword = randomPassword();
  await serviceClient().auth.admin.createUser({
    email: intruderEmail,
    password: intruderPassword,
    email_confirm: true,
  });
  const page = await login(browser, intruderEmail, intruderPassword);
  await page.goto(`/recuperer?code=${code}&email=${encodeURIComponent(PROSPECT_EMAIL)}`);
  await expect(page.getByText(/la proposition a\s+été envoyée à/)).toBeVisible();
  await page.getByRole('button', { name: 'Récupérer mon site' }).click();
  await expect(page.getByText(/envoyé à une autre adresse e-mail/)).toBeVisible();
  await page.context().close();
});

test('le prospect récupère son site, le voit, ne peut rien modifier, et écrit à l’équipe', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const claim = `/recuperer?code=${code}&email=${encodeURIComponent(PROSPECT_EMAIL)}`;

  await test.step('sans compte : trois étapes et deux boutons', async () => {
    await page.goto(claim);
    await expect(page.getByRole('link', { name: 'Créer mon compte' })).toBeVisible();
    await page.getByRole('link', { name: 'J’ai déjà un compte' }).click();
    await resetRateLimits();
    await page
      .getByLabel(/e-mail/i)
      .first()
      .fill(PROSPECT_EMAIL);
    await page
      .getByLabel(/mot de passe/i)
      .first()
      .fill(PROSPECT_PASSWORD);
    await page
      .getByRole('button', { name: /se connecter/i })
      .first()
      .click();
    await page.waitForURL(/\/recuperer/);
  });

  await test.step('le code est prérempli : un clic suffit', async () => {
    await expect(page.getByLabel('Votre code')).toHaveValue(code);
    await page.getByRole('button', { name: 'Récupérer mon site' }).click();
    await page.waitForURL(/\/app\?bienvenue=1/);
    const dashboard = page.getByTestId('proposal-dashboard');
    await expect(dashboard).toBeVisible();
    await expect(dashboard).toContainText('voici votre site');
    await expect(dashboard).toContainText(/660\s€/);
    await expect(page.getByTitle(`Site de ${COMPANY}`)).toHaveAttribute(
      'src',
      /^https:\/\/[a-z0-9-]+\.pages\.dev/,
    );
    await expect(
      page.getByRole('button', { name: /Payer .* et récupérer mon site/ }),
    ).toBeVisible();
  });

  await test.step('avant paiement : aucune modification possible', async () => {
    await page.goto('/app/editeur');
    await expect(page.getByTestId('site-awaiting-payment')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publier' })).toHaveCount(0);
  });

  await test.step('une petite retouche ? le prospect écrit à l’équipe', async () => {
    await page.goto('/app');
    await page.getByLabel('Votre message').fill('Pouvez-vous changer la photo d’accueil ?');
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(page.getByText('Message envoyé.')).toBeVisible();
  });
  await context.close();
});

test('l’équipe lit le message et répond', async ({ browser }) => {
  const page = await login(browser, staff.email, staff.password);
  await page.goto('/admin/messages');
  const row = page
    .getByTestId('conversation-list')
    .getByRole('link', { name: new RegExp(COMPANY) });
  await expect(row).toContainText('À répondre');
  await row.click();
  await expect(page.getByText('Pouvez-vous changer la photo d’accueil ?')).toBeVisible();
  await page.getByLabel('Votre réponse').fill('C’est fait, regardez votre site !');
  await page.getByRole('button', { name: 'Répondre' }).click();
  await expect(page.getByText(/Réponse envoyée/)).toBeVisible();
  await page.context().close();

  const client = await login(browser, PROSPECT_EMAIL, PROSPECT_PASSWORD);
  await client.goto('/app/discussion');
  await expect(client.getByText('C’est fait, regardez votre site !')).toBeVisible();
  await client.context().close();
});

test('paiement confirmé : le site est livré automatiquement', async ({ browser }) => {
  // Le prospect clique « Payer » : la commande naît en base, sur SON site. Le
  // paiement est confirmé par un webhook Stripe signé, comme en production.
  const prospectDb = await userClient(PROSPECT_EMAIL, PROSPECT_PASSWORD);
  const order = await prospectDb.rpc('create_proposal_order', {
    p_proposal: proposalId,
    p_terms_version: 'e2e',
  });
  const orderId = (order.data as { orderId: string }).orderId;
  expect(orderId).toBeTruthy();

  const response = await signedWebhook({
    id: `evt_e2e_proposal_${suffix}`,
    object: 'event',
    type: 'checkout.session.completed',
    api_version: '2025-01-27.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: `cs_e2e_proposal_${suffix}`,
        object: 'checkout.session',
        client_reference_id: orderId,
        metadata: { stax_order_id: orderId },
        payment_status: 'paid',
        payment_intent: `pi_e2e_proposal_${suffix}`,
        customer: null,
        subscription: null,
      },
    },
  });
  expect(response.ok).toBe(true);

  const site = await serviceClient()
    .from('sites')
    .select('delivered_at, status')
    .eq('id', siteId)
    .single();
  expect(site.data?.delivered_at).not.toBeNull();
  expect(site.data?.status).toBe('live');
  const proposal = await serviceClient()
    .from('site_proposals')
    .select('status')
    .eq('id', proposalId)
    .single();
  expect(proposal.data?.status).toBe('delivered');
  const sites = await serviceClient().from('sites').select('id').eq('name', COMPANY);
  expect(sites.data?.length).toBe(1);

  const page = await login(browser, PROSPECT_EMAIL, PROSPECT_PASSWORD);
  await page.goto(`/app/commande/${orderId}/confirmation`);
  await expect(page.getByText('Merci ! Votre site est à vous')).toBeVisible();
  await page.getByRole('link', { name: 'Modifier mon site' }).first().click();
  await expect(page.getByTestId('contract-editor')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publier' }).first()).toBeVisible();
  await page.goto('/app');
  await expect(page.getByTestId('first-steps')).toBeVisible();
  await page.context().close();
});

test('l’administration voit la vente conclue', async ({ browser }) => {
  const page = await login(browser, staff.email, staff.password);
  await page.goto('/admin/propositions?filtre=payees');
  await expect(page.getByTestId('proposal-list')).toContainText(COMPANY);
  await expect(page.getByTestId('proposal-list')).toContainText('Payée · site livré');
  await page.context().close();
});
