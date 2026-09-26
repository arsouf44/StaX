'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { unwrapMaybe } from '@stax/database';
import { sendEmail, teamReplyEmail } from '@stax/emails';
import { uuidSchema } from '@stax/validation';
import { absolutePlatformUrl, guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';

/**
 * Réponse de l'équipe à un ticket d'assistance.
 *
 * Une note interne n'est jamais montrée au client (policy
 * `ticket_messages_select`) ; une réponse l'est, et part par e-mail à la
 * personne qui a ouvert le ticket.
 */

const schema = z
  .object({
    ticketId: uuidSchema,
    body: z.string().trim().min(2, 'Votre réponse est vide.').max(5000),
    internal: z.boolean(),
    status: z.enum(['waiting_customer', 'resolved', 'closed', 'waiting_support']),
  })
  .strict();

export async function replyToTicketAsTeamAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session, db } = await requireAdminRole('support');
  const parsed = schema.safeParse({
    ticketId: formData.get('ticketId'),
    body: formData.get('body'),
    internal: formData.get('internal') === 'on',
    status: formData.get('status') ?? 'waiting_customer',
  });
  if (!parsed.success) return { status: 'error', message: 'Écrivez votre réponse.' };

  const guard = await guardAction({ limit: 'apiWrite', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const ticket = unwrapMaybe<{
    id: string;
    reference: string;
    organization_id: string | null;
    first_response_at: string | null;
    profiles: { email: string; first_name: string | null } | null;
  }>(
    (await db
      .from('support_tickets')
      .select(
        'id, reference, organization_id, first_response_at, profiles!support_tickets_opened_by_fkey ( email, first_name )',
      )
      .eq('id', parsed.data.ticketId)
      .maybeSingle()) as never,
  );
  if (!ticket) return { status: 'error', message: 'Ce ticket est introuvable.' };

  const { error } = await db.from('support_messages').insert({
    ticket_id: ticket.id,
    author_id: session.user.id,
    author_side: 'stax',
    body: parsed.data.body,
    is_internal: parsed.data.internal,
  });
  if (error) return { status: 'error', message: 'La réponse n’a pas pu être enregistrée.' };

  const now = new Date().toISOString();
  await db
    .from('support_tickets')
    .update({
      status: parsed.data.internal ? undefined : parsed.data.status,
      first_response_at: parsed.data.internal ? undefined : (ticket.first_response_at ?? now),
      resolved_at: parsed.data.status === 'resolved' ? now : undefined,
      closed_at: parsed.data.status === 'closed' ? now : undefined,
    })
    .eq('id', ticket.id);

  let emailed = false;
  if (!parsed.data.internal && ticket.profiles?.email) {
    const sent = await sendEmail(
      teamReplyEmail({
        to: ticket.profiles.email,
        firstName: ticket.profiles.first_name,
        excerpt: parsed.data.body,
        conversationUrl: absolutePlatformUrl('/app/support'),
      }),
      { db, organizationId: ticket.organization_id ?? undefined },
    ).catch(() => ({ ok: false, skipped: false }));
    emailed = sent.ok && !sent.skipped;
  }

  revalidatePath(`/admin/support/${ticket.id}`);
  revalidatePath('/admin/support');
  return {
    status: 'success',
    message: parsed.data.internal
      ? 'Note interne enregistrée (invisible pour le client).'
      : emailed
        ? 'Réponse envoyée, le client a été prévenu par e-mail.'
        : 'Réponse enregistrée : elle apparaît dans l’espace du client.',
  };
}
