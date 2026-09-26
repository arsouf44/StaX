import { createHash, createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  completeDeliveryChecklist,
  connectSiteInfrastructure,
  createSiteInfrastructure,
  type SiteInfrastructure,
} from './external-site';

/**
 * Acces a la pile locale (tests/e2e/stack) pour les parcours de bout en bout.
 *
 * Rien ici ne contourne le produit : les donnees de depart passent par les
 * MEMES fonctions que la production (creation de commande par le client,
 * webhook de paiement signe, script de provisionnement du compte interne,
 * rattachement du depot et du projet Cloudflare par l'equipe, livraison).
 * Seuls les fournisseurs externes sont remplaces : Stripe (le test signe
 * lui-meme l'evenement « paiement reussi »), GitHub et Cloudflare (faux
 * fournisseurs de la pile, memes API).
 */

const ROOT = resolve(__dirname, '../../../..');
const STACK_DIR = process.env.STAX_E2E_STACK_DIR ?? resolve(ROOT, '.e2e-stack');

function readStackEnv(): Record<string, string> {
  const raw = readFileSync(resolve(STACK_DIR, 'env'), 'utf8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match?.[1]) env[match[1]] = (match[2] ?? '').replace(/^['"]|['"]$/g, '');
  }
  return env;
}

export const stackEnv = readStackEnv();

export const PLATFORM_URL = 'http://127.0.0.1:3100';
export const SITES_PORT = 3101;
export const SITES_DOMAIN = 'sites.stax.test';

const SUPABASE_URL = stackEnv['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const ANON_KEY = stackEnv['SUPABASE_ANON_KEY'] ?? '';
const SERVICE_KEY = stackEnv['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

/** Meme derivation que tests/e2e/stack/serve.sh. */
function webhookSecret(): string {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  const jwtSecret = readFileSync(resolve(STACK_DIR, 'jwt-secret'), 'utf8').trim();
  const digest = createHash('sha256').update(`${jwtSecret}-stripe-webhook`).digest('hex');
  return `whsec_${digest.slice(0, 48)}`;
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/**
 * Remet a zero la limitation de debit de la pile locale.
 *
 * Tous les parcours se connectent depuis la meme adresse (127.0.0.1) : sans
 * cela, la limite de dix connexions par cinq minutes — la vraie, celle de la
 * production — serait atteinte au milieu de la suite.
 */
export async function resetRateLimits(): Promise<void> {
  const { error } = await serviceClient().from('rate_limit_counters').delete().gte('count', 0);
  if (error) throw new Error(`Limitation de debit : ${error.message}`);
}

export async function userClient(email: string, password: string): Promise<SupabaseClient> {
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Connexion impossible : ${error?.message}`);
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
}

export function randomPassword(): string {
  return `E2e-${randomBytes(12).toString('base64url')}-9!`;
}

/* -------------------------------------------------------------------------- */
/*  Client ordinaire : commande + paiement (webhook signe) = site prepare      */
/* -------------------------------------------------------------------------- */

export interface CustomerSite {
  email: string;
  password: string;
  businessName: string;
  organizationId: string;
  orderId: string;
  siteId: string;
  /** Domaine du site (projet Cloudflare) ; vide tant qu'il n'est pas livre. */
  hostname: string;
  /** Depot et projet du site chez les faux fournisseurs ; `null` avant la livraison. */
  infrastructure: SiteInfrastructure | null;
}

export async function signedWebhook(event: Record<string, unknown>): Promise<Response> {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', webhookSecret())
    .update(`${timestamp}.${body}`)
    .digest('hex');
  return fetch(`${PLATFORM_URL}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

/** Mentions legales plausibles pour un site de test (aucune n est reelle). */
export function legalIdentityFixture(businessName: string) {
  return {
    legalName: `${businessName} SAS`,
    legalForm: 'SAS',
    capital: '1 000 €',
    registration: 'RCS Lyon 000 000 000',
    address: '1 rue de la Paix, 69001 Lyon',
    publicationDirector: 'Marie Dupont',
  };
}

/** Le client saisit ses mentions legales dans « Mon entreprise », comme il le ferait. */
export async function fillLegalIdentity(page: Page, businessName: string): Promise<void> {
  const values = legalIdentityFixture(businessName);
  await page.goto('/app/entreprise');
  const form = page.getByTestId('legal-identity');
  await form.getByLabel('Raison sociale ou nom').fill(values.legalName);
  await form.getByLabel('Forme juridique').fill(values.legalForm);
  await form.getByLabel('Capital social').fill(values.capital);
  await form.getByLabel('Immatriculation').fill(values.registration);
  await form.getByLabel('Adresse du siège').fill(values.address);
  await form.getByLabel('Directeur de la publication').fill(values.publicationDirector);
  await form.getByRole('button', { name: 'Enregistrer mes mentions légales' }).click();
  await expect(form.getByText('Mentions légales enregistrées')).toBeVisible();
}

export async function createCustomerWithPaidOrder(options: {
  businessName: string;
  subdomain: string;
  planSlug?: string;
  sectorSlug?: string;
  businessType?: string;
  /**
   * Mentions legales deja saisies par le client (defaut : oui). Le parcours
   * client principal les laisse vides pour les saisir lui-meme dans
   * « Mon entreprise ».
   */
  withLegalIdentity?: boolean;
  /**
   * Site construit par StaX et confie au client (defaut : oui). `false` :
   * commande payee, site encore en construction, que le client ne voit pas.
   */
  delivered?: boolean;
}): Promise<CustomerSite> {
  const admin = serviceClient();
  const suffix = uniqueSuffix();
  const email = `client-${suffix}@exemple.test`;
  const password = randomPassword();

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: 'Marie', last_name: 'Dupont' },
  });
  if (created.error) throw new Error(`Compte client : ${created.error.message}`);

  // Tout ce qui suit est fait PAR LE CLIENT, avec son propre jeton : la RLS
  // s applique comme dans le tunnel de commande.
  const db = await userClient(email, password);
  const org = await db
    .from('organizations')
    .insert({
      name: options.businessName,
      slug: `org-${suffix}`,
      created_by: created.data.user.id,
      billing_email: email,
      city: 'Lyon',
      sector_slug: options.sectorSlug ?? 'restauration',
      business_type_slug: options.businessType ?? 'boulangerie',
    })
    .select('id')
    .single();
  if (org.error) throw new Error(`Organisation : ${org.error.message}`);

  const plan = await admin
    .from('plans')
    .select('id')
    .eq('slug', options.planSlug ?? 'premium')
    .eq('is_active', true)
    .is('valid_until', null)
    .single();
  if (plan.error) throw new Error(`Offre : ${plan.error.message}`);

  const order = await db.rpc('create_order', {
    p_organization_id: org.data.id,
    p_plan_id: plan.data.id,
    p_sector_slug: options.sectorSlug ?? 'restauration',
    p_business_type: options.businessType ?? 'boulangerie',
    p_questionnaire: { businessName: options.businessName, city: 'Lyon', contactEmail: email },
    p_requested_domain: options.subdomain,
    p_domain_handling: 'subdomain_only',
    p_terms_version: 'e2e',
  });
  if (order.error || typeof order.data !== 'string') {
    throw new Error(`Commande : ${order.error?.message ?? 'identifiant absent'}`);
  }
  const orderId = order.data;

  // « Stripe » confirme le paiement : le webhook de la plateforme enregistre la
  // commande et cree le site, VIDE et non confie, comme en production.
  const response = await signedWebhook({
    id: `evt_e2e_${suffix}`,
    object: 'event',
    type: 'checkout.session.completed',
    api_version: '2025-01-27.acacia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: `cs_e2e_${suffix}`,
        object: 'checkout.session',
        client_reference_id: orderId,
        metadata: { stax_order_id: orderId },
        payment_status: 'paid',
        payment_intent: `pi_e2e_${suffix}`,
        customer: null,
        subscription: null,
      },
    },
  });
  if (!response.ok) throw new Error(`Webhook : ${response.status} ${await response.text()}`);

  const paid = await admin.from('orders').select('status, site_id').eq('id', orderId).single();
  if (paid.error || paid.data.status !== 'paid' || !paid.data.site_id) {
    throw new Error(`Commande non payee apres le webhook : ${JSON.stringify(paid.data)}`);
  }

  // L'equipe StaX developpe le site HORS de StaX (depot + projet Cloudflare),
  // le rattache, verifie la checklist, puis le livre. Le parcours complet par
  // l'interface d'administration est couvert par external-site.spec.ts ; ici,
  // les memes fonctions sont appelees directement.
  if (options.delivered === false) {
    return {
      email,
      password,
      businessName: options.businessName,
      organizationId: org.data.id,
      orderId,
      siteId: paid.data.site_id as string,
      hostname: '',
      infrastructure: null,
    };
  }
  const delivered = await buildAndDeliverSite(paid.data.site_id as string, {
    businessName: options.businessName,
    slug: options.subdomain,
    email,
  });

  if (options.withLegalIdentity !== false) {
    // Saisi par le client lui-meme, avec son jeton : la RLS s applique.
    const identity = await db
      .from('site_settings')
      .update({ legal_identity: legalIdentityFixture(options.businessName) })
      .eq('site_id', paid.data.site_id);
    if (identity.error) throw new Error(`Mentions legales : ${identity.error.message}`);
  }

  return {
    email,
    password,
    businessName: options.businessName,
    organizationId: org.data.id,
    orderId,
    siteId: paid.data.site_id as string,
    hostname: delivered.hostname,
    infrastructure: delivered.infrastructure,
  };
}

/** Compte de l'equipe StaX (role plateforme), cree avec la cle de service. */
export async function createStaffAccount(
  role: 'platform_owner' | 'platform_admin' | 'designer' | 'support',
): Promise<{ email: string; password: string; id: string }> {
  const admin = serviceClient();
  const email = `equipe-${uniqueSuffix()}@stax.test`;
  const password = randomPassword();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`Compte equipe : ${created.error.message}`);
  const id = created.data.user.id;
  const updated = await admin
    .from('profiles')
    .update({ platform_role: role, mfa_enforced: false })
    .eq('id', id);
  if (updated.error) throw new Error(`Role equipe : ${updated.error.message}`);
  return { email, password, id };
}

/**
 * Le site developpe par l'equipe est rattache a StaX puis livre :
 *   depot GitHub + projet Cloudflare (faux fournisseurs) -> rattachement par
 *   une personne de l'equipe -> contrat d'edition et version 1 -> domaine ->
 *   checklist -> `deliver_site`.
 */
export async function buildAndDeliverSite(
  siteId: string,
  options: { businessName: string; slug: string; email: string },
): Promise<{ hostname: string; infrastructure: SiteInfrastructure }> {
  const admin = serviceClient();
  const staffAccount = await createStaffAccount('platform_admin');
  const staff = await userClient(staffAccount.email, staffAccount.password);

  const infrastructure = await createSiteInfrastructure(admin, {
    slug: options.slug,
    siteName: options.businessName,
    title: `${options.businessName}, bienvenue`,
  });
  await connectSiteInfrastructure(staff, siteId, infrastructure);

  // Domaine du client, rattache au projet Cloudflare du site.
  const site = await admin.from('sites').select('organization_id').eq('id', siteId).single();
  if (site.error) throw new Error(`Site : ${site.error.message}`);
  const hostname = `www.${options.slug}.example.test`;
  const domain = await admin.from('site_domains').insert({
    site_id: siteId,
    organization_id: site.data.organization_id,
    hostname,
    kind: 'custom',
    status: 'active',
    is_primary: true,
    served_by: 'cloudflare_project',
    dns_target: new URL(infrastructure.productionUrl).hostname,
    verification_method: 'cloudflare',
    verified_at: new Date().toISOString(),
  });
  if (domain.error) throw new Error(`Domaine : ${domain.error.message}`);

  await completeDeliveryChecklist(staff, admin, siteId, infrastructure);
  const delivered = await staff.rpc('deliver_site', { p_site: siteId, p_email: options.email });
  const result = (delivered.data ?? {}) as { ok?: boolean; code?: string; missing?: string[] };
  if (delivered.error || !result.ok) {
    throw new Error(
      `Livraison : ${delivered.error?.message ?? result.code ?? ''} ${JSON.stringify(result.missing ?? [])}`,
    );
  }
  return { hostname, infrastructure };
}

/* -------------------------------------------------------------------------- */
/*  Compte interne : provisionne par le VRAI script, mot de passe jetable      */
/* -------------------------------------------------------------------------- */

export function provisionInternalAccount(email: string): { email: string; password: string } {
  const password = randomPassword();
  execFileSync('pnpm', ['--silent', 'internal:bootstrap'], {
    cwd: ROOT,
    env: {
      ...process.env,
      SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      INTERNAL_OWNER_EMAIL: email,
      INTERNAL_OWNER_PASSWORD: password,
      INTERNAL_OWNER_RESET_PASSWORD: 'true',
    },
    stdio: 'pipe',
  });
  return { email, password };
}

/* -------------------------------------------------------------------------- */
/*  Requete HTTP reelle sur le nom d hote public                               */
/* -------------------------------------------------------------------------- */

export interface PublicResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * GET sur le moteur des sites, avec le nom d hote public dans `Host` : c est
 * exactement ce que recoit le Worker derriere Cloudflare.
 */
export function fetchPublicPage(hostname: string, path = '/'): Promise<PublicResponse> {
  return new Promise((resolvePromise, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: SITES_PORT,
        path,
        method: 'GET',
        headers: { Host: hostname, 'cache-control': 'no-cache' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') headers[key] = value;
            else if (Array.isArray(value)) headers[key] = value.join(', ');
          }
          resolvePromise({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(20_000, () => req.destroy(new Error('Delai depasse')));
    req.end();
  });
}

/** Premier titre de niveau 1 de la page publique, sans balises. */
export function firstHeading(html: string): string | null {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!match?.[1]) return null;
  return match[1]
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;|&#x27;/g, '’')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/*  Une vraie image PNG, fabriquee a la volee                                  */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Photo unie de `width` x `height`, couleur RVB donnee. */
export function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // profondeur
  header[9] = 2; // RVB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
