'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, unwrapMaybe } from '@stax/database';
import { uuidSchema } from '@stax/validation';
import { requireSession } from '~/lib/session';

/**
 * Echanges autour d un projet.
 *
 * Le message est ecrit avec le jeton de la personne : la RLS verifie qu elle
 * appartient bien a l organisation du projet. Le cote emetteur (`client`) est
 * impose ICI et jamais lu depuis le formulaire — sans quoi un client pourrait
 * se faire passer pour l equipe StaX dans le fil de discussion.
 */

const messageSchema = z
  .object({
    projectId: uuidSchema,
    body: z.string().trim().min(2, 'Votre message est vide.').max(5000),
  })
  .strict();

export async function sendProjectMessageAction(
  _previous: { status: 'idle' | 'error' | 'success'; message?: string },
  formData: FormData,
): Promise<{ status: 'idle' | 'error' | 'success'; message?: string }> {
  const parsed = messageSchema.safeParse({
    projectId: formData.get('projectId'),
    body: formData.get('body'),
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Écrivez votre message avant de l’envoyer.' };
  }

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  // Le projet doit exister ET etre visible par cette personne. La RLS le
  // garantit : une lecture vide signifie « pas le vôtre ».
  const project = unwrapMaybe<{ id: string }>(
    (await db.from('projects').select('id').eq('id', parsed.data.projectId).maybeSingle()) as never,
  );
  if (!project) {
    return { status: 'error', message: 'Ce projet est introuvable.' };
  }

  const { error } = await db.from('project_messages').insert({
    project_id: project.id,
    author_id: session.user.id,
    // Impose cote serveur : jamais lu depuis le formulaire.
    author_side: 'client',
    body: parsed.data.body,
  });

  if (error) {
    return {
      status: 'error',
      message: 'Votre message n’a pas pu être envoyé. Réessayez dans quelques instants.',
    };
  }

  revalidatePath('/app/projet');
  return { status: 'success', message: 'Message envoyé. Nous répondons sous un jour ouvré.' };
}
