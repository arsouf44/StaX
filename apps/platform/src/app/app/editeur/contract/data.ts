import 'server-only';
import { mediaPublicUrl, unwrapList, unwrapMaybe, type Db } from '@stax/database';
import {
  collectMediaIds,
  parseManifest,
  stableStringify,
  validateContent,
} from '@stax/site-contract';
import type { WorkspaceSite } from '@stax/database';
import type { ContractEditorData, PreviewView, ReleaseState, ReleaseView } from './types';

/**
 * Chargement de l'editeur d'un site independant, avec le JETON de la
 * personne : la RLS ne laisse lire que le contrat, le brouillon et les
 * versions de SON site.
 */

interface ReleaseRow {
  id: string;
  version_number: number;
  kind: ReleaseView['kind'];
  status: ReleaseState;
  created_at: string;
  published_at: string | null;
  scheduled_for: string | null;
  note: string | null;
  commit_sha: string | null;
  commit_url: string | null;
  error_message: string | null;
  created_by: string | null;
  actor_kind: string;
  source_release_id: string | null;
  deployment_id: string | null;
  content: unknown;
}

export const RELEASE_COLUMNS =
  'id, version_number, kind, status, created_at, published_at, scheduled_for, note, commit_sha, ' +
  'commit_url, error_message, created_by, actor_kind, source_release_id, deployment_id';

export async function loadReleaseViews(db: Db, siteId: string, limit = 30): Promise<ReleaseView[]> {
  const rows = unwrapList<Omit<ReleaseRow, 'content'>>(
    (await db
      .from('site_releases')
      .select(RELEASE_COLUMNS)
      .eq('site_id', siteId)
      .order('version_number', { ascending: false })
      .limit(limit)) as never,
  );
  const deploymentIds = rows
    .map((row) => row.deployment_id)
    .filter((id): id is string => Boolean(id));
  const authorIds = [
    ...new Set(rows.map((row) => row.created_by).filter((id): id is string => Boolean(id))),
  ];
  const [deployments, authors] = await Promise.all([
    deploymentIds.length
      ? unwrapList<{ id: string; status: string; url: string | null }>(
          (await db
            .from('site_deployments')
            .select('id, status, url')
            .in('id', deploymentIds)) as never,
        )
      : Promise.resolve([]),
    authorIds.length
      ? unwrapList<{
          id: string;
          first_name: string | null;
          last_name: string | null;
          full_name: string | null;
        }>(
          (await db
            .from('profiles')
            .select('id, first_name, last_name, full_name')
            .in('id', authorIds)) as never,
        )
      : Promise.resolve([]),
  ]);
  const versionById = new Map(rows.map((row) => [row.id, row.version_number]));
  return rows.map((row) => {
    const deployment = deployments.find((entry) => entry.id === row.deployment_id);
    const author = authors.find((entry) => entry.id === row.created_by);
    const authorName =
      row.actor_kind === 'stax'
        ? 'L’équipe StaX'
        : author
          ? author.first_name?.trim() || author.full_name?.trim() || null
          : null;
    return {
      id: row.id,
      version: row.version_number,
      kind: row.kind,
      status: row.status,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      scheduledFor: row.scheduled_for,
      author: authorName,
      note: row.note,
      commit: row.commit_sha,
      commitUrl: row.commit_url,
      deploymentStatus: deployment?.status ?? null,
      deploymentUrl: deployment?.url ?? null,
      error: row.error_message,
      sourceVersion: row.source_release_id
        ? (versionById.get(row.source_release_id) ?? null)
        : null,
    };
  });
}

export async function loadContractEditor(
  db: Db,
  site: WorkspaceSite,
  capabilities: readonly string[],
  hasScheduling: boolean,
): Promise<ContractEditorData | { problem: 'no_manifest' | 'not_initialized' }> {
  const [manifestRow, draft, releases, preview, overview] = await Promise.all([
    unwrapMaybe<{ manifest: unknown }>(
      (await db
        .from('site_manifests')
        .select('manifest')
        .eq('site_id', site.id)
        .eq('is_active', true)
        .maybeSingle()) as never,
    ),
    unwrapMaybe<{
      content: unknown;
      revision: number;
      updated_at: string;
      updated_by_kind: string;
    }>(
      (await db
        .from('site_content_drafts')
        .select('content, revision, updated_at, updated_by_kind')
        .eq('site_id', site.id)
        .maybeSingle()) as never,
    ),
    loadReleaseViews(db, site.id, 12),
    unwrapMaybe<{
      id: string;
      status: string;
      url: string | null;
      draft_revision: number | null;
      error_message: string | null;
      created_at: string;
    }>(
      (await db
        .from('site_deployments')
        .select('id, status, url, draft_revision, error_message, created_at')
        .eq('site_id', site.id)
        .eq('trigger', 'stax_preview')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()) as never,
    ),
    db.rpc('site_management_overview', { p_site: site.id }),
  ]);

  const parsed = manifestRow ? parseManifest(manifestRow.manifest) : null;
  if (!parsed?.ok) return { problem: 'no_manifest' };
  if (!draft) return { problem: 'not_initialized' };

  const manifest = parsed.manifest;
  const content = validateContent(manifest, draft.content, { mode: 'draft' }).content;

  const mediaIds = collectMediaIds(manifest, content);
  const mediaRows = mediaIds.length
    ? unwrapList<{ id: string; storage_bucket: string; storage_path: string }>(
        (await db
          .from('media')
          .select('id, storage_bucket, storage_path')
          .in('id', mediaIds)) as never,
      )
    : [];
  const mediaUrls = Object.fromEntries(
    mediaRows.map((row) => [
      row.id.toLowerCase(),
      mediaPublicUrl(row.storage_bucket, row.storage_path),
    ]),
  );

  const overviewData = (overview.data ?? {}) as {
    productionUrl?: string | null;
    primaryDomain?: string | null;
  };
  const liveUrl = overviewData.primaryDomain
    ? `https://${overviewData.primaryDomain}/`
    : (overviewData.productionUrl ?? null);

  const production = releases.find((release) => release.status === 'published') ?? null;
  const inFlight =
    releases.find((release) => ['queued', 'committing', 'deploying'].includes(release.status)) ??
    null;
  const scheduled = releases.find((release) => release.status === 'scheduled') ?? null;

  // Le brouillon differe-t-il de la version en ligne ? Comparaison exacte du
  // contenu normalise, pas d'une date.
  let hasUnpublishedChanges = false;
  if (production) {
    const productionRow = unwrapMaybe<{ content: unknown }>(
      (await db
        .from('site_releases')
        .select('content')
        .eq('id', production.id)
        .maybeSingle()) as never,
    );
    const live = validateContent(manifest, productionRow?.content ?? {}, { mode: 'draft' }).content;
    hasUnpublishedChanges = stableStringify(live) !== stableStringify(content);
  }

  const previewView: PreviewView | null = preview
    ? {
        id: preview.id,
        status: preview.status,
        url: preview.url,
        revision: preview.draft_revision,
        error: preview.error_message,
        createdAt: preview.created_at,
      }
    : null;

  return {
    siteId: site.id,
    siteName: site.name,
    manifest,
    content,
    revision: draft.revision,
    draftUpdatedAt: draft.updated_at,
    draftUpdatedBy: draft.updated_by_kind,
    liveUrl,
    preview: previewView,
    production,
    inFlight,
    scheduled,
    mediaUrls,
    canPublish: capabilities.includes('content.publish'),
    canSchedule: hasScheduling && capabilities.includes('content.publish'),
    canManageMedia: capabilities.includes('media.manage'),
    hasUnpublishedChanges,
  };
}
