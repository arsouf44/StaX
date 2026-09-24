'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, unwrapMaybe } from '@stax/database';
import { uuidSchema } from '@stax/validation';
import { storeMediaFile } from '~/lib/media-store';
import { requireSession } from '~/lib/session';
import { getWorkspace } from '~/lib/workspace';

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

/* -------------------------------------------------------------------------- */
/*  Validation demandee par l'equipe                                           */
/* -------------------------------------------------------------------------- */

const reviewSchema = z
  .object({
    projectId: uuidSchema,
    approved: z.boolean(),
    message: z.string().trim().max(5000).optional(),
  })
  .strict();

const REVIEW_ERRORS: Record<string, string> = {
  not_awaiting_review: 'Aucune validation n’est attendue pour le moment.',
  message_required: 'Décrivez les corrections souhaitées.',
};

/** « Je valide » / « Je demande des corrections » : enregistre par la base. */
export async function respondToReviewAction(
  payload: unknown,
): Promise<{ status: 'error' | 'success'; message: string }> {
  const parsed = reviewSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Réponse illisible.' };
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);
  const { data, error } = await db.rpc('respond_to_project_review', {
    p_project: parsed.data.projectId,
    p_approved: parsed.data.approved,
    p_message: parsed.data.message ?? null,
  });
  if (error) {
    return {
      status: 'error',
      message:
        error.code === '42501'
          ? 'Votre rôle ne permet pas de valider ce projet.'
          : 'Votre réponse n’a pas pu être enregistrée.',
    };
  }
  const result = (data ?? {}) as { ok?: boolean; code?: string };
  if (!result.ok) {
    return { status: 'error', message: REVIEW_ERRORS[result.code ?? ''] ?? 'Réponse refusée.' };
  }
  revalidatePath('/app/projet');
  revalidatePath('/app');
  return {
    status: 'success',
    message: parsed.data.approved
      ? 'Merci ! Votre validation est enregistrée : nous passons à l’étape suivante.'
      : 'Vos corrections sont transmises à l’équipe.',
  };
}

/* -------------------------------------------------------------------------- */
/*  Fichiers envoyes pour le projet (logo, photos, textes)                     */
/* -------------------------------------------------------------------------- */

const FILE_KINDS = ['logo', 'photo', 'document', 'menu', 'brochure'] as const;

export async function uploadProjectFileAction(
  formData: FormData,
): Promise<{ status: 'error' | 'success'; message: string }> {
  const projectId = formData.get('projectId');
  const kind = formData.get('kind');
  if (typeof projectId !== 'string' || !uuidSchema.safeParse(projectId).success) {
    return { status: 'error', message: 'Projet inconnu.' };
  }
  const fileKind = FILE_KINDS.includes(kind as (typeof FILE_KINDS)[number])
    ? (kind as (typeof FILE_KINDS)[number])
    : 'document';

  const context = await getWorkspace();
  const project = unwrapMaybe<{ id: string; organization_id: string }>(
    (await context.db
      .from('projects')
      .select('id, organization_id')
      .eq('id', projectId)
      .eq('organization_id', context.workspace.organization.id)
      .maybeSingle()) as never,
  );
  if (!project) return { status: 'error', message: 'Ce projet est introuvable.' };

  // Meme chemin que la mediatheque : type verifie, chemin construit cote
  // serveur, quota de l'offre applique. Les photos envoyees seront ensuite
  // disponibles dans l'editeur, apres la livraison.
  const stored = await storeMediaFile(context, formData.get('file'), '');
  if (!stored.ok) return { status: 'error', message: stored.message };

  const media = unwrapMaybe<{ storage_path: string; mime_type: string; size_bytes: number }>(
    (await context.db
      .from('media')
      .select('storage_path, mime_type, size_bytes')
      .eq('id', stored.media.id)
      .maybeSingle()) as never,
  );
  if (!media) return { status: 'error', message: 'Le fichier n’a pas pu être enregistré.' };

  const { error } = await context.db.from('project_files').insert({
    project_id: project.id,
    organization_id: project.organization_id,
    media_id: stored.media.id,
    storage_bucket: 'site-media',
    storage_path: media.storage_path,
    file_name: stored.media.fileName,
    mime_type: media.mime_type,
    size_bytes: media.size_bytes,
    kind: fileKind,
    direction: 'inbound',
    uploaded_by: context.userId,
  });
  if (error) return { status: 'error', message: 'Le fichier n’a pas pu être joint au projet.' };
  revalidatePath('/app/projet');
  return { status: 'success', message: 'Fichier transmis à l’équipe StaX.' };
}
