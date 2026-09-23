'use server';

import { tryCreateServiceClient } from '@stax/database';
import { contentReportReceivedEmail, sendEmail } from '@stax/emails';
import { contentReportSchema, fieldErrors, formDataToObject } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';

/**
 * Signalement d'un contenu illicite.
 *
 * Meme garde que le formulaire de contact (debit, champ piege, Turnstile).
 * L'ecriture passe par une fonction reservee au role de service : le public
 * n'a aucun droit sur la table. L'accuse de reception est du a la personne
 * qui signale (article 16.4 du reglement sur les services numeriques).
 */

export interface ReportState {
  status: 'idle' | 'error' | 'success';
  message?: string;
  reference?: string;
  errors?: Record<string, string[]>;
}

function checkbox(value: unknown): boolean {
  return value === 'on' || value === 'true' || value === true;
}

export async function sendContentReportAction(
  _previous: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const raw = formDataToObject(formData);
  const parsed = contentReportSchema.safeParse({ ...raw, goodFaith: checkbox(raw.goodFaith) });

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

  const service = tryCreateServiceClient();
  if (service === null) {
    return {
      status: 'error',
      message:
        'Votre signalement n’a pas pu être enregistré : le formulaire est momentanément ' +
        'indisponible. Réessayez dans quelques instants.',
    };
  }

  const { data, error } = await service.rpc('record_content_report', {
    p_url: parsed.data.url,
    p_category: parsed.data.category,
    p_explanation: parsed.data.explanation,
    p_name: parsed.data.name ?? null,
    p_email: parsed.data.email ?? null,
    p_good_faith: true,
    p_ip_hash: guard.ipHash,
  });
  const result = data as { ok?: boolean; reference?: string } | null;

  if (error || !result?.ok || !result.reference) {
    return {
      status: 'error',
      message: 'Votre signalement n’a pas pu être enregistré. Réessayez dans quelques instants.',
    };
  }

  if (parsed.data.email) {
    try {
      await sendEmail(
        contentReportReceivedEmail({
          to: parsed.data.email,
          reference: result.reference,
          url: parsed.data.url,
        }),
        { db: service },
      );
    } catch (mailError) {
      // Le signalement est enregistre : l'echec de l'accuse ne l'annule pas.
      console.error('[stax:signalements] accuse de reception non envoye', mailError);
    }
  }

  return {
    status: 'success',
    reference: result.reference,
    message:
      `Votre signalement est enregistré sous la référence ${result.reference}. ` +
      (parsed.data.email
        ? 'Un accusé de réception vous a été adressé par e-mail, et vous serez informé de la suite donnée.'
        : 'Il sera examiné par une personne de notre équipe.'),
  };
}
