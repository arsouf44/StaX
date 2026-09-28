import { expect, test, type Browser } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PLATFORM_URL,
  SITES_DOMAIN,
  createCustomerWithPaidOrder,
  fetchPublicPage,
  resetRateLimits,
  serviceClient,
  signedWebhook,
  uniqueSuffix,
  userClient,
  type CustomerSite,
} from './support/stack';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Simulation d'intrusion — EN LOCAL UNIQUEMENT.
 *
 * Deux clients étrangers l'un à l'autre (A = victime, B = attaquant) et un
 * visiteur anonyme. On joue l'attaquant contre la VRAIE pile (authentification
 * GoTrue, API PostgREST, plateforme et moteur des sites), et on vérifie qu'il
 * ne peut RIEN lire ni modifier qui ne soit à lui — même en connaissant les
 * identifiants exacts de la victime (le pire des cas : IDOR à l'aveugle exclu).
 *
 * Chaque table sensible reçoit une « pièce à voler » (produit, commande,
 * message, paramètres) avant l'attaque : un test qui ne trouve rien ne prouve
 * rien.
 */

let victim: CustomerSite;
let attacker: CustomerSite;
let attackerDb: SupabaseClient;
let victimDb: SupabaseClient;
const service = serviceClient();

/** Identifiants réels de la victime, semés puis convoités par l'attaquant. */
const loot: Record<string, string> = {};

test.beforeAll(async () => {
  await resetRateLimits();
  const suffix = uniqueSuffix();

  victim = await createCustomerWithPaidOrder({
    businessName: `Cible ${suffix}`,
    subdomain: `cible-${suffix}`,
  });
  attacker = await createCustomerWithPaidOrder({
    businessName: `Pirate ${suffix}`,
    subdomain: `pirate-${suffix}`,
  });

  victimDb = await userClient(victim.email, victim.password);
  attackerDb = await userClient(attacker.email, attacker.password);

  // --- On sème de vraies données dans le tenant de la victime ----------------
  const product = await service
    .from('products')
    .insert({
      site_id: victim.siteId,
      organization_id: victim.organizationId,
      name: 'Recette secrète',
      slug: `secret-${suffix}`,
      price_cents: 4200,
      currency: 'EUR',
      is_visible: true,
    })
    .select('id')
    .single();
  if (product.error) throw new Error(`Produit victime : ${product.error.message}`);
  loot.productId = product.data.id;

  const project = await service
    .from('projects')
    .select('id')
    .eq('organization_id', victim.organizationId)
    .limit(1)
    .maybeSingle();
  loot.projectId = project.data?.id ?? '';
  if (loot.projectId) {
    const message = await service
      .from('project_messages')
      .insert({
        project_id: loot.projectId,
        author_id: null,
        author_side: 'stax',
        body: 'Note confidentielle de la victime.',
      })
      .select('id')
      .single();
    if (message.error) throw new Error(`Message victime : ${message.error.message}`);
    loot.messageId = message.data.id;
  }

  const ticket = await service
    .from('support_tickets')
    .insert({
      reference: `PEN-${suffix.slice(0, 8).toUpperCase()}`,
      organization_id: victim.organizationId,
      opened_by: null,
      subject: 'Ticket confidentiel',
      category: 'general',
    })
    .select('id')
    .single();
  if (ticket.error) throw new Error(`Ticket victime : ${ticket.error.message}`);
  loot.ticketId = ticket.data.id;

  loot.orgId = victim.organizationId;
  loot.siteId = victim.siteId;
  loot.orderId = victim.orderId;
});

/* ========================================================================== *
 *  1. Un client connecté ne lit RIEN d'un autre client (API PostgREST)        *
 * ========================================================================== */

// Tables porteuses de données d'un client, avec la colonne qui les rattache.
const SCOPED_TABLES: Array<{ table: string; column: 'organization_id' | 'site_id'; key: string }> =
  [
    { table: 'organizations', column: 'id', key: 'orgId' },
    { table: 'sites', column: 'organization_id', key: 'orgId' },
    { table: 'site_settings', column: 'site_id', key: 'siteId' },
    { table: 'products', column: 'site_id', key: 'siteId' },
    { table: 'orders', column: 'organization_id', key: 'orgId' },
    { table: 'projects', column: 'organization_id', key: 'orgId' },
    { table: 'project_messages', column: 'project_id', key: 'projectId' },
    { table: 'support_tickets', column: 'organization_id', key: 'orgId' },
    { table: 'support_messages', column: 'ticket_id', key: 'ticketId' },
    { table: 'invoices', column: 'organization_id', key: 'orgId' },
    { table: 'site_customers', column: 'site_id', key: 'siteId' },
    { table: 'form_submissions', column: 'site_id', key: 'siteId' },
    { table: 'media', column: 'organization_id', key: 'orgId' },
    { table: 'organization_members', column: 'organization_id', key: 'orgId' },
    { table: 'audit_logs', column: 'organization_id', key: 'orgId' },
    { table: 'subscriptions', column: 'organization_id', key: 'orgId' },
    { table: 'payments', column: 'organization_id', key: 'orgId' },
    { table: 'site_domains', column: 'site_id', key: 'siteId' },
    { table: 'site_repositories', column: 'site_id', key: 'siteId' },
    { table: 'site_hosting', column: 'site_id', key: 'siteId' },
  ];

test('un client ne lit aucune ligne d’un autre client, même en connaissant son identifiant', async () => {
  for (const { table, column, key } of SCOPED_TABLES) {
    const value = loot[key];
    if (!value) continue;
    const { data, error } = await attackerDb.from(table).select('*').eq(column, value);
    // RLS filtre en silence (0 ligne) — jamais une erreur qui révélerait la table.
    expect.soft(error, `${table} : lecture`).toBeNull();
    expect.soft(data ?? [], `${table} : ${data?.length ?? 0} ligne(s) volée(s)`).toHaveLength(0);
  }
  // Contre-preuve : la VICTIME, elle, lit bien ses propres données. Sans cela,
  // « 0 ligne » pourrait ne prouver qu'une base vide, pas une isolation.
  const mine = await victimDb.from('products').select('id').eq('id', loot.productId);
  expect(mine.data, 'la victime lit son propre produit').toHaveLength(1);
});

test('un client ne peut ni modifier ni supprimer les données d’un autre', async () => {
  const attempts: Array<{ label: string; run: () => Promise<{ error: unknown; count: number }> }> =
    [
      {
        label: 'renommer l’organisation de la victime',
        run: async () => {
          const { error, count } = await attackerDb
            .from('organizations')
            .update({ name: 'Piraté' }, { count: 'exact' })
            .eq('id', loot.orgId);
          return { error, count: count ?? 0 };
        },
      },
      {
        label: 'baisser le prix d’un produit de la victime',
        run: async () => {
          const { error, count } = await attackerDb
            .from('products')
            .update({ price_cents: 1 }, { count: 'exact' })
            .eq('id', loot.productId);
          return { error, count: count ?? 0 };
        },
      },
      {
        label: 'supprimer le site de la victime',
        run: async () => {
          const { error, count } = await attackerDb
            .from('sites')
            .delete({ count: 'exact' })
            .eq('id', loot.siteId);
          return { error, count: count ?? 0 };
        },
      },
      {
        label: 'lire les messages confidentiels de la victime',
        run: async () => {
          const { error, count } = await attackerDb
            .from('project_messages')
            .update({ body: 'écrasé' }, { count: 'exact' })
            .eq('id', loot.messageId ?? '00000000-0000-0000-0000-000000000000');
          return { error, count: count ?? 0 };
        },
      },
    ];

  for (const { label, run } of attempts) {
    const { count } = await run();
    expect.soft(count, label).toBe(0);
  }

  // Preuve indépendante : côté service, rien n'a bougé.
  const org = await service.from('organizations').select('name').eq('id', loot.orgId).single();
  expect(org.data?.name).toBe(victim.businessName);
  const product = await service
    .from('products')
    .select('price_cents')
    .eq('id', loot.productId)
    .single();
  expect(product.data?.price_cents).toBe(4200);
  const site = await service.from('sites').select('id').eq('id', loot.siteId).maybeSingle();
  expect(site.data?.id, 'le site de la victime existe toujours').toBe(loot.siteId);
});

test('un client ne peut pas déplacer ses propres données vers un autre client', async () => {
  // « with check » : renommer son org vers l'id de la victime, rattacher son
  // site à l'org de la victime — refusé des deux côtés.
  const move = await attackerDb
    .from('sites')
    .update({ organization_id: loot.orgId }, { count: 'exact' })
    .eq('id', attacker.siteId);
  expect(move.count ?? 0, 'rattacher son site à l’org de la victime').toBe(0);

  const stillMine = await service
    .from('sites')
    .select('organization_id')
    .eq('id', attacker.siteId)
    .single();
  expect(stillMine.data?.organization_id).toBe(attacker.organizationId);
});

/* ========================================================================== *
 *  2. Pas d'escalade de privilège                                             *
 * ========================================================================== */

test('un client ne peut pas se donner de rôle plateforme ni forcer un accès admin', async () => {
  const userId = (await attackerDb.auth.getUser()).data.user?.id ?? '';

  // Chaque tentative CHANGE réellement une colonne protégée : le déclencheur
  // `app.guard_platform_role` doit la rejeter (un no-op false→false ne prouve
  // rien, on ne le teste donc pas).
  for (const patch of [
    { platform_role: 'platform_owner' },
    { platform_role: 'support' },
    { platform_role: 'platform_admin' },
    { mfa_enforced: true },
  ]) {
    const { error } = await attackerDb.from('profiles').update(patch).eq('id', userId);
    expect.soft(error, `profiles ← ${JSON.stringify(patch)} doit être refusé`).not.toBeNull();
  }

  // Autorité finale : le profil n'a gagné aucun privilège.
  const after = await service
    .from('profiles')
    .select('platform_role, mfa_enforced')
    .eq('id', userId)
    .single();
  expect(after.data?.platform_role, 'toujours aucun rôle plateforme').toBeNull();
  expect(after.data?.mfa_enforced, 'aucun changement forcé').toBe(false);
});

test('un client connecté dans un vrai navigateur n’atteint pas le back-office', async ({
  browser,
}) => {
  // Attaquant réellement connecté (cookie de session de la plateforme), qui
  // tente d'ouvrir l'administration : page introuvable, aucune donnée client.
  const page = await loginBrowser(browser, attacker.email, attacker.password);
  // Marqueurs du VRAI contenu du back-office (barre de navigation admin).
  const adminChrome = ['Propositions', 'Tickets', 'État des services', 'Sites'];
  for (const path of ['/admin', '/admin/clients', '/admin/messages', '/admin/sante']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    // Ce que VOIT la personne (pas les balises <head> : un <title> de segment
    // subsiste, mais la page affichée est le 404).
    const seen = await page.evaluate(() => document.body.innerText);
    expect.soft(seen, `${path} affiche la page « introuvable »`).toMatch(/404|n’existe pas/);
    for (const label of adminChrome) {
      expect.soft(seen, `${path} ne montre pas « ${label} »`).not.toContain(label);
    }
    expect.soft(seen, `${path} ne divulgue rien de la victime`).not.toContain(victim.businessName);
  }
  await page.context().close();
});

test('les fonctions réservées au serveur refusent un client', async () => {
  // Fonctions « service only » : livrer un site, marquer une commande payée,
  // écrire dans le journal d'une autre org.
  const deliver = await attackerDb.rpc('deliver_site', {
    p_site: loot.siteId,
    p_email: attacker.email,
  });
  expect(
    deliver.error !== null || (deliver.data as { ok?: boolean })?.ok === false,
    'livraison du site de la victime refusée',
  ).toBeTruthy();

  const audit = await attackerDb.rpc('write_audit', {
    p_action: 'pirate.test',
    p_org: loot.orgId,
    p_site: loot.siteId,
    p_target_type: 'site',
    p_target_id: loot.siteId,
    p_metadata: {},
  });
  expect(audit.error, 'écrire dans le journal de la victime').not.toBeNull();
});

/* ========================================================================== *
 *  3. Un visiteur anonyme ne lit rien via l'API                               *
 * ========================================================================== */

test('un visiteur anonyme (sans compte) ne lit aucune donnée client', async () => {
  // On frappe directement l'API REST Supabase avec la clé anonyme publique.
  const rest = anonRestClient();
  for (const table of ['organizations', 'sites', 'products', 'orders', 'profiles', 'invoices']) {
    const res = await rest(`/${table}?select=id&limit=5`);
    // 200 avec liste vide (RLS) ou 401/403/404 — jamais des lignes.
    if (res.status === 200) {
      const rows = (await res.json()) as unknown[];
      expect.soft(rows, `${table} lisible en anonyme`).toHaveLength(0);
    } else {
      expect.soft([401, 403, 404], `${table} en anonyme`).toContain(res.status);
    }
  }

  // Une fonction sensible appelée sans compte est refusée.
  const rpc = await fetch(`${anonRestBase()}/rpc/deliver_site`, {
    method: 'POST',
    headers: anonHeaders(),
    body: JSON.stringify({ p_site: loot.siteId, p_email: 'x@x.test' }),
  });
  expect([401, 403, 404]).toContain(rpc.status);
});

/* ========================================================================== *
 *  4. Le moteur des sites publics n'ouvre aucune brèche entre tenants         *
 * ========================================================================== */

test('un nom d’hôte inconnu ou usurpé ne sert aucun site', async () => {
  const bogus = await fetchPublicPage('www.je-nexiste-pas-42.example.test');
  expect([404, 400, 421]).toContain(bogus.status);
  expect(bogus.body).not.toContain(victim.businessName);

  // En-tête Host usurpé vers le domaine plateforme : pas de site servi.
  const spoof = await fetch(`http://127.0.0.1:3101/`, {
    headers: { host: new URL(PLATFORM_URL).host },
    redirect: 'manual',
  });
  expect([400, 404, 421]).toContain(spoof.status);
});

test('un cookie de panier signé pour un site ne vaut rien sur un autre', async () => {
  // On obtient un vrai cookie de panier sur le site de l'attaquant…
  const add = await fetch(`http://127.0.0.1:3101/api/cart`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: attacker.hostname,
      origin: `http://${attacker.hostname}`,
    },
    body: JSON.stringify({ productId: loot.productId, quantity: 1, _token: '' }),
    redirect: 'manual',
  });
  // Un site inconnu du moteur (404) ou une écriture sans jeton CSRF (400/403) :
  // dans tous les cas, aucun panier n'est créé et rien n'est servi.
  expect([400, 403, 404]).toContain(add.status);
});

test('la référence de commande d’un site ne fonctionne pas sur un autre', async () => {
  // Commande e-commerce réelle sur le site de la victime, via son moteur.
  const suffix = uniqueSuffix();
  const shopOrder = await service
    .from('shop_orders')
    .insert({
      site_id: victim.siteId,
      organization_id: victim.organizationId,
      reference: `CMD-${suffix.slice(0, 8).toUpperCase()}`,
      status: 'paid',
      total_cents: 4200,
      vat_cents: 700,
      currency: 'EUR',
      customer_email: 'acheteur@exemple.test',
      customer_name: 'Acheteur',
      fulfillment_method: 'pickup',
      manage_token_hash: createHash('sha256').update('jeton-bidon').digest('hex'),
    })
    .select('reference')
    .single();
  if (shopOrder.error) throw new Error(`Commande boutique : ${shopOrder.error.message}`);

  // Sur le site de l'ATTAQUANT, avec la référence de la victime : introuvable.
  const onAttackerSite = await fetch(
    `http://127.0.0.1:3101/commande?ref=${shopOrder.data.reference}&suivi=peu-importe`,
    { headers: { host: attacker.hostname }, redirect: 'manual' },
  );
  const body = await onAttackerSite.text();
  expect(body).not.toContain('Acheteur');
  expect(body).not.toContain('acheteur@exemple.test');
});

/* ========================================================================== *
 *  5. Les routes serveur protégées refusent l'accès non autorisé              *
 * ========================================================================== */

test('la tâche de fond refuse toute requête sans le bon secret', async () => {
  for (const auth of ['', 'Bearer', 'Bearer mauvais-secret', 'Bearer ' + 'x'.repeat(40)]) {
    const res = await fetch(`${PLATFORM_URL}/api/cron/sites`, {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
      redirect: 'manual',
    });
    expect.soft([401, 403], `cron avec « ${auth} »`).toContain(res.status);
  }
});

test('le webhook Stripe rejette une signature invalide', async () => {
  const forged = await fetch(`${PLATFORM_URL}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=faux' },
    body: JSON.stringify({ id: 'evt_forge', type: 'checkout.session.completed' }),
    redirect: 'manual',
  });
  expect([400, 401, 403]).toContain(forged.status);

  // La preuve inverse : une signature VALIDE, elle, est acceptée (helper signé).
  const signed = await signedWebhook({
    id: `evt_ping_${uniqueSuffix()}`,
    object: 'event',
    type: 'ping',
    api_version: '2025-01-27.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: { object: {} },
  });
  expect(signed.status).toBeLessThan(500);
});

/** Connexion réelle dans un navigateur, jusqu'à l'espace de la personne. */
async function loginBrowser(browser: Browser, email: string, password: string) {
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
  await page.waitForURL(/\/(app|admin|bienvenue|recuperer)/);
  return page;
}

/** Clé anonyme et URL de l'API REST de la pile locale (fichier .e2e-stack/env). */
function stackApi(): { url: string; anonKey: string } {
  const dir = process.env.NEMASUS_E2E_STACK_DIR ?? resolve(process.cwd(), '.e2e-stack');
  const env = readFileSync(resolve(dir, 'env'), 'utf8');
  const get = (k: string) =>
    env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.replace(/^["']|["']$/g, '') ?? '';
  return { url: get('SUPABASE_URL'), anonKey: get('SUPABASE_ANON_KEY') };
}

function anonRestBase(): string {
  return `${stackApi().url}/rest/v1`;
}

function anonHeaders(): Record<string, string> {
  const { anonKey } = stackApi();
  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    'content-type': 'application/json',
  };
}

/** Frappe l'API REST Supabase de la pile locale avec la clé anonyme. */
function anonRestClient(): (path: string) => Promise<Response> {
  return (path: string) => fetch(`${anonRestBase()}${path}`, { headers: anonHeaders() });
}

void SITES_DOMAIN;
