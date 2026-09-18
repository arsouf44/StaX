'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, unwrapMaybe } from '@stax/database';
import { boundedText, uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireSession } from '~/lib/session';
import type { ActionState } from '~/lib/form-state';

/**
 * Assistance.
 *
 * Le ticket est cree avec le jeton de la personne : la RLS le rattache a son
 * organisation. Le cote emetteur (`client`) et le statut initial sont imposes
 * ICI — un client ne peut ni se faire passer pour l equipe StaX, ni marquer son
 * propre ticket comme resolu pour le faire disparaitre d une file.
 */

const ticketSchema = z
  .object({
    subject: boundedText(5, 200, 'L objet'),
    category: z.enum(['technical', 'content', 'billing', 'domain', 'other']).default('other'),
    body: boundedText(10, 5000, 'Votre message'),
  })
  .strict();

export async function openTicketAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = ticketSchema.safeParse({
    subject: formData.get('subject'),
    category: formData.get('category'),
    body: formData.get('body'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Décrivez votre demande en quelques lignes pour que nous puissions aider.',
    };
  }

  const session = await requireSession();
  const guard = await guardAction({ limit: 'apiWrite', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);

  // L organisation vient de l appartenance reelle, pas d un champ du
  // formulaire.
  const membership = unwrapMaybe<{ organization_id: string }>(
    (await db
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', session.user.id)
      .limit(1)
      .maybeSingle()) as never,
  );

  if (!membership) {
    return { status: 'error', message: 'Aucune organisation rattachée à votre compte.' };
  }

  const reference = `T-${new Date().toISOString().slice(2, 7).replace('-', '')}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;

  const ticket = unwrapMaybe<{ id: string }>(
    (await db
      .from('support_tickets')
      .insert({
        reference,
        organization_id: membership.organization_id,
        opened_by: session.user.id,
        subject: parsed.data.subject,
        category: parsed.data.category,
        status: 'open',
        priority: 'normal',
      })
      .select('id')
      .single()) as never,
  );

  if (!ticket) {
    return { status: 'error', message: 'Votre demande n’a pas pu être enregistrée. Réessayez.' };
  }

  const { error } = await db.from('support_messages').insert({
    ticket_id: ticket.id,
    author_id: session.user.id,
    author_side: 'client',
    body: parsed.data.body,
    is_internal: false,
  });

  if (error) {
    return { status: 'error', message: 'Votre message n’a pas pu être enregistré.' };
  }

  revalidatePath('/app/support');
  return {
    status: 'success',
    message: `Votre demande est enregistrée sous la référence ${reference}. Nous répondons sous un jour ouvré.`,
  };
}

const replySchema = z.object({ ticketId: uuidSchema, body: boundedText(2, 5000, 'Votre message') });

export async function replyToTicketAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = replySchema.safeParse({
    ticketId: formData.get('ticketId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { status: 'error', message: 'Écrivez votre message.' };

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const ticket = unwrapMaybe<{ id: string }>(
    (await db
      .from('support_tickets')
      .select('id')
      .eq('id', parsed.data.ticketId)
      .maybeSingle()) as never,
  );
  if (!ticket) return { status: 'error', message: 'Cette demande est introuvable.' };

  const { error } = await db.from('support_messages').insert({
    ticket_id: ticket.id,
    author_id: session.user.id,
    author_side: 'client',
    body: parsed.data.body,
    is_internal: false,
  });

  if (error) return { status: 'error', message: 'Votre message n’a pas pu être envoyé.' };

  // Le ticket repasse en attente de notre cote : c est a nous de jouer.
  await db
    .from('support_tickets')
    .update({ status: 'waiting_support' })
    .eq('id', ticket.id)
    .in('status', ['waiting_customer', 'open']);

  revalidatePath('/app/support');
  return { status: 'success', message: 'Message envoyé.' };
}
