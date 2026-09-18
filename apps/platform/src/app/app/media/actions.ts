'use server';

import { revalidatePath } from 'next/cache';
import { createUserClient, featureAccess, loadFeatureSnapshot, unwrapMaybe } from '@stax/database';
import { safeFileName, tenantStoragePath } from '@stax/security';
import { optionalText, uuidSchema } from '@stax/validation';
import { z } from 'zod';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace } from '~/lib/workspace';

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

const MAX_BYTES = 12 * 1024 * 1024;

const ACCEPTED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'video/mp4',
  'video/webm',
]);

export async function uploadMediaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db, accessToken, userId } = await getWorkspace();

  if (!workspace.capabilities.includes('media.manage')) {
    return {
      status: 'error',
      message: 'Votre rôle ne permet pas d’ajouter des fichiers.',
    };
  }

  const guard = await guardAction({ limit: 'mediaUpload', userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'Choisissez un fichier à envoyer.' };
  }

  if (file.size > MAX_BYTES) {
    return {
      status: 'error',
      message:
        'Ce fichier dépasse 12 Mo. Une photo de site web n’a pas besoin d’être aussi lourde : réduisez-la avant de l’envoyer.',
    };
  }

  if (!ACCEPTED.has(file.type)) {
    return {
      status: 'error',
      message:
        'Ce type de fichier n’est pas accepté. Formats possibles : JPEG, PNG, WebP, AVIF, GIF, SVG, PDF, MP4 et WebM.',
    };
  }

  const rawAlt = formData.get('altText');
  const altText = typeof rawAlt === 'string' ? rawAlt.trim().slice(0, 200) : '';

  const access = featureAccess(await loadFeatureSnapshot(db, workspace.organization.id));
  const quotaMb = access.limit('max_media_mb');
  if (quotaMb !== null) {
    const usedMb = access.usage('max_media_mb');
    if (usedMb >= quotaMb) {
      return {
        status: 'error',
        message: `Votre offre inclut ${quotaMb} Mo de fichiers. Supprimez des fichiers inutilisés ou changez d’offre.`,
      };
    }
  }

  // Le chemin est construit ici : organisation, site, horodatage, nom nettoye.
  // Rien de ce qui vient du navigateur n'y entre sans passer par safeFileName.
  const storagePath = tenantStoragePath(
    workspace.organization.id,
    workspace.currentSite?.id ?? null,
    safeFileName(file.name),
  );

  const storage = createUserClient(accessToken).storage.from('site-media');

  const { error: uploadError } = await storage.upload(storagePath, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });

  if (uploadError) {
    console.error('[stax:media] envoi refuse', uploadError.message);
    return {
      status: 'error',
      message: 'L’envoi a échoué. Réessayez, et contactez-nous si le problème persiste.',
    };
  }

  const { error } = await db.from('media').insert({
    organization_id: workspace.organization.id,
    site_id: workspace.currentSite?.id ?? null,
    storage_bucket: 'site-media',
    storage_path: storagePath,
    file_name: safeFileName(file.name),
    mime_type: file.type,
    size_bytes: file.size,
    alt_text: altText === '' ? null : altText,
    uploaded_by: userId,
    is_public: true,
  });

  if (error) {
    // La ligne n'a pas pu etre ecrite : on retire le fichier pour ne pas
    // laisser d'orphelin qui consommerait du quota sans jamais etre visible.
    await storage.remove([storagePath]);
    return { status: 'error', message: 'Ce fichier n’a pas pu être enregistré.' };
  }

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

export async function deleteMediaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db, accessToken } = await getWorkspace();

  if (!workspace.capabilities.includes('media.manage')) {
    return { status: 'error', message: 'Votre rôle ne permet pas de supprimer ces fichiers.' };
  }

  const mediaId = formData.get('mediaId');
  if (typeof mediaId !== 'string' || !uuidSchema.safeParse(mediaId).success) {
    return { status: 'error', message: 'Ce fichier est introuvable.' };
  }

  const media = unwrapMaybe<{ id: string; storage_bucket: string; storage_path: string }>(
    (await db
      .from('media')
      .select('id, storage_bucket, storage_path')
      .eq('id', mediaId)
      .eq('organization_id', workspace.organization.id)
      .maybeSingle()) as never,
  );

  if (!media) return { status: 'error', message: 'Ce fichier est introuvable.' };

  const { error } = await db
    .from('media')
    .delete()
    .eq('id', media.id)
    .eq('organization_id', workspace.organization.id);

  if (error) {
    return {
      status: 'error',
      message:
        'Ce fichier n’a pas pu être supprimé. Il est peut-être encore utilisé sur une de vos pages.',
    };
  }

  // La ligne est partie : on nettoie le stockage. Si cet appel echoue, un
  // fichier orphelin subsiste — genant, mais sans consequence pour le client,
  // alors que l'inverse afficherait une image cassee sur son site.
  await createUserClient(accessToken)
    .storage.from(media.storage_bucket)
    .remove([media.storage_path]);

  revalidatePath('/app/media');
  return { status: 'success', message: 'Fichier supprimé.' };
}
