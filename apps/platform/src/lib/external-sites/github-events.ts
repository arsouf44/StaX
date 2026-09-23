import 'server-only';
import { unwrapList, type Db } from '@stax/database';
import { releaseIdFromMessage } from '@stax/infrastructure';

/**
 * Evenements de l'application GitHub (webhook signe, deja verifie).
 *
 *  - `installation` / `installation_repositories` : l'application est
 *    installee, suspendue ou retiree d'un compte ;
 *  - `push` : un commit arrive sur la branche de production d'un site. S'il
 *    vient de StaX (marqueur `Stax-Release`), le depot est a jour ; sinon le
 *    developpeur a travaille directement : l'equipe le voit, et le manifeste
 *    est signale s'il a change ;
 *  - `repository` : depot renomme, transfere, archive ou supprime.
 *
 * Aucune information du webhook n'ouvre un droit : les identifiants recus
 * sont compares a ceux enregistres par l'administration.
 */

interface InstallationPayload {
  action?: string;
  installation?: {
    id: number;
    account?: { login: string; id: number; type: string };
    repository_selection?: string;
    suspended_at?: string | null;
  };
  repositories_removed?: Array<{ id: number }>;
}

interface PushPayload {
  ref?: string;
  after?: string;
  repository?: { id: number; full_name: string; default_branch?: string };
  head_commit?: { id: string; message: string; timestamp?: string } | null;
  commits?: Array<{ added?: string[]; modified?: string[]; removed?: string[] }>;
}

interface RepositoryPayload {
  action?: string;
  repository?: { id: number; full_name: string; default_branch?: string; archived?: boolean };
}

export async function handleGitHubEvent(db: Db, event: string, payload: unknown): Promise<string> {
  switch (event) {
    case 'ping':
      return 'pong';
    case 'installation':
    case 'installation_repositories':
      return onInstallation(db, payload as InstallationPayload);
    case 'push':
      return onPush(db, payload as PushPayload);
    case 'repository':
      return onRepository(db, payload as RepositoryPayload);
    default:
      return 'ignored';
  }
}

async function onInstallation(db: Db, payload: InstallationPayload): Promise<string> {
  const installation = payload.installation;
  if (!installation?.id || !installation.account) return 'invalid';
  if (payload.action === 'deleted') {
    await db.rpc('remove_github_installation', { p_installation_id: installation.id });
    return 'removed';
  }
  await db.rpc('upsert_github_installation', {
    p_installation_id: installation.id,
    p_account_login: installation.account.login,
    p_account_id: installation.account.id,
    p_account_type: installation.account.type === 'Organization' ? 'Organization' : 'User',
    p_repository_selection: installation.repository_selection ?? null,
    p_suspended: payload.action === 'suspend' || Boolean(installation.suspended_at),
  });

  for (const removed of payload.repositories_removed ?? []) {
    const attached = unwrapList<{ id: string }>(
      (await db
        .from('site_repositories')
        .select('id')
        .eq('repository_id', removed.id)
        .eq('installation_id', installation.id)
        .neq('status', 'disconnected')) as never,
    );
    for (const repository of attached) {
      await db.rpc('record_repository_state', {
        p_repository: repository.id,
        p_head_sha: null,
        p_error:
          'Ce dépôt a été retiré de l’application GitHub StaX : la publication est impossible.',
      });
    }
  }
  return payload.action ?? 'synced';
}

async function onPush(db: Db, payload: PushPayload): Promise<string> {
  const repositoryId = payload.repository?.id;
  const after = payload.after;
  if (
    !repositoryId ||
    !after ||
    !/^[0-9a-f]{40}$/.test(after) ||
    !payload.ref?.startsWith('refs/heads/')
  ) {
    return 'ignored';
  }
  const branch = payload.ref.slice('refs/heads/'.length);
  const attached = unwrapList<{
    id: string;
    site_id: string;
    organization_id: string;
    production_branch: string;
    manifest_path: string;
    last_stax_commit_sha: string | null;
  }>(
    (await db
      .from('site_repositories')
      .select(
        'id, site_id, organization_id, production_branch, manifest_path, last_stax_commit_sha',
      )
      .eq('repository_id', repositoryId)
      .neq('status', 'disconnected')) as never,
  );
  let handled = 0;
  for (const repository of attached) {
    if (branch !== repository.production_branch) continue;
    const fromStax =
      Boolean(payload.head_commit && releaseIdFromMessage(payload.head_commit.message)) ||
      after === repository.last_stax_commit_sha;
    const manifestTouched = (payload.commits ?? []).some((commit) =>
      [...(commit.added ?? []), ...(commit.modified ?? []), ...(commit.removed ?? [])].includes(
        repository.manifest_path,
      ),
    );
    await db.rpc('record_repository_state', {
      p_repository: repository.id,
      p_head_sha: after,
      p_committed_at: payload.head_commit?.timestamp ?? null,
      p_sync_status: fromStax ? 'in_sync' : 'developer_changes',
      p_error: null,
      p_full_name: payload.repository?.full_name ?? null,
      p_default_branch: payload.repository?.default_branch ?? null,
    });
    if (manifestTouched) {
      await db.rpc('write_audit', {
        p_action: 'site.manifest_changed_in_repository',
        p_org: repository.organization_id,
        p_site: repository.site_id,
        p_target_type: 'site_repository',
        p_target_id: repository.id,
        p_metadata: { commit: after },
      });
    }
    handled += 1;
  }
  return handled > 0 ? 'recorded' : 'ignored';
}

async function onRepository(db: Db, payload: RepositoryPayload): Promise<string> {
  const repository = payload.repository;
  if (!repository?.id) return 'invalid';
  const attached = unwrapList<{ id: string }>(
    (await db
      .from('site_repositories')
      .select('id')
      .eq('repository_id', repository.id)
      .neq('status', 'disconnected')) as never,
  );
  for (const row of attached) {
    const gone = payload.action === 'deleted' || payload.action === 'archived';
    await db.rpc('record_repository_state', {
      p_repository: row.id,
      p_head_sha: null,
      p_error: gone
        ? payload.action === 'deleted'
          ? 'Le dépôt GitHub du site a été supprimé.'
          : 'Le dépôt GitHub du site a été archivé : il n’accepte plus de publication.'
        : null,
      p_full_name: repository.full_name,
      p_default_branch: repository.default_branch ?? null,
    });
  }
  return attached.length > 0 ? 'recorded' : 'ignored';
}
