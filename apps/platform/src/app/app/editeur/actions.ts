'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, unwrapList, unwrapMaybe } from '@stax/database';
import { createBlock, getBlockDefinition, parseBlock } from '@stax/site-engine';
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

/* -------------------------------------------------------------------------- */
/*  Composition de la page : ajouter, dupliquer, supprimer, restaurer          */
/* -------------------------------------------------------------------------- */

/**
 * Verifie qu une page appartient bien a une organisation de la personne.
 *
 * La RLS refuserait de toute facon l ecriture, mais lire la page d abord
 * permet de repondre « introuvable » plutot que de laisser passer une
 * insertion qui echouerait ensuite sans explication.
 */
async function ownedPage(db: ReturnType<typeof createUserClient>, pageId: string) {
  return unwrapMaybe<{ id: string; site_id: string }>(
    (await db.from('site_pages').select('id, site_id').eq('id', pageId).maybeSingle()) as never,
  );
}

const addSchema = z.object({ pageId: uuidSchema, type: z.string().max(40) }).strict();

/** Nombre maximum de sections par page. Au-dela, plus personne ne s y retrouve. */
const MAX_BLOCKS_PER_PAGE = 60;

export async function addBlockAction(payload: unknown): Promise<ActionState> {
  const parsed = addSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Ajout refusé.' };

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const page = await ownedPage(db, parsed.data.pageId);
  if (!page) return { status: 'error', message: 'Cette page est introuvable.' };

  // Le contenu initial vient du REGISTRE, pas du navigateur : une section
  // nouvellement ajoutee est donc toujours valide vis-a-vis de son schema.
  const block = createBlock(parsed.data.type);
  if (!block) return { status: 'error', message: 'Ce type de section n’existe pas.' };

  const definition = getBlockDefinition(parsed.data.type);

  const existing = unwrapList<{ id: string; type: string; sort_order: number }>(
    (await db
      .from('page_blocks')
      .select('id, type, sort_order')
      .eq('page_id', page.id)
      .order('sort_order', { ascending: true })) as never,
  );

  if (existing.length >= MAX_BLOCKS_PER_PAGE) {
    return {
      status: 'error',
      message: `Cette page a atteint ${MAX_BLOCKS_PER_PAGE} sections. Créez-en une nouvelle plutôt que de tout empiler.`,
    };
  }

  // Un bloc marque « unique » ne peut pas etre ajoute deux fois : deux bannieres
  // principales sur une meme page n ont pas de sens.
  if (definition?.singleton && existing.some((row) => row.type === parsed.data.type)) {
    return {
      status: 'error',
      message: `Votre page a déjà une section « ${definition.label} ». Modifiez celle qui existe.`,
    };
  }

  const { error } = await db.from('page_blocks').insert({
    page_id: page.id,
    site_id: page.site_id,
    type: block.type,
    version: block.version,
    props: block.props,
    settings: block.settings,
    sort_order: (existing.at(-1)?.sort_order ?? 0) + 10,
    is_visible: true,
  });

  if (error) {
    return {
      status: 'error',
      message: 'Cette section n’a pas pu être ajoutée. Vérifiez vos droits.',
    };
  }

  revalidatePath('/app/editeur');
  return {
    status: 'success',
    message: `Section « ${definition?.label ?? block.type} » ajoutée en bas de page.`,
  };
}

const blockSchema = z.object({ blockId: uuidSchema }).strict();

export async function duplicateBlockAction(payload: unknown): Promise<ActionState> {
  const parsed = blockSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Duplication refusée.' };

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const source = unwrapMaybe<{
    page_id: string;
    site_id: string;
    type: string;
    version: number;
    props: Record<string, unknown>;
    settings: Record<string, unknown>;
    sort_order: number;
  }>(
    (await db
      .from('page_blocks')
      .select('page_id, site_id, type, version, props, settings, sort_order')
      .eq('id', parsed.data.blockId)
      .maybeSingle()) as never,
  );

  if (!source) return { status: 'error', message: 'Cette section est introuvable.' };

  const definition = getBlockDefinition(source.type);
  if (definition?.singleton) {
    return {
      status: 'error',
      message: `Une page ne peut avoir qu’une seule section « ${definition.label} ».`,
    };
  }

  const count = unwrapList<{ id: string }>(
    (await db.from('page_blocks').select('id').eq('page_id', source.page_id)) as never,
  ).length;

  if (count >= MAX_BLOCKS_PER_PAGE) {
    return { status: 'error', message: `Cette page a atteint ${MAX_BLOCKS_PER_PAGE} sections.` };
  }

  // La copie se place JUSTE APRES l original : c est ce qu on attend d une
  // duplication, et cela evite d aller la rechercher en bas de page.
  const { error } = await db.from('page_blocks').insert({
    page_id: source.page_id,
    site_id: source.site_id,
    type: source.type,
    version: source.version,
    props: source.props,
    settings: source.settings,
    sort_order: source.sort_order + 5,
    is_visible: true,
  });

  if (error) return { status: 'error', message: 'Cette section n’a pas pu être dupliquée.' };

  revalidatePath('/app/editeur');
  return { status: 'success', message: 'Section dupliquée, juste en dessous.' };
}

export async function deleteBlockAction(payload: unknown): Promise<ActionState> {
  const parsed = blockSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Suppression refusée.' };

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const { error } = await db.from('page_blocks').delete().eq('id', parsed.data.blockId);

  if (error) return { status: 'error', message: 'Cette section n’a pas pu être supprimée.' };

  revalidatePath('/app/editeur');
  return {
    status: 'success',
    message:
      'Section supprimée de votre brouillon. Votre site en ligne n’a pas changé : ' +
      'republiez pour appliquer, ou restaurez une version précédente.',
  };
}

const rollbackSchema = z.object({ siteId: uuidSchema, versionId: uuidSchema }).strict();

/**
 * Retour a une version publiee.
 *
 * `rollback_site` republie l instantane choisi sous un NOUVEAU numero de
 * version, dans une seule transaction : le site en ligne change
 * immediatement. Le brouillon n est pas touche — les modifications en cours
 * restent dans l editeur.
 *
 * Le retour en arriere etant lui-meme une publication, il est annulable comme
 * n importe quelle autre : l historique ne perd jamais d etat.
 */
export async function rollbackSiteAction(payload: unknown): Promise<ActionState> {
  const parsed = rollbackSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Restauration refusée.' };

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const { error } = await db.rpc('rollback_site', {
    p_site: parsed.data.siteId,
    p_version_id: parsed.data.versionId,
  });

  if (error) {
    return {
      status: 'error',
      message:
        'Le retour à cette version a échoué. Votre rôle permet-il de publier ? ' +
        'Rien n’a été modifié, ni en ligne ni dans votre brouillon.',
    };
  }

  revalidatePath('/app/editeur');
  revalidatePath('/app');
  return {
    status: 'success',
    message: 'Cette version est de nouveau en ligne. Votre brouillon n’a pas changé.',
  };
}
