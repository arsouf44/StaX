'use server';

import { revalidatePath } from 'next/cache';
import { hasFeature, unwrapList, unwrapMaybe } from '@stax/database';
import { fieldErrors, uuidSchema } from '@stax/validation';
import { z } from 'zod';
import { guardAction } from '~/lib/action-guard';
import { buildSlug, parseCollectionForm, toDatabaseRow } from '~/lib/collection-io';
import { getCollection, isCollectionId, type CollectionDescriptor } from '~/lib/collections';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace, type WorkspaceContext } from '~/lib/workspace';

/**
 * Ecritures des collections metier.
 *
 * Une seule implementation sert les dix-sept collections. Elle impose, dans cet
 * ordre, ce qui ne doit jamais dependre de l'interface :
 *
 *  1. la collection demandee existe (sinon la requete n'a pas de sens) ;
 *  2. le role porte la capacite d'ecriture ;
 *  3. le module est actif sur le site et l'offre inclut la fonctionnalite ;
 *  4. la limitation de debit accepte la requete ;
 *  5. le schema Zod valide une liste blanche de champs ;
 *  6. `site_id` et `organization_id` viennent de la SESSION, jamais du
 *     formulaire ;
 *  7. l'ecriture passe par le JWT de la personne, donc par la RLS.
 *
 * Les points 2 et 3 sont du confort : meme contournes, la RLS refuserait la
 * ligne. Ils existent pour rendre un message clair plutot qu'une erreur brute.
 */

interface ResolvedCollection {
  descriptor: CollectionDescriptor;
  context: WorkspaceContext;
  siteId: string;
  organizationId: string;
}

type Resolution = { ok: true; value: ResolvedCollection } | { ok: false; state: ActionState };

const REFUSED: ActionState = {
  status: 'error',
  message: 'Cette action n’est pas disponible pour votre site.',
};

async function resolveCollection(raw: FormDataEntryValue | null): Promise<Resolution> {
  if (!isCollectionId(raw)) return { ok: false, state: REFUSED };

  const descriptor = getCollection(raw);
  const context = await getWorkspace();
  const { workspace, db } = context;

  if (!workspace.capabilities.includes(descriptor.writeCapability)) {
    return {
      ok: false,
      state: {
        status: 'error',
        message:
          'Votre rôle ne permet pas de modifier cette rubrique. Demandez à un propriétaire de votre organisation de vous l’ouvrir.',
      },
    };
  }

  const site = workspace.currentSite;
  if (!site) {
    return {
      ok: false,
      state: { status: 'error', message: 'Aucun site n’est encore rattaché à votre compte.' },
    };
  }

  if (descriptor.module && !site.enabledModules.includes(descriptor.module)) {
    return { ok: false, state: REFUSED };
  }

  if (descriptor.feature) {
    const included = await hasFeature(db, workspace.organization.id, descriptor.feature);
    if (!included) {
      return {
        ok: false,
        state: {
          status: 'error',
          message: 'Cette fonctionnalité n’est pas incluse dans votre offre actuelle.',
        },
      };
    }
  }

  return {
    ok: true,
    value: {
      descriptor,
      context,
      siteId: site.id,
      organizationId: workspace.organization.id,
    },
  };
}

/** Filtre de portee applique a toute lecture ou ecriture de la collection. */
function scopeFilter(resolved: ResolvedCollection): Record<string, string> {
  const { descriptor } = resolved;
  const filter: Record<string, string> = {};

  if (descriptor.scope === 'org') {
    filter.organization_id = resolved.organizationId;
  } else {
    filter.site_id = resolved.siteId;
    if (descriptor.scope === 'site+org') filter.organization_id = resolved.organizationId;
  }

  return { ...filter, ...(descriptor.fixed ?? {}) };
}

interface DatabaseError {
  code?: string;
  message?: string;
}

/**
 * Vue structurelle minimale d'une requete PostgREST.
 *
 * Les types generes par Supabase sont parametres par nom de table. Une fonction
 * qui accepte DIX-SEPT tables differentes ne peut pas les porter sans faire
 * exploser l'inference. On ne conserve donc que les operations reellement
 * utilisees. La securite ne repose de toute facon pas sur ce typage : elle
 * repose sur la RLS, qui s'applique quelle que soit la forme de la requete.
 */
type ScopedQuery = PromiseLike<{ data: unknown; error: DatabaseError | null }> & {
  eq(column: string, value: string | number): ScopedQuery;
  order(column: string, options: { ascending: boolean }): ScopedQuery;
  limit(count: number): ScopedQuery;
  maybeSingle(): ScopedQuery;
};

/** Applique la portee du tenant a une requete, sans exception possible. */
function scoped(query: unknown, resolved: ResolvedCollection): ScopedQuery {
  let current = query as ScopedQuery;
  for (const [column, value] of Object.entries(scopeFilter(resolved))) {
    current = current.eq(column, value);
  }
  return current;
}

/** Rang de creation : toujours apres les elements existants. */
async function nextSortOrder(resolved: ResolvedCollection): Promise<number> {
  const { descriptor, context } = resolved;
  if (!descriptor.sortColumn) return 100;

  const result = await scoped(
    context.db.from(descriptor.table).select(descriptor.sortColumn),
    resolved,
  )
    .order(descriptor.sortColumn, { ascending: false })
    .limit(1);

  const rows = unwrapList<Record<string, number>>(result as never);
  const highest = rows[0]?.[descriptor.sortColumn];
  return typeof highest === 'number' ? highest + 10 : 100;
}

async function takenSlugs(resolved: ResolvedCollection): Promise<Set<string>> {
  const result = await scoped(
    resolved.context.db.from(resolved.descriptor.table).select('slug'),
    resolved,
  ).limit(2000);

  return new Set(unwrapList<{ slug: string }>(result as never).map((row) => row.slug));
}

export async function saveCollectionItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const resolution = await resolveCollection(formData.get('collection'));
  if (!resolution.ok) return resolution.state;

  const resolved = resolution.value;
  const { descriptor, context } = resolved;

  const guard = await guardAction({ limit: 'apiWrite', userId: context.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const rawId = formData.get('itemId');
  const itemId = typeof rawId === 'string' && rawId.length > 0 ? rawId : null;
  if (itemId !== null && !uuidSchema.safeParse(itemId).success) return REFUSED;

  const parsed = parseCollectionForm(descriptor, formData);
  if (Object.keys(parsed.errors).length > 0) {
    return {
      status: 'error',
      message: 'Certaines informations doivent être corrigées.',
      errors: parsed.errors,
    };
  }

  const validated = descriptor.schema.safeParse(parsed.values);
  if (!validated.success) {
    return {
      status: 'error',
      message: 'Certaines informations doivent être corrigées.',
      errors: fieldErrors(validated.error),
    };
  }

  const row = toDatabaseRow(descriptor, validated.data as Record<string, unknown>);

  if (itemId) {
    // Le slug n'est PAS recalcule : une adresse publique deja partagee,
    // indexee ou imprimee doit continuer de repondre.
    const { error } = await scoped(context.db.from(descriptor.table).update(row), resolved).eq(
      'id',
      itemId,
    );

    if (error) return { status: 'error', message: databaseMessage(error) };

    revalidatePath(descriptor.route);
    return { status: 'success', message: 'Modifications enregistrées.' };
  }

  const insert: Record<string, unknown> = {
    ...row,
    ...scopeFilter(resolved),
  };

  // Une collection d'organisation garde quand meme la trace du site d'origine,
  // sans que cette colonne ne filtre jamais les lectures.
  if (descriptor.attachSiteOnCreate) insert.site_id = resolved.siteId;

  if (descriptor.sortColumn) insert[descriptor.sortColumn] = await nextSortOrder(resolved);

  if (descriptor.slugFrom) {
    const source = (validated.data as Record<string, unknown>)[descriptor.slugFrom];
    insert.slug = buildSlug(typeof source === 'string' ? source : '', await takenSlugs(resolved));
  }

  const { error } = await context.db.from(descriptor.table).insert(insert);
  if (error) return { status: 'error', message: databaseMessage(error) };

  revalidatePath(descriptor.route);
  return { status: 'success', message: `${descriptor.singular} ajouté${feminine(descriptor)}.` };
}

const deleteSchema = z.object({ itemId: uuidSchema });

export async function deleteCollectionItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const resolution = await resolveCollection(formData.get('collection'));
  if (!resolution.ok) return resolution.state;

  const resolved = resolution.value;
  const parsed = deleteSchema.safeParse({ itemId: formData.get('itemId') });
  if (!parsed.success) return REFUSED;

  const guard = await guardAction({ limit: 'apiWrite', userId: resolved.context.userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const { error } = await scoped(
    resolved.context.db.from(resolved.descriptor.table).delete(),
    resolved,
  ).eq('id', parsed.data.itemId);

  if (error) return { status: 'error', message: databaseMessage(error) };

  revalidatePath(resolved.descriptor.route);
  return { status: 'success', message: 'Élément supprimé.' };
}

const moveSchema = z.object({
  itemId: uuidSchema,
  direction: z.enum(['up', 'down']),
});

/**
 * Deplacement d'un element dans la liste.
 *
 * Les deux rangs sont echanges, ce qui evite de reecrire toute la collection a
 * chaque clic et garde un ordre stable meme si deux personnes reordonnent en
 * meme temps.
 */
export async function moveCollectionItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const resolution = await resolveCollection(formData.get('collection'));
  if (!resolution.ok) return resolution.state;

  const resolved = resolution.value;
  const { descriptor, context } = resolved;
  if (!descriptor.sortColumn) return REFUSED;

  const parsed = moveSchema.safeParse({
    itemId: formData.get('itemId'),
    direction: formData.get('direction'),
  });
  if (!parsed.success) return REFUSED;

  const ordered = await scoped(
    context.db.from(descriptor.table).select(`id, ${descriptor.sortColumn}`),
    resolved,
  ).order(descriptor.sortColumn, { ascending: true });

  const rows = unwrapList<Record<string, string | number>>(ordered as never);

  const index = rows.findIndex((row) => row.id === parsed.data.itemId);
  const target = parsed.data.direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= rows.length) return { status: 'idle' };

  const current = rows[index];
  const neighbour = rows[target];
  if (!current || !neighbour) return { status: 'idle' };

  const currentRank = Number(current[descriptor.sortColumn] ?? 0);
  const neighbourRank = Number(neighbour[descriptor.sortColumn] ?? 0);

  // Deux rangs identiques ne s'echangent pas : on force un ecart.
  const [nextCurrent, nextNeighbour] =
    currentRank === neighbourRank
      ? parsed.data.direction === 'up'
        ? [currentRank - 1, neighbourRank]
        : [currentRank + 1, neighbourRank]
      : [neighbourRank, currentRank];

  await Promise.all([
    scoped(
      context.db.from(descriptor.table).update({ [descriptor.sortColumn]: nextCurrent }),
      resolved,
    ).eq('id', String(current.id)),
    scoped(
      context.db.from(descriptor.table).update({ [descriptor.sortColumn]: nextNeighbour }),
      resolved,
    ).eq('id', String(neighbour.id)),
  ]);

  revalidatePath(descriptor.route);
  return { status: 'success', message: 'Ordre mis à jour.' };
}

/** Bascule de visibilite publique, sans ouvrir le formulaire complet. */
export async function toggleCollectionVisibilityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const resolution = await resolveCollection(formData.get('collection'));
  if (!resolution.ok) return resolution.state;

  const resolved = resolution.value;
  const { descriptor, context } = resolved;
  const column = descriptor.visibilityColumn;
  if (!column) return REFUSED;

  const parsed = deleteSchema.safeParse({ itemId: formData.get('itemId') });
  if (!parsed.success) return REFUSED;

  const existing = await scoped(context.db.from(descriptor.table).select(column), resolved)
    .eq('id', parsed.data.itemId)
    .maybeSingle();

  const row = unwrapMaybe<Record<string, boolean>>(existing as never);
  if (!row) return REFUSED;

  const next = row[column] !== true;

  const { error } = await scoped(
    context.db.from(descriptor.table).update({ [column]: next }),
    resolved,
  ).eq('id', parsed.data.itemId);

  if (error) return { status: 'error', message: databaseMessage(error) };

  revalidatePath(descriptor.route);
  return {
    status: 'success',
    message: next ? 'Élément affiché sur votre site.' : 'Élément masqué de votre site.',
  };
}

/**
 * Message d'erreur lisible.
 *
 * Le detail PostgreSQL n'est jamais renvoye au navigateur : il decrirait la
 * structure de la base. On traduit les cas que la personne peut corriger, et
 * on reste generique pour le reste.
 */
function databaseMessage(error: DatabaseError): string {
  if (error.code === '23505') {
    return 'Un élément portant ce nom existe déjà.';
  }
  if (error.code === '23514') {
    return 'Une des valeurs saisies n’est pas acceptée. Vérifiez les prix, les dates et les durées.';
  }
  if (error.code === '42501' || error.code === 'PGRST301') {
    return 'Vous n’avez pas les droits nécessaires pour cette modification.';
  }
  console.error('[stax:collections] ecriture refusee', error.code, error.message);
  return 'L’enregistrement a échoué. Réessayez dans un instant.';
}

/** Accord du participe dans le message de confirmation. */
function feminine(descriptor: CollectionDescriptor): string {
  return FEMININE_SINGULARS.has(descriptor.id) ? 'e' : '';
}

const FEMININE_SINGULARS = new Set<string>([
  'menu-categories',
  'product-categories',
  'service-areas',
  'opening-hours',
  'closures',
  'availability',
  'rooms',
  'portfolio',
  'booking-services',
]);
