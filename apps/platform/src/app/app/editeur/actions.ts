'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { publicSiteUrl, readEnv, publicEnv } from '@stax/config';
import {
  createUserClient,
  featureAccess,
  loadFeatureSnapshot,
  mediaPublicUrl,
  unwrapList,
  unwrapMaybe,
  type Db,
} from '@stax/database';
import { purgeSiteCache } from '@stax/infrastructure';
import {
  availableBlocks,
  checkSiteForPublication,
  compareDraftStates,
  getBlockDefinition,
  parseBlock,
  parseDraftState,
  type CollectionKey,
  type PublicationReport,
} from '@stax/site-engine';
import { uuidSchema } from '@stax/validation';
import { requireSession } from '~/lib/session';
import { getWorkspace } from '~/lib/workspace';
import { storeMediaFile } from '~/lib/media-store';
import { provisionExistingSite } from '~/lib/site-provisioning';
import {
  loadEditorStatus,
  loadHistory,
  loadMediaLibrary,
  loadPageBlocks,
  loadPageTrash,
  normalizeStatus,
} from './data';
import type {
  CommitPayload,
  EditorBlock,
  EditorResult,
  EditorStatus,
  HistoryChange,
  HistoryEntry,
  MediaItem,
  PublishOutcome,
  TrashedBlock,
} from './types';

/**
 * Actions de l editeur.
 *
 * Quatre garanties, toutes cote serveur :
 *
 *  1. Chaque ecriture passe par le jeton de la personne, puis par une fonction
 *     SQL qui verifie ses droits sur CE site (ou son role dans l equipe StaX).
 *     Un identifiant de page ou de section etranger ne designe rien.
 *
 *  2. Chaque section est REVALIDEE par son schema avant ecriture, et son type
 *     ne peut ni changer, ni sortir des modules actifs du site.
 *
 *  3. Une image ne pointe jamais vers une adresse fournie par le navigateur :
 *     son URL est reconstruite depuis la bibliotheque de l organisation.
 *
 *  4. Rien n est detruit : supprimer met a la corbeille, chaque modification
 *     s annule, et la publication fige une version immuable.
 */

const blockSchema = z
  .object({
    id: uuidSchema,
    type: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
    version: z.number().int().min(1).max(100),
    props: z.record(z.string().max(80), z.unknown()),
    settings: z.record(z.string().max(80), z.unknown()),
    visible: z.boolean(),
  })
  .strict();

const commitSchema = z
  .object({
    pageId: uuidSchema,
    baseSeq: z.number().int().min(0),
    action: z.enum([
      'block.edit',
      'block.style',
      'block.add',
      'block.duplicate',
      'block.move',
      'block.hide',
      'block.show',
      'block.delete',
      'block.restore',
    ]),
    label: z.string().trim().min(1).max(120),
    blockId: uuidSchema.nullable(),
    blocks: z.array(blockSchema).max(80),
  })
  .strict();

type Failure = { status: 'error'; message: string; conflict?: boolean };

function failure(message: string, conflict = false): Failure {
  return conflict ? { status: 'error', message, conflict } : { status: 'error', message };
}

function databaseFailure(error: { code?: string; message?: string } | null): Failure {
  if (error?.code === '40001' || error?.message?.includes('stax:conflict')) {
    return failure(
      'Cette page vient d’être modifiée ailleurs (par un membre de votre équipe ou par StaX). Nous rechargeons la dernière version : vos modifications précédentes sont conservées.',
      true,
    );
  }
  if (error?.code === 'P0002')
    return failure('Cette page est introuvable ou n’est plus modifiable.');
  if (error?.code === '42501') return failure('Votre rôle ne permet pas cette modification.');
  if (error?.message?.includes('corbeille')) {
    return failure('Cette page est dans la corbeille : restaurez-la avant de la modifier.');
  }
  return failure('La modification n’a pas pu être enregistrée. Réessayez dans un instant.');
}

/* -------------------------------------------------------------------------- */
/*  Images : l URL vient TOUJOURS de la bibliotheque                           */
/* -------------------------------------------------------------------------- */

function storagePublicPrefix(): string {
  const origin = (readEnv('SUPABASE_URL') ?? publicEnv().NEXT_PUBLIC_SUPABASE_URL).replace(
    /\/+$/,
    '',
  );
  return `${origin}/storage/v1/object/public/`;
}

function collectMediaIds(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 5 || !value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) collectMediaIds(entry, into, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['mediaId'] === 'string') into.add(record['mediaId']);
  for (const entry of Object.values(record)) collectMediaIds(entry, into, depth + 1);
}

function rewriteMedia(
  value: unknown,
  urls: ReadonlyMap<string, string>,
  prefix: string,
  depth = 0,
): unknown {
  if (depth > 5 || !value || typeof value !== 'object') return value;
  if (Array.isArray(value))
    return value.map((entry) => rewriteMedia(entry, urls, prefix, depth + 1));
  const record = { ...(value as Record<string, unknown>) };
  if ('mediaId' in record) {
    const mediaId = typeof record['mediaId'] === 'string' ? record['mediaId'] : null;
    if (mediaId) {
      // Fichier connu de la bibliotheque : URL reconstruite. Inconnu : pas
      // d image, plutot qu une adresse inventee par le navigateur.
      record['url'] = urls.get(mediaId) ?? null;
      if (!urls.has(mediaId)) record['mediaId'] = null;
    } else if (typeof record['url'] === 'string' && !record['url'].startsWith(prefix)) {
      record['url'] = null;
    }
    return record;
  }
  for (const [key, entry] of Object.entries(record)) {
    record[key] = rewriteMedia(entry, urls, prefix, depth + 1);
  }
  return record;
}

async function normalizeMedia(db: Db, blocks: EditorBlock[]): Promise<EditorBlock[]> {
  const ids = new Set<string>();
  for (const block of blocks) collectMediaIds(block.props, ids);
  const urls = new Map<string, string>();
  const validIds = [...ids].filter((id) => uuidSchema.safeParse(id).success);
  if (validIds.length > 0) {
    // RLS : seuls les fichiers de l organisation de la personne remontent.
    const rows = unwrapList<{ id: string; storage_bucket: string; storage_path: string }>(
      (await db
        .from('media')
        .select('id, storage_bucket, storage_path')
        .in('id', validIds)) as never,
    );
    for (const row of rows) urls.set(row.id, mediaPublicUrl(row.storage_bucket, row.storage_path));
  }
  const prefix = storagePublicPrefix();
  return blocks.map((block) => ({
    ...block,
    props: rewriteMedia(block.props, urls, prefix) as Record<string, unknown>,
  }));
}

/* -------------------------------------------------------------------------- */
/*  Modification d une page                                                    */
/* -------------------------------------------------------------------------- */

export async function commitPageAction(
  input: CommitPayload,
): Promise<EditorResult<{ editor: EditorStatus; blocks: EditorBlock[] }>> {
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return failure('Modification illisible. Rechargez la page.');
  const payload = parsed.data;

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const page = unwrapMaybe<{ id: string; site_id: string }>(
    (await db
      .from('site_pages')
      .select('id, site_id')
      .eq('id', payload.pageId)
      .is('deleted_at', null)
      .maybeSingle()) as never,
  );
  if (!page) return failure('Cette page est introuvable.');

  const [settings, existing] = await Promise.all([
    unwrapMaybe<{ enabled_modules: string[] }>(
      (await db
        .from('site_settings')
        .select('enabled_modules')
        .eq('site_id', page.site_id)
        .maybeSingle()) as never,
    ),
    unwrapList<{ id: string; type: string }>(
      (await db.from('page_blocks').select('id, type').eq('page_id', page.id)) as never,
    ),
  ]);

  const existingTypes = new Map(existing.map((row) => [row.id, row.type]));
  const allowed = new Set(
    availableBlocks(settings?.enabled_modules ?? []).map((definition) => definition.type),
  );
  const seenSingletons = new Set<string>();
  const validated: EditorBlock[] = [];

  for (const block of payload.blocks) {
    const definition = getBlockDefinition(block.type);
    if (!definition) return failure('Ce type de section n’existe pas.');

    const previousType = existingTypes.get(block.id);
    if (previousType !== undefined && previousType !== block.type) {
      return failure('Une section ne peut pas changer de nature. Ajoutez-en une nouvelle.');
    }
    if (previousType === undefined && !allowed.has(block.type)) {
      return failure(
        `La section « ${definition.label} » n’est pas disponible pour votre site. Elle dépend d’une fonctionnalité non activée.`,
      );
    }
    if (definition.singleton) {
      if (seenSingletons.has(block.type)) {
        return failure(`Une page ne peut avoir qu’une seule section « ${definition.label} ».`);
      }
      seenSingletons.add(block.type);
    }

    const result = parseBlock({
      id: block.id,
      type: block.type,
      props: block.props,
      settings: block.settings,
    });
    if (!result.block) {
      return failure(
        `La section « ${definition.label} » contient une valeur refusée. Vérifiez les boutons (texte et destination) et les champs obligatoires.`,
      );
    }
    validated.push({
      id: block.id,
      type: block.type,
      version: result.block.version,
      props: result.block.props,
      settings: result.block.settings as Record<string, unknown>,
      visible: block.visible,
    });
  }

  const blocks = await normalizeMedia(db, validated);

  const { data, error } = await db.rpc('editor_commit', {
    p_page: page.id,
    p_blocks: blocks,
    p_action: payload.action,
    p_label: payload.label,
    p_block: payload.blockId,
    p_base_seq: payload.baseSeq,
  });
  if (error) return databaseFailure(error);

  return { status: 'success', editor: normalizeStatus(data), blocks };
}

const pageOnlySchema = z.object({ pageId: uuidSchema }).strict();

async function replay(
  kind: 'editor_undo' | 'editor_redo',
  input: unknown,
): Promise<EditorResult<{ editor: EditorStatus; blocks: EditorBlock[] }>> {
  const parsed = pageOnlySchema.safeParse(input);
  if (!parsed.success) return failure('Action refusée.');

  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const { data, error } = await db.rpc(kind, { p_page: parsed.data.pageId });
  if (error) return databaseFailure(error);

  const status = (data ?? {}) as { undone?: string; redone?: string };
  const blocks = await loadPageBlocks(db, parsed.data.pageId);
  const message = status.undone
    ? `Annulé : ${status.undone}`
    : status.redone
      ? `Rétabli : ${status.redone}`
      : kind === 'editor_undo'
        ? 'Rien à annuler.'
        : 'Rien à rétablir.';

  return { status: 'success', message, editor: normalizeStatus(data), blocks };
}

export async function undoAction(input: { pageId: string }) {
  return replay('editor_undo', input);
}

export async function redoAction(input: { pageId: string }) {
  return replay('editor_redo', input);
}

/** Etat courant d une page : sections, corbeille, annulation. */
export async function reloadPageAction(
  input: unknown,
): Promise<EditorResult<{ blocks: EditorBlock[]; trash: TrashedBlock[]; editor: EditorStatus }>> {
  const parsed = pageOnlySchema.safeParse(input);
  if (!parsed.success) return failure('Page introuvable.');
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);
  const [blocks, trash, editor] = await Promise.all([
    loadPageBlocks(db, parsed.data.pageId),
    loadPageTrash(db, parsed.data.pageId),
    loadEditorStatus(db, parsed.data.pageId),
  ]);
  return { status: 'success', blocks, trash, editor };
}

const purgeSchema = z.object({ kind: z.enum(['block', 'page']), id: uuidSchema }).strict();

/** Suppression definitive, depuis la corbeille uniquement. */
export async function purgeTrashItemAction(input: unknown): Promise<EditorResult> {
  const parsed = purgeSchema.safeParse(input);
  if (!parsed.success) return failure('Action refusée.');
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);
  const { error } = await db.rpc('purge_trash_item', {
    p_kind: parsed.data.kind,
    p_id: parsed.data.id,
  });
  if (error) {
    return failure(
      error.code === 'P0002'
        ? 'La suppression définitive est réservée aux personnes qui peuvent publier.'
        : 'Cet élément n’a pas pu être supprimé définitivement.',
    );
  }
  revalidatePath('/app/editeur');
  return { status: 'success', message: 'Supprimé définitivement.' };
}

/* -------------------------------------------------------------------------- */
/*  Images                                                                     */
/* -------------------------------------------------------------------------- */

export async function listMediaAction(): Promise<EditorResult<{ items: MediaItem[] }>> {
  const { workspace, db } = await getWorkspace();
  return { status: 'success', items: await loadMediaLibrary(db, workspace.organization.id) };
}

export async function uploadImageAction(
  formData: FormData,
): Promise<EditorResult<{ item: MediaItem }>> {
  const context = await getWorkspace();
  const alt = formData.get('alt');
  const result = await storeMediaFile(
    context,
    formData.get('file'),
    typeof alt === 'string' ? alt : '',
    { imagesOnly: true },
  );
  if (!result.ok) return failure(result.message);
  revalidatePath('/app/media');
  return { status: 'success', message: 'Photo ajoutée.', item: result.media };
}

/* -------------------------------------------------------------------------- */
/*  Verification et publication                                                */
/* -------------------------------------------------------------------------- */

const siteSchema = z.object({ siteId: uuidSchema }).strict();

/** Donnee metier a compter pour chaque type de section. */
const COLLECTION_SOURCES: Record<CollectionKey, { table: string; types: string[] }> = {
  menu: { table: 'menu_items', types: ['menu', 'menu-preview'] },
  services: { table: 'services', types: ['services'] },
  team: { table: 'team_members', types: ['team'] },
  openingHours: { table: 'opening_hours', types: ['opening-hours'] },
  products: { table: 'products', types: ['products'] },
  bookingServices: { table: 'booking_services', types: ['booking'] },
  properties: { table: 'properties', types: ['properties'] },
  rooms: { table: 'rooms', types: ['rooms'] },
  serviceAreas: { table: 'service_areas', types: ['service-area'] },
  entries: { table: 'content_entries', types: ['articles', 'events', 'portfolio'] },
};

async function buildReport(
  db: Db,
  siteId: string,
): Promise<{ report: PublicationReport; organizationId: string } | null> {
  const site = unwrapMaybe<{ id: string; organization_id: string }>(
    (await db.from('sites').select('id, organization_id').eq('id', siteId).maybeSingle()) as never,
  );
  if (!site) return null;

  const { data: raw, error } = await db.rpc('history_state', {
    p_site: siteId,
    p_kind: 'draft',
    p_id: siteId,
  });
  if (error) return null;
  const state = parseDraftState(raw);

  const presentTypes = new Set(
    state.pages.flatMap((page) => (page.blocks ?? []).map((block) => block.type)),
  );

  const [forms, media, settings] = await Promise.all([
    unwrapList<{ slug: string; is_active: boolean; notify_emails: string[] | null }>(
      (await db
        .from('forms')
        .select('slug, is_active, notify_emails')
        .eq('site_id', siteId)) as never,
    ),
    unwrapList<{ id: string }>(
      (await db
        .from('media')
        .select('id')
        .eq('organization_id', site.organization_id)
        .is('deleted_at', null)) as never,
    ),
    unwrapMaybe<{ enabled_modules: string[] }>(
      (await db
        .from('site_settings')
        .select('enabled_modules')
        .eq('site_id', siteId)
        .maybeSingle()) as never,
    ),
  ]);

  const collections: Partial<Record<CollectionKey, number>> = {};
  await Promise.all(
    (
      Object.entries(COLLECTION_SOURCES) as Array<
        [CollectionKey, { table: string; types: string[] }]
      >
    )
      .filter(([, source]) => source.types.some((type) => presentTypes.has(type)))
      .map(async ([key, source]) => {
        const { count } = await db
          .from(source.table)
          .select('id', { count: 'exact', head: true })
          .eq('site_id', siteId);
        collections[key] = count ?? 0;
      }),
  );

  const report = checkSiteForPublication(state, {
    forms: forms.map((form) => ({
      slug: form.slug,
      isActive: form.is_active,
      notifyEmails: form.notify_emails ?? [],
    })),
    liveMediaIds: new Set(media.map((row) => row.id)),
    collections,
    enabledModules: new Set(settings?.enabled_modules ?? []),
  });
  return { report, organizationId: site.organization_id };
}

export async function checkPublicationAction(
  input: unknown,
): Promise<EditorResult<{ report: PublicationReport }>> {
  const parsed = siteSchema.safeParse(input);
  if (!parsed.success) return failure('Site introuvable.');
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);
  const built = await buildReport(db, parsed.data.siteId);
  if (!built) return failure('La vérification n’a pas pu être faite. Réessayez dans un instant.');
  return { status: 'success', report: built.report };
}

/** Noms d hote actifs d un site et pages publiees, pour la purge du cache. */
async function liveAddresses(db: Db, siteId: string) {
  const [domains, pages] = await Promise.all([
    unwrapList<{ hostname: string; is_primary: boolean; status: string }>(
      (await db
        .from('site_domains')
        .select('hostname, is_primary, status')
        .eq('site_id', siteId)
        .neq('status', 'detached')) as never,
    ),
    unwrapList<{ path: string }>(
      (await db
        .from('site_pages')
        .select('path')
        .eq('site_id', siteId)
        .eq('is_published', true)
        .is('deleted_at', null)) as never,
    ),
  ]);
  const active = domains.filter((domain) => domain.status === 'active');
  const primary = active.find((domain) => domain.is_primary) ?? active[0] ?? null;
  return {
    hostnames: active.map((domain) => domain.hostname),
    paths: pages.map((page) => page.path),
    liveUrl: primary ? publicSiteUrl(primary.hostname) : null,
  };
}

async function afterPublication(
  db: Db,
  siteId: string,
  organizationId: string | null,
  versionId: string,
): Promise<PublishOutcome> {
  const version = unwrapMaybe<{ version_number: number }>(
    (await db
      .from('site_versions')
      .select('version_number')
      .eq('id', versionId)
      .maybeSingle()) as never,
  );
  const addresses = await liveAddresses(db, siteId);
  const purge = await purgeSiteCache({ hostnames: addresses.hostnames, paths: addresses.paths });

  // Trace sans secret : l equipe StaX sait si le cache a bien ete vide.
  await db.rpc('write_audit', {
    p_action: 'site.cache_purged',
    p_org: organizationId,
    p_site: siteId,
    p_target_type: 'site_version',
    p_target_id: versionId,
    p_metadata: { status: purge.status, urls: purge.urls, message: purge.message },
  });

  revalidatePath('/app/editeur');
  revalidatePath('/app');
  return {
    versionNumber: version?.version_number ?? 0,
    liveUrl: addresses.liveUrl,
    cacheCleared: purge.status !== 'failed',
  };
}

export async function publishAction(
  input: unknown,
): Promise<EditorResult<{ outcome: PublishOutcome }>> {
  const parsed = siteSchema.safeParse(input);
  if (!parsed.success) return failure('Site introuvable.');
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const built = await buildReport(db, parsed.data.siteId);
  if (!built) return failure('La vérification n’a pas pu être faite. Rien n’a été publié.');
  if (!built.report.ok) {
    return {
      status: 'error',
      message: 'Nous avons détecté un problème avant la publication.',
      report: built.report,
    };
  }

  const { data: versionId, error } = await db.rpc('publish_site', {
    p_site: parsed.data.siteId,
    p_label: null,
  });
  if (error || typeof versionId !== 'string') {
    if (error?.message?.includes('stax:no_home')) {
      return failure(
        'Nous avons détecté un problème avant la publication : votre site n’a pas de page d’accueil.',
      );
    }
    return failure(
      error?.code === '42501'
        ? 'Votre rôle permet de modifier le site, pas de le publier. Prévenez un administrateur de votre organisation.'
        : 'La publication a échoué. Rien n’a changé en ligne : réessayez dans un instant.',
    );
  }

  const outcome = await afterPublication(db, parsed.data.siteId, built.organizationId, versionId);
  return {
    status: 'success',
    message: `Votre site est en ligne (version ${outcome.versionNumber}).`,
    outcome,
  };
}

/* -------------------------------------------------------------------------- */
/*  Historique                                                                 */
/* -------------------------------------------------------------------------- */

export async function loadHistoryAction(
  input: unknown,
): Promise<EditorResult<{ entries: HistoryEntry[] }>> {
  const parsed = siteSchema.safeParse(input);
  if (!parsed.success) return failure('Site introuvable.');
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);
  const site = unwrapMaybe<{ published_version_id: string | null }>(
    (await db
      .from('sites')
      .select('published_version_id')
      .eq('id', parsed.data.siteId)
      .maybeSingle()) as never,
  );
  if (!site) return failure('Site introuvable.');
  const entries = await loadHistory(
    db,
    parsed.data.siteId,
    session.user.id,
    site.published_version_id,
  );
  return { status: 'success', entries };
}

const historyItemSchema = z
  .object({ siteId: uuidSchema, kind: z.enum(['version', 'checkpoint']), id: uuidSchema })
  .strict();

export async function compareAction(
  input: unknown,
): Promise<EditorResult<{ changes: HistoryChange[] }>> {
  const parsed = historyItemSchema.safeParse(input);
  if (!parsed.success) return failure('Version introuvable.');
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const [chosen, draft] = await Promise.all([
    db.rpc('history_state', {
      p_site: parsed.data.siteId,
      p_kind: parsed.data.kind,
      p_id: parsed.data.id,
    }),
    db.rpc('history_state', {
      p_site: parsed.data.siteId,
      p_kind: 'draft',
      p_id: parsed.data.siteId,
    }),
  ]);
  if (chosen.error || draft.error) return failure('La comparaison n’a pas pu être faite.');

  const changes = compareDraftStates(parseDraftState(chosen.data), parseDraftState(draft.data));
  return { status: 'success', changes };
}

/** Restaurer DANS LE BROUILLON : le site en ligne ne change pas. */
export async function restoreToDraftAction(input: unknown): Promise<EditorResult> {
  const parsed = historyItemSchema.safeParse(input);
  if (!parsed.success) return failure('Version introuvable.');
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const { error } =
    parsed.data.kind === 'version'
      ? await db.rpc('restore_version_to_draft', {
          p_site: parsed.data.siteId,
          p_version: parsed.data.id,
        })
      : await db.rpc('restore_checkpoint_to_draft', {
          p_site: parsed.data.siteId,
          p_checkpoint: parsed.data.id,
        });

  if (error) return failure('La restauration a échoué. Rien n’a été modifié.');

  revalidatePath('/app/editeur');
  return {
    status: 'success',
    message:
      'Cette version est restaurée dans votre brouillon. Votre site en ligne n’a pas changé : publiez pour l’appliquer. Votre brouillon précédent reste dans l’historique.',
  };
}

const republishSchema = z.object({ siteId: uuidSchema, versionId: uuidSchema }).strict();

/** « Republier cette version » : nouvelle version, identique a l ancienne. */
export async function republishVersionAction(
  input: unknown,
): Promise<EditorResult<{ outcome: PublishOutcome }>> {
  const parsed = republishSchema.safeParse(input);
  if (!parsed.success) return failure('Version introuvable.');
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  const { data: versionId, error } = await db.rpc('rollback_site', {
    p_site: parsed.data.siteId,
    p_version_id: parsed.data.versionId,
  });
  if (error || typeof versionId !== 'string') {
    return failure(
      error?.code === '42501'
        ? 'Votre rôle ne permet pas de publier.'
        : 'La remise en ligne a échoué. Rien n’a changé en ligne.',
    );
  }

  const site = unwrapMaybe<{ organization_id: string }>(
    (await db
      .from('sites')
      .select('organization_id')
      .eq('id', parsed.data.siteId)
      .maybeSingle()) as never,
  );
  const outcome = await afterPublication(
    db,
    parsed.data.siteId,
    site?.organization_id ?? null,
    versionId,
  );
  return {
    status: 'success',
    message: `Cette version est de nouveau en ligne (publiée comme version ${outcome.versionNumber}). Les versions suivantes restent dans l’historique.`,
    outcome,
  };
}

/**
 * Prepare un site encore vide a partir de son metier. Sans effet sur un site
 * qui a deja des pages : la base le verifie elle-meme.
 */
export async function prepareSiteAction(): Promise<EditorResult> {
  const { workspace, db } = await getWorkspace();
  const site = workspace.currentSite;
  if (!site) return failure('Aucun site à préparer.');
  if (!workspace.capabilities.includes('content.edit')) {
    return failure('Votre rôle ne permet pas de modifier ce site.');
  }

  const snapshot = await loadFeatureSnapshot(db, workspace.organization.id);
  const access = featureAccess(snapshot);
  const result = await provisionExistingSite(
    db,
    {
      id: site.id,
      name: site.name,
      businessTypeSlug: site.businessTypeSlug,
      organizationId: workspace.organization.id,
    },
    {
      hasFeature: (feature) => access.has(feature as never),
      details: {
        email: workspace.organization.billing_email,
        phone: workspace.organization.phone,
        city: workspace.organization.city,
      },
    },
  );
  if (!result.ok) return failure('Le site n’a pas pu être préparé. Réessayez dans un instant.');
  revalidatePath('/app', 'layout');
  return { status: 'success', message: 'Votre site est prêt à être personnalisé.' };
}
