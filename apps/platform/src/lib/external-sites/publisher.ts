import 'server-only';
import { unwrapList, unwrapMaybe, type Db } from '@stax/database';
import {
  CloudflareError,
  deploymentLog,
  GitHubError,
  githubAppConfigured,
  cloudflareSitesConfigured,
  listDeployments,
  previewCommitMessage,
  releaseCommitMessage,
  releaseIdFromMessage,
  RepositoryClient,
  type FileToWrite,
  type ProviderDeployment,
} from '@stax/infrastructure';
import {
  buildContentBundle,
  collectMediaIds,
  contentHash,
  mediaRepoPath,
  validateContent,
  type SiteManifest,
} from '@stax/site-contract';
import {
  downloadMedia,
  HOSTING_COLUMNS,
  loadActiveManifest,
  loadManifestById,
  loadMediaFiles,
  REPOSITORY_COLUMNS,
  toHostingTarget,
  toRepositoryRef,
  type HostingRow,
  type RepositoryRow,
} from './records';

/**
 * Publication d'un site developpe independamment.
 *
 *   brouillon valide -> version (queued) -> commit GitHub (committing)
 *   -> deploiement Cloudflare (deploying) -> publie | echec
 *
 * Regles :
 *  - le contenu est revalide ici, sur le document exact qui part dans le
 *    depot, quel que soit le chemin par lequel il a ete ecrit ;
 *  - un commit n'est jamais force : si le developpeur a pousse entre-temps,
 *    la publication se rejoue au-dessus de son travail ;
 *  - une version ne devient « publiee » que sur confirmation de Cloudflare
 *    (`record_site_deployment`), jamais ici ;
 *  - un echec GitHub ou Cloudflare laisse la version precedente en ligne et
 *    le dit clairement au client.
 */

export type StepOutcome =
  | { status: 'committed'; commitSha: string }
  | { status: 'failed'; stage: string; message: string }
  | { status: 'skipped'; reason: string }
  | { status: 'synced'; recorded: number };

interface ReleaseRow {
  id: string;
  site_id: string;
  organization_id: string;
  version_number: number;
  kind: 'import' | 'publish' | 'rollback';
  status: string;
  manifest_id: string;
  content: unknown;
  source_release_id: string | null;
  repository_id: string | null;
  hosting_id: string | null;
  branch: string | null;
  commit_sha: string | null;
  deployment_id: string | null;
  created_by: string | null;
  updated_at: string;
  deploy_started_at: string | null;
}

const RELEASE_COLUMNS =
  'id, site_id, organization_id, version_number, kind, status, manifest_id, content, source_release_id, ' +
  'repository_id, hosting_id, branch, commit_sha, deployment_id, created_by, updated_at, deploy_started_at';

/** Delai au-dela duquel un deploiement jamais confirme est declare en echec. */
export const DEPLOYMENT_TIMEOUT_MINUTES = 45;
export const PREVIEW_TIMEOUT_MINUTES = 30;

async function failRelease(
  db: Db,
  releaseId: string,
  stage: string,
  code: string,
  message: string,
) {
  await db.rpc('fail_site_release', {
    p_release: releaseId,
    p_stage: stage,
    p_code: code,
    p_message: message.slice(0, 500),
  });
  return { status: 'failed' as const, stage, message };
}

function describeIssues(issues: Array<{ path: string; message: string }>): string {
  const listed = issues
    .slice(0, 3)
    .map((issue) => `${issue.message}${issue.path ? ` (${issue.path})` : ''}`)
    .join(' · ');
  return issues.length > 3 ? `${listed} · et ${issues.length - 3} autre(s)` : listed;
}

async function authorName(db: Db, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const profile = unwrapMaybe<{ full_name: string | null }>(
    (await db.from('profiles').select('full_name').eq('id', userId).maybeSingle()) as never,
  );
  return profile?.full_name?.trim() || null;
}

/** Fichiers a ecrire : le bundle de contenu, et les photos absentes du depot. */
async function buildFiles(input: {
  db: Db;
  client: RepositoryClient;
  ref: string;
  manifest: SiteManifest;
  content: ReturnType<typeof validateContent>['content'];
  organizationId: string;
  meta: Parameters<typeof buildContentBundle>[3];
  strictMedia: boolean;
}): Promise<{ files: FileToWrite[]; missing: string[]; hash: string }> {
  const ids = collectMediaIds(input.manifest, input.content);
  const media = await loadMediaFiles(input.db, input.organizationId, ids);
  const built = buildContentBundle(input.manifest, input.content, media.descriptors, input.meta);
  const missing = [...new Set([...media.missing, ...built.missingMedia])];
  if (missing.length > 0 && input.strictMedia) {
    return { files: [], missing, hash: '' };
  }

  const files: FileToWrite[] = [{ path: input.manifest.content.file, content: built.json }];
  const existing = await input.client.listDirectory(input.manifest.content.mediaDir, input.ref);
  let total = 0;
  for (const descriptor of media.descriptors.values()) {
    if (existing.has(descriptor.fileName)) continue;
    const row = media.rows.get(descriptor.id);
    if (!row) continue;
    const bytes = await downloadMedia(input.db, row);
    total += bytes.length;
    if (total > 80 * 1024 * 1024) {
      throw new GitHubError(
        'Trop de photos nouvelles en une seule publication (80 Mo au plus).',
        413,
        'too_large',
      );
    }
    files.push({ path: mediaRepoPath(input.manifest, descriptor.fileName), content: bytes });
  }
  return { files, missing, hash: await contentHash(input.content) };
}

/* -------------------------------------------------------------------------- */
/*  Publication d'une version                                                  */
/* -------------------------------------------------------------------------- */

export async function processRelease(db: Db, releaseId: string): Promise<StepOutcome> {
  let release = unwrapMaybe<ReleaseRow>(
    (await db
      .from('site_releases')
      .select(RELEASE_COLUMNS)
      .eq('id', releaseId)
      .maybeSingle()) as never,
  );
  if (!release) return { status: 'skipped', reason: 'release_not_found' };

  if (release.status === 'deploying') {
    return syncReleaseDeployment(db, release);
  }
  if (release.status === 'queued') {
    const { data } = await db.rpc('claim_site_release', { p_release: release.id });
    if (!(data as { ok?: boolean } | null)?.ok)
      return { status: 'skipped', reason: 'not_claimable' };
    release = { ...release, status: 'committing' };
  }
  if (release.status !== 'committing') return { status: 'skipped', reason: release.status };

  if (!githubAppConfigured()) {
    return failRelease(
      db,
      release.id,
      'configuration',
      'github_not_configured',
      'L’application GitHub de StaX n’est pas configurée : la publication ne peut pas être écrite dans le dépôt du site.',
    );
  }

  const repository = unwrapMaybe<RepositoryRow>(
    (await db
      .from('site_repositories')
      .select(REPOSITORY_COLUMNS)
      .eq('id', release.repository_id ?? '')
      .eq('status', 'connected')
      .maybeSingle()) as never,
  );
  if (!repository) {
    return failRelease(
      db,
      release.id,
      'configuration',
      'repository_missing',
      'Le dépôt GitHub du site n’est plus connecté.',
    );
  }

  const loaded = await loadManifestById(db, release.manifest_id);
  if (!loaded) {
    return failRelease(
      db,
      release.id,
      'validation',
      'manifest_invalid',
      'Le contrat d’édition du site est illisible.',
    );
  }
  const { manifest } = loaded;

  // Restaurer une version : son contenu a deja ete publie, il est seulement
  // remis en conformite avec le contrat actuel. Publier : tout doit etre en regle.
  const validation = validateContent(manifest, release.content, {
    mode: release.kind === 'rollback' ? 'draft' : 'publish',
  });
  if (!validation.ok) {
    return failRelease(
      db,
      release.id,
      'validation',
      'invalid_content',
      `Contenu refusé : ${describeIssues(validation.errors)}.`,
    );
  }

  let client: RepositoryClient;
  try {
    client = await RepositoryClient.open(toRepositoryRef(repository), 'write');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Accès au dépôt refusé.';
    return failRelease(
      db,
      release.id,
      'github',
      error instanceof GitHubError ? error.code : 'github_error',
      message,
    );
  }

  // Reprise : si le commit de cette version existe deja (serveur interrompu
  // juste apres l'ecriture), il est retrouve par son marqueur, pas refait.
  try {
    const recent = await client.recentCommits(repository.production_branch, 30);
    const releaseId = release.id;
    const already = recent.find((commit) => releaseIdFromMessage(commit.message) === releaseId);
    if (already) {
      const { data } = await db.rpc('record_release_commit', {
        p_release: release.id,
        p_base_sha: null,
        p_commit_sha: already.sha,
        p_commit_url: already.htmlUrl,
        p_branch: repository.production_branch,
      });
      if ((data as { ok?: boolean } | null)?.ok)
        return { status: 'committed', commitSha: already.sha };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dépôt illisible.';
    return failRelease(
      db,
      release.id,
      'github',
      error instanceof GitHubError ? error.code : 'github_error',
      message,
    );
  }

  let commit: Awaited<ReturnType<RepositoryClient['commitFiles']>>;
  try {
    const head = await client.branchHead(repository.production_branch);
    if (!head) {
      return failRelease(
        db,
        release.id,
        'github',
        'branch_not_found',
        `La branche de production « ${repository.production_branch} » n’existe plus dans le dépôt.`,
      );
    }
    const sourceVersion = release.source_release_id
      ? (unwrapMaybe<{ version_number: number }>(
          (await db
            .from('site_releases')
            .select('version_number')
            .eq('id', release.source_release_id)
            .maybeSingle()) as never,
        )?.version_number ?? null)
      : null;
    const { files, missing } = await buildFiles({
      db,
      client,
      ref: head,
      manifest,
      content: validation.content,
      organizationId: release.organization_id,
      meta: { siteId: release.site_id, version: release.version_number, releaseId: release.id },
      strictMedia: true,
    });
    if (missing.length > 0) {
      return failRelease(
        db,
        release.id,
        'validation',
        'missing_media',
        `${missing.length} photo(s) utilisée(s) n’existent plus dans votre médiathèque. Remplacez-les, puis publiez à nouveau.`,
      );
    }
    commit = await client.commitFiles({
      branch: repository.production_branch,
      files,
      message: releaseCommitMessage({
        version: release.version_number,
        kind: release.kind,
        releaseId: release.id,
        siteId: release.site_id,
        author: await authorName(db, release.created_by),
        sourceVersion,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Écriture dans le dépôt impossible.';
    return failRelease(
      db,
      release.id,
      'github',
      error instanceof GitHubError ? error.code : 'github_error',
      message,
    );
  }

  // Le commit existe : a partir d'ici, ne JAMAIS declarer d'echec sur une
  // erreur locale. Si l'enregistrement echoue, la reprise retrouvera le commit.
  const { data, error } = await db.rpc('record_release_commit', {
    p_release: release.id,
    p_base_sha: commit.baseSha,
    p_commit_sha: commit.commitSha,
    p_commit_url: commit.commitUrl,
    p_branch: commit.branch,
  });
  if (error || !(data as { ok?: boolean } | null)?.ok) {
    console.error('[stax:publish] commit ecrit mais non enregistre', release.id, error?.message);
    return { status: 'committed', commitSha: commit.commitSha };
  }

  // Premier suivi immediat ; la tache de fond et les notifications Cloudflare
  // prennent le relais.
  if (release.hosting_id) {
    await syncHostingById(db, release.hosting_id).catch(() => undefined);
  }
  return { status: 'committed', commitSha: commit.commitSha };
}

/* -------------------------------------------------------------------------- */
/*  Suivi des deploiements (Cloudflare fait foi)                               */
/* -------------------------------------------------------------------------- */

async function syncHostingById(db: Db, hostingId: string): Promise<StepOutcome> {
  const hosting = unwrapMaybe<HostingRow>(
    (await db
      .from('site_hosting')
      .select(HOSTING_COLUMNS)
      .eq('id', hostingId)
      .maybeSingle()) as never,
  );
  if (!hosting || hosting.status === 'disconnected')
    return { status: 'skipped', reason: 'hosting_missing' };
  return syncHostingDeployments(db, hosting);
}

/**
 * Relit les deploiements recents du projet et les enregistre. C'est ce qui
 * fait passer une version a « publiee » (ou « echec ») : `record_site_deployment`.
 */
export async function syncHostingDeployments(db: Db, hosting: HostingRow): Promise<StepOutcome> {
  if (!cloudflareSitesConfigured())
    return { status: 'skipped', reason: 'cloudflare_not_configured' };
  const target = toHostingTarget(hosting);
  let deployments: ProviderDeployment[];
  try {
    deployments = await listDeployments(target);
  } catch (error) {
    const message = error instanceof CloudflareError ? error.message : 'Cloudflare injoignable.';
    await db.rpc('record_hosting_state', { p_hosting: hosting.id, p_error: message });
    return { status: 'failed', stage: 'cloudflare', message };
  }

  // Commits attendus par StaX (versions et apercus en cours) : pour eux, un
  // echec est explique avec l'extrait du journal de build.
  const pending = new Set<string>();
  for (const row of unwrapList<{ commit_sha: string | null }>(
    (await db
      .from('site_deployments')
      .select('commit_sha')
      .eq('hosting_id', hosting.id)
      .in('status', ['queued', 'building', 'deploying'])) as never,
  )) {
    if (row.commit_sha) pending.add(row.commit_sha);
  }

  let recorded = 0;
  // Du plus ancien au plus recent : les etats finaux s'appliquent dans l'ordre.
  for (const deployment of [...deployments].reverse()) {
    let errorText = deployment.error;
    if (
      deployment.status === 'failure' &&
      deployment.commitSha &&
      pending.has(deployment.commitSha)
    ) {
      const log = await deploymentLog(target, deployment.providerDeploymentId).catch(() => null);
      if (log) errorText = `${deployment.error ?? 'Échec du build.'} Journal : ${log.slice(-600)}`;
    }
    const { error } = await db.rpc('record_site_deployment', {
      p_hosting: hosting.id,
      p_provider_deployment_id: deployment.providerDeploymentId,
      p_environment: deployment.environment,
      p_status: deployment.status,
      p_commit_sha: deployment.commitSha,
      p_branch: deployment.branch,
      p_url: deployment.url,
      p_stage: deployment.stage,
      p_error: errorText,
      p_started_at: deployment.startedAt,
      p_finished_at: deployment.finishedAt,
      p_deployment: null,
    });
    if (!error) recorded += 1;
  }
  await db.rpc('record_hosting_state', { p_hosting: hosting.id, p_error: null });
  return { status: 'synced', recorded };
}

async function syncReleaseDeployment(db: Db, release: ReleaseRow): Promise<StepOutcome> {
  if (release.hosting_id) {
    const outcome = await syncHostingById(db, release.hosting_id);
    if (outcome.status === 'failed') return outcome;
  }
  const current = unwrapMaybe<{ status: string; deploy_started_at: string | null }>(
    (await db
      .from('site_releases')
      .select('status, deploy_started_at')
      .eq('id', release.id)
      .maybeSingle()) as never,
  );
  if (current?.status === 'deploying' && current.deploy_started_at) {
    const age = Date.now() - Date.parse(current.deploy_started_at);
    if (age > DEPLOYMENT_TIMEOUT_MINUTES * 60_000) {
      return failRelease(
        db,
        release.id,
        'timeout',
        'deployment_timeout',
        `Cloudflare n’a pas confirmé le déploiement de ce commit en ${DEPLOYMENT_TIMEOUT_MINUTES} minutes. La version précédente reste affichée ; l’équipe StaX vérifie le projet.`,
      );
    }
  }
  return { status: 'synced', recorded: 0 };
}

/* -------------------------------------------------------------------------- */
/*  Apercu : un vrai build du brouillon, sur une branche technique             */
/* -------------------------------------------------------------------------- */

interface PreviewRow {
  id: string;
  site_id: string;
  organization_id: string;
  hosting_id: string;
  status: string;
  draft_revision: number | null;
  created_at: string;
}

export async function processPreview(db: Db, deploymentId: string): Promise<StepOutcome> {
  const preview = unwrapMaybe<PreviewRow>(
    (await db
      .from('site_deployments')
      .select('id, site_id, organization_id, hosting_id, status, draft_revision, created_at')
      .eq('id', deploymentId)
      .eq('trigger', 'stax_preview')
      .maybeSingle()) as never,
  );
  if (!preview || preview.status !== 'queued') return { status: 'skipped', reason: 'not_queued' };

  const fail = async (message: string) => {
    await db.rpc('fail_site_preview', {
      p_deployment: preview.id,
      p_message: message.slice(0, 1000),
    });
    return { status: 'failed' as const, stage: 'preview', message };
  };

  if (!githubAppConfigured()) {
    return fail(
      'L’application GitHub de StaX n’est pas configurée : l’aperçu ne peut pas être construit.',
    );
  }
  const repository = unwrapMaybe<RepositoryRow>(
    (await db
      .from('site_repositories')
      .select(REPOSITORY_COLUMNS)
      .eq('site_id', preview.site_id)
      .eq('status', 'connected')
      .maybeSingle()) as never,
  );
  const active = await loadActiveManifest(db, preview.site_id);
  const draft = unwrapMaybe<{ content: unknown; revision: number }>(
    (await db
      .from('site_content_drafts')
      .select('content, revision')
      .eq('site_id', preview.site_id)
      .maybeSingle()) as never,
  );
  if (!repository || !active || !draft) return fail('Le site n’est pas prêt pour un aperçu.');

  const validation = validateContent(active.manifest, draft.content, { mode: 'draft' });
  try {
    const client = await RepositoryClient.open(toRepositoryRef(repository), 'write');
    const productionHead = await client.branchHead(repository.production_branch);
    if (!productionHead) return fail('La branche de production du dépôt est introuvable.');
    const { files, hash } = await buildFiles({
      db,
      client,
      ref: productionHead,
      manifest: active.manifest,
      content: validation.content,
      organizationId: preview.organization_id,
      meta: {
        siteId: preview.site_id,
        version: null,
        releaseId: null,
        preview: { revision: draft.revision },
      },
      strictMedia: false,
    });
    // La branche d'apercu repart TOUJOURS du code de production : l'apercu
    // montre le vrai site, avec le brouillon a la place du contenu publie.
    const commit = await client.commitFiles({
      branch: repository.preview_branch,
      files,
      message: previewCommitMessage({
        siteId: preview.site_id,
        deploymentId: preview.id,
        revision: draft.revision,
      }),
      resetTo: productionHead,
    });
    await db.rpc('record_preview_commit', {
      p_deployment: preview.id,
      p_commit_sha: commit.commitSha,
      p_branch: commit.branch,
      p_content_hash: hash,
    });
    await syncHostingById(db, preview.hosting_id).catch(() => undefined);
    return { status: 'committed', commitSha: commit.commitSha };
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Aperçu impossible.');
  }
}

/** Apercus bloques (jamais construits) : declares en echec, pour ne pas bloquer les suivants. */
export async function expireStalePreviews(db: Db): Promise<number> {
  const stale = unwrapList<{ id: string }>(
    (await db
      .from('site_deployments')
      .select('id')
      .eq('trigger', 'stax_preview')
      .in('status', ['queued', 'building', 'deploying'])
      .lt('created_at', new Date(Date.now() - PREVIEW_TIMEOUT_MINUTES * 60_000).toISOString())
      .limit(100)) as never,
  );
  for (const row of stale) {
    await db.rpc('fail_site_preview', {
      p_deployment: row.id,
      p_message: `Cloudflare n’a pas construit l’aperçu en ${PREVIEW_TIMEOUT_MINUTES} minutes.`,
    });
  }
  return stale.length;
}

/** Hebergements a relire : ceux qui ont une version ou un apercu en cours. */
export async function hostingsWithPendingWork(db: Db): Promise<HostingRow[]> {
  const ids = new Set<string>();
  for (const row of unwrapList<{ hosting_id: string }>(
    (await db
      .from('site_deployments')
      .select('hosting_id')
      .in('status', ['queued', 'building', 'deploying'])
      .limit(500)) as never,
  )) {
    ids.add(row.hosting_id);
  }
  if (ids.size === 0) return [];
  return unwrapList<HostingRow>(
    (await db
      .from('site_hosting')
      .select(HOSTING_COLUMNS)
      .in('id', [...ids])
      .neq('status', 'disconnected')) as never,
  );
}
