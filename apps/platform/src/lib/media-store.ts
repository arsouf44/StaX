import 'server-only';
import {
  createUserClient,
  featureAccess,
  loadFeatureSnapshot,
  mediaPublicUrl,
  unwrapMaybe,
} from '@stax/database';
import { safeFileName, tenantStoragePath } from '@stax/security';
import { guardAction } from '~/lib/action-guard';
import type { WorkspaceContext } from '~/lib/workspace';

/**
 * Envoi d un fichier dans la bibliotheque d une organisation.
 *
 * Utilise par « Photos & fichiers » ET par l editeur (« Changer la photo ») :
 * une seule implementation, donc les memes protections partout.
 *
 *  1. le TYPE est verifie contre une liste blanche — la base porte la meme
 *     contrainte ;
 *  2. le CHEMIN est construit ici, a partir de l organisation et du site lus
 *     en session : un nom de fichier envoye par le navigateur ne peut ni
 *     remonter l arborescence ni ecrire chez un autre client ;
 *  3. le QUOTA de l offre est verifie avant l ecriture.
 */

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export const ACCEPTED_MEDIA = new Set([
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

export type StoreResult =
  | { ok: true; media: { id: string; url: string; alt: string; fileName: string } }
  | { ok: false; message: string };

export async function storeMediaFile(
  context: WorkspaceContext,
  file: unknown,
  altText: string,
  options: { imagesOnly?: boolean } = {},
): Promise<StoreResult> {
  const { workspace, db, accessToken, userId } = context;

  if (!workspace.capabilities.includes('media.manage')) {
    return { ok: false, message: 'Votre rôle ne permet pas d’ajouter des fichiers.' };
  }

  const guard = await guardAction({ limit: 'mediaUpload', userId });
  if (!guard.ok) return { ok: false, message: guard.message };

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Choisissez un fichier à envoyer.' };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message:
        'Ce fichier dépasse 12 Mo. Une photo de site web n’a pas besoin d’être aussi lourde : réduisez-la avant de l’envoyer.',
    };
  }

  if (!ACCEPTED_MEDIA.has(file.type) || (options.imagesOnly && !file.type.startsWith('image/'))) {
    return {
      ok: false,
      message: options.imagesOnly
        ? 'Choisissez une image (JPEG, PNG, WebP, AVIF, GIF ou SVG).'
        : 'Ce type de fichier n’est pas accepté. Formats possibles : JPEG, PNG, WebP, AVIF, GIF, SVG, PDF, MP4 et WebM.',
    };
  }

  const access = featureAccess(await loadFeatureSnapshot(db, workspace.organization.id));
  const quotaMb = access.limit('max_media_mb');
  if (quotaMb !== null && access.usage('max_media_mb') >= quotaMb) {
    return {
      ok: false,
      message: `Votre offre inclut ${quotaMb} Mo de fichiers. Videz la corbeille de vos photos ou changez d’offre.`,
    };
  }

  const fileName = safeFileName(file.name);
  const storagePath = tenantStoragePath(
    workspace.organization.id,
    workspace.currentSite?.id ?? null,
    fileName,
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
      ok: false,
      message: 'L’envoi a échoué. Réessayez, et contactez-nous si le problème persiste.',
    };
  }

  const alt = altText.trim().slice(0, 200);
  const row = unwrapMaybe<{ id: string }>(
    (await db
      .from('media')
      .insert({
        organization_id: workspace.organization.id,
        site_id: workspace.currentSite?.id ?? null,
        storage_bucket: 'site-media',
        storage_path: storagePath,
        file_name: fileName,
        mime_type: file.type,
        size_bytes: file.size,
        alt_text: alt === '' ? null : alt,
        uploaded_by: userId,
        is_public: true,
      })
      .select('id')
      .single()) as never,
  );

  if (!row) {
    // La ligne n'a pas pu etre ecrite : pas d'orphelin qui consommerait du quota.
    await storage.remove([storagePath]);
    return { ok: false, message: 'Ce fichier n’a pas pu être enregistré.' };
  }

  return {
    ok: true,
    media: { id: row.id, url: mediaPublicUrl('site-media', storagePath), alt, fileName },
  };
}
