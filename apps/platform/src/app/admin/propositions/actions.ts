'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { tryCreateServiceClient, unwrapMaybe } from '@stax/database';
import { cloudflareSitesConfigured } from '@stax/infrastructure';
import { emailSchema, optionalText, uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import { runDeliveryChecks } from '~/lib/external-sites/admin-flows';
import type { ActionState } from '~/lib/form-state';
import {
  automaticChecksStale,
  generateProposalCode,
  hashProposalCode,
  PROPOSAL_VALID_DAYS,
  proposalClaimUrl,
  proposalCodeHint,
  sendPaymentReminder,
  sendProposalEmail,
} from '~/lib/proposals';

/**
 * Propositions de site : envoyer, relancer, retirer.
 *
 * Tout passe par le JETON de la personne : la base vérifie le rôle
 * (`platform_admin`), la checklist du site, l'offre, et journalise. La clé de
 * service ne sert qu'à rafraîchir les contrôles automatiques (preuves que
 * seul le serveur peut inscrire).
 *
 * Le code en clair n'existe que dans l'e-mail et dans la réponse de l'action
 * (pour pouvoir le dicter ou le copier si l'e-mail n'est pas parti). Il n'est
 * jamais stocké ni journalisé.
 */

export interface ProposalActionState extends ActionState {
  code?: string;
  claimUrl?: string;
  emailSent?: boolean;
}

const CHECK_LABELS: Record<string, string> = {
  repository: 'dépôt GitHub connecté',
  hosting: 'projet Cloudflare connecté',
  deployed: 'site déployé',
  https: 'HTTPS valide',
  seo: 'SEO minimum',
  forms: 'formulaires testés (à attester)',
  responsive: 'responsive vérifié (à attester)',
  manifest: 'contrat d’édition valide',
  editor: 'contenu initial importé (version 1)',
  plan: 'contrat compatible avec l’offre choisie',
};

const REFUSALS: Record<string, string> = {
  not_found: 'Ce site est introuvable.',
  archived: 'Ce site est archivé.',
  already_delivered: 'Ce site est déjà livré à un client.',
  not_external: 'Seul un site développé dans son propre dépôt peut être proposé.',
  proposal_open:
    'Une proposition est déjà en cours pour ce site. Relancez-la ou retirez-la d’abord.',
  site_has_client: 'Ce site a déjà un client rattaché : créez un nouveau site pour ce prospect.',
  plan_unavailable: 'Cette offre ne peut pas être proposée (offre sur devis ou inactive).',
  invalid_email: 'L’adresse e-mail du prospect n’est pas valide.',
  company_required: 'Indiquez le nom de l’entreprise.',
};

const createSchema = z
  .object({
    siteId: uuidSchema,
    planId: uuidSchema,
    email: emailSchema,
    companyName: z.string().trim().min(2, 'Nom de l’entreprise requis.').max(160),
    contactName: optionalText(120),
    phone: optionalText(40),
    message: optionalText(2000),
    internalNotes: optionalText(4000),
  })
  .strict();

function readForm(formData: FormData): Record<string, unknown> {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
  };
  return {
    siteId: text('siteId'),
    planId: text('planId'),
    email: text('email'),
    companyName: text('companyName'),
    contactName: text('contactName'),
    phone: text('phone'),
    message: text('message'),
    internalNotes: text('internalNotes'),
  };
}

export async function createProposalAction(
  _previous: ProposalActionState,
  formData: FormData,
): Promise<ProposalActionState> {
  const { session, db } = await requireAdminRole('platform_admin');

  const parsed = createSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Vérifiez le formulaire : site, offre, adresse e-mail et nom de l’entreprise sont obligatoires.',
    };
  }

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const site = unwrapMaybe<{ id: string; organization_id: string }>(
    (await db
      .from('sites')
      .select('id, organization_id')
      .eq('id', parsed.data.siteId)
      .maybeSingle()) as never,
  );
  if (!site) return { status: 'error', message: REFUSALS['not_found'] };

  // Les contrôles automatiques ne valent que 24 heures : on les refait avant
  // d'envoyer, pour ne pas refuser un site en bon état sur une preuve périmée.
  const service = tryCreateServiceClient();
  if (service && cloudflareSitesConfigured() && (await automaticChecksStale(db, site.id))) {
    await runDeliveryChecks(db, service, { id: site.id, organizationId: site.organization_id });
  }

  const code = generateProposalCode();
  const { data, error } = await db.rpc('create_site_proposal', {
    p_site: site.id,
    p_plan: parsed.data.planId,
    p_email: parsed.data.email,
    p_company: parsed.data.companyName,
    p_name: parsed.data.contactName ?? null,
    p_phone: parsed.data.phone ?? null,
    p_message: parsed.data.message ?? null,
    p_internal_notes: parsed.data.internalNotes ?? null,
    p_code_hash: await hashProposalCode(code),
    p_code_hint: proposalCodeHint(code),
    p_valid_days: PROPOSAL_VALID_DAYS,
  });

  if (error) {
    console.error('[stax:proposal] creation refusee', error.code, error.message);
    return {
      status: 'error',
      message:
        error.code === '42501'
          ? 'Votre rôle ne permet pas d’envoyer une proposition.'
          : 'La proposition n’a pas pu être créée. Rien n’a été envoyé.',
    };
  }

  const result = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    missing?: string[];
    proposalId?: string;
  };
  if (!result.ok || !result.proposalId) {
    if (result.code === 'checklist_incomplete') {
      const missing = (result.missing ?? []).map((key) => CHECK_LABELS[key] ?? key);
      return {
        status: 'error',
        message:
          'Le site n’est pas encore prêt à être vendu. À terminer sur « Infrastructure & ' +
          `livraison » : ${missing.join(', ')}. Le client recevra son site automatiquement ` +
          'après paiement : il doit donc être vérifié avant l’envoi.',
      };
    }
    return {
      status: 'error',
      message: REFUSALS[result.code ?? ''] ?? 'La proposition n’a pas pu être créée.',
    };
  }

  const proposal = unwrapMaybe<Parameters<typeof sendProposalEmail>[1]>(
    (await db
      .from('site_proposals')
      .select(
        'id, site_id, organization_id, prospect_email, prospect_name, company_name, plan_name, ' +
          'message, expires_at, setup_price_cents, total_cents, maintenance_price_cents, ' +
          'billing_interval, currency',
      )
      .eq('id', result.proposalId)
      .single()) as never,
  );

  const sent = proposal ? await sendProposalEmail(db, proposal, code) : null;
  const claimUrl = proposalClaimUrl(code, parsed.data.email.trim().toLowerCase());

  revalidatePath('/admin/propositions');
  revalidatePath(`/admin/sites/${site.id}`);

  if (!sent?.ok || sent.skipped) {
    return {
      status: 'success',
      message:
        'Proposition créée, mais l’e-mail n’est PAS parti' +
        (sent?.skipped ? ' (aucun fournisseur d’e-mail configuré)' : '') +
        '. Envoyez vous-même le lien et le code ci-dessous au prospect.',
      code,
      claimUrl,
      emailSent: false,
    };
  }

  return {
    status: 'success',
    message: `Proposition envoyée à ${parsed.data.email}. Elle est valable ${PROPOSAL_VALID_DAYS} jours.`,
    code,
    claimUrl,
    emailSent: true,
  };
}

const idSchema = z.object({ proposalId: uuidSchema }).strict();

export async function renewProposalAction(payload: unknown): Promise<ProposalActionState> {
  const { session, db } = await requireAdminRole('platform_admin');
  const parsed = idSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const current = unwrapMaybe<{ status: string; prospect_email: string }>(
    (await db
      .from('site_proposals')
      .select('status, prospect_email')
      .eq('id', parsed.data.proposalId)
      .maybeSingle()) as never,
  );
  if (!current) return { status: 'error', message: 'Cette proposition est introuvable.' };

  // Tant que le code n'a pas servi, il est remplacé : l'ancien e-mail ne vaut
  // plus rien. Une fois le site récupéré, seul le délai est prolongé.
  const code = current.status === 'sent' ? generateProposalCode() : null;
  const { data, error } = await db.rpc('renew_site_proposal', {
    p_proposal: parsed.data.proposalId,
    p_code_hash: code ? await hashProposalCode(code) : null,
    p_code_hint: code ? proposalCodeHint(code) : null,
    p_valid_days: PROPOSAL_VALID_DAYS,
  });
  const result = (data ?? {}) as { ok?: boolean; code?: string };
  if (error || !result.ok) {
    return {
      status: 'error',
      message:
        result.code === 'not_renewable'
          ? 'Cette proposition est payée, livrée ou retirée : elle ne se relance plus.'
          : 'La relance n’a pas pu être enregistrée.',
    };
  }

  const proposal = unwrapMaybe<Parameters<typeof sendProposalEmail>[1]>(
    (await db
      .from('site_proposals')
      .select(
        'id, site_id, organization_id, prospect_email, prospect_name, company_name, plan_name, ' +
          'message, expires_at, setup_price_cents, total_cents, maintenance_price_cents, ' +
          'billing_interval, currency',
      )
      .eq('id', parsed.data.proposalId)
      .single()) as never,
  );
  if (!proposal) return { status: 'error', message: 'Cette proposition est introuvable.' };

  const sent = code
    ? await sendProposalEmail(db, proposal, code, { reminder: true })
    : await sendPaymentReminder(db, proposal);

  revalidatePath('/admin/propositions');
  const emailed = sent.ok && !sent.skipped;
  return {
    status: 'success',
    message:
      `Proposition prolongée de ${PROPOSAL_VALID_DAYS} jours. ` +
      (emailed ? `Rappel envoyé à ${current.prospect_email}.` : 'L’e-mail n’est PAS parti.') +
      (code && !emailed ? ' Transmettez vous-même le nouveau code ci-dessous.' : ''),
    code: code && !emailed ? code : undefined,
    claimUrl: code && !emailed ? proposalClaimUrl(code, current.prospect_email) : undefined,
    emailSent: emailed,
  };
}

const withdrawSchema = z.object({ proposalId: uuidSchema, reason: optionalText(500) }).strict();

export async function withdrawProposalAction(payload: unknown): Promise<ActionState> {
  const { session, db } = await requireAdminRole('platform_admin');
  const parsed = withdrawSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const { data, error } = await db.rpc('withdraw_site_proposal', {
    p_proposal: parsed.data.proposalId,
    p_reason: parsed.data.reason ?? null,
  });
  const result = (data ?? {}) as { ok?: boolean; code?: string; accessRemoved?: boolean };
  if (error || !result.ok) {
    return {
      status: 'error',
      message:
        result.code === 'payment_in_progress'
          ? 'Un paiement est en cours sur cette proposition : elle ne peut pas être retirée.'
          : result.code === 'not_withdrawable'
            ? 'Cette proposition est déjà payée, livrée ou retirée.'
            : 'Le retrait n’a pas pu être enregistré.',
    };
  }

  revalidatePath('/admin/propositions');
  return {
    status: 'success',
    message: result.accessRemoved
      ? 'Proposition retirée. Le prospect n’a plus accès à ce site ; son compte et le site restent.'
      : 'Proposition retirée. Le code ne fonctionne plus ; le site reste en place.',
  };
}
