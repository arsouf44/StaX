'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, unwrapMaybe } from '@stax/database';
import { uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { messageRefusal, messageText, singleLineText } from '~/lib/message-text';
import { requireSession } from '~/lib/session';
import { alertTeam } from '~/lib/team-alerts';
import type { ActionState } from '~/lib/form-state';

/**
 * Assistance.
 *
 * Le ticket est cree avec le jeton de la personne : la RLS le rattache a son
 * organisation. Le cote emetteur (`client`) et le statut initial sont imposes
 * ICI — un client ne peut ni se faire passer pour l equipe StaX, ni marquer son
 * propre ticket comme resolu pour le faire disparaitre d une file.
 */

/** Message d'erreur a montrer tel quel : seulement ceux des champs de texte. */
function textIssue(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
  const issue = issues.find((item) => item.path[0] === 'subject' || item.path[0] === 'body');
  return issue?.message;
}

const ticketSchema = z
  .object({
    subject: singleLineText(5, 200, 'L’objet'),
    category: z.enum(['technical', 'content', 'billing', 'domain', 'other']).default('other'),
    body: messageText(10, 5000, 'Décrivez votre demande en quelques lignes.'),
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
      message:
        textIssue(parsed.error.issues) ??
        'Décrivez votre demande en quelques lignes pour que nous puissions aider.',
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
        // « Autre chose » : la base range ces demandes dans « general » (sa
        // liste ne connait pas `other`, et refusait le ticket entier).
        category: parsed.data.category === 'other' ? 'general' : parsed.data.category,
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
    return {
      status: 'error',
      message: messageRefusal(error, 'Votre message n’a pas pu être enregistré.'),
    };
  }

  await alertTeam(
    {
      subject: `Nouvelle demande d’assistance — ${parsed.data.subject}`,
      heading: 'Un client a ouvert une demande',
      lines: [
        ['Référence', reference],
        ['De', session.profile.email],
      ],
      excerpt: parsed.data.body,
      path: `/admin/support/${ticket.id}`,
      actionLabel: 'Lire et répondre',
    },
    { db, organizationId: membership.organization_id },
  );

  revalidatePath('/app/support');
  return {
    status: 'success',
    message: `Votre demande est enregistrée sous la référence ${reference}. Nous répondons sous un jour ouvré.`,
  };
}

const replySchema = z.object({
  ticketId: uuidSchema,
  body: messageText(2, 5000, 'Écrivez votre message.'),
});

export async function replyToTicketAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = replySchema.safeParse({
    ticketId: formData.get('ticketId'),
    body: formData.get('body'),
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: textIssue(parsed.error.issues) ?? 'Écrivez votre message.',
    };
  }

  const session = await requireSession();
  const guard = await guardAction({ limit: 'conversation', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };
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

  if (error) {
    return {
      status: 'error',
      message: messageRefusal(error, 'Votre message n’a pas pu être envoyé.'),
    };
  }

  await alertTeam({
    subject: 'Réponse d’un client sur une demande d’assistance',
    heading: 'Un client a répondu',
    lines: [['De', session.profile.email]],
    excerpt: parsed.data.body,
    path: `/admin/support/${ticket.id}`,
    actionLabel: 'Lire et répondre',
  });

  // Le ticket repasse « en attente de l'equipe » : c'est la base qui le fait
  // (`app.reopen_ticket_on_client_reply`, migration 0056). La mise a jour
  // tentee ici avec le jeton du client etait refusee en silence par la regle
  // `tickets_update_staff`.

  revalidatePath('/app/support');
  return { status: 'success', message: 'Message envoyé.' };
}
