import { readEnv } from '@stax/config';

/**
 * Application GitHub de StaX — serveur uniquement.
 *
 * Chaque site livre par StaX vit dans SON depot GitHub. StaX n'y accede que
 * par une GitHub App installee sur le compte qui heberge les depots :
 *
 *  - aucun jeton personnel (PAT) : l'application s'authentifie avec sa cle
 *    privee, et obtient pour chaque operation un jeton d'installation de
 *    courte duree (une heure au plus) ;
 *  - ce jeton est RESTREINT au seul depot du site concerne
 *    (`repository_ids`) et aux seules permissions necessaires : lecture du
 *    contenu pour importer un manifeste, ecriture du contenu pour publier ;
 *  - ni la cle privee, ni un jeton, ne quittent le serveur : ils ne sont ni
 *    stockes en base, ni renvoyes au navigateur, ni journalises.
 *
 * Configuration : GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM, PKCS#1 ou
 * PKCS#8, eventuellement encode en base64), GITHUB_APP_WEBHOOK_SECRET,
 * GITHUB_APP_SLUG (pour le lien d'installation).
 */

const API_VERSION = '2022-11-28';

export type RepositoryAccess = 'read' | 'write';

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export function githubAppConfigured(): boolean {
  return Boolean(readEnv('GITHUB_APP_ID') && readEnv('GITHUB_APP_PRIVATE_KEY'));
}

export function githubWebhookConfigured(): boolean {
  return Boolean(readEnv('GITHUB_APP_WEBHOOK_SECRET'));
}

/** Lien d'installation de l'application sur un compte GitHub. */
export function githubAppInstallUrl(): string | null {
  const slug = readEnv('GITHUB_APP_SLUG');
  return slug && /^[a-z0-9-]{1,100}$/.test(slug)
    ? `https://github.com/apps/${slug}/installations/new`
    : null;
}

function apiBase(): string {
  return (readEnv('GITHUB_API_BASE_URL') ?? 'https://api.github.com').replace(/\/+$/, '');
}

/* -------------------------------------------------------------------------- */
/*  Cle privee et jeton d'application (JWT RS256)                              */
/* -------------------------------------------------------------------------- */

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64Url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function derLength(length: number): Uint8Array {
  if (length < 0x80) return Uint8Array.of(length);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Enveloppe une cle RSA PKCS#1 (format fourni par GitHub) en PKCS#8 (WebCrypto). */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = Uint8Array.of(0x02, 0x01, 0x00);
  const algorithm = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  );
  const octet = concat(Uint8Array.of(0x04), derLength(pkcs1.length), pkcs1);
  const body = concat(version, algorithm, octet);
  return concat(Uint8Array.of(0x30), derLength(body.length), body);
}

/** Lit la cle privee de l'application, quel que soit son format de stockage. */
export function readPrivateKeyDer(raw: string): Uint8Array {
  let pem = raw.trim().replace(/\\n/g, '\n');
  if (!pem.includes('-----BEGIN')) {
    // Cle stockee encodee en base64 (pratique dans certains gestionnaires de secrets).
    pem = new TextDecoder().decode(base64ToBytes(pem));
  }
  const match = pem.match(
    /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (RSA )?PRIVATE KEY-----/,
  );
  if (!match || !match[2]) {
    throw new GitHubError(
      'Clé privée de l’application GitHub illisible.',
      0,
      'invalid_private_key',
    );
  }
  const der = base64ToBytes(match[2]);
  return match[1] ? pkcs1ToPkcs8(der) : der;
}

let signingKey: { raw: string; key: CryptoKey } | null = null;

async function importSigningKey(raw: string): Promise<CryptoKey> {
  if (signingKey?.raw === raw) return signingKey.key;
  const der = readPrivateKeyDer(raw);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der as unknown as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  signingKey = { raw, key };
  return key;
}

/** Jeton de l'application elle-meme (10 minutes au plus, ici 9). */
export async function createAppJwt(now = Date.now()): Promise<string> {
  const appId = readEnv('GITHUB_APP_ID');
  const privateKey = readEnv('GITHUB_APP_PRIVATE_KEY');
  if (!appId || !privateKey) {
    throw new GitHubError('Application GitHub non configurée.', 0, 'not_configured');
  }
  const issuedAt = Math.floor(now / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64Url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 540, iss: appId }));
  const data = `${header}.${payload}`;
  const key = await importSigningKey(privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(data),
  );
  return `${data}.${base64Url(new Uint8Array(signature))}`;
}

/* -------------------------------------------------------------------------- */
/*  Appels HTTP                                                                */
/* -------------------------------------------------------------------------- */

type FetchImpl = typeof fetch;

function explain(status: number, body: { message?: string }): string {
  const detail = typeof body.message === 'string' ? body.message : '';
  if (status === 401) return 'GitHub a refusé l’authentification de l’application StaX.';
  if (status === 403 && /rate limit/i.test(detail))
    return 'Limite d’appels GitHub atteinte : nouvel essai dans quelques minutes.';
  if (status === 403) return 'L’application StaX n’a pas la permission nécessaire sur ce dépôt.';
  if (status === 404)
    return 'Dépôt, branche ou fichier introuvable (ou application non installée sur ce dépôt).';
  if (status === 409) return 'Le dépôt est vide ou dans un état qui empêche l’opération.';
  if (status === 422) return `GitHub a refusé l’opération${detail ? ` : ${detail}` : ''}.`;
  if (status >= 500) return 'GitHub est momentanément indisponible.';
  return `GitHub a répondu ${status}${detail ? ` : ${detail}` : ''}.`;
}

async function request<T>(
  token: string,
  method: string,
  path: string,
  options: { body?: unknown; accept?: string; fetchImpl?: FetchImpl; raw?: boolean } = {},
): Promise<{ status: number; data: T | null; text: string | null }> {
  const call = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await call(`${apiBase()}${path}`, {
      method,
      headers: {
        accept: options.accept ?? 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': API_VERSION,
        'user-agent': 'StaX-Platform',
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
    });
  } catch (error) {
    throw new GitHubError(
      `GitHub injoignable${error instanceof Error ? ` (${error.message})` : ''}.`,
      0,
      'network',
    );
  }
  if (options.raw && response.ok) {
    return { status: response.status, data: null, text: await response.text() };
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new GitHubError(
      explain(response.status, body as { message?: string }),
      response.status,
      `http_${response.status}`,
    );
  }
  return { status: response.status, data: body as T, text: null };
}

/* -------------------------------------------------------------------------- */
/*  Installations et jetons d'installation                                     */
/* -------------------------------------------------------------------------- */

export interface GitHubInstallation {
  id: number;
  accountLogin: string;
  accountId: number;
  accountType: 'Organization' | 'User';
  repositorySelection: string | null;
  suspended: boolean;
}

export async function getInstallation(
  installationId: number,
  fetchImpl?: FetchImpl,
): Promise<GitHubInstallation> {
  const jwt = await createAppJwt();
  const { data } = await request<{
    id: number;
    account: { login: string; id: number; type: string };
    repository_selection?: string;
    suspended_at?: string | null;
  }>(jwt, 'GET', `/app/installations/${installationId}`, { fetchImpl });
  if (!data) throw new GitHubError('Installation illisible.', 0, 'invalid_response');
  return {
    id: data.id,
    accountLogin: data.account.login,
    accountId: data.account.id,
    accountType: data.account.type === 'Organization' ? 'Organization' : 'User',
    repositorySelection: data.repository_selection ?? null,
    suspended: Boolean(data.suspended_at),
  };
}

/** Toutes les installations de l'application (resynchronisation manuelle). */
export async function listAppInstallations(fetchImpl?: FetchImpl): Promise<GitHubInstallation[]> {
  const jwt = await createAppJwt();
  const out: GitHubInstallation[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const { data } = await request<
      Array<{
        id: number;
        account: { login: string; id: number; type: string };
        repository_selection?: string;
        suspended_at?: string | null;
      }>
    >(jwt, 'GET', `/app/installations?per_page=100&page=${page}`, { fetchImpl });
    const rows = data ?? [];
    out.push(
      ...rows.map((row) => ({
        id: row.id,
        accountLogin: row.account.login,
        accountId: row.account.id,
        accountType:
          row.account.type === 'Organization' ? ('Organization' as const) : ('User' as const),
        repositorySelection: row.repository_selection ?? null,
        suspended: Boolean(row.suspended_at),
      })),
    );
    if (rows.length < 100) break;
  }
  return out;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

/**
 * Jeton d'installation restreint a UN depot et au strict necessaire.
 * Conserve en memoire (jamais ailleurs) tant qu'il lui reste 5 minutes.
 */
export async function installationToken(
  installationId: number,
  repositoryId: number,
  access: RepositoryAccess,
  fetchImpl?: FetchImpl,
): Promise<string> {
  const cacheKey = `${installationId}:${repositoryId}:${access}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token;

  const jwt = await createAppJwt();
  const { data } = await request<{ token: string; expires_at: string }>(
    jwt,
    'POST',
    `/app/installations/${installationId}/access_tokens`,
    {
      fetchImpl,
      body: {
        repository_ids: [repositoryId],
        permissions: { contents: access, metadata: 'read' },
      },
    },
  );
  if (!data?.token)
    throw new GitHubError('Jeton d’installation non délivré.', 0, 'invalid_response');
  tokenCache.set(cacheKey, {
    token: data.token,
    expiresAt: Date.parse(data.expires_at) || Date.now() + 50 * 60_000,
  });
  return data.token;
}

/** Test helper. */
export function resetGitHubTokenCache(): void {
  tokenCache.clear();
  signingKey = null;
}

export interface InstallationRepository {
  id: number;
  name: string;
  fullName: string;
  ownerLogin: string;
  ownerId: number;
  htmlUrl: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
}

function toRepository(raw: {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; id: number };
  html_url: string;
  default_branch: string;
  private: boolean;
  archived?: boolean;
}): InstallationRepository {
  return {
    id: raw.id,
    name: raw.name,
    fullName: raw.full_name,
    ownerLogin: raw.owner.login,
    ownerId: raw.owner.id,
    htmlUrl: raw.html_url,
    defaultBranch: raw.default_branch,
    private: raw.private,
    archived: Boolean(raw.archived),
  };
}

/** Depots auxquels une installation donne acces (pour choisir celui d'un site). */
export async function listInstallationRepositories(
  installationId: number,
  fetchImpl?: FetchImpl,
): Promise<InstallationRepository[]> {
  const jwt = await createAppJwt();
  // Jeton de lecture, sans restriction de depot : il sert uniquement a lister.
  const { data: tokenData } = await request<{ token: string }>(
    jwt,
    'POST',
    `/app/installations/${installationId}/access_tokens`,
    { fetchImpl, body: { permissions: { metadata: 'read' } } },
  );
  if (!tokenData?.token)
    throw new GitHubError('Jeton d’installation non délivré.', 0, 'invalid_response');
  const out: InstallationRepository[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data } = await request<{ repositories: Parameters<typeof toRepository>[0][] }>(
      tokenData.token,
      'GET',
      `/installation/repositories?per_page=100&page=${page}`,
      { fetchImpl },
    );
    const repositories = data?.repositories ?? [];
    out.push(...repositories.map(toRepository));
    if (repositories.length < 100) break;
  }
  return out.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/* -------------------------------------------------------------------------- */
/*  Client d'un depot                                                          */
/* -------------------------------------------------------------------------- */

export interface RepositoryRef {
  installationId: number;
  repositoryId: number;
  /** `owner/nom` courant (peut changer si le depot est renomme ou transfere). */
  fullName: string;
}

export interface FileToWrite {
  path: string;
  /** Texte (UTF-8) ou octets (images). */
  content: string | Uint8Array;
}

export interface CommitResult {
  commitSha: string;
  commitUrl: string;
  baseSha: string;
  branch: string;
  /** Aucun fichier ne changeait : pas de commit cree, le depot est deja a jour. */
  unchanged: boolean;
}

export interface CommitInfo {
  sha: string;
  message: string;
  treeSha: string;
  committedAt: string | null;
  htmlUrl: string;
}

const SHA = /^[0-9a-f]{40}$/;

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/** Empreinte Git d'un fichier (`blob <taille>\0<contenu>`), pour eviter les envois inutiles. */
export async function gitBlobSha(content: string | Uint8Array): Promise<string> {
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const digest = await crypto.subtle.digest(
    'SHA-1',
    concat(header, bytes) as unknown as BufferSource,
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class RepositoryClient {
  private constructor(
    private readonly token: string,
    private readonly fullName: string,
    private readonly fetchImpl?: FetchImpl,
  ) {}

  static async open(
    ref: RepositoryRef,
    access: RepositoryAccess,
    fetchImpl?: FetchImpl,
  ): Promise<RepositoryClient> {
    if (!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(ref.fullName)) {
      throw new GitHubError('Nom de dépôt invalide.', 0, 'invalid_repository');
    }
    const token = await installationToken(ref.installationId, ref.repositoryId, access, fetchImpl);
    return new RepositoryClient(token, ref.fullName, fetchImpl);
  }

  private call<T>(
    method: string,
    path: string,
    options: { body?: unknown; accept?: string; raw?: boolean } = {},
  ) {
    return request<T>(this.token, method, `/repos/${this.fullName}${path}`, {
      ...options,
      fetchImpl: this.fetchImpl,
    });
  }

  async repository(): Promise<InstallationRepository> {
    const { data } = await this.call<Parameters<typeof toRepository>[0]>('GET', '');
    if (!data) throw new GitHubError('Dépôt illisible.', 0, 'invalid_response');
    return toRepository(data);
  }

  /** SHA du dernier commit d'une branche, ou `null` si la branche n'existe pas. */
  async branchHead(branch: string): Promise<string | null> {
    try {
      const { data } = await this.call<{ object: { sha: string } }>(
        'GET',
        `/git/ref/heads/${encodePath(branch)}`,
      );
      return data?.object.sha ?? null;
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  async commit(sha: string): Promise<CommitInfo> {
    if (!SHA.test(sha)) throw new GitHubError('Identifiant de commit invalide.', 0, 'invalid_sha');
    const { data } = await this.call<{
      sha: string;
      message: string;
      tree: { sha: string };
      committer?: { date?: string };
      html_url: string;
    }>('GET', `/git/commits/${sha}`);
    if (!data) throw new GitHubError('Commit illisible.', 0, 'invalid_response');
    return {
      sha: data.sha,
      message: data.message,
      treeSha: data.tree.sha,
      committedAt: data.committer?.date ?? null,
      htmlUrl: data.html_url,
    };
  }

  /** Derniers commits d'une branche (plus recent d'abord). */
  async recentCommits(branch: string, count = 30): Promise<CommitInfo[]> {
    const { data } = await this.call<
      Array<{
        sha: string;
        html_url: string;
        commit: { message: string; tree: { sha: string }; committer?: { date?: string } };
      }>
    >(
      'GET',
      `/commits?sha=${encodeURIComponent(branch)}&per_page=${Math.min(Math.max(count, 1), 100)}`,
    );
    return (data ?? []).map((entry) => ({
      sha: entry.sha,
      message: entry.commit.message,
      treeSha: entry.commit.tree.sha,
      committedAt: entry.commit.committer?.date ?? null,
      htmlUrl: entry.html_url,
    }));
  }

  /** Contenu texte d'un fichier a une revision donnee, ou `null` s'il n'existe pas. */
  async readTextFile(path: string, ref: string): Promise<string | null> {
    try {
      const { text } = await this.call<never>(
        'GET',
        `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`,
        { accept: 'application/vnd.github.raw+json', raw: true },
      );
      return text;
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  /** Fichiers d'un dossier (nom -> empreinte Git), vide s'il n'existe pas. */
  async listDirectory(path: string, ref: string): Promise<Map<string, string>> {
    try {
      const target = path === '' || path === '.' ? '/contents' : `/contents/${encodePath(path)}`;
      const { data } = await this.call<Array<{ name: string; sha: string; type: string }>>(
        'GET',
        `${target}?ref=${encodeURIComponent(ref)}`,
      );
      const out = new Map<string, string>();
      if (Array.isArray(data)) {
        for (const entry of data) if (entry.type === 'file') out.set(entry.name, entry.sha);
      }
      return out;
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return new Map();
      throw error;
    }
  }

  /** Cree ou deplace une branche technique (apercus) sur un commit donne. */
  async setBranch(branch: string, sha: string): Promise<void> {
    const exists = (await this.branchHead(branch)) !== null;
    if (exists) {
      await this.call('PATCH', `/git/refs/heads/${encodePath(branch)}`, {
        body: { sha, force: true },
      });
    } else {
      await this.call('POST', '/git/refs', { body: { ref: `refs/heads/${branch}`, sha } });
    }
  }

  /**
   * Ecrit des fichiers en UN commit au sommet d'une branche.
   *
   * - Les fichiers deja identiques dans le depot ne sont pas renvoyes.
   * - La branche n'avance qu'en avance rapide (jamais de `force`) : un commit
   *   pousse entre-temps par le developpeur n'est jamais ecrase. Dans ce cas,
   *   l'operation est rejouee une fois au-dessus du nouveau sommet.
   */
  async commitFiles(input: {
    branch: string;
    files: readonly FileToWrite[];
    message: string;
    /** Sommet attendu ; a defaut, le sommet courant de la branche. */
    baseSha?: string | null;
    /** Branche technique : partir de ce commit, et deplacer la branche de force. */
    resetTo?: string | null;
  }): Promise<CommitResult> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const head = input.resetTo ?? (await this.branchHead(input.branch));
      if (!head)
        throw new GitHubError(
          `La branche « ${input.branch} » n’existe pas.`,
          404,
          'branch_not_found',
        );
      const base = await this.commit(head);

      // Seuls les fichiers qui changent sont envoyes.
      const changed: FileToWrite[] = [];
      const byDirectory = new Map<string, FileToWrite[]>();
      for (const file of input.files) {
        const slash = file.path.lastIndexOf('/');
        const directory = slash === -1 ? '' : file.path.slice(0, slash);
        byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), file]);
      }
      for (const [directory, files] of byDirectory) {
        const existing = await this.listDirectory(directory, head).catch(
          () => new Map<string, string>(),
        );
        for (const file of files) {
          const name = file.path.slice(file.path.lastIndexOf('/') + 1);
          const current = existing.get(name);
          if (!current || current !== (await gitBlobSha(file.content))) changed.push(file);
        }
      }
      if (changed.length === 0 && !input.resetTo) {
        return {
          commitSha: head,
          commitUrl: base.htmlUrl,
          baseSha: head,
          branch: input.branch,
          unchanged: true,
        };
      }

      const tree: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
      for (const file of changed) {
        const { data } = await this.call<{ sha: string }>('POST', '/git/blobs', {
          body:
            typeof file.content === 'string'
              ? { content: file.content, encoding: 'utf-8' }
              : { content: bytesToBase64(file.content), encoding: 'base64' },
        });
        if (!data?.sha) throw new GitHubError('Fichier refusé par GitHub.', 0, 'blob_failed');
        tree.push({ path: file.path, mode: '100644', type: 'blob', sha: data.sha });
      }

      const { data: treeData } = await this.call<{ sha: string }>('POST', '/git/trees', {
        body: { base_tree: base.treeSha, tree },
      });
      if (!treeData?.sha)
        throw new GitHubError('Arborescence refusée par GitHub.', 0, 'tree_failed');

      const { data: commitData } = await this.call<{ sha: string; html_url: string }>(
        'POST',
        '/git/commits',
        {
          body: { message: input.message, tree: treeData.sha, parents: [head] },
        },
      );
      if (!commitData?.sha) throw new GitHubError('Commit refusé par GitHub.', 0, 'commit_failed');

      try {
        if (input.resetTo) {
          await this.setBranch(input.branch, commitData.sha);
        } else {
          await this.call('PATCH', `/git/refs/heads/${encodePath(input.branch)}`, {
            body: { sha: commitData.sha, force: false },
          });
        }
        return {
          commitSha: commitData.sha,
          commitUrl: commitData.html_url,
          baseSha: head,
          branch: input.branch,
          unchanged: false,
        };
      } catch (error) {
        // 422 « Update is not a fast forward » : la branche a avance entre-temps.
        const raced = error instanceof GitHubError && error.status === 422 && !input.resetTo;
        if (!raced || attempt === 1) throw error;
      }
    }
    throw new GitHubError(
      'La branche change trop vite : publication abandonnée.',
      409,
      'branch_race',
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Messages de commit                                                         */
/* -------------------------------------------------------------------------- */

export function releaseCommitMessage(input: {
  version: number;
  kind: 'publish' | 'rollback' | 'import';
  releaseId: string;
  siteId: string;
  author: string | null;
  sourceVersion?: number | null;
}): string {
  const title =
    input.kind === 'rollback'
      ? `stax: restauration de la version ${input.sourceVersion ?? '?'} (version ${input.version})`
      : `stax: publication client ${String(input.version).padStart(5, '0')}`;
  const body = input.author ? `\n\nPubliée depuis StaX par ${input.author.slice(0, 120)}.` : '';
  return `${title}${body}\n\nStax-Release: ${input.releaseId}\nStax-Site: ${input.siteId}\nStax-Version: ${input.version}\n`;
}

export function previewCommitMessage(input: {
  siteId: string;
  deploymentId: string;
  revision: number;
}): string {
  return `stax: aperçu du brouillon (révision ${input.revision})\n\nStax-Preview: ${input.deploymentId}\nStax-Site: ${input.siteId}\n`;
}

/** Identifiant de version StaX porte par un message de commit, s'il y en a un. */
export function releaseIdFromMessage(message: string): string | null {
  const match = message.match(/^Stax-Release:\s*([0-9a-f-]{36})\s*$/m);
  return match?.[1] ?? null;
}
