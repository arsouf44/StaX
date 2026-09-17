'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient } from '@stax/database';
import { uuidSchema } from '@stax/validation';
import { requireSession } from '~/lib/session';

/**
 * Traitement des messages recus.
 *
 * Toutes les ecritures passent par le client porteur du JWT de la personne :
 * la RLS verifie l appartenance du message a son organisation ET la capacite
 * `inbox.manage` du role. Aucun identifiant fourni par le navigateur n est
 * utilise pour choisir un tenant — seulement pour designer une ligne, dont
 * l appartenance est verifiee en base.
 */

const updateSchema = z
  .object({
    id: uuidSchema,
    status: z.enum(['unread', 'read', 'archived', 'spam']),
  })
  .strict();

export interface InboxActionState {
  status: 'idle' | 'error' | 'success';
  message?: string;
}

export async function updateSubmissionStatusAction(
  _previous: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const parsed = updateSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Action non reconnue.' };
  }

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const patch: Record<string, unknown> = { status: parsed.data.status };
  if (parsed.data.status === 'read') patch.read_at = new Date().toISOString();
  if (parsed.data.status === 'archived') patch.archived_at = new Date().toISOString();

  const { error } = await db.from('form_submissions').update(patch).eq('id', parsed.data.id);

  if (error) {
    return {
      status: 'error',
      message: 'Ce message n’a pas pu être mis à jour. Vérifiez vos droits ou réessayez.',
    };
  }

  revalidatePath('/app/messages');
  return { status: 'success' };
}

const noteSchema = z.object({ id: uuidSchema, note: z.string().max(4000) }).strict();

export async function saveInternalNoteAction(
  _previous: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const parsed = noteSchema.safeParse({
    id: formData.get('id'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) return { status: 'error', message: 'Note invalide.' };

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const { error } = await db
    .from('form_submissions')
    .update({ internal_note: parsed.data.note.trim() || null })
    .eq('id', parsed.data.id);

  if (error) return { status: 'error', message: 'La note n’a pas pu être enregistrée.' };

  revalidatePath('/app/messages');
  return { status: 'success', message: 'Note enregistrée.' };
}
