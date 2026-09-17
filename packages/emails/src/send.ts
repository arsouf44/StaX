import { hashEmail } from '@stax/security';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEmailProvider, type EmailMessage, type EmailSendResult } from './provider';

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
  const result = await provider.send(message);

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
