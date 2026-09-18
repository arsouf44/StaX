'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, unwrapMaybe } from '@stax/database';
import { parseBlock } from '@stax/site-engine';
import { uuidSchema } from '@stax/validation';
import { requireSession } from '~/lib/session';
import type { ActionState } from '~/lib/form-state';

/**
 * Edition du contenu.
 *
 * Quatre garanties, toutes appliquees cote serveur :
 *
 *  1. Chaque ecriture passe par le jeton de la personne. La RLS verifie
 *     l appartenance du bloc a son organisation ET la capacite `content.edit`
 *     de son role. Un identifiant de bloc appartenant a quelqu un d autre ne
 *     designe rien.
 *
 *  2. Les proprietes sont REVALIDEES par le schema du bloc avant ecriture.
 *     L editeur ne peut pas enregistrer ce que le schema refuserait, et une
 *     requete forgee non plus.
 *
 *  3. Le contenu n est jamais stocke en HTML. Un bloc est une structure
 *     validee : une injection ne peut pas survivre au cycle de vie du contenu.
 *
 *  4. La publication est une fonction SQL atomique qui fige un instantane.
 *     Le brouillon peut ensuite evoluer sans toucher a ce qui est en ligne.
 */

const updateSchema = z
  .object({
    blockId: uuidSchema,
    // Forme libre : c est le schema du bloc qui tranche, juste apres.
    props: z.record(z.string().max(80), z.unknown()),
  })
  .strict();

export async function updateBlockAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = formData.get('payload');
  if (typeof raw !== 'string') {
    return { status: 'error', message: 'Modification illisible.' };
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(raw);
  } catch {
    return { status: 'error', message: 'Modification illisible.' };
  }

  const parsed = updateSchema.safeParse(parsedPayload);
  if (!parsed.success) {
    return { status: 'error', message: 'Modification refusée.' };
  }

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  // On relit le type depuis la BASE : le navigateur ne choisit pas contre quel
  // schema sa modification sera validee.
  const block = unwrapMaybe<{ id: string; type: string; site_id: string; settings: unknown }>(
    (await db
      .from('page_blocks')
      .select('id, type, site_id, settings')
      .eq('id', parsed.data.blockId)
      .maybeSingle()) as never,
  );

  if (!block) {
    return { status: 'error', message: 'Ce bloc est introuvable.' };
  }

  const validated = parseBlock({
    id: block.id,
    type: block.type,
    props: parsed.data.props,
    settings: block.settings,
  });

  if (!validated.block) {
    return {
      status: 'error',
      message: 'Certaines valeurs ne sont pas acceptées.',
      errors: { _form: validated.errors.slice(0, 5) },
    };
  }

  const { error } = await db
    .from('page_blocks')
    .update({ props: validated.block.props })
    .eq('id', block.id);

  if (error) {
    return {
      status: 'error',
      message: 'Votre modification n’a pas pu être enregistrée. Vérifiez vos droits.',
    };
  }

  revalidatePath('/app/editeur');
  return { status: 'success', message: 'Modification enregistrée.' };
}

const reorderSchema = z.object({ pageId: uuidSchema, order: z.array(uuidSchema).max(80) }).strict();

export async function reorderBlocksAction(payload: unknown): Promise<ActionState> {
  const parsed = reorderSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Réordonnancement refusé.' };

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  // Chaque mise a jour est filtree par `page_id` : un identifiant de bloc
  // appartenant a une autre page — donc potentiellement a un autre client —
  // ne correspond a aucune ligne.
  for (const [index, blockId] of parsed.data.order.entries()) {
    const { error } = await db
      .from('page_blocks')
      .update({ sort_order: index * 10 })
      .eq('id', blockId)
      .eq('page_id', parsed.data.pageId);
    if (error) {
      return { status: 'error', message: 'L’ordre n’a pas pu être enregistré.' };
    }
  }

  revalidatePath('/app/editeur');
  return { status: 'success', message: 'Ordre enregistré.' };
}

const visibilitySchema = z.object({ blockId: uuidSchema, visible: z.boolean() }).strict();

export async function toggleBlockVisibilityAction(payload: unknown): Promise<ActionState> {
  const parsed = visibilitySchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Action refusée.' };

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const { error } = await db
    .from('page_blocks')
    .update({ is_visible: parsed.data.visible })
    .eq('id', parsed.data.blockId);

  if (error) return { status: 'error', message: 'Modification refusée.' };

  revalidatePath('/app/editeur');
  return {
    status: 'success',
    message: parsed.data.visible ? 'Section affichée.' : 'Section masquée.',
  };
}

const publishSchema = z.object({ siteId: uuidSchema, label: z.string().max(120).optional() });

export async function publishSiteAction(payload: unknown): Promise<ActionState> {
  const parsed = publishSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Publication refusée.' };

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  // `publish_site` verifie la capacite `content.publish` et fige un instantane
  // dans la meme transaction. Rien ne peut etre publie a moitie.
  const { error } = await db.rpc('publish_site', {
    p_site: parsed.data.siteId,
    p_label: parsed.data.label ?? null,
  });

  if (error) {
    return {
      status: 'error',
      message:
        'La publication a échoué. Votre rôle permet-il de publier ? Si oui, réessayez dans ' +
        'quelques instants — rien n’a été modifié en ligne.',
    };
  }

  revalidatePath('/app/editeur');
  revalidatePath('/app');
  return {
    status: 'success',
    message: 'Votre site est publié. Les visiteurs voient la nouvelle version.',
  };
}
