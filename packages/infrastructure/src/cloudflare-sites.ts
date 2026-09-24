import { readEnv } from '@stax/config';

/**
 * API Cloudflare des sites livres — serveur uniquement.
 *
 * Chaque site StaX est deploye par SON projet Cloudflare (Pages, ou Worker
 * avec Workers Builds), connecte a son depot GitHub : un commit sur la
 * branche de production declenche un build puis un deploiement. StaX ne
 * deploie pas a la place de Cloudflare ; il LIT l'etat reel des deploiements
 * pour savoir, sans le supposer, si une version est en ligne.
 *
 * Ce module est la seule source de verite de StaX sur ce point : une version
 * n'est « publiee » que lorsque Cloudflare rapporte le deploiement de son
 * commit comme reussi. Les notifications (webhooks) recues de Cloudflare ne
 * sont jamais crues sur parole : elles declenchent une relecture ici.
 *
 * Jeton : CLOUDFLARE_SITES_API_TOKEN (a defaut CLOUDFLARE_API_TOKEN), limite
 * aux permissions « Cloudflare Pages : modifier », « Workers Scripts : lire »
 * et « Workers Builds : modifier » sur le compte qui heberge les sites. Il ne
 * quitte jamais le serveur.
 */

export type HostingProvider = 'cloudflare_pages' | 'cloudflare_workers';

export type DeploymentStatus =
  'queued' | 'building' | 'deploying' | 'success' | 'failure' | 'canceled' | 'skipped';

export interface ProviderDeployment {
  providerDeploymentId: string;
  environment: 'production' | 'preview';
  status: DeploymentStatus;
  commitSha: string | null;
  branch: string | null;
  url: string | null;
  stage: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface HostingTarget {
  provider: HostingProvider;
  accountId: string;
  projectName: string;
  /** Pages : identifiant du projet. Workers : etiquette (tag) du script. */
  projectId: string | null;
  productionBranch: string;
  productionUrl: string;
  /** Workers Builds : declencheur a utiliser pour relancer un build. */
  workersTriggerId: string | null;
}

export class CloudflareError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'CloudflareError';
  }
}

export function cloudflareSitesConfigured(): boolean {
  return Boolean(readEnv('CLOUDFLARE_SITES_API_TOKEN') ?? readEnv('CLOUDFLARE_API_TOKEN'));
}

export function cloudflareWebhookConfigured(): boolean {
  return Boolean(readEnv('CLOUDFLARE_WEBHOOK_SECRET'));
}

/** Compte Cloudflare propose par defaut a l'equipe (non secret). */
export function defaultCloudflareAccountId(): string | null {
  const value = readEnv('CLOUDFLARE_SITES_ACCOUNT_ID') ?? readEnv('CLOUDFLARE_ACCOUNT_ID');
  return value && /^[0-9a-f]{32}$/.test(value) ? value : null;
}

function apiBase(): string {
  return (readEnv('CLOUDFLARE_API_BASE_URL') ?? 'https://api.cloudflare.com/client/v4').replace(
    /\/+$/,
    '',
  );
}

function apiToken(): string {
  const token = readEnv('CLOUDFLARE_SITES_API_TOKEN') ?? readEnv('CLOUDFLARE_API_TOKEN');
  if (!token) throw new CloudflareError('API Cloudflare non configurée.', 0, 'not_configured');
  return token;
}

type FetchImpl = typeof fetch;

interface Envelope<T> {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
  result_info?: { page?: number; per_page?: number; total_pages?: number; total_count?: number };
}

async function call<T>(
  method: string,
  path: string,
  options: { body?: unknown; form?: FormData; fetchImpl?: FetchImpl } = {},
): Promise<Envelope<T>> {
  const fetcher = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${apiBase()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiToken()}`,
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      cache: 'no-store',
    });
  } catch (error) {
    throw new CloudflareError(
      `Cloudflare injoignable${error instanceof Error ? ` (${error.message})` : ''}.`,
      0,
      'network',
    );
  }
  const body = (await response.json().catch(() => ({}))) as Envelope<T>;
  if (!response.ok || body.success === false) {
    const detail = body.errors?.[0]?.message;
    const message =
      response.status === 401 || response.status === 403
        ? 'Cloudflare a refusé le jeton de StaX pour ce compte ou ce projet.'
        : response.status === 404
          ? 'Projet ou déploiement Cloudflare introuvable.'
          : response.status === 429
            ? 'Limite d’appels Cloudflare atteinte : nouvel essai dans quelques minutes.'
            : `Cloudflare a répondu ${response.status}${detail ? ` : ${detail}` : ''}.`;
    throw new CloudflareError(message, response.status, `http_${response.status}`);
  }
  return body;
}

const ACCOUNT = /^[0-9a-f]{32}$/;
const PROJECT = /^[a-z0-9][a-z0-9-]{0,62}$/;

function accountPath(accountId: string): string {
  if (!ACCOUNT.test(accountId))
    throw new CloudflareError('Compte Cloudflare invalide.', 0, 'invalid_account');
  return `/accounts/${accountId}`;
}

function projectPath(accountId: string, projectName: string): string {
  if (!PROJECT.test(projectName))
    throw new CloudflareError('Nom de projet invalide.', 0, 'invalid_project');
  return `${accountPath(accountId)}/pages/projects/${projectName}`;
}

/* -------------------------------------------------------------------------- */
/*  Cloudflare Pages                                                           */
/* -------------------------------------------------------------------------- */

export interface PagesProject {
  id: string;
  name: string;
  /** `<projet>.pages.dev` (peut differer du nom si celui-ci etait pris). */
  subdomain: string;
  productionBranch: string;
  domains: string[];
  source: {
    type: string;
    owner: string | null;
    repository: string | null;
    deploymentsEnabled: boolean;
  } | null;
}

interface RawPagesDeployment {
  id: string;
  environment?: string;
  url?: string;
  created_on?: string;
  modified_on?: string;
  aliases?: string[] | null;
  is_skipped?: boolean;
  latest_stage?: {
    name?: string;
    status?: string;
    started_on?: string | null;
    ended_on?: string | null;
  };
  deployment_trigger?: {
    type?: string;
    metadata?: { branch?: string; commit_hash?: string; commit_message?: string };
  };
}

export async function getPagesProject(
  accountId: string,
  projectName: string,
  fetchImpl?: FetchImpl,
): Promise<PagesProject> {
  const { result } = await call<{
    id: string;
    name: string;
    subdomain: string;
    production_branch: string;
    domains?: string[];
    source?: {
      type?: string;
      config?: {
        owner?: string;
        repo_name?: string;
        deployments_enabled?: boolean;
        production_deployments_enabled?: boolean;
      };
    };
  }>('GET', projectPath(accountId, projectName), { fetchImpl });
  if (!result) throw new CloudflareError('Projet illisible.', 0, 'invalid_response');
  return {
    id: result.id,
    name: result.name,
    subdomain: result.subdomain,
    productionBranch: result.production_branch,
    domains: result.domains ?? [],
    source: result.source
      ? {
          type: result.source.type ?? 'unknown',
          owner: result.source.config?.owner ?? null,
          repository: result.source.config?.repo_name ?? null,
          deploymentsEnabled:
            (result.source.config?.deployments_enabled ?? true) &&
            (result.source.config?.production_deployments_enabled ?? true),
        }
      : null,
  };
}

/** Etat normalise d'un deploiement Pages, a partir de sa derniere etape. */
export function pagesDeploymentStatus(raw: RawPagesDeployment): DeploymentStatus {
  if (raw.is_skipped) return 'skipped';
  const stage = raw.latest_stage?.name ?? '';
  const status = raw.latest_stage?.status ?? '';
  if (status === 'failure') return 'failure';
  if (status === 'canceled') return 'canceled';
  if (status === 'skipped') return 'skipped';
  if (stage === 'deploy' && status === 'success') return 'success';
  if (stage === 'deploy') return 'deploying';
  if (stage === 'queued' || (stage === 'initialize' && status === 'idle')) return 'queued';
  return 'building';
}

function toPagesDeployment(raw: RawPagesDeployment, target: HostingTarget): ProviderDeployment {
  const status = pagesDeploymentStatus(raw);
  const branch = raw.deployment_trigger?.metadata?.branch ?? null;
  const commit = raw.deployment_trigger?.metadata?.commit_hash ?? null;
  return {
    providerDeploymentId: raw.id,
    environment:
      raw.environment === 'production' || branch === target.productionBranch
        ? 'production'
        : 'preview',
    status,
    commitSha: commit && /^[0-9a-f]{40}$/.test(commit) ? commit : null,
    branch,
    url: raw.url ?? null,
    stage: raw.latest_stage?.name ?? null,
    error:
      status === 'failure' ? `Échec à l’étape « ${raw.latest_stage?.name ?? 'build'} ».` : null,
    startedAt: raw.latest_stage?.started_on ?? raw.created_on ?? null,
    finishedAt:
      status === 'success' || status === 'failure' || status === 'canceled' || status === 'skipped'
        ? (raw.latest_stage?.ended_on ?? raw.modified_on ?? null)
        : null,
  };
}

async function listPagesDeployments(
  target: HostingTarget,
  environment: 'production' | 'preview',
  fetchImpl?: FetchImpl,
): Promise<ProviderDeployment[]> {
  const { result } = await call<RawPagesDeployment[]>(
    'GET',
    `${projectPath(target.accountId, target.projectName)}/deployments?env=${environment}&page=1&per_page=15`,
    { fetchImpl },
  );
  return (result ?? []).map((raw) => toPagesDeployment(raw, target));
}

/** Dernieres lignes du journal de build (pour expliquer un echec a l'equipe). */
async function pagesDeploymentLog(
  target: HostingTarget,
  deploymentId: string,
  fetchImpl?: FetchImpl,
): Promise<string | null> {
  try {
    const { result } = await call<{ data?: Array<{ line?: string }> }>(
      'GET',
      `${projectPath(target.accountId, target.projectName)}/deployments/${encodeURIComponent(deploymentId)}/history/logs`,
      { fetchImpl },
    );
    const lines = (result?.data ?? []).map((entry) => entry.line ?? '').filter(Boolean);
    return lines.slice(-12).join('\n').slice(-1500) || null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Workers + Workers Builds                                                   */
/* -------------------------------------------------------------------------- */

interface RawWorkersBuild {
  build_uuid: string;
  status?: string;
  build_outcome?: string | null;
  created_on?: string;
  running_on?: string | null;
  stopped_on?: string | null;
  build_trigger_metadata?: { branch?: string; commit_hash?: string };
}

export function workersBuildStatus(raw: RawWorkersBuild): DeploymentStatus {
  const outcome = raw.build_outcome ?? null;
  if (raw.status === 'stopped' || outcome) {
    if (outcome === 'success') return 'success';
    if (outcome === 'skipped') return 'skipped';
    if (outcome === 'cancelled') return 'canceled';
    return 'failure';
  }
  if (raw.status === 'queued') return 'queued';
  return 'building';
}

/** Adresse d'apercu d'une branche sur un Worker : `<branche>-<worker>.<compte>.workers.dev`. */
export function workersPreviewUrl(productionUrl: string, branch: string): string | null {
  const match = productionUrl.match(/^https:\/\/([^/]+\.workers\.dev)\/?$/);
  if (!match) return null;
  const alias = branch
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return alias ? `https://${alias}-${match[1]}/` : null;
}

/** Adresse d'apercu d'une branche sur Pages : `<branche>.<projet>.pages.dev`. */
export function pagesBranchUrl(productionUrl: string, branch: string): string | null {
  const match = productionUrl.match(/^https:\/\/([^/]+\.pages\.dev)\/?$/);
  if (!match) return null;
  const alias = branch
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return alias ? `https://${alias}.${match[1]}/` : null;
}

function toWorkersDeployment(raw: RawWorkersBuild, target: HostingTarget): ProviderDeployment {
  const status = workersBuildStatus(raw);
  const branch = raw.build_trigger_metadata?.branch ?? null;
  const commit = raw.build_trigger_metadata?.commit_hash ?? null;
  const production = branch === target.productionBranch;
  return {
    providerDeploymentId: raw.build_uuid,
    environment: production ? 'production' : 'preview',
    status,
    commitSha: commit && /^[0-9a-f]{40}$/.test(commit) ? commit : null,
    branch,
    url: production
      ? target.productionUrl
      : branch
        ? workersPreviewUrl(target.productionUrl, branch)
        : null,
    stage: raw.status ?? null,
    error: status === 'failure' ? `Build ${raw.build_outcome ?? 'en échec'}.` : null,
    startedAt: raw.running_on ?? raw.created_on ?? null,
    finishedAt: raw.stopped_on ?? null,
  };
}

export async function getWorkerScriptTag(
  accountId: string,
  scriptName: string,
  fetchImpl?: FetchImpl,
): Promise<string | null> {
  const { result } = await call<Array<{ id: string; tag?: string }>>(
    'GET',
    `${accountPath(accountId)}/workers/scripts`,
    {
      fetchImpl,
    },
  );
  return (result ?? []).find((script) => script.id === scriptName)?.tag ?? null;
}

async function listWorkersBuilds(
  target: HostingTarget,
  fetchImpl?: FetchImpl,
): Promise<ProviderDeployment[]> {
  const tag =
    target.projectId ?? (await getWorkerScriptTag(target.accountId, target.projectName, fetchImpl));
  if (!tag || !/^[0-9a-f]{32}$/.test(tag)) {
    throw new CloudflareError('Worker introuvable sur ce compte.', 404, 'worker_not_found');
  }
  const { result } = await call<RawWorkersBuild[]>(
    'GET',
    `${accountPath(target.accountId)}/builds/workers/${tag}/builds?page=1&per_page=20`,
    { fetchImpl },
  );
  return (result ?? []).map((raw) => toWorkersDeployment(raw, target));
}

async function workersBuildLog(
  target: HostingTarget,
  buildId: string,
  fetchImpl?: FetchImpl,
): Promise<string | null> {
  try {
    const { result } = await call<{ lines?: Array<[number, string]> }>(
      'GET',
      `${accountPath(target.accountId)}/builds/builds/${encodeURIComponent(buildId)}/logs`,
      { fetchImpl },
    );
    const lines = (result?.lines ?? []).map((entry) => entry[1]).filter(Boolean);
    return lines.slice(-12).join('\n').slice(-1500) || null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Operations communes                                                        */
/* -------------------------------------------------------------------------- */

/** Deploiements recents du projet (production et apercus), du plus recent au plus ancien. */
export async function listDeployments(
  target: HostingTarget,
  fetchImpl?: FetchImpl,
): Promise<ProviderDeployment[]> {
  if (target.provider === 'cloudflare_pages') {
    const [production, preview] = await Promise.all([
      listPagesDeployments(target, 'production', fetchImpl),
      listPagesDeployments(target, 'preview', fetchImpl),
    ]);
    return [...production, ...preview].sort((a, b) =>
      (b.startedAt ?? '').localeCompare(a.startedAt ?? ''),
    );
  }
  return listWorkersBuilds(target, fetchImpl);
}

/** Journal d'un deploiement en echec (extrait), si Cloudflare le fournit. */
export async function deploymentLog(
  target: HostingTarget,
  providerDeploymentId: string,
  fetchImpl?: FetchImpl,
): Promise<string | null> {
  return target.provider === 'cloudflare_pages'
    ? pagesDeploymentLog(target, providerDeploymentId, fetchImpl)
    : workersBuildLog(target, providerDeploymentId, fetchImpl);
}

/**
 * Relance un deploiement (action d'administration). Pages : nouvel essai du
 * deploiement indique. Workers : nouveau build du commit, via le declencheur.
 */
export async function retryDeployment(
  target: HostingTarget,
  deployment: {
    providerDeploymentId: string | null;
    commitSha: string | null;
    branch: string | null;
  },
  fetchImpl?: FetchImpl,
): Promise<string | null> {
  if (target.provider === 'cloudflare_pages') {
    if (deployment.providerDeploymentId) {
      const { result } = await call<{ id: string }>(
        'POST',
        `${projectPath(target.accountId, target.projectName)}/deployments/${encodeURIComponent(deployment.providerDeploymentId)}/retry`,
        { fetchImpl },
      );
      return result?.id ?? null;
    }
    // Aucun deploiement a relancer : nouveau deploiement du sommet de la branche.
    const form = new FormData();
    form.set('branch', deployment.branch ?? target.productionBranch);
    const { result } = await call<{ id: string }>(
      'POST',
      `${projectPath(target.accountId, target.projectName)}/deployments`,
      { form, fetchImpl },
    );
    return result?.id ?? null;
  }
  if (!target.workersTriggerId || !/^[0-9a-f-]{36}$/.test(target.workersTriggerId)) {
    throw new CloudflareError(
      'Aucun déclencheur Workers Builds renseigné pour ce site.',
      0,
      'no_trigger',
    );
  }
  const { result } = await call<{ build_uuid: string }>(
    'POST',
    `${accountPath(target.accountId)}/builds/triggers/${target.workersTriggerId}/builds`,
    {
      fetchImpl,
      body: deployment.commitSha
        ? { commit_hash: deployment.commitSha }
        : { branch: deployment.branch ?? target.productionBranch },
    },
  );
  return result?.build_uuid ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Domaines du projet                                                         */
/* -------------------------------------------------------------------------- */

export interface ProjectDomain {
  name: string;
  status: 'pending' | 'active' | 'error';
  detail: string | null;
  /** Enregistrement DNS attendu (verification ou acheminement). */
  dns: Array<{ type: string; name: string; value: string }>;
}

export async function listProjectDomains(
  target: HostingTarget,
  fetchImpl?: FetchImpl,
): Promise<ProjectDomain[]> {
  if (target.provider === 'cloudflare_pages') {
    const { result } = await call<
      Array<{
        name: string;
        status?: string;
        validation_data?: {
          status?: string;
          txt_name?: string;
          txt_value?: string;
          error_message?: string;
        };
        verification_data?: { status?: string; error_message?: string };
      }>
    >('GET', `${projectPath(target.accountId, target.projectName)}/domains`, { fetchImpl });
    const subdomain = new URL(target.productionUrl).hostname;
    return (result ?? []).map((domain) => {
      const status: ProjectDomain['status'] =
        domain.status === 'active'
          ? 'active'
          : domain.status === 'error' || domain.status === 'blocked'
            ? 'error'
            : 'pending';
      const dns: ProjectDomain['dns'] = [{ type: 'CNAME', name: domain.name, value: subdomain }];
      if (domain.validation_data?.txt_name && domain.validation_data.txt_value) {
        dns.push({
          type: 'TXT',
          name: domain.validation_data.txt_name,
          value: domain.validation_data.txt_value,
        });
      }
      return {
        name: domain.name,
        status,
        detail:
          domain.validation_data?.error_message ?? domain.verification_data?.error_message ?? null,
        dns,
      };
    });
  }
  const { result } = await call<Array<{ hostname: string; service: string }>>(
    'GET',
    `${accountPath(target.accountId)}/workers/domains?service=${encodeURIComponent(target.projectName)}`,
    { fetchImpl },
  );
  // Un domaine personnalise de Worker est actif des sa creation (DNS et
  // certificat geres par Cloudflare sur la zone du compte).
  return (result ?? [])
    .filter((domain) => domain.service === target.projectName)
    .map((domain) => ({ name: domain.hostname, status: 'active' as const, detail: null, dns: [] }));
}

/** Ajoute un domaine au projet Pages du site (Workers : zone requise, fait par l'equipe). */
export async function addPagesDomain(
  target: HostingTarget,
  hostname: string,
  fetchImpl?: FetchImpl,
): Promise<void> {
  if (target.provider !== 'cloudflare_pages') {
    throw new CloudflareError(
      'Sur un Worker, le domaine se rattache depuis la zone Cloudflare.',
      0,
      'unsupported',
    );
  }
  await call('POST', `${projectPath(target.accountId, target.projectName)}/domains`, {
    body: { name: hostname },
    fetchImpl,
  });
}

/* -------------------------------------------------------------------------- */
/*  Controle d'un projet au rattachement                                       */
/* -------------------------------------------------------------------------- */

export interface HostingInspection {
  provider: HostingProvider;
  projectId: string | null;
  productionBranch: string;
  productionUrl: string;
  /** Depot GitHub declare par le projet (Pages), pour verifier la coherence. */
  repository: string | null;
  deploymentsEnabled: boolean;
  latestProduction: ProviderDeployment | null;
}

/** Lit le projet et son dernier deploiement de production. */
export async function inspectHosting(
  target: Omit<HostingTarget, 'productionUrl' | 'productionBranch' | 'projectId'> &
    Partial<Pick<HostingTarget, 'productionUrl' | 'productionBranch' | 'projectId'>>,
  fetchImpl?: FetchImpl,
): Promise<HostingInspection> {
  if (target.provider === 'cloudflare_pages') {
    const project = await getPagesProject(target.accountId, target.projectName, fetchImpl);
    const full: HostingTarget = {
      ...target,
      projectId: project.id,
      productionBranch: project.productionBranch,
      productionUrl: `https://${project.subdomain}/`,
      workersTriggerId: null,
    };
    const deployments = await listPagesDeployments(full, 'production', fetchImpl);
    return {
      provider: target.provider,
      projectId: project.id,
      productionBranch: project.productionBranch,
      productionUrl: full.productionUrl,
      repository:
        project.source?.owner && project.source.repository
          ? `${project.source.owner}/${project.source.repository}`
          : null,
      deploymentsEnabled: project.source?.deploymentsEnabled ?? false,
      latestProduction: deployments[0] ?? null,
    };
  }
  if (!target.productionUrl || !target.productionBranch) {
    throw new CloudflareError(
      'Adresse et branche de production requises pour un Worker.',
      0,
      'missing_worker_details',
    );
  }
  const tag =
    target.projectId ?? (await getWorkerScriptTag(target.accountId, target.projectName, fetchImpl));
  const full: HostingTarget = {
    ...target,
    projectId: tag,
    productionBranch: target.productionBranch,
    productionUrl: target.productionUrl,
    workersTriggerId: target.workersTriggerId ?? null,
  };
  const builds = await listWorkersBuilds(full, fetchImpl);
  return {
    provider: target.provider,
    projectId: tag,
    productionBranch: target.productionBranch,
    productionUrl: target.productionUrl,
    repository: null,
    deploymentsEnabled: true,
    latestProduction: builds.find((build) => build.environment === 'production') ?? null,
  };
}
