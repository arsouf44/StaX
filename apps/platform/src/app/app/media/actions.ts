'use server';

import { revalidatePath } from 'next/cache';
import { createUserClient, unwrapMaybe } from '@stax/database';
import { optionalText, uuidSchema } from '@stax/validation';
import { z } from 'zod';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace } from '~/lib/workspace';
import { storeMediaFile } from '~/lib/media-store';

/**
 * Bibliotheque de medias.
 *
 * Trois protections, toutes cote serveur :
 *
 *  1. le TYPE du fichier est verifie contre une liste blanche — la base porte
 *     la meme contrainte, donc un contournement applicatif ne suffirait pas ;
 *  2. le CHEMIN de stockage est CONSTRUIT a partir de l'organisation et du
 *     site lus en session. Un nom de fichier envoye par le navigateur ne peut
 *     pas remonter dans l'arborescence ni ecrire chez un autre client ;
 *  3. le QUOTA de l'offre est verifie avant l'ecriture.
 *
 * Le SVG est accepte parce que beaucoup de logos en dependent, mais il est
 * servi depuis le stockage Supabase — une origine distincte du site client —
 * et jamais insere en ligne dans une page : un SVG peut contenir du script.
 */

export async function uploadMediaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await getWorkspace();
  const rawAlt = formData.get('altText');
  const result = await storeMediaFile(
    context,
    formData.get('file'),
    typeof rawAlt === 'string' ? rawAlt : '',
  );
  if (!result.ok) return { status: 'error', message: result.message };

  revalidatePath('/app/media');
  return { status: 'success', message: 'Fichier ajouté.' };
}

const describeSchema = z.object({
  mediaId: uuidSchema,
  altText: optionalText(200),
  caption: optionalText(300),
});

export async function describeMediaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db } = await getWorkspace();

  if (!workspace.capabilities.includes('media.manage')) {
    return { status: 'error', message: 'Votre rôle ne permet pas de modifier ces fichiers.' };
  }

  const parsed = describeSchema.safeParse({
    mediaId: formData.get('mediaId'),
    altText: formData.get('altText') ?? undefined,
    caption: formData.get('caption') ?? undefined,
  });

  if (!parsed.success) return { status: 'error', message: 'Cette modification est impossible.' };

  const { error } = await db
    .from('media')
    .update({
      alt_text: parsed.data.altText ?? null,
      caption: parsed.data.caption ?? null,
    })
    .eq('id', parsed.data.mediaId)
    .eq('organization_id', workspace.organization.id);

  if (error) return { status: 'error', message: 'La modification n’a pas pu être enregistrée.' };

  revalidatePath('/app/media');
  return { status: 'success', message: 'Description enregistrée.' };
}

function mediaIdFrom(formData: FormData): string | null {
  const mediaId = formData.get('mediaId');
  return typeof mediaId === 'string' && uuidSchema.safeParse(mediaId).success ? mediaId : null;
}

/**
 * « Supprimer » place le fichier dans la corbeille. Il reste en ligne tant
 * qu une page publiee l utilise, et se restaure d un clic.
 */
export async function deleteMediaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db, userId } = await getWorkspace();

  if (!workspace.capabilities.includes('media.manage')) {
    return { status: 'error', message: 'Votre rôle ne permet pas de supprimer ces fichiers.' };
  }

  const mediaId = mediaIdFrom(formData);
  if (!mediaId) return { status: 'error', message: 'Ce fichier est introuvable.' };

  const { data, error } = await db
    .from('media')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', mediaId)
    .eq('organization_id', workspace.organization.id)
    .is('deleted_at', null)
    .select('id');

  if (error || !data || data.length === 0) {
    return { status: 'error', message: 'Ce fichier n’a pas pu être déplacé dans la corbeille.' };
  }

  revalidatePath('/app/media');
  return {
    status: 'success',
    message: 'Fichier placé dans la corbeille. Vous pouvez le restaurer à tout moment.',
  };
}

export async function restoreMediaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db } = await getWorkspace();
  if (!workspace.capabilities.includes('media.manage')) {
    return { status: 'error', message: 'Votre rôle ne permet pas de modifier ces fichiers.' };
  }
  const mediaId = mediaIdFrom(formData);
  if (!mediaId) return { status: 'error', message: 'Ce fichier est introuvable.' };

  const { error } = await db
    .from('media')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', mediaId)
    .eq('organization_id', workspace.organization.id);
  if (error) return { status: 'error', message: 'Ce fichier n’a pas pu être restauré.' };

  revalidatePath('/app/media');
  return { status: 'success', message: 'Fichier restauré.' };
}

/**
 * Suppression DEFINITIVE — uniquement depuis la corbeille, et reservee aux
 * personnes qui peuvent publier. Le fichier disparait aussi du stockage.
 */
export async function purgeMediaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db, accessToken } = await getWorkspace();

  if (
    !workspace.capabilities.includes('media.manage') ||
    !workspace.capabilities.includes('content.publish')
  ) {
    return {
      status: 'error',
      message: 'La suppression définitive est réservée aux personnes qui peuvent publier.',
    };
  }

  const mediaId = mediaIdFrom(formData);
  if (!mediaId) return { status: 'error', message: 'Ce fichier est introuvable.' };

  const media = unwrapMaybe<{ id: string; storage_bucket: string; storage_path: string }>(
    (await db
      .from('media')
      .select('id, storage_bucket, storage_path')
      .eq('id', mediaId)
      .eq('organization_id', workspace.organization.id)
      .not('deleted_at', 'is', null)
      .maybeSingle()) as never,
  );

  if (!media) {
    return {
      status: 'error',
      message: 'Seul un fichier déjà dans la corbeille peut être supprimé définitivement.',
    };
  }

  const { error } = await db
    .from('media')
    .delete()
    .eq('id', media.id)
    .eq('organization_id', workspace.organization.id);

  if (error) {
    return {
      status: 'error',
      message:
        'Ce fichier n’a pas pu être supprimé. Il est peut-être encore utilisé comme logo ou image de partage.',
    };
  }

  await createUserClient(accessToken)
    .storage.from(media.storage_bucket)
    .remove([media.storage_path]);

  revalidatePath('/app/media');
  return { status: 'success', message: 'Fichier supprimé définitivement.' };
}
