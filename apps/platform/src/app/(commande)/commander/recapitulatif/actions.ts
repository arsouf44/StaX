'use server';

import type { ActionState } from '~/lib/form-state';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getBusiness } from '@nemasus/business';
import { createUserClient, tryCreateServiceClient, unwrapMaybe } from '@nemasus/database';
import { isLegalValueConfigured, legalValue } from '@nemasus/config';
import { clearOrderDraft, readOrderDraft } from '~/lib/order-draft';
import { ORG_COOKIE, SITE_COOKIE } from '~/lib/workspace';
import { getSession } from '~/lib/session';
import { guardAction } from '~/lib/action-guard';
import { sendOrderReceivedEmail } from '~/lib/site-orders';
import { alertTeam } from '~/lib/team-alerts';
import { TERMS_VERSION } from '~/content/legal';

/**
 * Envoi de la commande.
 *
 *  1. Aucun compte n'est exigé : le compte du client s'ouvre avec le code
 *     d'accès personnel qu'il reçoit une fois son virement arrivé.
 *  2. Aucun montant ne part du navigateur, et aucun n'est enregistré ici : il
 *     n'y a pas de grille tarifaire. L'équipe convient du montant avec le
 *     client et lui adresse les modalités de paiement par virement.
 *  3. L'écriture passe par une fonction SQL réservée au serveur : aucune
 *     table n'est exposée en écriture au public. Garde commune (débit,
 *     champ piège, Turnstile) avant tout.
 */

export type OrderSubmitState = ActionState;

function checked(value: FormDataEntryValue | null): boolean {
  return value === 'on' || value === 'true';
}

function unavailable(): string {
  const contact = isLegalValueConfigured('SUPPORT_EMAIL')
    ? ` Écrivez-nous à ${legalValue('SUPPORT_EMAIL')} : nous enregistrerons votre commande avec vous.`
    : '';
  return `Votre commande n’a pas pu être enregistrée pour le moment.${contact}`;
}

const DOMAIN_LABELS: Record<string, string> = {
  customer_owned: 'Domaine existant à connecter',
  purchase: 'Domaine à acheter',
  later: 'Domaine choisi plus tard',
};

export async function submitOrderAction(
  _previous: OrderSubmitState,
  formData: FormData,
): Promise<OrderSubmitState> {
  if (!checked(formData.get('professionalUse'))) {
    return {
      status: 'error',
      message:
        'Nos services sont réservés aux professionnels et aux associations : confirmez que vous ' +
        'commandez pour votre activité.',
    };
  }
  if (!checked(formData.get('acceptTerms'))) {
    return {
      status: 'error',
      message:
        'Pour envoyer votre commande, acceptez les conditions générales de vente et l’accord de ' +
        'traitement des données.',
    };
  }

  const guard = await guardAction({
    limit: 'orderForm',
    honeypot: formData.get('website'),
    turnstileToken: formData.get('turnstileToken'),
  });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const draft = await readOrderDraft();
  if (!draft.businessTypeSlug || !draft.sectorSlug || !draft.organizationName) {
    return {
      status: 'error',
      message: 'Votre commande est incomplète. Reprenez le parcours depuis le début.',
    };
  }
  if (!draft.contactEmail) {
    return {
      status: 'error',
      message: 'Indiquez votre adresse e-mail à l’étape « Vos coordonnées ».',
    };
  }
  const business = getBusiness(draft.businessTypeSlug);
  if (!business || business.sector !== draft.sectorSlug) {
    return {
      status: 'error',
      message: 'Le métier choisi n’est plus disponible. Choisissez-le à nouveau.',
    };
  }

  const service = tryCreateServiceClient();
  if (service === null) return { status: 'error', message: unavailable() };

  const { data, error } = await service.rpc('submit_site_order', {
    p_company: draft.organizationName,
    p_first_name: draft.contactFirstName ?? null,
    p_last_name: draft.contactLastName ?? null,
    p_email: draft.contactEmail,
    p_phone: draft.contactPhone ?? null,
    p_city: draft.city ?? null,
    p_sector: draft.sectorSlug,
    p_business_type: draft.businessTypeSlug,
    p_description: draft.customerNotes ?? null,
    p_answers: draft.answers,
    p_domain_handling: draft.domainHandling ?? 'later',
    p_domain: draft.domainHostname ?? null,
    p_terms_version: TERMS_VERSION,
    p_ip_hash: guard.ipHash,
  });

  const result = (data ?? null) as {
    ok?: boolean;
    code?: string;
    orderId?: string;
    reference?: string;
    duplicate?: boolean;
  } | null;

  if (error || !result?.ok || !result.orderId || !result.reference) {
    console.error('[nemasus:order] commande refusee', error?.code, error?.message, result?.code);
    if (result?.code === 'invalid_email') {
      return { status: 'error', message: 'L’adresse e-mail indiquée n’est pas valide.' };
    }
    return { status: 'error', message: unavailable() };
  }

  if (!result.duplicate) {
    await sendOrderReceivedEmail(service, {
      id: result.orderId,
      reference: result.reference,
      company_name: draft.organizationName,
      contact_first_name: draft.contactFirstName ?? null,
      contact_email: draft.contactEmail,
    });

    await alertTeam(
      {
        subject: `Nouvelle commande ${result.reference} — ${draft.organizationName}`,
        heading: 'Nouvelle commande : modalités de paiement à envoyer',
        lines: [
          ['Référence', result.reference],
          ['Entreprise', draft.organizationName],
          [
            'Contact',
            [draft.contactFirstName, draft.contactLastName].filter(Boolean).join(' ') ||
              draft.contactEmail,
          ],
          ['E-mail', draft.contactEmail],
          ['Téléphone', draft.contactPhone ?? '—'],
          ['Métier', business.name],
          ['Ville', draft.city ?? '—'],
          [
            'Adresse web',
            `${DOMAIN_LABELS[draft.domainHandling ?? 'later'] ?? '—'}${
              draft.domainHostname ? ` : ${draft.domainHostname}` : ''
            }`,
          ],
        ],
        excerpt: draft.customerNotes ?? null,
        path: `/admin/commandes/${result.orderId}`,
        actionLabel: 'Ouvrir la commande',
      },
      { db: service },
    );
  }

  await clearOrderDraft();
  redirect(`/commander/merci?reference=${encodeURIComponent(result.reference)}`);
}

/**
 * Commande d'un compte interne Nemasus : aucun paiement, même parcours qu'un
 * client. La commande, l'organisation, le projet et un site VIDE sont créés ;
 * l'équipe construit ensuite le site, puis le confie à ce compte.
 *
 * L'interface ne propose ce chemin qu'aux comptes internes, mais CE N'EST PAS
 * ELLE QUI DÉCIDE : `create_internal_order` relit en base le privilège du
 * compte et refuse tout autre appelant.
 */
export async function createInternalOrderAction(
  _previous: OrderSubmitState,
  formData: FormData,
): Promise<OrderSubmitState> {
  if (!checked(formData.get('acceptTerms'))) {
    return { status: 'error', message: 'Cochez la case de confirmation pour créer ce site.' };
  }

  const session = await getSession();
  if (!session.user) {
    redirect('/connexion?suivant=%2Fcommander%2Frecapitulatif');
  }

  const guard = await guardAction({ limit: 'checkout', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const draft = await readOrderDraft();
  if (!draft.businessTypeSlug || !draft.sectorSlug || !draft.organizationName) {
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
  // L'offre interne n'est pas publique : la RLS la masque aux comptes non
  // staff. Son identifiant n'a rien de sensible, il est lu côté serveur ;
  // la commande elle-même reste passée sous l'identité de l'utilisateur.
  const catalog = tryCreateServiceClient();
  if (!catalog) return { status: 'error', message: 'La commande interne est indisponible.' };

  // Formule interne des sites (aucun prix) : ses droits sont ceux que vérifie
  // la checklist de livraison.
  const plan = unwrapMaybe<{ id: string }>(
    (await catalog
      .from('plans')
      .select('id')
      .eq('slug', 'site-nemasus')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()) as never,
  );
  if (!plan) return { status: 'error', message: 'La commande interne est indisponible.' };

  const pitch = typeof draft.answers['pitch'] === 'string' ? draft.answers['pitch'] : null;

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
    p_requested_domain: draft.domainHostname ?? null,
    p_domain_handling:
      draft.domainHandling === 'customer_owned'
        ? 'customer_owned'
        : draft.domainHandling === 'purchase'
          ? 'stax_purchase'
          : 'subdomain_only',
    p_customer_notes: draft.customerNotes ?? null,
    p_terms_version: TERMS_VERSION,
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
        message: 'Ce compte ne peut pas commander sans paiement. Envoyez la commande normalement.',
      };
    }
    console.error('[nemasus:internal-order]', error?.message);
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
