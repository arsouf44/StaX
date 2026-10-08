import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ContentDocument, SiteManifest } from '@nemasus/site-contract';
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
 * MEMES fonctions que la production (commande enregistree par le serveur,
 * modalites de virement puis paiement confirme par l'equipe, code d'acces
 * consomme par le serveur, script de provisionnement du compte interne,
 * rattachement du depot et du projet Cloudflare par l'equipe, livraison).
 * Seuls les fournisseurs externes sont remplaces : GitHub et Cloudflare (faux
 * fournisseurs de la pile, memes API). Aucun virement n'est evidemment emis :
 * c'est l'equipe qui declare l'avoir recu, comme en production.
 */

const ROOT = resolve(__dirname, '../../../..');
const STACK_DIR = process.env.NEMASUS_E2E_STACK_DIR ?? resolve(ROOT, '.e2e-stack');

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
export const SITES_DOMAIN = 'sites.nemasus.test';

const SUPABASE_URL = stackEnv['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';
const ANON_KEY = stackEnv['SUPABASE_ANON_KEY'] ?? '';
const SERVICE_KEY = stackEnv['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

/** Cle de signature de la plateforme : meme derivation que tests/e2e/stack/serve.sh. */
function platformSecret(): string {
  if (process.env.NEMASUS_SECRET_KEY) return process.env.NEMASUS_SECRET_KEY;
  const jwtSecret = readFileSync(resolve(STACK_DIR, 'jwt-secret'), 'utf8').trim();
  return `${jwtSecret}-nemasus-e2e-secret`;
}

/** Code d'acces lisible, meme alphabet que la plateforme (ni 0, O, 1, I, L). */
export function newAccessCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Empreinte HMAC d'un code, identique a `hashActivationCode` du serveur. */
export function accessCodeHash(code: string): string {
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const normalized = (clean.match(/.{1,4}/g) ?? []).join('-');
  return createHmac('sha256', platformSecret())
    .update(`activation-code:${normalized}`)
    .digest('hex');
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

/** Empreinte d'un jeton de reinitialisation, identique a celle du serveur. */
export function passwordResetHash(token: string): string {
  return createHmac('sha256', platformSecret()).update(`password-reset:${token}`).digest('hex');
}

/* -------------------------------------------------------------------------- */
/*  Client ordinaire : commande + virement confirme + code = site prepare      */
/* -------------------------------------------------------------------------- */

export interface CustomerSite {
  email: string;
  password: string;
  businessName: string;
  organizationId: string;
  /** Commande de site (`site_orders`). */
  orderId: string;
  siteId: string;
  /** Domaine du site (projet Cloudflare) ; vide tant qu'il n'est pas livre. */
  hostname: string;
  /** Depot et projet du site chez les faux fournisseurs ; `null` avant la livraison. */
  infrastructure: SiteInfrastructure | null;
}

export interface PaidSiteOrder {
  orderId: string;
  reference: string;
  organizationId: string;
  siteId: string;
  /** Code d'acces en clair, tel que le client le recoit par e-mail. */
  code: string;
}

/**
 * Commande puis virement confirme, par les memes fonctions que la production :
 * enregistrement par le serveur (`submit_site_order`), modalites puis paiement
 * confirmes par une personne de l'equipe, avec son propre jeton.
 */
export async function createPaidSiteOrder(options: {
  businessName: string;
  email: string;
  firstName?: string;
  lastName?: string;
  sectorSlug?: string;
  businessType?: string;
  amountCents?: number;
}): Promise<PaidSiteOrder> {
  const admin = serviceClient();
  const submitted = await admin.rpc('submit_site_order', {
    p_company: options.businessName,
    p_first_name: options.firstName ?? 'Marie',
    p_last_name: options.lastName ?? 'Dupont',
    p_email: options.email,
    p_phone: '0600000000',
    p_city: 'Lyon',
    p_sector: options.sectorSlug ?? 'restauration',
    p_business_type: options.businessType ?? 'boulangerie',
    p_description: `Site de ${options.businessName}`,
    p_answers: {},
    p_domain_handling: 'later',
    p_domain: null,
    p_terms_version: 'e2e',
    p_ip_hash: null,
  });
  const order = (submitted.data ?? {}) as { ok?: boolean; orderId?: string; reference?: string };
  if (submitted.error || !order.ok || !order.orderId || !order.reference) {
    throw new Error(`Commande : ${submitted.error?.message ?? JSON.stringify(submitted.data)}`);
  }

  const staffAccount = await createStaffAccount('platform_admin');
  const staff = await userClient(staffAccount.email, staffAccount.password);
  const amount = options.amountCents ?? 120_000;
  const requested = await staff.rpc('request_site_order_payment', {
    p_order: order.orderId,
    p_amount_cents: amount,
    p_message: 'Création du site et mise en ligne.',
  });
  if (requested.error || !(requested.data as { ok?: boolean })?.ok) {
    throw new Error(`Modalites : ${requested.error?.message ?? JSON.stringify(requested.data)}`);
  }

  const code = newAccessCode();
  const confirmed = await staff.rpc('confirm_site_order_payment', {
    p_order: order.orderId,
    p_amount_cents: amount,
    p_code_hash: accessCodeHash(code),
    p_code_hint: code.replace(/-/g, '').slice(-4),
    p_valid_days: 30,
    p_site: null,
  });
  const paid = (confirmed.data ?? {}) as { ok?: boolean; organizationId?: string; siteId?: string };
  if (confirmed.error || !paid.ok || !paid.organizationId || !paid.siteId) {
    throw new Error(`Paiement : ${confirmed.error?.message ?? JSON.stringify(confirmed.data)}`);
  }
  return {
    orderId: order.orderId,
    reference: order.reference,
    organizationId: paid.organizationId,
    siteId: paid.siteId,
    code,
  };
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
  sectorSlug?: string;
  businessType?: string;
  /**
   * Mentions legales deja saisies par le client (defaut : oui). Le parcours
   * client principal les laisse vides pour les saisir lui-meme dans
   * « Mon entreprise ».
   */
  withLegalIdentity?: boolean;
  /**
   * Site construit par Nemasus et confie au client (defaut : oui). `false` :
   * commande payee, site encore en construction, que le client ne voit pas.
   */
  delivered?: boolean;
  /** Contrat d'édition et contenu du site livré (défaut : site minimal). */
  manifest?: SiteManifest;
  content?: ContentDocument;
}): Promise<CustomerSite> {
  const admin = serviceClient();
  const suffix = uniqueSuffix();
  const email = `client-${suffix}@exemple.test`;
  const password = randomPassword();

  const paidOrder = await createPaidSiteOrder({
    businessName: options.businessName,
    email,
    ...(options.sectorSlug ? { sectorSlug: options.sectorSlug } : {}),
    ...(options.businessType ? { businessType: options.businessType } : {}),
  });

  // Le client a deja ouvert son espace avec son code et choisi un mot de
  // passe (parcours verifie par bank-transfer.spec.ts) : compte confirme, puis
  // code consomme par le serveur pour ce compte, comme le fait `/acces`.
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: 'Marie', last_name: 'Dupont' },
  });
  if (created.error) throw new Error(`Compte client : ${created.error.message}`);
  const redeemed = await admin.rpc('redeem_activation_code', {
    p_code_hash: accessCodeHash(paidOrder.code),
    p_user_id: created.data.user.id,
    p_email: email,
  });
  const redemption = (redeemed.data ?? {}) as { ok?: boolean; code?: string };
  if (redeemed.error || !redemption.ok) {
    throw new Error(`Code d'acces : ${redeemed.error?.message ?? redemption.code ?? ''}`);
  }

  const db = await userClient(email, password);
  const { organizationId, orderId, siteId } = paidOrder;

  // L'equipe Nemasus developpe le site HORS de Nemasus (depot + projet Cloudflare),
  // le rattache, verifie la checklist, puis le livre. Le parcours complet par
  // l'interface d'administration est couvert par external-site.spec.ts ; ici,
  // les memes fonctions sont appelees directement.
  if (options.delivered === false) {
    return {
      email,
      password,
      businessName: options.businessName,
      organizationId,
      orderId,
      siteId,
      hostname: '',
      infrastructure: null,
    };
  }
  const delivered = await buildAndDeliverSite(siteId, {
    businessName: options.businessName,
    slug: options.subdomain,
    email,
    ...(options.manifest ? { manifest: options.manifest } : {}),
    ...(options.content ? { content: options.content } : {}),
  });

  if (options.withLegalIdentity !== false) {
    // Saisi par le client lui-meme, avec son jeton : la RLS s applique.
    const identity = await db
      .from('site_settings')
      .update({ legal_identity: legalIdentityFixture(options.businessName) })
      .eq('site_id', siteId);
    if (identity.error) throw new Error(`Mentions legales : ${identity.error.message}`);
  }

  return {
    email,
    password,
    businessName: options.businessName,
    organizationId,
    orderId,
    siteId,
    hostname: delivered.hostname,
    infrastructure: delivered.infrastructure,
  };
}

/** Compte de l'equipe Nemasus (role plateforme), cree avec la cle de service. */
export async function createStaffAccount(
  role: 'platform_owner' | 'platform_admin' | 'designer' | 'support',
): Promise<{ email: string; password: string; id: string }> {
  const admin = serviceClient();
  const email = `equipe-${uniqueSuffix()}@nemasus.test`;
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
 * Le site developpe par l'equipe est rattache a Nemasus puis livre :
 *   depot GitHub + projet Cloudflare (faux fournisseurs) -> rattachement par
 *   une personne de l'equipe -> contrat d'edition et version 1 -> domaine ->
 *   checklist -> `deliver_site`.
 */
export async function buildAndDeliverSite(
  siteId: string,
  options: {
    businessName: string;
    slug: string;
    email: string;
    manifest?: SiteManifest;
    content?: ContentDocument;
  },
): Promise<{ hostname: string; infrastructure: SiteInfrastructure }> {
  const admin = serviceClient();
  const staffAccount = await createStaffAccount('platform_admin');
  const staff = await userClient(staffAccount.email, staffAccount.password);

  const infrastructure = await createSiteInfrastructure(admin, {
    slug: options.slug,
    siteName: options.businessName,
    title: `${options.businessName}, bienvenue`,
    ...(options.manifest ? { manifest: options.manifest } : {}),
    ...(options.content ? { content: options.content } : {}),
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
