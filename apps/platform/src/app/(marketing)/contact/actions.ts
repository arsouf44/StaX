'use server';

import { createServiceClient } from '@stax/database';
import { scoreSubmission } from '@stax/security';
import {
  contactFormSchema,
  fieldErrors,
  formDataToObject,
  quoteBriefSchema,
} from '@stax/validation';
import { guardAction } from '~/lib/action-guard';

/**
 * Demandes entrantes du site StaX.
 *
 * Deux garde-fous imposes a chaque envoi : la garde commune (limitation de
 * debit sur empreinte d IP, champ piege, Turnstile) et un score anti-pourriel.
 * Un message suspect n est JAMAIS jete : il est enregistre et classe, pour
 * qu un faux positif reste recuperable.
 *
 * L ecriture passe par une fonction SQL reservee au role de service : aucune
 * table n est exposee en ecriture au public.
 */

export interface LeadState {
  status: 'idle' | 'error' | 'success';
  message?: string;
  reference?: string;
  errors?: Record<string, string[]>;
}

function checkbox(value: unknown): boolean {
  return value === 'on' || value === 'true' || value === true;
}

export async function sendContactAction(
  _previous: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const raw = formDataToObject(formData);
  const parsed = contactFormSchema.safeParse({
    ...raw,
    acceptPrivacy: checkbox(raw.acceptPrivacy),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Certains champs doivent être corrigés.',
      errors: fieldErrors(parsed.error),
    };
  }

  const guard = await guardAction({
    limit: 'contactForm',
    honeypot: parsed.data.website,
    turnstileToken: parsed.data.turnstileToken,
  });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const verdict = scoreSubmission({
    honeypot: parsed.data.website,
    elapsedMs: parsed.data.elapsedMs ?? null,
    message: parsed.data.message,
    email: parsed.data.email,
  });

  const { data, error } = await createServiceClient().rpc('record_platform_lead', {
    p_kind: 'contact',
    p_name: parsed.data.name,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone || null,
    p_company: parsed.data.company || null,
    p_subject: parsed.data.subject,
    p_message: parsed.data.message,
    p_brief: {},
    p_sector: null,
    p_business: null,
    p_spam_score: verdict.score,
    p_ip_hash: guard.ipHash,
    p_locale: 'fr',
  });

  if (error || !(data as { ok?: boolean } | null)?.ok) {
    return {
      status: 'error',
      message:
        'Votre message n’a pas pu être enregistré. Réessayez dans quelques instants, ou ' +
        'écrivez-nous directement.',
    };
  }

  return {
    status: 'success',
    message:
      'Merci, votre message est bien arrivé. Nous répondons sous un jour ouvré, à l’adresse ' +
      'que vous avez indiquée.',
  };
}

export async function sendQuoteRequestAction(
  _previous: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const raw = formDataToObject(formData);
  const parsed = quoteBriefSchema.safeParse({
    ...raw,
    acceptPrivacy: checkbox(raw.acceptPrivacy),
    features: formData.getAll('features').map(String),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Certains champs doivent être corrigés.',
      errors: fieldErrors(parsed.error),
    };
  }

  const guard = await guardAction({
    limit: 'quoteForm',
    honeypot: parsed.data.website,
    turnstileToken: parsed.data.turnstileToken,
  });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const verdict = scoreSubmission({
    honeypot: parsed.data.website,
    message: parsed.data.objective,
    email: parsed.data.contactEmail,
  });

  // Le brief est stocke tel quel : c est une structure validee, pas du texte
  // libre reinterprete.
  const brief = {
    objective: parsed.data.objective,
    pageCountRange: parsed.data.pageCountRange,
    features: parsed.data.features,
    integrations: parsed.data.integrations ?? null,
    hasContent: parsed.data.hasContent,
    hasDomain: parsed.data.hasDomain,
    deadline: parsed.data.deadline,
    budgetRange: parsed.data.budgetRange,
    comments: parsed.data.comments ?? null,
  };

  const { data, error } = await createServiceClient().rpc('record_platform_lead', {
    p_kind: 'quote',
    p_name: parsed.data.contactName,
    p_email: parsed.data.contactEmail,
    p_phone: parsed.data.contactPhone || null,
    p_company: parsed.data.companyName || null,
    p_subject: 'Demande de devis sur mesure',
    p_message: parsed.data.objective,
    p_brief: brief,
    p_sector: parsed.data.sectorSlug ?? null,
    p_business: parsed.data.businessTypeSlug ?? null,
    p_spam_score: verdict.score,
    p_ip_hash: guard.ipHash,
    p_locale: 'fr',
  });

  const result = data as { ok?: boolean; reference?: string } | null;
  if (error || !result?.ok) {
    return {
      status: 'error',
      message: 'Votre demande n’a pas pu être enregistrée. Réessayez, ou écrivez-nous directement.',
    };
  }

  return {
    status: 'success',
    reference: result.reference,
    message:
      'Merci, votre demande est enregistrée. Nous revenons vers vous sous deux jours ouvrés ' +
      'avec des questions précises, puis un devis chiffré.',
  };
}
