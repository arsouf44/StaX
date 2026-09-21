import { createServiceClient, unwrapMaybe } from '@stax/database';
import { createConnectCheckoutSession } from '@stax/payments';
import { jsonResponse } from '../responses';
import { siteOrigin } from '../context';
import { field, guardPublicWrite, intField, refuse } from './shared';
import type { ResolvedSite } from '../resolve';

/**
 * Dons ponctuels sur le site d'un client.
 *
 * L'argent ne transite JAMAIS par StaX : le paiement est cree sur le compte
 * Stripe connecte de l'association, et le donateur paie sur une page hebergee
 * par Stripe. Aucun numero de carte n'atteint ni le site du client ni le notre.
 *
 * Deux protections structurent cette route :
 *
 *  1. le MONTANT est borne cote serveur, et compare aux montants proposes par
 *     le bloc. Un navigateur qui poste « 1 centime » ou « 10 millions » est
 *     refuse : un don de montant libre reste encadre ;
 *  2. le COMPTE Stripe vient de l'organisation resolue par le nom d'hote,
 *     jamais du corps de la requete. On ne peut pas faire encaisser une autre
 *     association en forgeant un identifiant.
 */

/** Bornes d'un don, en centimes. Encadrent aussi le montant libre. */
const MIN_DONATION_CENTS = 100;
const MAX_DONATION_CENTS = 500_000;

export async function handleDonation(request: Request, site: ResolvedSite): Promise<Response> {
  if (!site.enabledModules.has('donations')) {
    return refuse('Les dons ne sont pas activés sur ce site.', 404, 'module_disabled');
  }

  const guard = await guardPublicWrite(request, site, 'checkout');
  if (!guard.ok) return guard.response ?? refuse('Requête refusée.', 400);

  const amountCents = intField(guard.payload, 'amountCents');
  const donorName = field(guard.payload, 'name', 120);
  const donorEmail = field(guard.payload, 'email', 200);

  if (amountCents === null || !Number.isSafeInteger(amountCents)) {
    return refuse('Choisissez un montant.', 400, 'amount_required');
  }

  if (amountCents < MIN_DONATION_CENTS || amountCents > MAX_DONATION_CENTS) {
    return refuse(
      `Le montant doit être compris entre ${MIN_DONATION_CENTS / 100} et ${
        MAX_DONATION_CENTS / 100
      } euros.`,
      400,
      'amount_out_of_range',
    );
  }

  const service = createServiceClient();

  // Le compte encaisseur vient du TENANT resolu par le nom d'hote.
  const account = unwrapMaybe<{ stripe_account_id: string; charges_enabled: boolean }>(
    (await service
      .from('connected_accounts')
      .select('stripe_account_id, charges_enabled')
      .eq('organization_id', site.organizationId)
      .maybeSingle()) as never,
  );

  if (!account?.charges_enabled) {
    return refuse(
      'Les dons en ligne ne sont pas encore activés. Contactez l’association directement.',
      503,
      'payments_unavailable',
    );
  }

  const origin = siteOrigin(request);
  const reference = crypto.randomUUID();

  // La ligne est ecrite AVANT l'appel a Stripe : si Stripe repond mal, la
  // tentative existe et peut etre rapprochee. L'inverse perdrait un don.
  const { error } = await service.from('payments').insert({
    id: reference,
    organization_id: site.organizationId,
    site_id: site.siteId,
    scope: 'connect',
    kind: 'donation',
    status: 'pending',
    amount_cents: amountCents,
    currency: 'EUR',
    stripe_account_id: account.stripe_account_id,
    description: donorName ? `Don de ${donorName}` : 'Don',
  });

  if (error) {
    console.error('[stax:donations] enregistrement impossible', error.code, error.message);
    return refuse('Votre don n’a pas pu être enregistré. Réessayez.', 503, 'unavailable');
  }

  try {
    const session = await createConnectCheckoutSession({
      stripeAccountId: account.stripe_account_id,
      amountCents,
      currency: 'EUR',
      referenceId: reference,
      productName: 'Don',
      successUrl: `${origin}/don-merci?ref=${reference}`,
      cancelUrl: `${origin}/?don=annule`,
      ...(donorEmail ? { customerEmail: donorEmail } : {}),
      metadata: { stax_site_id: site.siteId, stax_kind: 'donation' },
    });

    return jsonResponse({ ok: true, url: session.url });
  } catch (error) {
    console.error('[stax:donations] session Stripe impossible', error);

    // La tentative reste en base avec son echec : elle ne sera pas comptee
    // comme un don recu, et l'incident est visible.
    await service
      .from('payments')
      .update({
        status: 'failed',
        failure_code: 'checkout_unavailable',
        failed_at: new Date().toISOString(),
      })
      .eq('id', reference);

    return refuse(
      'Le service de paiement est momentanément indisponible. Réessayez dans quelques minutes.',
      503,
      'stripe_unavailable',
    );
  }
}
