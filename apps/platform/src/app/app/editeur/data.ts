import 'server-only';
import { getModule, resolveBusiness } from '@stax/business';
import { mediaPublicUrl, unwrapList, type Db } from '@stax/database';
import {
  BLOCK_DEFINITIONS,
  availableBlocks,
  createStarterBlock,
  editorFieldsFor,
  getBlockDefinition,
  type EditorField,
} from '@stax/site-engine';
import type {
  AuthorKind,
  BlockMeta,
  EditorBlock,
  EditorStatus,
  HistoryEntry,
  MediaItem,
  TrashedBlock,
} from './types';

/**
 * Lectures de l editeur.
 *
 * Toutes passent par le client portant le jeton de la personne : la RLS
 * decide de ce qu elle voit. Un identifiant de page ou de site etranger ne
 * renvoie rien.
 */

/** Champs presentes dans l onglet « Apparence » plutot que « Contenu ». */
const STYLE_FIELD_NAMES = new Set([
  'layout',
  'mediaPosition',
  'columns',
  'aspectRatio',
  'grayscale',
]);

/** Section alimentee par une donnee metier : la page ou la modifier. */
const DATA_LINKS: Record<string, { label: string; href: string }> = {
  menu: { label: 'Modifier la carte', href: '/app/carte' },
  'menu-preview': { label: 'Modifier la carte', href: '/app/carte' },
  services: { label: 'Modifier les prestations', href: '/app/prestations' },
  team: { label: 'Modifier l’équipe', href: '/app/equipe' },
  'opening-hours': { label: 'Modifier les horaires', href: '/app/horaires' },
  products: { label: 'Modifier les produits', href: '/app/produits' },
  booking: { label: 'Gérer les réservations', href: '/app/reservations' },
  properties: { label: 'Modifier les biens', href: '/app/biens' },
  rooms: { label: 'Modifier les chambres', href: '/app/chambres' },
  portfolio: { label: 'Modifier les réalisations', href: '/app/realisations' },
  'service-area': { label: 'Modifier les zones', href: '/app/zones' },
  events: { label: 'Modifier les événements', href: '/app/evenements' },
  articles: { label: 'Modifier les actualités', href: '/app/actualites' },
  contact: { label: 'Régler le formulaire', href: '/app/forms' },
  'quote-form': { label: 'Régler le formulaire', href: '/app/forms' },
  newsletter: { label: 'Régler le formulaire', href: '/app/forms' },
  map: { label: 'Modifier l’adresse', href: '/app/entreprise' },
};

export function blockMetas(
  enabledModules: readonly string[],
  businessTypeSlug: string | null,
): Record<string, BlockMeta> {
  const available = new Set(availableBlocks(enabledModules).map((definition) => definition.type));
  const business = businessTypeSlug ? resolveBusiness(businessTypeSlug) : null;
  const recommended = new Set(
    (business?.recommendedPages ?? []).flatMap((page) => [...page.blocks]),
  );
  for (const moduleId of business?.modules ?? []) {
    for (const type of getModule(moduleId)?.blockTypes ?? []) recommended.add(type);
  }

  const metas: Record<string, BlockMeta> = {};
  for (const definition of BLOCK_DEFINITIONS) {
    const fields = editorFieldsFor(definition.type);
    const styleFields: EditorField[] = [];
    const contentFields: EditorField[] = [];
    for (const field of fields) {
      if (STYLE_FIELD_NAMES.has(field.name) && field.kind !== 'list') styleFields.push(field);
      else contentFields.push(field);
    }
    metas[definition.type] = {
      type: definition.type,
      label: definition.label,
      description: definition.description,
      icon: definition.icon,
      category: definition.category,
      singleton: Boolean(definition.singleton),
      fields: contentFields,
      styleFields,
      dataLink: DATA_LINKS[definition.type] ?? null,
      available: available.has(definition.type),
      recommended: recommended.has(definition.type),
      defaults: (() => {
        const block = createStarterBlock(definition.type);
        return {
          version: block?.version ?? 1,
          props: block?.props ?? {},
          settings: (block?.settings ?? {}) as Record<string, unknown>,
        };
      })(),
    };
  }
  return metas;
}

export async function loadPageBlocks(db: Db, pageId: string): Promise<EditorBlock[]> {
  const rows = unwrapList<{
    id: string;
    type: string;
    version: number;
    props: Record<string, unknown> | null;
    settings: Record<string, unknown> | null;
    is_visible: boolean;
  }>(
    (await db
      .from('page_blocks')
      .select('id, type, version, props, settings, is_visible')
      .eq('page_id', pageId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })) as never,
  );
  return rows
    .filter((row) => getBlockDefinition(row.type) !== undefined)
    .map((row) => ({
      id: row.id,
      type: row.type,
      version: row.version,
      props: row.props ?? {},
      settings: row.settings ?? {},
      visible: row.is_visible,
    }));
}

const SHORT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

export async function loadPageTrash(db: Db, pageId: string): Promise<TrashedBlock[]> {
  const rows = unwrapList<{
    id: string;
    type: string;
    version: number;
    props: Record<string, unknown> | null;
    settings: Record<string, unknown> | null;
    sort_order: number;
    deleted_at: string;
  }>(
    (await db
      .from('page_blocks')
      .select('id, type, version, props, settings, sort_order, deleted_at')
      .eq('page_id', pageId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(30)) as never,
  );
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    label: getBlockDefinition(row.type)?.label ?? 'Section',
    deletedAtLabel: SHORT.format(new Date(row.deleted_at)),
    sortOrder: row.sort_order,
    version: row.version,
    props: row.props ?? {},
    settings: row.settings ?? {},
  }));
}

export async function loadEditorStatus(db: Db, pageId: string): Promise<EditorStatus> {
  const { data } = await db.rpc('editor_status', { p_page: pageId });
  return normalizeStatus(data);
}

export function normalizeStatus(raw: unknown): EditorStatus {
  const value = (raw ?? {}) as Partial<EditorStatus>;
  return {
    seq: typeof value.seq === 'number' ? value.seq : 0,
    canUndo: value.canUndo === true,
    undoLabel: typeof value.undoLabel === 'string' ? value.undoLabel : null,
    canRedo: value.canRedo === true,
    redoLabel: typeof value.redoLabel === 'string' ? value.redoLabel : null,
  };
}

export async function loadMediaLibrary(db: Db, organizationId: string): Promise<MediaItem[]> {
  const rows = unwrapList<{
    id: string;
    storage_bucket: string;
    storage_path: string;
    alt_text: string | null;
    file_name: string;
    mime_type: string;
  }>(
    (await db
      .from('media')
      .select('id, storage_bucket, storage_path, alt_text, file_name, mime_type')
      .eq('organization_id', organizationId)
      .eq('is_public', true)
      .is('deleted_at', null)
      .like('mime_type', 'image/%')
      .order('created_at', { ascending: false })
      .limit(200)) as never,
  );
  return rows.map((row) => ({
    id: row.id,
    url: mediaPublicUrl(row.storage_bucket, row.storage_path),
    alt: row.alt_text ?? '',
    fileName: row.file_name,
  }));
}

const HISTORY_DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/** « Aujourd’hui 18:42 », « Hier 21:15 », sinon la date complete. */
export function historyDateLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const day = (value: Date) =>
    new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeZone: 'Europe/Paris' }).format(
      value,
    );
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(date);
  if (day(date) === day(now)) return `Aujourd’hui ${time}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (day(date) === day(yesterday)) return `Hier ${time}`;
  return HISTORY_DATE.format(date);
}

function authorOf(
  actorId: string | null,
  actorKind: string,
  viewerId: string,
  names: Map<string, string>,
): { author: string; authorKind: AuthorKind } {
  if (actorId && actorId === viewerId) return { author: 'Vous', authorKind: 'you' };
  const name = actorId ? (names.get(actorId) ?? null) : null;
  if (actorKind === 'stax') {
    return { author: name ? `Équipe StaX (${name})` : 'Équipe StaX', authorKind: 'stax' };
  }
  if (actorKind === 'system' || !actorId) return { author: 'StaX', authorKind: 'system' };
  return { author: name ?? 'Un membre de votre équipe', authorKind: 'member' };
}

const VERSION_TITLES: Record<string, string> = {
  initial: 'Première mise en ligne',
  publish: 'Publication',
  rollback: 'Retour à une version précédente',
};

const CHECKPOINT_TITLES: Record<string, string> = {
  autosave: 'Enregistrement automatique',
  before_restore: 'Sauvegarde avant restauration',
  before_publish: 'Sauvegarde avant publication',
  manual: 'Sauvegarde',
};

export async function loadHistory(
  db: Db,
  siteId: string,
  viewerId: string,
  liveVersionId: string | null,
): Promise<HistoryEntry[]> {
  const [versions, checkpoints] = await Promise.all([
    unwrapList<{
      id: string;
      version_number: number;
      label: string | null;
      source: string;
      published_at: string | null;
      published_by: string | null;
      actor_kind: string;
    }>(
      (await db
        .from('site_versions')
        .select('id, version_number, label, source, published_at, published_by, actor_kind')
        .eq('site_id', siteId)
        .not('published_at', 'is', null)
        .order('version_number', { ascending: false })
        .limit(40)) as never,
    ),
    unwrapList<{
      id: string;
      source: string;
      label: string;
      actor_id: string | null;
      actor_kind: string;
      created_at: string;
      updated_at: string;
    }>(
      (await db
        .from('draft_checkpoints')
        .select('id, source, label, actor_id, actor_kind, created_at, updated_at')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(40)) as never,
    ),
  ]);

  const actorIds = [
    ...new Set(
      [...versions.map((v) => v.published_by), ...checkpoints.map((c) => c.actor_id)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const profiles = unwrapList<{ id: string; full_name: string | null; email: string }>(
      (await db.from('profiles').select('id, full_name, email').in('id', actorIds)) as never,
    );
    for (const profile of profiles) {
      names.set(profile.id, profile.full_name?.split(' ')[0] || profile.email.split('@')[0] || '');
    }
  }

  const entries: HistoryEntry[] = [
    ...versions.map((version) => ({
      kind: 'version' as const,
      id: version.id,
      number: version.version_number,
      title:
        version.source === 'rollback' && version.label
          ? version.label
          : `${VERSION_TITLES[version.source] ?? 'Publication'} — version ${version.version_number}`,
      atIso: version.published_at ?? '',
      atLabel: historyDateLabel(version.published_at ?? new Date().toISOString()),
      ...authorOf(version.published_by, version.actor_kind, viewerId, names),
      isLive: version.id === liveVersionId,
    })),
    ...checkpoints.map((checkpoint) => ({
      kind: 'checkpoint' as const,
      id: checkpoint.id,
      number: null,
      title:
        checkpoint.source === 'before_restore'
          ? checkpoint.label
          : (CHECKPOINT_TITLES[checkpoint.source] ?? checkpoint.label),
      atIso: checkpoint.updated_at,
      atLabel: historyDateLabel(checkpoint.updated_at),
      ...authorOf(checkpoint.actor_id, checkpoint.actor_kind, viewerId, names),
      isLive: false,
    })),
  ];

  return entries.sort((a, b) => (a.atIso < b.atIso ? 1 : -1));
}
