import {
  createServiceClient,
  PostgresRateLimitStore,
  unwrap,
  unwrapList,
  unwrapMaybe,
} from '@stax/database';
import { customerLoginEmail, sendEmail } from '@stax/emails';
import { createConnectCheckoutSession } from '@stax/payments';
import {
  enforceRateLimit,
  hashIp,
  hmacHex,
  randomToken,
  rateLimitIdentity,
  scoreSubmission,
  timingSafeEqual,
  verifyTurnstile,
  visitorHash,
  type RateLimitName,
} from '@stax/security';
import { clientIp, field, intField } from './api/shared';
import { loginTokenHash, newLoginToken } from './api/customer-session';

/**
 * API des sites — pour les sites concus et developpes independamment.
 *
 * Un tel site est servi par SON projet Cloudflare ; ses formulaires, sa mesure
 * d'audience, ses reservations, sa boutique et l'espace de ses clients
 * s'appuient sur StaX via cette API :
 *
 *     https://<api>/v1/sites/<cle publique>/<ressource>
 *
 * Regles :
 *  - le site est identifie par sa cle PUBLIQUE (`sites.public_key`), jamais
 *    par un identifiant interne ; elle n'ouvre aucun droit a elle seule ;
 *  - toute ecriture exige une origine appartenant au site (ses domaines, son
 *    adresse Cloudflare, ses apercus) : un autre site ne peut pas ecrire au
 *    nom de celui-ci depuis un navigateur ;
 *  - chaque operation est limitee en debit, et la base verifie ce que l'offre
 *    du client comprend (`submit_form`, `create_booking`, `create_shop_order`) ;
 *  - l'argent ne transite jamais par StaX : paiement sur le compte Stripe
 *    connecte du commercant.
 *
 * Le rendu du site ne depend PAS de cette API : si StaX est indisponible, le
 * site s'affiche ; seules ces interactions sont suspendues.
 */

interface ApiSite {
  siteId: string;
  organizationId: string;
  name: string;
  available: boolean;
  timezone: string;
  locale: string;
  enabledModules: string[];
  integration: {
    analytics?: boolean;
    customerAccountsLoginPath?: string;
    orderStatusPath?: string;
  };
  businessName: string;
  hosts: string[];
  previewSuffixes: string[];
  features: {
    bookings: boolean;
    ecommerce: boolean;
    onlinePayments: boolean;
    customerAccounts: boolean;
    advancedAnalytics: boolean;
  };
}

const KEY = /^pk_site_[0-9a-f]{32}$/;
const MAX_BODY_BYTES = 64 * 1024;

function cors(origin: string | null): Record<string, string> {
  return origin
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-max-age': '600',
        vary: 'Origin',
      }
    : {};
}

function json(
  body: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...cors(origin),
      ...extra,
    },
  });
}

function refuse(message: string, status: number, code: string, origin: string | null): Response {
  return json({ ok: false, code, message }, status, origin);
}

/** L'origine appartient-elle au site ? Domaines, adresse Cloudflare, apercus. */
export function originAllowed(
  origin: string | null,
  site: Pick<ApiSite, 'hosts' | 'previewSuffixes'>,
): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port) return false;
  const host = url.hostname.toLowerCase();
  if (site.hosts.some((allowed) => allowed.toLowerCase() === host)) return true;
  // Apercus : `<hash>.<projet>.pages.dev` ou `<alias>-<worker>.<compte>.workers.dev`.
  return site.previewSuffixes.some((suffix) => {
    const lower = suffix.toLowerCase();
    return lower.length > 5 && host.endsWith(lower) && host.length > lower.length;
  });
}

async function resolveApiSite(publicKey: string): Promise<ApiSite | null> {
  const { data, error } = await createServiceClient().rpc('resolve_site_api', {
    p_public_key: publicKey,
  });
  if (error || !data) return null;
  return data as ApiSite;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number.parseInt(request.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return null;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function limit(
  site: ApiSite,
  request: Request,
  name: RateLimitName,
): Promise<{ ok: boolean; ipHash: string | null; retry?: number }> {
  const ipHash = await hashIp(clientIp(request));
  try {
    const decision = await enforceRateLimit(
      new PostgresRateLimitStore(createServiceClient()),
      name,
      rateLimitIdentity({ ipHash: `${site.siteId}:${ipHash ?? 'anonymous'}` }),
    );
    return { ok: decision.allowed, ipHash, retry: decision.retryAfterSeconds };
  } catch (error) {
    // Compteur injoignable : on laisse passer, l'incident est journalise.
    console.error('[stax:sites-api] compteur indisponible', error);
    return { ok: true, ipHash };
  }
}

/* -------------------------------------------------------------------------- */
/*  Jeton de session d'un client du site (porte par le site, pas un cookie)   */
/* -------------------------------------------------------------------------- */

const SESSION_DAYS = 30;

async function issueSessionToken(siteId: string, customerId: string): Promise<string> {
  const body = btoa(
    JSON.stringify({ customerId, expiresAt: Date.now() + SESSION_DAYS * 86_400_000 }),
  );
  return `${body}.${await hmacHex(`${siteId}.${body}`, 'customer-api-session')}`;
}

async function readSessionToken(request: Request, siteId: string): Promise<string | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+([A-Za-z0-9+/=]+\.[0-9a-f]{64})$/)?.[1];
  if (!token) return null;
  const [body, signature] = token.split('.') as [string, string];
  if (!timingSafeEqual(signature, await hmacHex(`${siteId}.${body}`, 'customer-api-session')))
    return null;
  try {
    const decoded = JSON.parse(atob(body)) as { customerId?: unknown; expiresAt?: unknown };
    if (typeof decoded.customerId !== 'string' || typeof decoded.expiresAt !== 'number')
      return null;
    return decoded.expiresAt > Date.now() ? decoded.customerId : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Routeur                                                                    */
/* -------------------------------------------------------------------------- */

export function isSitesApiPath(path: string): boolean {
  return path.startsWith('/v1/sites/');
}

export async function handleSitesApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const [, , , publicKey = '', ...rest] = url.pathname.split('/');
  const resource = rest.join('/');
  const origin = request.headers.get('origin');

  if (!KEY.test(publicKey)) return refuse('Site inconnu.', 404, 'unknown_site', null);

  const site = await resolveApiSite(publicKey);
  if (!site) return refuse('Site inconnu.', 404, 'unknown_site', null);

  const allowed = originAllowed(origin, site);
  const replyOrigin = allowed ? origin : null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: allowed ? 204 : 403, headers: cors(replyOrigin) });
  }
  if (!site.available)
    return refuse('Ce site est momentanément indisponible.', 503, 'site_unavailable', replyOrigin);

  // Lecture publique (catalogue, creneaux) : autorisee sans origine (appel
  // serveur a serveur au build du site), refusee depuis une autre origine.
  const isRead = request.method === 'GET';
  if (origin && !allowed)
    return refuse('Origine non autorisée pour ce site.', 403, 'bad_origin', null);
  if (!isRead && !allowed)
    return refuse('Origine non autorisée pour ce site.', 403, 'bad_origin', null);

  try {
    if (resource === 'collect' && request.method === 'POST')
      return await collect(request, site, replyOrigin);
    if (resource.startsWith('forms/') && request.method === 'POST') {
      return await submitForm(request, site, resource.slice('forms/'.length), replyOrigin);
    }
    if (resource === 'catalog' && isRead) return await catalog(site, replyOrigin);
    if (resource === 'bookings/services' && isRead) return await bookingServices(site, replyOrigin);
    if (resource === 'bookings/slots' && isRead) return await bookingSlots(url, site, replyOrigin);
    if (resource === 'bookings' && request.method === 'POST')
      return await createBooking(request, site, replyOrigin);
    if (resource === 'checkout' && request.method === 'POST')
      return await checkout(request, site, replyOrigin);
    if (resource === 'customers/login' && request.method === 'POST')
      return await customerLogin(request, site, replyOrigin);
    if (resource === 'customers/session' && request.method === 'POST')
      return await customerSession(request, site, replyOrigin);
    if (resource === 'customers/me' && isRead) return await customerMe(request, site, replyOrigin);
  } catch (error) {
    console.error('[stax:sites-api] erreur', resource, error);
    return refuse('Service momentanément indisponible.', 503, 'unavailable', replyOrigin);
  }
  return refuse('Ressource inconnue.', 404, 'not_found', replyOrigin);
}

/* -------------------------------------------------------------------------- */
/*  Mesure d'audience (sans cookie)                                            */
/* -------------------------------------------------------------------------- */

async function collect(request: Request, site: ApiSite, origin: string | null): Promise<Response> {
  if (!site.integration.analytics)
    return new Response(null, { status: 204, headers: cors(origin) });
  const body = (await readBody(request)) ?? {};
  const path = typeof body['path'] === 'string' ? body['path'].slice(0, 512) : '/';
  const referrer = typeof body['ref'] === 'string' ? body['ref'].slice(0, 120) : null;
  try {
    await createServiceClient().rpc('record_page_view', {
      p_site: site.siteId,
      p_path: path.startsWith('/') ? path : '/',
      p_visitor_hash: await visitorHash({
        ip: clientIp(request),
        userAgent: request.headers.get('user-agent'),
        siteId: site.siteId,
      }),
      p_referrer_host: referrer && !site.hosts.includes(referrer) ? referrer : null,
      p_country: request.headers.get('cf-ipcountry'),
      p_kind: 'pageview',
    });
  } catch {
    // Jamais bloquant pour le visiteur.
  }
  return new Response(null, { status: 204, headers: cors(origin) });
}

/* -------------------------------------------------------------------------- */
/*  Formulaires                                                                */
/* -------------------------------------------------------------------------- */

async function submitForm(
  request: Request,
  site: ApiSite,
  slug: string,
  origin: string | null,
): Promise<Response> {
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug))
    return refuse('Formulaire inconnu.', 404, 'not_found', origin);
  const payload = await readBody(request);
  if (!payload) return refuse('Requête illisible ou trop volumineuse.', 413, 'bad_payload', origin);

  const gate = await limit(
    site,
    request,
    slug.includes('devis') || slug.includes('quote') ? 'quoteForm' : 'contactForm',
  );
  if (!gate.ok) {
    return json(
      { ok: false, code: 'rate_limited', message: 'Trop d’envois. Réessayez plus tard.' },
      429,
      origin,
      {
        'retry-after': String(gate.retry ?? 60),
      },
    );
  }
  const captcha =
    typeof payload['cf-turnstile-response'] === 'string' ? payload['cf-turnstile-response'] : null;
  const turnstile = await verifyTurnstile(captcha, clientIp(request));
  if (!turnstile.success)
    return refuse('La vérification anti-robot a échoué.', 403, 'captcha', origin);

  const verdict = scoreSubmission({
    honeypot: field(payload, 'website_url') ?? field(payload, 'company_website'),
    message: field(payload, 'message', 5000),
    email: field(payload, 'email', 200),
  });

  const result = unwrap<{ ok: boolean; message?: string; code?: string; fields?: string[] }>(
    (await createServiceClient().rpc('submit_form', {
      p_site: site.siteId,
      p_form_slug: slug,
      p_data: payload,
      p_spam_score: verdict.score,
      p_ip_hash: gate.ipHash,
      p_user_agent: (request.headers.get('user-agent') ?? '').slice(0, 60),
      p_referrer: request.headers.get('referer'),
      p_locale: site.locale,
    })) as never,
  );
  if (!result.ok) {
    if (result.code === 'missing_fields') {
      return json(
        {
          ok: false,
          code: 'missing_fields',
          message: `Merci de renseigner : ${(result.fields ?? []).join(', ')}.`,
          fields: result.fields ?? [],
        },
        422,
        origin,
      );
    }
    return refuse('Formulaire indisponible.', 404, 'not_found', origin);
  }
  return json(
    { ok: true, message: result.message ?? 'Merci, votre message a bien été envoyé.' },
    200,
    origin,
  );
}

/* -------------------------------------------------------------------------- */
/*  Boutique                                                                   */
/* -------------------------------------------------------------------------- */

async function catalog(site: ApiSite, origin: string | null): Promise<Response> {
  if (!site.features.ecommerce)
    return refuse('Boutique non incluse dans l’offre.', 404, 'module_disabled', origin);
  const { data } = await createServiceClient().rpc('site_public_catalog', { p_site: site.siteId });
  return json({ ok: true, products: data ?? [] }, 200, origin, {
    'cache-control': 'public, max-age=60',
  });
}

async function checkout(request: Request, site: ApiSite, origin: string | null): Promise<Response> {
  if (!site.features.ecommerce || !site.enabledModules.includes('orders')) {
    return refuse(
      'La vente en ligne n’est pas activée sur ce site.',
      404,
      'module_disabled',
      origin,
    );
  }
  const payload = await readBody(request);
  if (!payload) return refuse('Requête illisible.', 413, 'bad_payload', origin);
  const gate = await limit(site, request, 'checkout');
  if (!gate.ok)
    return refuse('Trop de tentatives. Patientez quelques minutes.', 429, 'rate_limited', origin);

  // Le panier ne porte que des produits et des quantites : la BASE relit les
  // prix, controle le stock et fige le montant.
  const rawLines = Array.isArray(payload['lines']) ? payload['lines'].slice(0, 50) : [];
  const lines = rawLines
    .map((line) =>
      line !== null && typeof line === 'object' ? (line as Record<string, unknown>) : {},
    )
    .map((line) => ({
      productId: typeof line['productId'] === 'string' ? line['productId'] : '',
      quantity: typeof line['quantity'] === 'number' ? Math.trunc(line['quantity']) : 0,
    }))
    .filter(
      (line) => /^[0-9a-f-]{36}$/.test(line.productId) && line.quantity > 0 && line.quantity <= 99,
    );
  if (lines.length === 0) return refuse('Votre panier est vide.', 409, 'cart_empty', origin);

  const manageToken = randomToken(24);
  const email = field(payload, 'email', 200);
  const service = createServiceClient();
  const { data, error } = await service.rpc('create_shop_order', {
    p_site: site.siteId,
    p_lines: lines,
    p_name: field(payload, 'name', 120),
    p_email: email,
    p_phone: field(payload, 'phone', 40),
    p_fulfillment: field(payload, 'fulfillment', 20) ?? 'pickup',
    p_address: null,
    p_note: field(payload, 'note', 1000),
    p_token_hash: await hmacHex(manageToken, 'order-manage'),
  });
  if (error)
    return refuse('Votre commande n’a pas pu être enregistrée.', 503, 'unavailable', origin);
  const result = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    orderId?: string;
    reference?: string;
    totalCents?: number;
    currency?: string;
    paymentAvailable?: boolean;
  };
  if (result.ok !== true)
    return refuse(
      'Votre commande n’a pas pu être enregistrée.',
      422,
      result.code ?? 'refused',
      origin,
    );

  const statusPath = site.integration.orderStatusPath ?? '/';
  const confirmation = `${origin}${statusPath}?ref=${encodeURIComponent(result.reference ?? '')}&suivi=${manageToken}`;
  if (result.paymentAvailable !== true) {
    return json(
      { ok: true, paid: false, reference: result.reference, url: confirmation },
      200,
      origin,
    );
  }
  const account = unwrapMaybe<{ stripe_account_id: string; charges_enabled: boolean }>(
    (await service
      .from('connected_accounts')
      .select('stripe_account_id, charges_enabled')
      .eq('organization_id', site.organizationId)
      .maybeSingle()) as never,
  );
  if (!account?.charges_enabled) {
    return json(
      { ok: true, paid: false, reference: result.reference, url: confirmation },
      200,
      origin,
    );
  }
  const session = await createConnectCheckoutSession({
    stripeAccountId: account.stripe_account_id,
    amountCents: result.totalCents ?? 0,
    currency: (result.currency ?? 'EUR') as 'EUR',
    referenceId: result.orderId as `${string}-${string}-${string}-${string}-${string}`,
    productName: `Commande ${result.reference ?? ''}`,
    successUrl: confirmation,
    cancelUrl: `${origin}/?paiement=annule`,
    ...(email ? { customerEmail: email } : {}),
    metadata: {
      stax_site_id: site.siteId,
      stax_kind: 'shop_order',
      stax_order_id: result.orderId ?? '',
    },
  });
  return json(
    { ok: true, paid: false, reference: result.reference, url: session.url },
    200,
    origin,
  );
}

/* -------------------------------------------------------------------------- */
/*  Reservations                                                               */
/* -------------------------------------------------------------------------- */

async function bookingServices(site: ApiSite, origin: string | null): Promise<Response> {
  if (!site.features.bookings)
    return refuse('Réservations non incluses dans l’offre.', 404, 'module_disabled', origin);
  const rows = unwrapList<{
    id: string;
    name: string;
    description: string | null;
    duration_minutes: number;
    price_cents: number | null;
  }>(
    (await createServiceClient()
      .from('booking_services')
      .select('id, name, description, duration_minutes, price_cents')
      .eq('site_id', site.siteId)
      .eq('is_active', true)
      .order('sort_order')) as never,
  );
  return json({ ok: true, services: rows }, 200, origin, { 'cache-control': 'public, max-age=60' });
}

async function bookingSlots(url: URL, site: ApiSite, origin: string | null): Promise<Response> {
  if (!site.features.bookings)
    return refuse('Réservations non incluses dans l’offre.', 404, 'module_disabled', origin);
  const day = url.searchParams.get('date');
  const serviceId = url.searchParams.get('service');
  if (
    !day ||
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !serviceId ||
    !/^[0-9a-f-]{36}$/.test(serviceId)
  ) {
    return json({ ok: true, slots: [] }, 200, origin);
  }
  const rows = unwrapList<{ slot_start: string; remaining: number }>(
    (await createServiceClient().rpc('available_slots', {
      p_site: site.siteId,
      p_service: serviceId,
      p_day: day,
    })) as never,
  );
  return json(
    {
      ok: true,
      slots: rows
        .filter((row) => row.remaining > 0)
        .map((row) => ({ start: row.slot_start, remaining: row.remaining })),
    },
    200,
    origin,
  );
}

async function createBooking(
  request: Request,
  site: ApiSite,
  origin: string | null,
): Promise<Response> {
  if (!site.features.bookings)
    return refuse('Réservations non incluses dans l’offre.', 404, 'module_disabled', origin);
  const payload = await readBody(request);
  if (!payload) return refuse('Requête illisible.', 413, 'bad_payload', origin);
  const gate = await limit(site, request, 'booking');
  if (!gate.ok)
    return refuse('Trop de demandes. Réessayez plus tard.', 429, 'rate_limited', origin);
  const serviceId = field(payload, 'serviceId', 64);
  const slot = field(payload, 'slot', 40);
  const name = field(payload, 'name', 120);
  if (!serviceId || !slot || !name)
    return refuse('Créneau et nom requis.', 422, 'missing_fields', origin);
  const manageToken = randomToken(24);
  const result = unwrap<{
    ok: boolean;
    code?: string;
    reference?: string;
    requiresApproval?: boolean;
  }>(
    (await createServiceClient().rpc('create_booking', {
      p_site: site.siteId,
      p_service: serviceId,
      p_starts_at: new Date(slot).toISOString(),
      p_party_size: intField(payload, 'partySize') ?? 1,
      p_name: name,
      p_email: field(payload, 'email', 200),
      p_phone: field(payload, 'phone', 40),
      p_note: field(payload, 'note', 1000),
      p_token_hash: await hmacHex(manageToken, 'booking-manage'),
    })) as never,
  );
  if (!result.ok)
    return refuse(
      'Cette réservation n’a pas pu être enregistrée.',
      409,
      result.code ?? 'unavailable',
      origin,
    );
  return json(
    { ok: true, reference: result.reference, requiresApproval: result.requiresApproval ?? true },
    200,
    origin,
  );
}

/* -------------------------------------------------------------------------- */
/*  Comptes des clients du site (lien de connexion, sans mot de passe)         */
/* -------------------------------------------------------------------------- */

const UNIFORM =
  'Si cette adresse correspond à un compte, un lien de connexion vient de lui être envoyé.';

async function customerLogin(
  request: Request,
  site: ApiSite,
  origin: string | null,
): Promise<Response> {
  if (!site.features.customerAccounts || !site.integration.customerAccountsLoginPath || !origin) {
    return refuse('Espace client non activé sur ce site.', 404, 'module_disabled', origin);
  }
  const payload = await readBody(request);
  const gate = await limit(site, request, 'apiWrite');
  if (!gate.ok || !payload) return json({ ok: true, message: UNIFORM }, 200, origin);
  const email = field(payload, 'email', 200);
  if (!email) return json({ ok: true, message: UNIFORM }, 200, origin);
  const token = newLoginToken();
  const expiresAt = new Date(Date.now() + 3_600_000);
  const service = createServiceClient();
  const { data } = await service.rpc('request_customer_login', {
    p_site: site.siteId,
    p_email: email,
    p_token_hash: await loginTokenHash(token),
    p_expires_at: expiresAt.toISOString(),
    p_ip_hash: gate.ipHash,
  });
  if ((data as { ok?: boolean; sent?: boolean } | null)?.sent === true) {
    await sendEmail(
      customerLoginEmail({
        to: email,
        businessName: site.businessName,
        siteUrl: origin,
        contactEmail: null,
        loginUrl: `${origin}${site.integration.customerAccountsLoginPath}?stax_token=${encodeURIComponent(token)}`,
        expiresLabel: new Intl.DateTimeFormat('fr-FR', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: site.timezone,
        }).format(expiresAt),
      }),
      { db: service, organizationId: site.organizationId, siteId: site.siteId },
    );
  }
  return json({ ok: true, message: UNIFORM }, 200, origin);
}

async function customerSession(
  request: Request,
  site: ApiSite,
  origin: string | null,
): Promise<Response> {
  if (!site.features.customerAccounts)
    return refuse('Espace client non activé.', 404, 'module_disabled', origin);
  const payload = await readBody(request);
  const token = payload ? field(payload, 'token', 200) : null;
  if (!token) return refuse('Lien de connexion invalide.', 400, 'bad_token', origin);
  const { data } = await createServiceClient().rpc('redeem_customer_login', {
    p_site: site.siteId,
    p_token_hash: await loginTokenHash(token),
  });
  const outcome = (data ?? {}) as { ok?: boolean; customerId?: string };
  if (!outcome.ok || !outcome.customerId) {
    return refuse('Ce lien n’est plus valable. Demandez-en un nouveau.', 401, 'expired', origin);
  }
  return json(
    { ok: true, session: await issueSessionToken(site.siteId, outcome.customerId) },
    200,
    origin,
  );
}

async function customerMe(
  request: Request,
  site: ApiSite,
  origin: string | null,
): Promise<Response> {
  if (!site.features.customerAccounts)
    return refuse('Espace client non activé.', 404, 'module_disabled', origin);
  const customerId = await readSessionToken(request, site.siteId);
  if (!customerId) return refuse('Session expirée.', 401, 'unauthenticated', origin);
  const { data } = await createServiceClient().rpc('customer_account_view', {
    p_site: site.siteId,
    p_customer: customerId,
  });
  return json({ ok: true, account: data ?? null }, 200, origin);
}
