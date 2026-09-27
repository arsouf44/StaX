import { hashEmail } from '@stax/security';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEmailProvider, type EmailMessage, type EmailSendResult } from './provider';

/**
 * Une ligne d'en-tete tient sur UNE ligne : un saut de ligne dans un objet
 * compose a partir d'un nom saisi (entreprise, prospect) pourrait, chez un
 * fournisseur SMTP, ajouter des en-tetes (destinataires caches). Les
 * controles et marques de direction sont retires pour la meme raison.
 */
export function headerSafe(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ')
      .replace(/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 250)
  );
}

/**
 * Envoi journalise.
 *
 * Le journal conserve le gabarit, un HACHE du destinataire et le statut :
 * assez pour diagnostiquer un probleme de delivrabilite, jamais assez pour
 * reconstituer un carnet d adresses.
 */
export async function sendEmail(
  message: EmailMessage,
  options: { db?: SupabaseClient; organizationId?: string; siteId?: string } = {},
): Promise<EmailSendResult> {
  const provider = getEmailProvider();
  const result = await provider.send({
    ...message,
    to: message.to.trim(),
    subject: headerSafe(message.subject),
    ...(message.replyTo ? { replyTo: headerSafe(message.replyTo) } : {}),
  });

  if (options.db) {
    const toHash = await hashEmail(message.to);
    await options.db.from('email_log').insert({
      template: message.template,
      to_hash: toHash,
      organization_id: options.organizationId ?? null,
      site_id: options.siteId ?? null,
      provider: provider.name,
      provider_message_id: result.providerMessageId ?? null,
      status: result.ok ? 'sent' : 'failed',
      error: result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
    });
  }

  return result;
}

/** Envoi groupe, tolerant a l echec unitaire. */
export async function sendEmails(
  messages: readonly EmailMessage[],
  options: { db?: SupabaseClient; organizationId?: string; siteId?: string } = {},
): Promise<EmailSendResult[]> {
  return Promise.all(messages.map((message) => sendEmail(message, options)));
}
