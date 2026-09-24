import 'server-only';
import { unwrapList, unwrapMaybe, type Db } from '@stax/database';
import type { HostingTarget, RepositoryRef } from '@stax/infrastructure';
import {
  mediaFileName,
  parseManifest,
  type MediaDescriptor,
  type SiteManifest,
} from '@stax/site-contract';

/**
 * Lecture des enregistrements d'un site developpe independamment : son
 * depot, son projet Cloudflare, son contrat d'edition actif, ses medias.
 *
 * Aucune de ces lignes ne contient de secret : identifiants GitHub et
 * Cloudflare non sensibles seulement. Les jetons vivent dans les variables
 * d'environnement du serveur.
 */

export interface RepositoryRow {
  id: string;
  site_id: string;
  organization_id: string;
  installation_id: number;
  repository_id: number;
  owner_login: string;
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  production_branch: string;
  preview_branch: string;
  manifest_path: string;
  delivery_commit_sha: string | null;
  head_commit_sha: string | null;
  head_committed_at: string | null;
  last_stax_commit_sha: string | null;
  sync_status: string;
  status: string;
  last_error: string | null;
  last_synced_at: string | null;
  connected_at: string;
}

export const REPOSITORY_COLUMNS =
  'id, site_id, organization_id, installation_id, repository_id, owner_login, name, full_name, ' +
  'html_url, default_branch, production_branch, preview_branch, manifest_path, delivery_commit_sha, ' +
  'head_commit_sha, head_committed_at, last_stax_commit_sha, sync_status, status, last_error, ' +
  'last_synced_at, connected_at';

export interface HostingRow {
  id: string;
  site_id: string;
  organization_id: string;
  provider: 'cloudflare_pages' | 'cloudflare_workers';
  account_id: string;
  project_name: string;
  project_id: string | null;
  production_branch: string;
  production_url: string;
  workers_trigger_id: string | null;
  status: string;
  last_error: string | null;
  last_synced_at: string | null;
  connected_at: string;
}

export const HOSTING_COLUMNS =
  'id, site_id, organization_id, provider, account_id, project_name, project_id, production_branch, ' +
  'production_url, workers_trigger_id, status, last_error, last_synced_at, connected_at';

export interface ManifestRow {
  id: string;
  site_id: string;
  commit_sha: string;
  path: string;
  contract_version: number;
  manifest: unknown;
  manifest_hash: string;
  status: 'valid' | 'invalid';
  errors: Array<{ path: string; message: string }>;
  warnings: Array<{ path: string; message: string }>;
  summary: Record<string, unknown>;
  is_active: boolean;
  imported_at: string;
}

export const MANIFEST_COLUMNS =
  'id, site_id, commit_sha, path, contract_version, manifest, manifest_hash, status, errors, ' +
  'warnings, summary, is_active, imported_at';

export function toRepositoryRef(row: RepositoryRow): RepositoryRef {
  return {
    installationId: Number(row.installation_id),
    repositoryId: Number(row.repository_id),
    fullName: row.full_name,
  };
}

export function toHostingTarget(row: HostingRow): HostingTarget {
  return {
    provider: row.provider,
    accountId: row.account_id,
    projectName: row.project_name,
    projectId: row.project_id,
    productionBranch: row.production_branch,
    productionUrl: row.production_url,
    workersTriggerId: row.workers_trigger_id,
  };
}

export async function loadRepository(db: Db, siteId: string): Promise<RepositoryRow | null> {
  return unwrapMaybe<RepositoryRow>(
    (await db
      .from('site_repositories')
      .select(REPOSITORY_COLUMNS)
      .eq('site_id', siteId)
      .neq('status', 'disconnected')
      .maybeSingle()) as never,
  );
}

export async function loadHosting(db: Db, siteId: string): Promise<HostingRow | null> {
  return unwrapMaybe<HostingRow>(
    (await db
      .from('site_hosting')
      .select(HOSTING_COLUMNS)
      .eq('site_id', siteId)
      .neq('status', 'disconnected')
      .maybeSingle()) as never,
  );
}

export async function loadActiveManifest(
  db: Db,
  siteId: string,
): Promise<{ row: ManifestRow; manifest: SiteManifest } | null> {
  const row = unwrapMaybe<ManifestRow>(
    (await db
      .from('site_manifests')
      .select(MANIFEST_COLUMNS)
      .eq('site_id', siteId)
      .eq('is_active', true)
      .maybeSingle()) as never,
  );
  if (!row) return null;
  const parsed = parseManifest(row.manifest);
  return parsed.ok ? { row, manifest: parsed.manifest } : null;
}

export async function loadManifestById(
  db: Db,
  manifestId: string,
): Promise<{ row: ManifestRow; manifest: SiteManifest } | null> {
  const row = unwrapMaybe<ManifestRow>(
    (await db
      .from('site_manifests')
      .select(MANIFEST_COLUMNS)
      .eq('id', manifestId)
      .maybeSingle()) as never,
  );
  if (!row) return null;
  const parsed = parseManifest(row.manifest);
  return parsed.ok ? { row, manifest: parsed.manifest } : null;
}

/* -------------------------------------------------------------------------- */
/*  Medias de la mediatheque utilises par un contenu                           */
/* -------------------------------------------------------------------------- */

export interface MediaFileRow {
  id: string;
  organization_id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

/** Taille maximale d'un fichier depose dans un depot par StaX. */
export const MAX_REPOSITORY_MEDIA_BYTES = 20 * 1024 * 1024;

export async function loadMediaFiles(
  db: Db,
  organizationId: string,
  ids: readonly string[],
): Promise<{
  descriptors: Map<string, MediaDescriptor>;
  rows: Map<string, MediaFileRow>;
  missing: string[];
}> {
  const descriptors = new Map<string, MediaDescriptor>();
  const rows = new Map<string, MediaFileRow>();
  if (ids.length === 0) return { descriptors, rows, missing: [] };
  const found = unwrapList<MediaFileRow>(
    (await db
      .from('media')
      .select(
        'id, organization_id, storage_bucket, storage_path, mime_type, size_bytes, width, height',
      )
      // Jamais le media d'une autre organisation, meme si son identifiant a
      // ete glisse dans un contenu.
      .eq('organization_id', organizationId)
      .in('id', [...ids])) as never,
  );
  for (const row of found) {
    const fileName = mediaFileName(row.id, row.mime_type);
    if (!fileName || row.size_bytes > MAX_REPOSITORY_MEDIA_BYTES) continue;
    rows.set(row.id.toLowerCase(), row);
    descriptors.set(row.id.toLowerCase(), {
      id: row.id.toLowerCase(),
      fileName,
      width: row.width,
      height: row.height,
    });
  }
  return { descriptors, rows, missing: ids.filter((id) => !descriptors.has(id.toLowerCase())) };
}

export async function downloadMedia(db: Db, row: MediaFileRow): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(row.storage_bucket).download(row.storage_path);
  if (error || !data) {
    throw new Error(`Photo ${row.id} illisible dans la médiathèque.`);
  }
  return new Uint8Array(await data.arrayBuffer());
}
