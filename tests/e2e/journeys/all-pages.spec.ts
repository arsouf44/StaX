import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  createCustomerWithPaidOrder,
  createStaffAccount,
  type CustomerSite,
  resetRateLimits,
  uniqueSuffix,
} from './support/stack';

/**
 * Toutes les pages, avec chaque profil : aucune ne doit repondre une erreur.
 *
 * Une page qui plante affiche « Cette page n’a pas pu s’afficher » : ce test
 * les ouvre toutes, une a une, pour l'equipe StaX, pour un client dont le site
 * est confie et pour un client dont le site est encore en construction. Il
 * suffit d'une requete mal formee (colonne renommee, jointure ambigue) pour
 * qu'un ecran entier tombe ; c'est ici qu'on le voit, pas en production.
 */

test.describe.configure({ mode: 'serial' });

const BASE = process.env.STAX_CRAWL_BASE_URL ?? 'http://127.0.0.1:3100';
const ERROR_TEXT = 'Cette page n’a pas pu s’afficher';

const PUBLIC_PAGES = [
  '/',
  '/tarifs',
  '/fonctionnalites',
  '/metiers',
  '/comment-ca-marche',
  '/realisations',
  '/a-propos',
  '/contact',
  '/faq',
  '/aide',
  '/securite',
  '/infrastructure',
  '/status',
  '/sur-mesure',
  '/devis',
  '/cgv',
  '/cgu',
  '/confidentialite',
  '/mentions-legales',
  '/cookies',
  '/accord-de-traitement',
  '/remboursements',
  '/sous-traitants',
  '/donnees-personnelles',
  '/accessibilite',
  '/signaler-un-contenu',
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
];

const ADMIN_PAGES = [
  '/admin',
  '/admin/abonnements',
  '/admin/activite',
  '/admin/assistance',
  '/admin/catalogue',
  '/admin/commandes',
  '/admin/confidentialite',
  '/admin/coupons',
  '/admin/devis',
  '/admin/domaines',
  '/admin/factures',
  '/admin/feature-flags',
  '/admin/metiers',
  '/admin/organisations',
  '/admin/projets',
  '/admin/remboursements',
  '/admin/sante',
  '/admin/securite',
  '/admin/securite/violations',
  '/admin/signalements',
  '/admin/sites',
  '/admin/sites?filtre=a-confier',
  '/admin/support',
  '/admin/taches',
  '/admin/utilisateurs',
  '/admin/webhooks',
];

const CLIENT_PAGES = [
  '/app',
  '/app/abonnement',
  '/app/activite',
  '/app/actualites',
  '/app/avis',
  '/app/biens',
  '/app/carte',
  '/app/chambres',
  '/app/commandes',
  '/app/compte',
  '/app/comptes-clients',
  '/app/contacts',
  '/app/disponibilites',
  '/app/donnees',
  '/app/editeur',
  '/app/entreprise',
  '/app/equipe',
  '/app/equipe-stax',
  '/app/evenements',
  '/app/facturation',
  '/app/forms',
  '/app/horaires',
  '/app/media',
  '/app/messages',
  '/app/paiements',
  '/app/prestations',
  '/app/produits',
  '/app/projet',
  '/app/realisations',
  '/app/reservations',
  '/app/securite',
  '/app/site/apparence',
  '/app/site/domaine',
  '/app/site/navigation',
  '/app/site/pages',
  '/app/site/referencement',
  '/app/statistiques',
  '/app/support',
  '/app/zones',
  '/commander',
  '/bienvenue',
  '/facture',
  '/activation',
  '/mfa/configuration',
];

async function login(browser: Browser, email: string, password: string): Promise<Page> {
  const context = await browser.newContext({ baseURL: BASE });
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

/** Ouvre chaque page et renvoie celles qui repondent une erreur. */
async function crawl(page: Page, paths: string[]): Promise<string[]> {
  const failures: string[] = [];
  for (const path of paths) {
    const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    const crashed = await page.getByText(ERROR_TEXT).count();
    if (status >= 500 || crashed > 0) {
      const reference = await page
        .locator('code')
        .first()
        .textContent()
        .catch(() => null);
      failures.push(`${path} → HTTP ${status}${reference ? ` (incident ${reference})` : ''}`);
    }
  }
  return failures;
}

let delivered: CustomerSite;
let underConstruction: CustomerSite;

test.beforeAll(async () => {
  const suffix = uniqueSuffix();
  delivered = await createCustomerWithPaidOrder({
    businessName: `Restaurant confié ${suffix}`,
    subdomain: `confie-${suffix}`,
    planSlug: 'ultra-premium',
    sectorSlug: 'restauration',
    businessType: 'restaurant',
  });
  underConstruction = await createCustomerWithPaidOrder({
    businessName: `Boulangerie en chantier ${suffix}`,
    subdomain: `chantier-${suffix}`,
    delivered: false,
  });
});

test('pages publiques', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  expect(await crawl(page, PUBLIC_PAGES)).toEqual([]);
  await context.close();
});

test('administration, avec le rôle le plus large', async ({ browser }) => {
  const staff = await createStaffAccount('platform_owner');
  const page = await login(browser, staff.email, staff.password);
  const failures = await crawl(page, [
    ...ADMIN_PAGES,
    `/admin/sites/${delivered.siteId}`,
    `/admin/sites/${underConstruction.siteId}`,
  ]);
  expect(failures).toEqual([]);
  await page.context().close();
});

test('espace client, site confié', async ({ browser }) => {
  const page = await login(browser, delivered.email, delivered.password);
  const failures = await crawl(page, [
    ...CLIENT_PAGES,
    `/app/commande/${delivered.orderId}/confirmation`,
  ]);
  expect(failures).toEqual([]);
  await page.context().close();
});

test('espace client, site encore en construction', async ({ browser }) => {
  const page = await login(browser, underConstruction.email, underConstruction.password);
  expect(await crawl(page, CLIENT_PAGES)).toEqual([]);
  // Les écrans du site cèdent la place au suivi de la construction.
  await page.goto('/app/editeur');
  await expect(page.getByTestId('site-under-construction')).toBeVisible();
  await expect(page.getByTestId('visual-editor')).toHaveCount(0);
  await page.goto('/app/projet');
  await expect(page.getByTestId('site-under-construction')).toHaveCount(0);
  await page.context().close();
});
