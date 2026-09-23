import 'server-only';
import { unwrapList, unwrapMaybe, type Db } from '@stax/database';
import {
  addPagesDomain,
  CloudflareError,
  cloudflareSitesConfigured,
  GitHubError,
  githubAppConfigured,
  inspectHosting,
  listAppInstallations,
  listDeployments,
  listInstallationRepositories,
  listProjectDomains,
  RepositoryClient,
  runDeliveryProbes,
  type HostingProvider,
  type InstallationRepository,
} from '@stax/infrastructure';
import {
  checkManifestAgainstPlan,
  contentFromBundle,
  contentHash,
  integrationsFromManifest,
  parseManifest,
  sha256Hex,
  stableStringify,
  validateContent,
  type ContractIssue,
  type ManifestSummary,
  type PlanProblem,
  type PlanRights,
} from '@stax/site-contract';
import { syncHostingDeployments } from './publisher';
import {
  loadActiveManifest,
  loadHosting,
  loadRepository,
  toHostingTarget,
  toRepositoryRef,
} from './records';

/**
 * Operations de l'equipe StaX sur l'infrastructure d'un site (page
 * « Infrastructure & livraison »).
 *
 * Deux clients :
 *  - `db` : le JETON de la personne de l'equipe. Toute ecriture metier passe
 *    par lui, pour que la base verifie son role et journalise son nom ;
 *  - `service` : la cle de service, UNIQUEMENT pour les fonctions que seul le
 *    serveur peut appeler (preuves de controle, etat relu chez GitHub ou
 *    Cloudflare). Jamais pour contourner un droit.
 *
 * Les informations envoyees a la base (proprietaire d'un depot, identifiant
 * d'un projet, adresse de production) viennent des API GitHub et Cloudflare,
 * jamais du formulaire : on ne peut pas rattacher un depot ou un projet en
 * inventant ses caracteristiques.
 */

export type FlowResult<T = undefined> =
  { ok: true; message: string; data?: T } | { ok: false; message: string };

function describe(error: unknown, fallback: string): string {
  if (error instanceof GitHubError || error instanceof CloudflareError) return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

/* -------------------------------------------------------------------------- */
/*  GitHub                                                                      */
/* -------------------------------------------------------------------------- */

export async function syncGitHubInstallations(service: Db): Promise<FlowResult<number>> {
  if (!githubAppConfigured()) {
    return { ok: false, message: 'L’application GitHub n’est pas configurée sur ce déploiement.' };
  }
  try {
    const installations = await listAppInstallations();
    for (const installation of installations) {
      const { error } = await service.rpc('upsert_github_installation', {
        p_installation_id: installation.id,
        p_account_login: installation.accountLogin,
        p_account_id: installation.accountId,
        p_account_type: installation.accountType,
        p_repository_selection: installation.repositorySelection,
        p_suspended: installation.suspended,
      });
      if (error) throw new Error(error.message);
    }
    return {
      ok: true,
      message: `${installations.length} installation(s) de l’application synchronisée(s).`,
      data: installations.length,
    };
  } catch (error) {
    return { ok: false, message: describe(error, 'Synchronisation impossible.') };
  }
}

export async function repositoriesOfInstallation(
  installationId: number,
): Promise<FlowResult<InstallationRepository[]>> {
  if (!githubAppConfigured()) {
    return { ok: false, message: 'L’application GitHub n’est pas configurée sur ce déploiement.' };
  }
  try {
    const repositories = await listInstallationRepositories(installationId);
    return { ok: true, message: `${repositories.length} dépôt(s).`, data: repositories };
  } catch (error) {
    return { ok: false, message: describe(error, 'Dépôts illisibles.') };
  }
}

const REPOSITORY_ERRORS: Record<string, string> = {
  site_not_found: 'Ce site est introuvable.',
  legacy_site: 'Ce site est servi par l’ancien moteur : il ne se rattache pas à un dépôt.',
  installation_unknown:
    'Installation GitHub inconnue, suspendue ou retirée : synchronisez les installations.',
  owner_mismatch: 'Ce dépôt n’appartient pas au compte GitHub de cette installation.',
  name_mismatch: 'Le nom du dépôt ne correspond pas à son propriétaire.',
  repository_already_attached:
    'Ce dépôt est déjà rattaché à un autre site. Un dépôt ne sert qu’un seul site.',
};

export async function connectRepository(
  db: Db,
  input: {
    siteId: string;
    installationId: number;
    repositoryId: number;
    productionBranch: string;
    manifestPath: string;
  },
): Promise<FlowResult> {
  const listed = await repositoriesOfInstallation(input.installationId);
  if (!listed.ok) return listed;
  const repository = listed.data?.find((entry) => entry.id === input.repositoryId);
  if (!repository) {
    return {
      ok: false,
      message: 'Ce dépôt n’est pas accessible à l’application StaX sur cette installation.',
    };
  }
  if (repository.archived) {
    return { ok: false, message: 'Ce dépôt est archivé : il ne peut pas recevoir de publication.' };
  }

  let head: string | null;
  try {
    const client = await RepositoryClient.open(
      {
        installationId: input.installationId,
        repositoryId: repository.id,
        fullName: repository.fullName,
      },
      'read',
    );
    head = await client.branchHead(input.productionBranch);
  } catch (error) {
    return { ok: false, message: describe(error, 'Dépôt illisible.') };
  }
  if (!head) {
    return {
      ok: false,
      message: `La branche « ${input.productionBranch} » n’existe pas dans ${repository.fullName}.`,
    };
  }

  const { data, error } = await db.rpc('connect_site_repository', {
    p_site: input.siteId,
    p_installation_id: input.installationId,
    p_repository_id: repository.id,
    p_owner_login: repository.ownerLogin,
    p_owner_id: repository.ownerId,
    p_name: repository.name,
    p_full_name: repository.fullName,
    p_html_url: repository.htmlUrl,
    p_default_branch: repository.defaultBranch,
    p_production_branch: input.productionBranch,
    p_manifest_path: input.manifestPath,
    p_head_commit_sha: head,
  });
  if (error) return { ok: false, message: 'Rattachement refusé par la base.' };
  const result = (data ?? {}) as { ok?: boolean; code?: string };
  if (!result.ok) {
    return { ok: false, message: REPOSITORY_ERRORS[result.code ?? ''] ?? 'Rattachement refusé.' };
  }
  return {
    ok: true,
    message: `Dépôt ${repository.fullName} rattaché (branche ${input.productionBranch}).`,
  };
}

/** Relit le sommet de la branche de production (et detecte le travail hors StaX). */
export async function refreshRepository(db: Db, service: Db, siteId: string): Promise<FlowResult> {
  const repository = await loadRepository(db, siteId);
  if (!repository) return { ok: false, message: 'Aucun dépôt rattaché.' };
  try {
    const client = await RepositoryClient.open(toRepositoryRef(repository), 'read');
    const head = await client.branchHead(repository.production_branch);
    if (!head) {
      await service.rpc('record_repository_state', {
        p_repository: repository.id,
        p_head_sha: null,
        p_error: `La branche « ${repository.production_branch} » n’existe plus.`,
      });
      return {
        ok: false,
        message: `La branche « ${repository.production_branch} » n’existe plus.`,
      };
    }
    const commit = await client.commit(head);
    const fromStax =
      head === repository.last_stax_commit_sha || /^Stax-Release:/m.test(commit.message);
    await service.rpc('record_repository_state', {
      p_repository: repository.id,
      p_head_sha: head,
      p_committed_at: commit.committedAt,
      p_sync_status: fromStax || !repository.last_stax_commit_sha ? 'in_sync' : 'developer_changes',
      p_error: null,
    });
    return { ok: true, message: `Dépôt relu : dernier commit ${head.slice(0, 7)}.` };
  } catch (error) {
    const message = describe(error, 'Dépôt illisible.');
    await service.rpc('record_repository_state', {
      p_repository: repository.id,
      p_head_sha: null,
      p_error: message,
    });
    return { ok: false, message };
  }
}

/* -------------------------------------------------------------------------- */
/*  Cloudflare                                                                  */
/* -------------------------------------------------------------------------- */

const HOSTING_ERRORS: Record<string, string> = {
  site_not_found: 'Ce site est introuvable.',
  legacy_site: 'Ce site est servi par l’ancien moteur : il n’a pas de projet Cloudflare propre.',
  project_already_attached: 'Ce projet Cloudflare est déjà rattaché à un autre site.',
};

export async function connectHosting(
  db: Db,
  service: Db,
  input: {
    siteId: string;
    provider: HostingProvider;
    accountId: string;
    projectName: string;
    productionUrl?: string | null;
    productionBranch?: string | null;
    workersTriggerId?: string | null;
  },
): Promise<FlowResult> {
  if (!cloudflareSitesConfigured()) {
    return { ok: false, message: 'Aucun jeton Cloudflare n’est configuré sur ce déploiement.' };
  }
  const repository = await loadRepository(db, input.siteId);
  let inspection: Awaited<ReturnType<typeof inspectHosting>>;
  try {
    inspection = await inspectHosting({
      provider: input.provider,
      accountId: input.accountId,
      projectName: input.projectName,
      productionUrl: input.productionUrl ?? undefined,
      productionBranch: input.productionBranch ?? repository?.production_branch ?? undefined,
      workersTriggerId: input.workersTriggerId ?? null,
    });
  } catch (error) {
    return { ok: false, message: describe(error, 'Projet Cloudflare illisible.') };
  }

  // Le projet doit deployer LE depot du site, depuis SA branche de production.
  if (repository) {
    if (
      inspection.repository &&
      inspection.repository.toLowerCase() !== repository.full_name.toLowerCase()
    ) {
      return {
        ok: false,
        message: `Ce projet Cloudflare déploie ${inspection.repository}, pas ${repository.full_name}.`,
      };
    }
    if (inspection.productionBranch !== repository.production_branch) {
      return {
        ok: false,
        message: `Branche de production différente : Cloudflare « ${inspection.productionBranch} », dépôt « ${repository.production_branch} ».`,
      };
    }
  }
  if (!inspection.deploymentsEnabled) {
    return {
      ok: false,
      message:
        'Les déploiements automatiques sont désactivés sur ce projet : StaX ne pourrait pas publier.',
    };
  }

  const { data, error } = await db.rpc('connect_site_hosting', {
    p_site: input.siteId,
    p_provider: input.provider,
    p_account_id: input.accountId,
    p_project_name: input.projectName,
    p_project_id: inspection.projectId,
    p_production_branch: inspection.productionBranch,
    p_production_url: inspection.productionUrl,
    p_workers_trigger_id: input.workersTriggerId ?? null,
  });
  if (error) return { ok: false, message: 'Rattachement refusé par la base.' };
  const result = (data ?? {}) as { ok?: boolean; code?: string };
  if (!result.ok) {
    return { ok: false, message: HOSTING_ERRORS[result.code ?? ''] ?? 'Rattachement refusé.' };
  }

  const hosting = await loadHosting(db, input.siteId);
  if (hosting) await syncHostingDeployments(service, hosting).catch(() => undefined);
  return {
    ok: true,
    message: `Projet Cloudflare « ${input.projectName} » rattaché (${inspection.productionUrl}).`,
  };
}

export async function refreshDeployments(db: Db, service: Db, siteId: string): Promise<FlowResult> {
  const hosting = await loadHosting(db, siteId);
  if (!hosting) return { ok: false, message: 'Aucun projet Cloudflare rattaché.' };
  const outcome = await syncHostingDeployments(service, hosting);
  if (outcome.status === 'failed') return { ok: false, message: outcome.message };
  if (outcome.status === 'skipped') {
    return { ok: false, message: 'Aucun jeton Cloudflare n’est configuré sur ce déploiement.' };
  }
  return {
    ok: true,
    message: `Déploiements relus chez Cloudflare (${outcome.status === 'synced' ? outcome.recorded : 0}).`,
  };
}

/* -------------------------------------------------------------------------- */
/*  Contrat d'edition et contenu initial                                        */
/* -------------------------------------------------------------------------- */

const RIGHT_KEYS = [
  'blog',
  'multi_language',
  'advanced_forms',
  'bookings',
  'ecommerce',
  'online_payments',
  'customer_accounts',
];
const LIMIT_KEYS = ['max_pages', 'max_locales', 'max_forms'];

export async function planRights(db: Db, organizationId: string): Promise<PlanRights> {
  const features = new Map<string, boolean>();
  const limits = new Map<string, number | null>();
  await Promise.all([
    ...RIGHT_KEYS.map(async (key) => {
      const { data } = await db.rpc('has_feature', { p_org: organizationId, p_feature: key });
      features.set(key, data === true);
    }),
    ...LIMIT_KEYS.map(async (key) => {
      const { data } = await db.rpc('feature_limit', { p_org: organizationId, p_feature: key });
      limits.set(key, typeof data === 'number' ? data : data === null ? null : -1);
    }),
  ]);
  return {
    has: (key) => features.get(key) === true,
    limit: (key) => (limits.has(key) ? (limits.get(key) ?? null) : null),
  };
}

export interface ManifestImportReport {
  commit: string;
  valid: boolean;
  errors: ContractIssue[];
  warnings: ContractIssue[];
  planProblems: PlanProblem[];
  summary: ManifestSummary | null;
  content: { initialized: boolean; message: string } | null;
  dropped: string[];
}

export async function importManifest(
  db: Db,
  service: Db,
  site: { id: string; organizationId: string },
): Promise<FlowResult<ManifestImportReport>> {
  if (!githubAppConfigured()) {
    return { ok: false, message: 'L’application GitHub n’est pas configurée sur ce déploiement.' };
  }
  const repository = await loadRepository(db, site.id);
  if (!repository) return { ok: false, message: 'Rattachez d’abord le dépôt GitHub du site.' };

  let head: string | null;
  let text: string | null;
  try {
    const client = await RepositoryClient.open(toRepositoryRef(repository), 'read');
    head = await client.branchHead(repository.production_branch);
    text = head ? await client.readTextFile(repository.manifest_path, head) : null;
  } catch (error) {
    return { ok: false, message: describe(error, 'Dépôt illisible.') };
  }
  if (!head)
    return {
      ok: false,
      message: `La branche « ${repository.production_branch} » est introuvable.`,
    };
  if (text === null) {
    return {
      ok: false,
      message: `Aucun fichier ${repository.manifest_path} sur ${repository.production_branch} : le développeur doit l’ajouter au dépôt.`,
    };
  }

  const parsed = parseManifest(text);
  let raw: unknown = {};
  try {
    raw = JSON.parse(text);
  } catch {
    raw = {};
  }
  const stored = parsed.ok ? parsed.manifest : raw !== null && typeof raw === 'object' ? raw : {};
  const planProblems = parsed.ok
    ? checkManifestAgainstPlan(parsed.summary, await planRights(db, site.organizationId))
    : [];

  const { data, error } = await db.rpc('record_site_manifest', {
    p_site: site.id,
    p_commit_sha: head,
    p_path: repository.manifest_path,
    p_contract_version: parsed.ok ? parsed.manifest.contract : (parsed.contractVersion ?? 0),
    p_manifest: stored,
    p_manifest_hash: await sha256Hex(stableStringify(stored)),
    p_status: parsed.ok ? 'valid' : 'invalid',
    p_errors: parsed.ok ? [] : parsed.errors,
    p_warnings: parsed.ok
      ? [
          ...parsed.warnings,
          ...planProblems.map((problem) => ({ path: 'offre', message: problem.message })),
        ]
      : [],
    p_summary: parsed.ok ? parsed.summary : {},
    p_activate: parsed.ok,
  });
  if (error || !(data as { ok?: boolean } | null)?.ok) {
    return { ok: false, message: 'Le manifeste n’a pas pu être enregistré.' };
  }

  const report: ManifestImportReport = {
    commit: head,
    valid: parsed.ok,
    errors: parsed.ok ? [] : parsed.errors,
    warnings: parsed.ok ? parsed.warnings : [],
    planProblems,
    summary: parsed.ok ? parsed.summary : null,
    content: null,
    dropped: [],
  };
  if (!parsed.ok) {
    return {
      ok: true,
      message: 'Manifeste importé, mais invalide : il n’est pas activé.',
      data: report,
    };
  }

  // Formulaires et modules du contrat -> messagerie et API des sites.
  const sync = integrationsFromManifest(parsed.manifest);
  await db.rpc('sync_site_integrations', {
    p_site: site.id,
    p_forms: sync.forms,
    p_modules: sync.modules,
    p_integration: sync.integration,
  });

  const hasRelease = unwrapMaybe<{ id: string }>(
    (await db
      .from('site_releases')
      .select('id')
      .eq('site_id', site.id)
      .limit(1)
      .maybeSingle()) as never,
  );
  if (!hasRelease) {
    const initialized = await initializeContent(db, service, site.id);
    report.content = { initialized: initialized.ok, message: initialized.message };
  } else {
    const draft = unwrapMaybe<{ content: unknown }>(
      (await db
        .from('site_content_drafts')
        .select('content')
        .eq('site_id', site.id)
        .maybeSingle()) as never,
    );
    if (draft)
      report.dropped = validateContent(parsed.manifest, draft.content, { mode: 'draft' }).dropped;
  }
  return { ok: true, message: 'Manifeste importé et activé.', data: report };
}

const INITIALIZE_ERRORS: Record<string, string> = {
  already_initialized: 'Le contenu du site est déjà initialisé.',
  manifest_not_active: 'Aucun contrat d’édition actif.',
  infrastructure_missing: 'Le dépôt ou le projet Cloudflare n’est pas rattaché.',
  deployment_not_verified: 'Le déploiement de production n’est pas confirmé par Cloudflare.',
};

/**
 * Contenu initial : le fichier de contenu que le developpeur a mis dans le
 * depot, au commit ACTUELLEMENT deploye en production (confirme par
 * Cloudflare). Il devient la version 1.
 */
export async function initializeContent(db: Db, service: Db, siteId: string): Promise<FlowResult> {
  const [repository, hosting, active] = await Promise.all([
    loadRepository(db, siteId),
    loadHosting(db, siteId),
    loadActiveManifest(db, siteId),
  ]);
  if (!repository || !hosting)
    return { ok: false, message: 'Rattachez le dépôt et le projet Cloudflare.' };
  if (!active) return { ok: false, message: 'Importez d’abord un manifeste valide.' };
  if (!cloudflareSitesConfigured()) {
    return {
      ok: false,
      message: 'Aucun jeton Cloudflare : le déploiement ne peut pas être vérifié.',
    };
  }

  try {
    const client = await RepositoryClient.open(toRepositoryRef(repository), 'read');
    const head = await client.branchHead(repository.production_branch);
    if (!head) return { ok: false, message: 'Branche de production introuvable.' };
    const deployments = await listDeployments(toHostingTarget(hosting));
    const live = deployments.find(
      (deployment) =>
        deployment.environment === 'production' &&
        deployment.commitSha === head &&
        deployment.status === 'success',
    );
    if (!live) {
      return {
        ok: false,
        message: `Le commit ${head.slice(0, 7)} n’est pas (encore) déployé avec succès en production par Cloudflare.`,
      };
    }
    const text = await client.readTextFile(active.manifest.content.file, head);
    if (text === null) {
      return {
        ok: false,
        message: `Fichier de contenu ${active.manifest.content.file} absent du dépôt : le site doit lire ses textes depuis ce fichier.`,
      };
    }
    let bundle: unknown;
    try {
      bundle = JSON.parse(text);
    } catch {
      return { ok: false, message: `${active.manifest.content.file} n’est pas un JSON valide.` };
    }
    const validation = validateContent(
      active.manifest,
      contentFromBundle(active.manifest, bundle),
      {
        mode: 'draft',
      },
    );
    if (!validation.ok) {
      return {
        ok: false,
        message: `Contenu initial invalide : ${validation.errors
          .slice(0, 3)
          .map((issue) => `${issue.message} (${issue.path})`)
          .join(' · ')}`,
      };
    }
    const { data, error } = await db.rpc('initialize_site_content', {
      p_site: siteId,
      p_manifest: active.row.id,
      p_content: validation.content,
      p_content_hash: await contentHash(validation.content),
      p_commit_sha: head,
      p_deployment: {
        status: 'success',
        providerDeploymentId: live.providerDeploymentId,
        url: live.url,
        stage: live.stage,
        startedAt: live.startedAt,
        finishedAt: live.finishedAt,
      },
    });
    if (error) return { ok: false, message: 'Initialisation refusée par la base.' };
    const result = (data ?? {}) as { ok?: boolean; code?: string };
    if (!result.ok) {
      return {
        ok: false,
        message: INITIALIZE_ERRORS[result.code ?? ''] ?? 'Initialisation refusée.',
      };
    }
    await syncHostingDeployments(service, hosting).catch(() => undefined);
    return {
      ok: true,
      message: `Contenu initial repris du commit ${head.slice(0, 7)} : version 1.`,
    };
  } catch (error) {
    return { ok: false, message: describe(error, 'Initialisation impossible.') };
  }
}

/* -------------------------------------------------------------------------- */
/*  Domaines                                                                    */
/* -------------------------------------------------------------------------- */

interface DomainRow {
  id: string;
  hostname: string;
  status: string;
  is_primary: boolean;
  verified_at: string | null;
}

export async function syncDomains(db: Db, siteId: string): Promise<FlowResult> {
  const hosting = await loadHosting(db, siteId);
  if (!hosting) return { ok: false, message: 'Aucun projet Cloudflare rattaché.' };
  if (!cloudflareSitesConfigured())
    return { ok: false, message: 'Aucun jeton Cloudflare configuré.' };
  let provider: Awaited<ReturnType<typeof listProjectDomains>>;
  try {
    provider = await listProjectDomains(toHostingTarget(hosting));
  } catch (error) {
    return { ok: false, message: describe(error, 'Domaines illisibles.') };
  }
  const rows = unwrapList<DomainRow>(
    (await db
      .from('site_domains')
      .select('id, hostname, status, is_primary, verified_at')
      .eq('site_id', siteId)
      .eq('served_by', 'cloudflare_project')
      .neq('status', 'detached')) as never,
  );
  const target = new URL(hosting.production_url).hostname;
  for (const row of rows) {
    const remote = provider.find((domain) => domain.name === row.hostname);
    const status = !remote
      ? 'failed'
      : remote.status === 'active'
        ? 'active'
        : remote.status === 'error'
          ? 'failed'
          : 'verifying';
    await db
      .from('site_domains')
      .update({
        status,
        ssl_status: status === 'active' ? 'active' : status === 'failed' ? 'failed' : 'pending',
        provider_status: remote?.status ?? 'absent',
        dns_target: target,
        verified_at:
          status === 'active' ? (row.verified_at ?? new Date().toISOString()) : row.verified_at,
        last_checked_at: new Date().toISOString(),
        last_error: !remote ? 'Domaine absent du projet Cloudflare.' : remote.detail,
      })
      .eq('id', row.id);
  }
  return { ok: true, message: `${rows.length} domaine(s) vérifié(s) auprès de Cloudflare.` };
}

export async function addDomain(
  db: Db,
  site: { id: string; organizationId: string },
  hostname: string,
  primary: boolean,
): Promise<FlowResult> {
  const hosting = await loadHosting(db, site.id);
  if (!hosting) return { ok: false, message: 'Rattachez d’abord le projet Cloudflare du site.' };
  if (!cloudflareSitesConfigured())
    return { ok: false, message: 'Aucun jeton Cloudflare configuré.' };
  const target = toHostingTarget(hosting);
  try {
    if (hosting.provider === 'cloudflare_pages') {
      const existing = await listProjectDomains(target);
      if (!existing.some((domain) => domain.name === hostname))
        await addPagesDomain(target, hostname);
    } else {
      const existing = await listProjectDomains(target);
      if (!existing.some((domain) => domain.name === hostname)) {
        return {
          ok: false,
          message:
            'Sur un Worker, ajoutez d’abord le domaine personnalisé dans Cloudflare (zone du compte), puis revenez ici.',
        };
      }
    }
  } catch (error) {
    return { ok: false, message: describe(error, 'Cloudflare a refusé le domaine.') };
  }

  if (primary) {
    await db.from('site_domains').update({ is_primary: false }).eq('site_id', site.id);
  }
  const { error } = await db.from('site_domains').insert({
    site_id: site.id,
    organization_id: site.organizationId,
    hostname,
    kind: 'custom',
    status: 'pending',
    is_primary: primary,
    served_by: 'cloudflare_project',
    dns_target: new URL(hosting.production_url).hostname,
    verification_method: 'cloudflare',
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === '23505'
          ? 'Ce domaine est déjà rattaché à un site (ici ou ailleurs).'
          : 'Le domaine n’a pas pu être enregistré.',
    };
  }
  await db.rpc('write_audit', {
    p_action: 'site.domain_attached',
    p_org: site.organizationId,
    p_site: site.id,
    p_target_type: 'site_domain',
    p_target_id: hostname,
    p_metadata: { primary, project: hosting.project_name },
  });
  await syncDomains(db, site.id);
  return {
    ok: true,
    message: `${hostname} ajouté au projet Cloudflare. Faites pointer son DNS (CNAME) vers ${new URL(hosting.production_url).hostname}.`,
  };
}

/* -------------------------------------------------------------------------- */
/*  Controles automatiques de livraison                                         */
/* -------------------------------------------------------------------------- */

export async function runDeliveryChecks(
  db: Db,
  service: Db,
  site: { id: string; organizationId: string },
): Promise<FlowResult> {
  const hosting = await loadHosting(db, site.id);
  if (!hosting) return { ok: false, message: 'Rattachez d’abord le projet Cloudflare du site.' };
  if (!cloudflareSitesConfigured())
    return { ok: false, message: 'Aucun jeton Cloudflare configuré.' };

  await syncHostingDeployments(service, hosting).catch(() => undefined);
  await syncDomains(db, site.id);

  const target = toHostingTarget(hosting);
  let deployments: Awaited<ReturnType<typeof listDeployments>> = [];
  let domains: Awaited<ReturnType<typeof listProjectDomains>> = [];
  try {
    [deployments, domains] = await Promise.all([
      listDeployments(target),
      listProjectDomains(target),
    ]);
  } catch (error) {
    return { ok: false, message: describe(error, 'Cloudflare injoignable.') };
  }
  const primary = unwrapMaybe<{ id: string; hostname: string }>(
    (await db
      .from('site_domains')
      .select('id, hostname')
      .eq('site_id', site.id)
      .eq('is_primary', true)
      .eq('served_by', 'cloudflare_project')
      .neq('status', 'detached')
      .maybeSingle()) as never,
  );
  const results = await runDeliveryProbes({
    productionUrl: hosting.production_url,
    primaryDomain: primary?.hostname ?? null,
    domainStatus: primary
      ? (domains.find((domain) => domain.name === primary.hostname)?.status ?? null)
      : null,
    latestProduction:
      deployments.find((deployment) => deployment.environment === 'production') ?? null,
  });

  for (const [key, outcome] of Object.entries(results)) {
    const { error } = await service.rpc('record_delivery_check', {
      p_site: site.id,
      p_key: key,
      p_passed: outcome.passed,
      p_evidence: outcome.evidence,
    });
    if (error) return { ok: false, message: 'Les résultats n’ont pas pu être enregistrés.' };
  }
  if (primary) {
    await db
      .from('site_domains')
      .update({ https_ok: results.https.passed, https_checked_at: new Date().toISOString() })
      .eq('id', primary.id);
  }
  await db.rpc('write_audit', {
    p_action: 'site.delivery_checks_run',
    p_org: site.organizationId,
    p_site: site.id,
    p_target_type: 'site',
    p_target_id: site.id,
    p_metadata: Object.fromEntries(
      Object.entries(results).map(([key, value]) => [key, value.passed]),
    ),
  });
  const passed = Object.values(results).filter((outcome) => outcome.passed).length;
  return { ok: true, message: `Vérifications terminées : ${passed} sur 4 réussies.` };
}
