import { createServiceClient, unwrapMaybe } from '@stax/database';
import { createConnectCheckoutSession } from '@stax/payments';
import { SALES_TERMS_PATH } from '@stax/site-engine';
import { hmacHex, randomToken } from '@stax/security';
import { jsonResponse } from '../responses';
import { siteOrigin } from '../context';
import { clearedCartCookie, readCart } from './cart';
import { field, guardPublicWrite, refuse } from './shared';
import type { ResolvedSite } from '../resolve';

/**
 * Passage de commande sur le site d'un client.
 *
 * Le panier vit dans un cookie signe. Il ne porte que des identifiants de
 * produit et des quantites : c'est la base qui relit les prix, controle le
 * stock et fige les montants, en une seule transaction. Le navigateur ne peut
 * donc influencer QUE ce qui est commande, jamais ce qui est paye.
 *
 * L'argent ne transite jamais par StaX : le paiement est cree sur le compte
 * Stripe connecte du commercant, et l'acheteur paie sur une page hebergee par
 * Stripe. Aucun numero de carte n'atteint notre infrastructure.
 *
 * LA COMMANDE N'EST JAMAIS MARQUEE PAYEE ICI. Le retour du navigateur ne prouve
 * rien : seul le webhook Stripe signe encaisse, et seulement si le montant
 * recu est exactement celui fige a la commande.
 */

interface OrderResult {
  ok?: boolean;
  code?: string;
  orderId?: string;
  reference?: string;
  totalCents?: number;
  currency?: string;
  paymentAvailable?: boolean;
  rejected?: unknown[];
}

/** Messages adresses a l'acheteur, dans sa langue et sans jargon. */
const REFUSALS: Record<string, { message: string; status: number }> = {
  cart_empty: {
    message: 'Votre panier est vide, ou les articles ne sont plus disponibles.',
    status: 409,
  },
  cart_too_large: { message: 'Votre panier contient trop d’articles différents.', status: 422 },
  name_required: { message: 'Indiquez votre nom.', status: 422 },
  email_invalid: { message: 'Vérifiez votre adresse e-mail.', status: 422 },
  address_required: { message: 'Indiquez une adresse de livraison.', status: 422 },
  module_unavailable: {
    message: 'La vente en ligne n’est pas disponible sur ce site.',
    status: 404,
  },
  site_unavailable: { message: 'Cette boutique est momentanément fermée.', status: 503 },
};

export async function handleCheckout(request: Request, site: ResolvedSite): Promise<Response> {
  if (!site.enabledModules.has('orders')) {
    return refuse('La vente en ligne n’est pas activée sur ce site.', 404, 'module_disabled');
  }

  const guard = await guardPublicWrite(request, site, 'checkout');
  if (!guard.ok) return guard.response ?? refuse('Requête refusée.', 400);

  // Le panier vient du COOKIE SIGNE, jamais du corps de la requete : une
  // commande ne peut pas etre fabriquee de toutes pieces par un appel direct.
  const lines = await readCart(request, site.siteId);
  if (lines.length === 0) {
    return refuse('Votre panier est vide.', 409, 'cart_empty');
  }

  // Quand la boutique publie des conditions de vente, leur acceptation est
  // exigee ICI aussi : la case cochee dans la page ne prouve rien a elle seule.
  const hasSalesTerms = site.snapshot.pages.some((page) => page.path === SALES_TERMS_PATH);
  const accepted = field(guard.payload, 'acceptTerms', 10);
  if (hasSalesTerms && accepted !== 'on' && accepted !== 'true' && accepted !== '1') {
    return refuse(
      'Acceptez les conditions générales de vente pour passer commande.',
      422,
      'terms_required',
    );
  }

  const name = field(guard.payload, 'name', 120);
  const email = field(guard.payload, 'email', 200);
  const phone = field(guard.payload, 'phone', 40);
  const note = field(guard.payload, 'note', 1000);
  const fulfillment = field(guard.payload, 'fulfillment', 20) ?? 'pickup';

  const address = addressFrom(guard.payload);

  // Jeton de suivi : permet a l'acheteur de revenir sur sa commande sans
  // compte. Seule son empreinte est stockee, jamais le jeton lui-meme.
  const manageToken = randomToken(24);
  const manageTokenHash = await hmacHex(manageToken, 'order-manage');
  const service = createServiceClient();

  const { data, error } = await service.rpc('create_shop_order', {
    p_site: site.siteId,
    p_lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    p_name: name,
    p_email: email,
    p_phone: phone,
    p_fulfillment: fulfillment,
    p_address: address,
    p_note: note,
    p_token_hash: manageTokenHash,
  });

  if (error) {
    console.error('[stax:checkout] commande impossible', error.code, error.message);
    return refuse(
      'Votre commande n’a pas pu être enregistrée. Réessayez dans un instant.',
      503,
      'unavailable',
    );
  }

  const result = (data ?? {}) as OrderResult;
  if (result.ok !== true) {
    const refusal = REFUSALS[result.code ?? ''] ?? {
      message: 'Votre commande n’a pas pu être enregistrée.',
      status: 422,
    };
    return jsonResponse(
      { ok: false, code: result.code ?? 'refused', message: refusal.message },
      refusal.status,
    );
  }

  const origin = siteOrigin(request);
  const confirmation = `${origin}/commande?ref=${encodeURIComponent(result.reference ?? '')}&suivi=${manageToken}`;

  // A partir d'ici la commande EXISTE : quoi qu'il arrive ensuite, le panier
  // est vide et l'acheteur repart avec une reference.
  const cleared = { 'set-cookie': clearedCartCookie() };

  if (result.paymentAvailable !== true) {
    // Encaissement en ligne non inclus dans l'offre : la commande est prise,
    // le reglement se fait sur place. On ne laisse jamais croire au contraire.
    return jsonResponse(
      {
        ok: true,
        paid: false,
        reference: result.reference,
        url: confirmation,
        message: 'Votre commande est enregistrée. Le règlement se fera sur place.',
      },
      200,
      cleared,
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
    return jsonResponse(
      {
        ok: true,
        paid: false,
        reference: result.reference,
        url: confirmation,
        message:
          'Votre commande est enregistrée. Le paiement en ligne n’est pas encore actif : ' +
          'le commerçant vous recontacte pour le règlement.',
      },
      200,
      cleared,
    );
  }

  try {
    const session = await createConnectCheckoutSession({
      stripeAccountId: account.stripe_account_id,
      amountCents: result.totalCents ?? 0,
      currency: (result.currency ?? 'EUR') as 'EUR',
      referenceId: result.orderId as `${string}-${string}-${string}-${string}-${string}`,
      productName: `Commande ${result.reference ?? ''}`,
      successUrl: confirmation,
      cancelUrl: `${origin}/panier?paiement=annule`,
      ...(email ? { customerEmail: email } : {}),
      metadata: {
        stax_site_id: site.siteId,
        stax_kind: 'shop_order',
        stax_order_id: result.orderId ?? '',
      },
    });

    return jsonResponse({ ok: true, paid: false, url: session.url }, 200, cleared);
  } catch (caught) {
    console.error('[stax:checkout] session Stripe impossible', caught);

    // La commande reste enregistree : elle sera liberee automatiquement si
    // personne ne paie, et le commercant la voit en attente entre-temps.
    return jsonResponse(
      {
        ok: true,
        paid: false,
        reference: result.reference,
        url: confirmation,
        message:
          'Votre commande est enregistrée, mais le paiement en ligne est momentanément ' +
          'indisponible. Le commerçant vous recontacte pour le règlement.',
      },
      200,
      cleared,
    );
  }
}

/** Adresse de livraison, bornee champ par champ. */
function addressFrom(payload: Record<string, unknown>): Record<string, string> | null {
  const line1 = field(payload, 'addressLine1', 120);
  if (!line1) return null;
  const parts: Record<string, string> = { line1 };
  const line2 = field(payload, 'addressLine2', 120);
  const postalCode = field(payload, 'postalCode', 12);
  const city = field(payload, 'city', 80);
  const country = field(payload, 'country', 2);
  if (line2) parts['line2'] = line2;
  if (postalCode) parts['postalCode'] = postalCode;
  if (city) parts['city'] = city;
  parts['country'] = country ?? 'FR';
  return parts;
}
