'use server';

import type { ActionState } from '~/lib/form-state';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createUserClient, listMemberships, unwrapMaybe } from '@stax/database';
import { createCheckoutSession, ensureStripeCustomer, isStripeConfigured } from '@stax/payments';
import { getBusiness } from '@stax/business';
import { clearOrderDraft, readOrderDraft } from '~/lib/order-draft';
import { ORG_COOKIE, SITE_COOKIE } from '~/lib/workspace';
import { getSession } from '~/lib/session';
import { guardAction } from '~/lib/action-guard';
import { DPA_VERSION, TERMS_VERSION } from '~/content/legal';

/**
 * Creation de la commande et ouverture du paiement.
 *
 * Ce qui se passe ici, et l ordre dans lequel cela se passe, est le cœur de
 * l integrite financiere :
 *
 *  1. La personne doit etre authentifiee. Une commande sans compte n aurait
 *     pas de proprietaire identifiable.
 *
 *  2. L organisation est creee si besoin, avec la personne comme
 *     proprietaire — le declencheur en base s en charge dans la meme
 *     transaction.
 *
 *  3. La commande est creee par `app.create_order`, qui LIT LE PRIX DANS LE
 *     CATALOGUE. Aucun montant ne vient du navigateur, et le brouillon signe
 *     n en contient aucun. Un client ne peut donc pas se fabriquer une remise.
 *
 *  4. La session Stripe est ouverte a partir des montants figes dans la
 *     commande, avec une cle d idempotence derivee de son identifiant : un
 *     double-clic ne cree pas deux paiements.
 *
 *  5. La commande ne devient « payee » qu au webhook. Cette action ne la marque
 *     jamais comme telle, quoi qu il arrive ensuite dans le navigateur.
 */

export type CheckoutState = ActionState;

export async function startCheckoutAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const professional = formData.get('professionalUse');
  if (professional !== 'on' && professional !== 'true') {
    return {
      status: 'error',
      message:
        'Nos offres sont réservées aux professionnels et aux associations : confirmez que vous ' +
        'commandez pour votre activité.',
    };
  }

  const accepted = formData.get('acceptTerms');
  if (accepted !== 'on' && accepted !== 'true') {
    return {
      status: 'error',
      message:
        'Vous devez accepter les conditions générales de vente et l’accord de traitement des ' +
        'données pour commander.',
    };
  }

  const session = await getSession();
  if (!session.user) {
    redirect('/connexion?suivant=%2Fcommander%2Frecapitulatif');
  }

  const guard = await guardAction({ limit: 'checkout', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const draft = await readOrderDraft();
  if (!draft.planSlug || !draft.businessTypeSlug || !draft.sectorSlug || !draft.organizationName) {
    return {
      status: 'error',
      message: 'Votre commande est incomplète. Reprenez le parcours depuis le début.',
    };
  }

  // Le metier doit exister ET appartenir au secteur annonce.
  const business = getBusiness(draft.businessTypeSlug);
  if (!business || business.sector !== draft.sectorSlug) {
    return { status: 'error', message: 'Le métier choisi n’est plus disponible.' };
  }

  if (!isStripeConfigured()) {
    return {
      status: 'error',
      message:
        'Le paiement en ligne n’est pas disponible pour le moment. Écrivez-nous et nous ' +
        'finaliserons votre commande avec vous.',
    };
  }

  const db = createUserClient(session.user.accessToken);

  // 1. Organisation : on reutilise celle dont la personne est deja
  //    proprietaire plutot que d en empiler une nouvelle a chaque commande.
  const memberships = await listMemberships(db, session.user.id);
  let organizationId = memberships.find((m) => m.role === 'owner')?.organizationId ?? null;

  if (!organizationId) {
    const { data: slug } = await db.rpc('unique_organization_slug', {
      p_source: draft.organizationName,
    });

    const created = unwrapMaybe<{ id: string }>(
      (await db
        .from('organizations')
        .insert({
          name: draft.organizationName,
          slug: typeof slug === 'string' ? slug : null,
          created_by: session.user.id,
          billing_email: draft.contactEmail ?? session.user.email,
          city: draft.city ?? null,
          phone: draft.contactPhone ?? null,
          sector_slug: draft.sectorSlug,
          business_type_slug: draft.businessTypeSlug,
        })
        .select('id')
        .single()) as never,
    );
    if (!created) {
      return {
        status: 'error',
        message: 'Votre espace n’a pas pu être créé. Réessayez dans quelques instants.',
      };
    }
    organizationId = created.id;
  }

  // 2. Offre : l identifiant du plan est resolu en base, jamais transmis par
  //    le navigateur.
  const plan = unwrapMaybe<{
    id: string;
    name: string;
    setup_price_cents: number;
    maintenance_price_cents: number;
    currency: string;
    stripe_setup_price_id: string | null;
    stripe_maintenance_price_id: string | null;
  }>(
    (await db
      .from('plans')
      .select(
        'id, name, setup_price_cents, maintenance_price_cents, currency, stripe_setup_price_id, stripe_maintenance_price_id',
      )
      .eq('slug', draft.planSlug)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single()) as never,
  );

  if (!plan) {
    return { status: 'error', message: 'Cette offre n’est plus disponible.' };
  }

  // 3. Commande : le prix vient du catalogue, calcule par la base.
  const { data: orderId, error: orderError } = await db.rpc('create_order', {
    p_organization_id: organizationId,
    p_plan_id: plan.id,
    p_sector_slug: draft.sectorSlug,
    p_business_type: draft.businessTypeSlug,
    p_questionnaire: {
      businessName: draft.organizationName,
      city: draft.city ?? null,
      contactEmail: draft.contactEmail ?? null,
      contactPhone: draft.contactPhone ?? null,
      ...draft.answers,
      // Preuve de l'acceptation (article 1127-2 du Code civil) : versions des
      // documents acceptes et declaration d'achat professionnel.
      acceptedDocuments: { cgv: TERMS_VERSION, dpa: DPA_VERSION, professionalUse: true },
    },
    p_requested_domain: draft.domainHostname ?? draft.subdomain ?? null,
    p_domain_handling: draft.domainHandling ?? 'none',
    p_coupon_code: draft.couponCode ?? null,
    p_customer_notes: draft.customerNotes ?? null,
    p_terms_version: TERMS_VERSION,
    p_ip_hash: guard.ipHash,
  });

  if (orderError || typeof orderId !== 'string') {
    return {
      status: 'error',
      message:
        'Votre commande n’a pas pu être enregistrée. Vérifiez vos droits sur cette organisation ' +
        'ou réessayez dans quelques instants.',
    };
  }

  // 4. Montants relus DEPUIS LA COMMANDE : ce sont eux, et eux seuls, qui
  //    partent chez Stripe.
  const order = unwrapMaybe<{
    id: string;
    reference: string;
    setup_price_cents: number;
    maintenance_price_cents: number;
    discount_cents: number;
    currency: string;
    coupon_code: string | null;
    vat_rate_bps: number;
  }>(
    (await db
      .from('orders')
      .select(
        'id, reference, setup_price_cents, maintenance_price_cents, discount_cents, currency, coupon_code, vat_rate_bps',
      )
      .eq('id', orderId)
      .single()) as never,
  );

  if (!order) {
    return { status: 'error', message: 'Commande introuvable. Réessayez.' };
  }

  let checkoutUrl: string;
  try {
    // Le client Stripe est cree une seule fois par organisation : la cle
    // d idempotence derive de son identifiant.
    const { data: existing } = await db
      .from('organizations')
      .select('stripe_customer_id')
      .eq('id', organizationId)
      .maybeSingle();

    const customerId = await ensureStripeCustomer({
      email: session.user.email,
      organizationName: draft.organizationName,
      organizationId,
      existingCustomerId: existing?.stripe_customer_id ?? null,
    });

    if (!existing?.stripe_customer_id) {
      await db
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', organizationId);
    }

    const checkout = await createCheckoutSession({
      orderId: order.id,
      orderReference: order.reference,
      organizationId,
      customerEmail: session.user.email,
      stripeCustomerId: customerId,
      plan: {
        planSlug: draft.planSlug,
        planName: plan.name,
        setupPriceCents: order.setup_price_cents,
        maintenancePriceCents: order.maintenance_price_cents,
        currency: order.currency as 'EUR',
        stripeSetupPriceId: plan.stripe_setup_price_id,
        stripeMaintenancePriceId: plan.stripe_maintenance_price_id,
        vatRateBps: order.vat_rate_bps,
      },
      discountCents: order.discount_cents,
      couponCode: order.coupon_code,
      locale: 'fr',
    });
    checkoutUrl = checkout.url;

    await db
      .from('orders')
      .update({ status: 'checkout_pending', stripe_checkout_session_id: checkout.sessionId })
      .eq('id', order.id);
  } catch (error) {
    console.error('[stax:checkout]', error);
    return {
      status: 'error',
      message:
        'La page de paiement n’a pas pu être ouverte. Votre commande est enregistrée : ' +
        'réessayez depuis votre espace, rien n’a été débité.',
    };
  }

  redirect(checkoutUrl);
}

/**
 * Commande d un compte interne StaX : aucun paiement, meme parcours qu un
 * client. La commande, l organisation, le projet et un site VIDE sont crees ;
 * l equipe StaX construit ensuite le site depuis l administration, puis le
 * confie a ce compte.
 *
 * L interface ne propose ce chemin qu aux comptes internes, mais CE N EST PAS
 * ELLE QUI DECIDE : `create_internal_order` relit en base le privilege du
 * compte (colonnes que lui-meme ne peut pas ecrire) et refuse tout autre
 * appelant. Un client qui invoquerait cette action a la main obtiendrait un
 * refus, et aucune commande.
 *
 * Aucun appel a Stripe n a lieu ici, ni avant ni apres.
 */
export async function createInternalOrderAction(
  _previous: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const accepted = formData.get('acceptTerms');
  if (accepted !== 'on' && accepted !== 'true') {
    return {
      status: 'error',
      message: 'Cochez la case de confirmation pour créer ce site.',
    };
  }

  const session = await getSession();
  if (!session.user) {
    redirect('/connexion?suivant=%2Fcommander%2Frecapitulatif');
  }

  const guard = await guardAction({ limit: 'checkout', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const draft = await readOrderDraft();
  if (!draft.planSlug || !draft.businessTypeSlug || !draft.sectorSlug || !draft.organizationName) {
    return {
      status: 'error',
      message: 'Votre commande est incomplète. Reprenez le parcours depuis le début.',
    };
  }

  const business = getBusiness(draft.businessTypeSlug);
  if (!business || business.sector !== draft.sectorSlug) {
    return { status: 'error', message: 'Le métier choisi n’est plus disponible.' };
  }

  const db = createUserClient(session.user.accessToken);

  const plan = unwrapMaybe<{ id: string }>(
    (await db
      .from('plans')
      .select('id')
      .eq('slug', draft.planSlug)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()) as never,
  );
  if (!plan) return { status: 'error', message: 'Cette offre n’est plus disponible.' };

  const pitch = typeof draft.answers['pitch'] === 'string' ? draft.answers['pitch'] : null;

  // Aucun modele n est applique : le site est construit de zero par l equipe.
  // Aucune cle de service non plus : tout passe par le jeton de la personne,
  // et c est la base qui verifie le privilege du compte.
  const { data, error } = await db.rpc('create_internal_order', {
    p_plan_id: plan.id,
    p_sector_slug: draft.sectorSlug,
    p_business_type: business.id,
    p_organization_name: draft.organizationName,
    p_questionnaire: {
      businessName: draft.organizationName,
      city: draft.city ?? null,
      contactEmail: draft.contactEmail ?? null,
      contactPhone: draft.contactPhone ?? null,
      ...draft.answers,
    },
    p_requested_domain: draft.domainHostname ?? draft.subdomain ?? null,
    p_domain_handling: draft.domainHandling ?? 'subdomain_only',
    p_customer_notes: draft.customerNotes ?? null,
    p_terms_version: TERMS_VERSION,
    p_template: null,
    p_hostname: null,
    p_details: {
      email: draft.contactEmail ?? null,
      phone: draft.contactPhone ?? null,
      city: draft.city ?? null,
      description: pitch,
    },
  });

  const result = (data ?? null) as {
    ok?: boolean;
    organizationId?: string;
    siteId?: string;
  } | null;
  if (error || !result?.ok || !result.organizationId || !result.siteId) {
    if (error?.code === '42501') {
      return {
        status: 'error',
        message: 'Ce compte ne peut pas commander sans paiement. Passez par le règlement habituel.',
      };
    }
    console.error('[stax:internal-order]', error?.message);
    return {
      status: 'error',
      message: 'La commande n’a pas pu être enregistrée. Rien n’a été créé : réessayez.',
    };
  }

  await clearOrderDraft();
  const store = await cookies();
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  };
  store.set(ORG_COOKIE, result.organizationId, options);
  store.set(SITE_COOKIE, result.siteId, options);

  redirect('/app?commande=interne');
}
