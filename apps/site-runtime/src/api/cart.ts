import { formatMoney, sumCents } from '@stax/payments/money';
import { createServiceClient, unwrapList } from '@stax/database';
import { hmacHex, timingSafeEqual } from '@stax/security';
import { jsonResponse } from '../responses';
import { guardPublicWrite, intField, field, refuse } from './shared';
import type { ResolvedSite } from '../resolve';

/**
 * Panier.
 *
 * Le panier stocke UNIQUEMENT des identifiants de produit et des quantites.
 * Les prix sont relus en base a chaque affichage et a chaque paiement : un
 * visiteur qui modifierait le cookie ne change que ce qu il commande, jamais ce
 * qu il paie. C est la seule facon sure de faire un panier cote client.
 *
 * Le cookie est signe (HMAC) et porte sur l identifiant du site : il ne peut
 * pas etre transpose d un site a un autre.
 */

const COOKIE_NAME = '__stax_cart';
const MAX_LINES = 30;
const MAX_QUANTITY = 99;

interface CartLine {
  productId: string;
  quantity: number;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

async function readCart(request: Request, siteId: string): Promise<CartLine[]> {
  const cookie = parseCookies(request.headers.get('cookie'))[COOKIE_NAME];
  if (!cookie) return [];
  const separator = cookie.lastIndexOf('.');
  if (separator === -1) return [];

  const body = cookie.slice(0, separator);
  const signature = cookie.slice(separator + 1);
  const expected = await hmacHex(`${siteId}.${body}`, 'cart');
  if (!timingSafeEqual(signature, expected)) return [];

  try {
    const decoded: unknown = JSON.parse(atob(body));
    if (!Array.isArray(decoded)) return [];
    return decoded
      .filter(
        (line): line is CartLine =>
          typeof line === 'object' &&
          line !== null &&
          typeof (line as CartLine).productId === 'string' &&
          Number.isInteger((line as CartLine).quantity),
      )
      .map((line) => ({
        productId: line.productId,
        quantity: Math.min(Math.max(line.quantity, 1), MAX_QUANTITY),
      }))
      .slice(0, MAX_LINES);
  } catch {
    return [];
  }
}

async function cartCookie(siteId: string, lines: CartLine[]): Promise<string> {
  const body = btoa(JSON.stringify(lines));
  const signature = await hmacHex(`${siteId}.${body}`, 'cart');
  return [
    `${COOKIE_NAME}=${body}.${signature}`,
    'Path=/',
    'SameSite=Lax',
    'HttpOnly',
    'Secure',
    'Max-Age=604800',
  ].join('; ');
}

export interface PricedCart {
  ok: true;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  total: string;
  totalCents: number;
  currency: string;
}

/**
 * Re-tarifie un panier a partir de la base.
 * Les produits invisibles, supprimes ou epuises disparaissent silencieusement :
 * mieux vaut un panier plus court qu une commande impossible a honorer.
 */
async function priceCart(siteId: string, lines: CartLine[]): Promise<PricedCart> {
  if (lines.length === 0) {
    return { ok: true, items: [], total: formatMoney(0), totalCents: 0, currency: 'EUR' };
  }

  const rows = unwrapList<{
    id: string;
    name: string;
    price_cents: number;
    currency: string;
    track_inventory: boolean;
    stock_quantity: number;
    allow_backorder: boolean;
  }>(
    (await createServiceClient()
      .from('products')
      .select('id, name, price_cents, currency, track_inventory, stock_quantity, allow_backorder')
      .eq('site_id', siteId)
      .eq('is_visible', true)
      .in(
        'id',
        lines.map((line) => line.productId),
      )) as never,
  );

  const items: PricedCart['items'] = [];
  const totals: number[] = [];
  let currency = 'EUR';

  for (const line of lines) {
    const product = rows.find((row) => row.id === line.productId);
    if (!product) continue;
    const available =
      product.track_inventory && !product.allow_backorder
        ? Math.max(product.stock_quantity, 0)
        : line.quantity;
    const quantity = Math.min(line.quantity, available);
    if (quantity < 1) continue;

    const lineTotal = product.price_cents * quantity;
    currency = product.currency;
    totals.push(lineTotal);
    items.push({
      id: product.id,
      name: product.name,
      quantity,
      unitPrice: formatMoney(product.price_cents, product.currency as 'EUR'),
      lineTotal: formatMoney(lineTotal, product.currency as 'EUR'),
    });
  }

  const totalCents = totals.length > 0 ? sumCents(...totals) : 0;
  return {
    ok: true,
    items,
    total: formatMoney(totalCents, currency as 'EUR'),
    totalCents,
    currency,
  };
}

export async function handleCartRead(request: Request, site: ResolvedSite): Promise<Response> {
  if (!site.enabledModules.has('orders')) return jsonResponse({ ok: true, items: [], total: '' });
  try {
    return jsonResponse(await priceCart(site.siteId, await readCart(request, site.siteId)));
  } catch {
    return jsonResponse({ ok: false, items: [], total: '' }, 503);
  }
}

export async function handleCartWrite(request: Request, site: ResolvedSite): Promise<Response> {
  if (!site.enabledModules.has('orders')) {
    return refuse('La vente en ligne n’est pas activée sur ce site.', 404, 'module_disabled');
  }

  const guard = await guardPublicWrite(request, site, 'apiWrite');
  if (!guard.ok) return guard.response ?? refuse('Requête refusée.', 400);

  const productId = field(guard.payload, 'productId', 64);
  if (!productId) return refuse('Produit manquant.', 422, 'missing_product');

  const requested = intField(guard.payload, 'quantity') ?? 1;
  const lines = await readCart(request, site.siteId);
  const existing = lines.find((line) => line.productId === productId);

  if (existing) {
    existing.quantity = Math.min(Math.max(existing.quantity + requested, 0), MAX_QUANTITY);
  } else if (requested > 0 && lines.length < MAX_LINES) {
    lines.push({ productId, quantity: Math.min(requested, MAX_QUANTITY) });
  }

  const next = lines.filter((line) => line.quantity > 0);

  try {
    const priced = await priceCart(site.siteId, next);
    return jsonResponse(priced, 200, { 'set-cookie': await cartCookie(site.siteId, next) });
  } catch {
    return refuse('Le panier n’a pas pu être mis à jour.', 503, 'storage_unavailable');
  }
}
