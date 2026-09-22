'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, unwrapMaybe } from '@stax/database';
import { boundedText, uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';

/**
 * Traitement des demandes RGPD.
 *
 * Deux regles tiennent tout le reste :
 *
 *  1. RIEN N'EST LIVRE SANS IDENTITE VERIFIEE. Repondre a une demande d'acces
 *     sans s'assurer de qui demande revient a communiquer les donnees de
 *     quelqu'un d'autre a un inconnu — c'est-a-dire a commettre la violation
 *     qu'on croyait eviter. L'ordre des etapes est donc impose ici, pas
 *     seulement suggere.
 *  2. UN REFUS SE MOTIVE. L'article 12.4 impose d'informer la personne des
 *     motifs et de son droit de reclamation. Un refus sans motif n'est pas une
 *     decision, c'est une omission.
 */

const verifySchema = z
  .object({ id: uuidSchema, method: boundedText(5, 300, 'La méthode de vérification') })
  .strict();

export async function verifyRequesterIdentityAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = verifySchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Indiquez comment l’identité a été vérifiée : ce point sera relu en cas de litige.',
    };
  }

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);

  const { error } = await db
    .from('privacy_requests')
    .update({
      identity_verified_at: new Date().toISOString(),
      status: 'in_progress',
      handled_by: session.user.id,
      response_note: parsed.data.method,
    })
    .eq('id', parsed.data.id);

  if (error) return { status: 'error', message: 'Cette vérification n’a pas pu être enregistrée.' };

  revalidatePath('/admin/confidentialite');
  return { status: 'success', message: 'Identité vérifiée. La demande peut être traitée.' };
}

const resolveSchema = z
  .object({
    id: uuidSchema,
    outcome: z.enum(['completed', 'refused']),
    note: boundedText(10, 2000, 'La réponse'),
  })
  .strict();

export async function resolvePrivacyRequestAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = resolveSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Décrivez ce qui a été fait, ou le motif du refus. Cette réponse est due à la personne ' +
        'et sera relue en cas de réclamation.',
    };
  }

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);

  const request = unwrapMaybe<{ id: string; kind: string; identity_verified_at: string | null }>(
    (await db
      .from('privacy_requests')
      .select('id, kind, identity_verified_at')
      .eq('id', parsed.data.id)
      .maybeSingle()) as never,
  );

  if (!request) return { status: 'error', message: 'Cette demande est introuvable.' };

  // Une demande d'acces ou d'effacement executee sans verification d'identite
  // est precisement la faute qu'on cherche a eviter. On refuse ici, meme si
  // l'operateur insiste.
  if (parsed.data.outcome === 'completed' && request.identity_verified_at === null) {
    return {
      status: 'error',
      message:
        'L’identité du demandeur n’a pas été vérifiée. Livrer ou effacer des données sans cette ' +
        'vérification revient à traiter la demande de quelqu’un d’autre.',
    };
  }

  const { error } = await db
    .from('privacy_requests')
    .update({
      status: parsed.data.outcome,
      response_note: parsed.data.note,
      handled_by: session.user.id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id);

  if (error) return { status: 'error', message: 'Cette réponse n’a pas pu être enregistrée.' };

  revalidatePath('/admin/confidentialite');
  return {
    status: 'success',
    message:
      parsed.data.outcome === 'completed'
        ? 'Demande traitée. Informez la personne du résultat.'
        : 'Refus enregistré. La personne doit être informée du motif et de son droit de saisir la CNIL.',
  };
}
