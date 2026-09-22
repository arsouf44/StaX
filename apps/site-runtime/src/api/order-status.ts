import { createServiceClient, unwrapList, unwrapMaybe } from '@stax/database';
import { formatMoney } from '@stax/payments/money';
import { hmacHex, timingSafeEqual } from '@stax/security';
import { html, join, renderDocument, type RawHtml } from '@stax/site-engine';
import { buildPageContext } from '../context';
import { htmlResponse, statusPage } from '../responses';
import type { ResolvedSite } from '../resolve';

/**
 * Suivi d'une commande, sans compte.
 *
 * Une reference de commande est imprimee, envoyee par e-mail, lue a voix haute
 * au telephone : ce n'est pas un secret. Elle ne suffit donc JAMAIS a ouvrir
 * une commande. Le lien porte en plus un jeton aleatoire dont seule
 * l'empreinte est stockee, et c'est lui qui autorise l'acces.
 *
 * Sans jeton valable, la page ne dit rien — pas meme si la reference existe.
 * Repondre differemment permettrait d'enumerer les commandes d'un commercant,
 * donc son volume d'affaires et les coordonnees de ses clients.
 */

interface OrderRow {
  id: string;
  reference: string;
  status: string;
  total_cents: number;
  vat_cents: number;
  currency: string;
  customer_name: string;
  customer_email: string;
  fulfillment_method: string;
  manage_token_hash: string | null;
  created_at: string;
  paid_at: string | null;
}

const STATUS_MESSAGES: Record<string, { title: string; detail: string }> = {
  pending: {
    title: 'Commande enregistrée',
    detail:
      'Nous attendons la confirmation de votre paiement. Si vous venez de payer, ' +
      'cette page se mettra à jour d’ici quelques instants.',
  },
  awaiting_payment: {
    title: 'En attente de paiement',
    detail: 'Votre commande est réservée. Elle sera préparée dès le règlement reçu.',
  },
  paid: {
    title: 'Commande confirmée',
    detail: 'Votre paiement est bien reçu. Votre commande est en cours de préparation.',
  },
  preparing: {
    title: 'Commande en préparation',
    detail: 'Votre commande est en cours de préparation.',
  },
  fulfilled: {
    title: 'Commande remise',
    detail: 'Votre commande vous a été remise. Merci de votre confiance.',
  },
  cancelled: {
    title: 'Commande annulée',
    detail:
      'Cette commande a été annulée, faute de paiement finalisé. Vous pouvez en passer ' +
      'une nouvelle à tout moment.',
  },
  refunded: {
    title: 'Commande remboursée',
    detail: 'Cette commande a été remboursée.',
  },
};

const FULFILLMENT_LABELS: Record<string, string> = {
  pickup: 'Retrait sur place',
  delivery: 'Livraison',
  shipping: 'Expédition',
  digital: 'Envoi par e-mail',
};

export async function handleOrderStatus(request: Request, site: ResolvedSite): Promise<Response> {
  const url = new URL(request.url);
  const reference = (url.searchParams.get('ref') ?? '').trim().slice(0, 40);
  const token = (url.searchParams.get('suivi') ?? '').trim().slice(0, 128);

  if (!reference || !token) return unknownOrder(request, site);

  const db = createServiceClient();

  // La commande est cherchee DANS CE SITE : une reference du site voisin ne
  // correspond a rien ici, quelle que soit la validite du jeton.
  const order = unwrapMaybe<OrderRow>(
    (await db
      .from('shop_orders')
      .select(
        'id, reference, status, total_cents, vat_cents, currency, customer_name, ' +
          'customer_email, fulfillment_method, manage_token_hash, created_at, paid_at',
      )
      .eq('site_id', site.siteId)
      .eq('reference', reference)
      .maybeSingle()) as never,
  );

  const expected = order?.manage_token_hash ?? null;
  const provided = await hmacHex(token, 'order-manage');
  if (!order || !expected || !timingSafeEqual(expected, provided)) {
    return unknownOrder(request, site);
  }

  const items = unwrapList<{ name: string; quantity: number; total_cents: number }>(
    (await db
      .from('shop_order_items')
      .select('name, quantity, total_cents')
      .eq('shop_order_id', order.id)) as never,
  );

  const state = STATUS_MESSAGES[order.status] ?? STATUS_MESSAGES['pending'];
  const currency = order.currency as 'EUR';

  const main = html`
    <section class="sec">
      <div class="wrap w-narrow">
        <p class="eyebrow">Commande ${order.reference}</p>
        <h1>${state?.title ?? 'Votre commande'}</h1>
        <p class="lede">${state?.detail ?? ''}</p>

        <div class="price-list" style="margin-top:2.5rem">
          ${join(
            items.map(
              (item) =>
                html`<div class="price-row">
                  <div>
                    <p><strong>${item.name}</strong></p>
                    <p class="price-meta">Quantité : ${String(item.quantity)}</p>
                  </div>
                  <span class="dots"></span>
                  <span class="price-amt">${formatMoney(item.total_cents, currency)}</span>
                </div>`,
            ),
          )}
        </div>

        <p class="price-row" style="margin-top:1rem">
          <strong>Total</strong><span class="dots"></span>
          <span class="price-amt">${formatMoney(order.total_cents, currency)}</span>
        </p>
        <p class="muted" style="font-size:.8125rem">
          Dont TVA ${formatMoney(order.vat_cents, currency)} ·
          ${FULFILLMENT_LABELS[order.fulfillment_method] ?? 'Retrait sur place'}
        </p>

        <p class="muted" style="margin-top:2rem">
          Conservez ce lien : il vous permet de revenir sur votre commande à tout moment. Une
          question ? Répondez simplement à l’e-mail de confirmation.
        </p>

        <p style="margin-top:2rem"><a class="btn btn-secondary" href="/">Retour à l’accueil</a></p>
      </div>
    </section>
  `;

  return renderInSiteShell(request, site, main, 200);
}

/**
 * Reponse identique pour une reference inexistante et pour une commande qu'on
 * n'a pas le droit de voir.
 */
function unknownOrder(request: Request, site: ResolvedSite): Promise<Response> {
  const main = html`
    <section class="sec">
      <div class="wrap w-narrow">
        <h1>Lien de suivi invalide</h1>
        <p class="lede">
          Ce lien ne correspond à aucune commande. Vérifiez qu’il est complet — il se termine par un
          code de suivi — ou utilisez celui reçu par e-mail.
        </p>
        <p style="margin-top:2rem"><a class="btn btn-secondary" href="/">Retour à l’accueil</a></p>
      </div>
    </section>
  `;
  return renderInSiteShell(request, site, main, 404);
}

/**
 * Rend une page produite par le moteur dans l'identite du site du client.
 * Un acheteur qui vient de payer ne doit pas atterrir sur une page systeme.
 */
async function renderInSiteShell(
  request: Request,
  site: ResolvedSite,
  main: RawHtml,
  status: number,
): Promise<Response> {
  const page = site.snapshot.pagesByPath.get('/') ?? site.snapshot.pages[0];
  if (!page) {
    return statusPage({
      status,
      title: 'Commande',
      message: 'Ce lien ne correspond à aucune commande.',
      nonce: crypto.randomUUID(),
    });
  }

  const context = await buildPageContext(
    request,
    site,
    { ...page, path: '/commande', title: 'Votre commande', robotsIndexable: false, blocks: [] },
    { isPreview: site.hostname.isPreview },
  );

  return htmlResponse(
    renderDocument({
      page: context.page,
      context: context.context,
      schemaOrgType: context.schemaOrgType,
      logoUrl: context.logoUrl,
      ogImageUrl: context.ogImageUrl,
      mainOverride: main,
    }),
    // Une page de suivi de commande ne se met jamais en cache partage : elle
    // porte le nom et le montant d'une personne.
    { status, nonce: context.context.nonce, cache: 'no-store, private' },
  );
}
