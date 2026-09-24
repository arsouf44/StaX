#!/usr/bin/env node
/**
 * Faux GitHub et faux Cloudflare de la pile de bout en bout.
 *
 * La plateforme appelle ces services EXACTEMENT comme en production
 * (`GITHUB_API_BASE_URL`, `CLOUDFLARE_API_BASE_URL`) : jeton d'application
 * RS256, jeton d'installation limite a un depot, API Git Data (blobs, arbres,
 * commits, avance de branche), projets et deploiements Pages. Seul le reseau
 * est remplace — comme le stockage des fichiers par gateway.mjs.
 *
 * Ce qui est modelise, parce que la plateforme en depend :
 *   - l'avance d'une branche est refusee (422) si elle n'est pas rapide ;
 *   - chaque commit pousse sur une branche suivie par un projet Pages cree un
 *     deploiement, d'abord « en construction », puis reussi — ou en echec si
 *     le test l'a demande (`/__fake/projects/:name/fail-next`) ;
 *   - les empreintes de fichiers sont de vraies empreintes Git (blob SHA-1).
 *
 * Points de controle, pour les tests uniquement : `/__fake/*`.
 *
 * Usage :
 *   node providers.mjs serve        (PROVIDERS_PORT, defaut 54350)
 *   node providers.mjs keys         (cle privee de l'application, en base64)
 */
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PROVIDERS_PORT ?? 54350);

if (process.argv[2] === 'keys') {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  process.stdout.write(`GITHUB_APP_PRIVATE_KEY=${Buffer.from(privateKey).toString('base64')}\n`);
  process.exit(0);
}

/* -------------------------------------------------------------------------- */
/*  Etat                                                                       */
/* -------------------------------------------------------------------------- */

const sha1 = (value) => createHash('sha1').update(value).digest('hex');
const blobSha = (content) => {
  const bytes = Buffer.from(content);
  return sha1(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]));
};

/** installationId -> { id, account: { login, id, type } } */
const installations = new Map();
/** fullName (minuscules) -> repository */
const repositories = new Map();
/** nom de projet -> project */
const projects = new Map();
/** Jetons d'installation delivres -> { installationId, repositoryIds, permissions } */
const tokens = new Map();
/** Journal des appels ecrivant dans un depot (pour les assertions). */
const writes = [];

function reset() {
  installations.clear();
  repositories.clear();
  projects.clear();
  tokens.clear();
  writes.length = 0;
}

function now() {
  return new Date().toISOString();
}

function createRepository({ installationId, accountLogin, accountId, repositoryId, name, files }) {
  if (!installations.has(installationId)) {
    installations.set(installationId, {
      id: installationId,
      account: { login: accountLogin, id: accountId, type: 'Organization' },
    });
  }
  const fullName = `${accountLogin}/${name}`;
  const repository = {
    id: repositoryId,
    name,
    fullName,
    ownerLogin: accountLogin,
    ownerId: accountId,
    installationId,
    branches: new Map(),
    commits: new Map(),
    blobs: new Map(),
    trees: new Map(),
  };
  const tree = {};
  for (const [path, content] of Object.entries(files)) {
    const sha = blobSha(content);
    repository.blobs.set(sha, Buffer.from(content));
    tree[path] = sha;
  }
  const treeSha = sha1(JSON.stringify(tree));
  repository.trees.set(treeSha, tree);
  const commitSha = sha1(`initial ${fullName} ${randomBytes(8).toString('hex')}`);
  repository.commits.set(commitSha, {
    sha: commitSha,
    message: 'Site développé par l’équipe StaX',
    tree: treeSha,
    parents: [],
    date: now(),
  });
  repository.branches.set('main', commitSha);
  repositories.set(fullName.toLowerCase(), repository);
  return repository;
}

function fileAt(repository, commitSha, path) {
  const commit = repository.commits.get(commitSha);
  if (!commit) return null;
  const tree = repository.trees.get(commit.tree) ?? {};
  const sha = tree[path];
  return sha ? repository.blobs.get(sha) : null;
}

/** Un commit arrive sur une branche : les projets qui la suivent deploient. */
function onBranchMoved(repository, branch, commitSha) {
  for (const project of projects.values()) {
    if (project.repository !== repository.fullName.toLowerCase()) continue;
    const environment = branch === project.productionBranch ? 'production' : 'preview';
    const failing = project.failNext > 0;
    if (failing) project.failNext -= 1;
    project.deployments.unshift({
      id: randomBytes(16)
        .toString('hex')
        .replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-'),
      environment,
      branch,
      commit: commitSha,
      created: now(),
      reads: 0,
      outcome: failing ? 'failure' : 'success',
      aliases: environment === 'preview' ? [`https://${branch}.${project.subdomain}`] : null,
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  HTTP                                                                       */
/* -------------------------------------------------------------------------- */

function send(response, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  response.writeHead(status, {
    'content-type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json',
    ...headers,
  });
  response.end(payload);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function bearer(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.authorization ?? '');
  return match ? match[1] : null;
}

const isJwt = (value) => typeof value === 'string' && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(value);

/* ---------------------------- GitHub -------------------------------------- */

function rawRepository(repository) {
  return {
    id: repository.id,
    name: repository.name,
    full_name: repository.fullName,
    owner: { login: repository.ownerLogin, id: repository.ownerId },
    html_url: `https://github.com/${repository.fullName}`,
    default_branch: 'main',
    private: true,
    archived: false,
  };
}

function rawCommit(repository, commit) {
  return {
    sha: commit.sha,
    message: commit.message,
    tree: { sha: commit.tree },
    committer: { date: commit.date },
    html_url: `https://github.com/${repository.fullName}/commit/${commit.sha}`,
  };
}

async function github(request, response, path, url) {
  const method = request.method ?? 'GET';
  const token = bearer(request);

  // --- Application (JWT RS256) -------------------------------------------
  if (path === '/app/installations' && method === 'GET') {
    if (!isJwt(token)) return send(response, 401, { message: 'Bad credentials' });
    return send(
      response,
      200,
      [...installations.values()].map((installation) => ({
        id: installation.id,
        account: installation.account,
        repository_selection: 'selected',
        suspended_at: null,
      })),
    );
  }
  let match = /^\/app\/installations\/(\d+)$/.exec(path);
  if (match && method === 'GET') {
    if (!isJwt(token)) return send(response, 401, { message: 'Bad credentials' });
    const installation = installations.get(Number(match[1]));
    if (!installation) return send(response, 404, { message: 'Not Found' });
    return send(response, 200, {
      id: installation.id,
      account: installation.account,
      repository_selection: 'selected',
      suspended_at: null,
    });
  }
  match = /^\/app\/installations\/(\d+)\/access_tokens$/.exec(path);
  if (match && method === 'POST') {
    if (!isJwt(token)) return send(response, 401, { message: 'Bad credentials' });
    const installationId = Number(match[1]);
    if (!installations.has(installationId)) return send(response, 404, { message: 'Not Found' });
    const body = (await readBody(request)) ?? {};
    const issued = `ghs_${randomBytes(18).toString('hex')}`;
    tokens.set(issued, {
      installationId,
      repositoryIds: Array.isArray(body.repository_ids) ? body.repository_ids : null,
      permissions: body.permissions ?? {},
    });
    return send(response, 201, {
      token: issued,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    });
  }

  // --- Jeton d'installation ------------------------------------------------
  const grant = token ? tokens.get(token) : null;
  if (!grant) return send(response, 401, { message: 'Bad credentials' });

  if (path === '/installation/repositories' && method === 'GET') {
    const page = Number(url.searchParams.get('page') ?? '1');
    const list = [...repositories.values()].filter(
      (repository) => repository.installationId === grant.installationId,
    );
    return send(response, 200, {
      total_count: list.length,
      repositories: page === 1 ? list.map(rawRepository) : [],
    });
  }

  match = /^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/.exec(path);
  if (!match) return send(response, 404, { message: 'Not Found' });
  const repository = repositories.get(`${match[1]}/${match[2]}`.toLowerCase());
  if (!repository || repository.installationId !== grant.installationId) {
    return send(response, 404, { message: 'Not Found' });
  }
  // Un jeton restreint a d'autres depots ne voit pas celui-ci.
  if (grant.repositoryIds && !grant.repositoryIds.includes(repository.id)) {
    return send(response, 404, { message: 'Not Found' });
  }
  const rest = match[3] ?? '';
  const canWrite = grant.permissions?.contents === 'write';

  if (rest === '' && method === 'GET') return send(response, 200, rawRepository(repository));

  match = /^\/git\/ref\/heads\/(.+)$/.exec(rest);
  if (match && method === 'GET') {
    const head = repository.branches.get(decodeURIComponent(match[1]));
    if (!head) return send(response, 404, { message: 'Not Found' });
    return send(response, 200, { ref: `refs/heads/${match[1]}`, object: { sha: head } });
  }

  match = /^\/git\/commits\/([0-9a-f]{40})$/.exec(rest);
  if (match && method === 'GET') {
    const commit = repository.commits.get(match[1]);
    if (!commit) return send(response, 404, { message: 'Not Found' });
    return send(response, 200, rawCommit(repository, commit));
  }

  if (rest === '/commits' && method === 'GET') {
    const branch = url.searchParams.get('sha') ?? 'main';
    const limit = Number(url.searchParams.get('per_page') ?? '30');
    const out = [];
    let cursor = repository.branches.get(branch);
    while (cursor && out.length < limit) {
      const commit = repository.commits.get(cursor);
      if (!commit) break;
      out.push({
        sha: commit.sha,
        html_url: `https://github.com/${repository.fullName}/commit/${commit.sha}`,
        commit: {
          message: commit.message,
          tree: { sha: commit.tree },
          committer: { date: commit.date },
        },
      });
      cursor = commit.parents[0];
    }
    return send(response, 200, out);
  }

  match = /^\/contents(?:\/(.*))?$/.exec(rest);
  if (match && method === 'GET') {
    const path = decodeURIComponent(match[1] ?? '');
    const ref = url.searchParams.get('ref') ?? 'main';
    const commitSha = /^[0-9a-f]{40}$/.test(ref) ? ref : repository.branches.get(ref);
    const commit = commitSha ? repository.commits.get(commitSha) : null;
    if (!commit) return send(response, 404, { message: 'Not Found' });
    const tree = repository.trees.get(commit.tree) ?? {};
    if (tree[path]) {
      const content = repository.blobs.get(tree[path]);
      if ((request.headers.accept ?? '').includes('raw')) {
        return send(response, 200, content.toString('utf8'));
      }
      return send(response, 200, {
        type: 'file',
        name: path.split('/').pop(),
        path,
        sha: tree[path],
        content: content.toString('base64'),
        encoding: 'base64',
      });
    }
    const prefix = path ? `${path}/` : '';
    const entries = Object.entries(tree)
      .filter(([file]) => file.startsWith(prefix) && !file.slice(prefix.length).includes('/'))
      .map(([file, sha]) => ({ type: 'file', name: file.slice(prefix.length), path: file, sha }));
    if (entries.length === 0) return send(response, 404, { message: 'Not Found' });
    return send(response, 200, entries);
  }

  // --- Ecritures : jeton en ecriture uniquement ----------------------------
  if (method !== 'GET' && !canWrite) {
    return send(response, 403, { message: 'Resource not accessible by integration' });
  }
  const body = (await readBody(request)) ?? {};

  if (rest === '/git/blobs' && method === 'POST') {
    const content =
      body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : Buffer.from(body.content);
    const sha = blobSha(content);
    repository.blobs.set(sha, content);
    return send(response, 201, { sha });
  }
  if (rest === '/git/trees' && method === 'POST') {
    const base = body.base_tree ? (repository.trees.get(body.base_tree) ?? {}) : {};
    const tree = { ...base };
    for (const entry of body.tree ?? []) tree[entry.path] = entry.sha;
    const sha = sha1(JSON.stringify(tree));
    repository.trees.set(sha, tree);
    return send(response, 201, { sha });
  }
  if (rest === '/git/commits' && method === 'POST') {
    const sha = sha1(
      `${body.tree}:${(body.parents ?? []).join(',')}:${body.message}:${Date.now()}`,
    );
    repository.commits.set(sha, {
      sha,
      message: body.message,
      tree: body.tree,
      parents: body.parents ?? [],
      date: now(),
    });
    return send(response, 201, {
      sha,
      html_url: `https://github.com/${repository.fullName}/commit/${sha}`,
    });
  }
  match = /^\/git\/refs\/heads\/(.+)$/.exec(rest);
  if (match && method === 'PATCH') {
    const branch = decodeURIComponent(match[1]);
    const head = repository.branches.get(branch);
    const commit = repository.commits.get(body.sha);
    if (!head || !commit) return send(response, 422, { message: 'Reference does not exist' });
    if (!body.force && !commit.parents.includes(head)) {
      return send(response, 422, { message: 'Update is not a fast forward' });
    }
    repository.branches.set(branch, body.sha);
    writes.push({
      repository: repository.fullName,
      branch,
      sha: body.sha,
      force: Boolean(body.force),
      message: commit.message,
    });
    onBranchMoved(repository, branch, body.sha);
    return send(response, 200, { ref: `refs/heads/${branch}`, object: { sha: body.sha } });
  }
  if (rest === '/git/refs' && method === 'POST') {
    const branch = String(body.ref ?? '').replace(/^refs\/heads\//, '');
    if (repository.branches.has(branch))
      return send(response, 422, { message: 'Reference already exists' });
    repository.branches.set(branch, body.sha);
    writes.push({
      repository: repository.fullName,
      branch,
      sha: body.sha,
      force: false,
      message: 'branch',
    });
    onBranchMoved(repository, branch, body.sha);
    return send(response, 201, { ref: `refs/heads/${branch}`, object: { sha: body.sha } });
  }

  return send(response, 404, { message: 'Not Found' });
}

/* ---------------------------- Cloudflare ---------------------------------- */

const ok = (result) => ({ success: true, errors: [], messages: [], result });

function rawDeployment(project, deployment) {
  // Premier regard : « en construction » ; ensuite, l'issue du build.
  deployment.reads += 1;
  const finished = deployment.reads > 1;
  const stage = finished
    ? { name: 'deploy', status: deployment.outcome === 'success' ? 'success' : 'failure' }
    : { name: 'build', status: 'active' };
  if (finished && deployment.outcome === 'failure') stage.name = 'build';
  return {
    id: deployment.id,
    environment: deployment.environment,
    url: `https://${deployment.id.slice(0, 8)}.${project.subdomain}`,
    created_on: deployment.created,
    modified_on: deployment.created,
    aliases: deployment.aliases,
    is_skipped: false,
    latest_stage: {
      name: stage.name,
      status: stage.status,
      started_on: deployment.created,
      ended_on: finished ? now() : null,
    },
    deployment_trigger: {
      type: 'github:push',
      metadata: { branch: deployment.branch, commit_hash: deployment.commit },
    },
  };
}

async function cloudflare(request, response, path, url) {
  if (!bearer(request)) {
    return send(response, 403, {
      success: false,
      errors: [{ code: 10000, message: 'Authentication error' }],
    });
  }
  const method = request.method ?? 'GET';
  let match = /^\/accounts\/([0-9a-f]{32})\/pages\/projects\/([a-z0-9-]+)(\/.*)?$/.exec(path);
  if (!match) return send(response, 404, { success: false, errors: [{ message: 'Not Found' }] });
  const project = projects.get(match[2]);
  if (!project || project.accountId !== match[1]) {
    return send(response, 404, {
      success: false,
      errors: [{ code: 8000007, message: 'Project not found' }],
    });
  }
  const rest = match[3] ?? '';
  const [owner, name] = project.repository.split('/');

  if (rest === '' && method === 'GET') {
    return send(
      response,
      200,
      ok({
        id: project.id,
        name: project.name,
        subdomain: project.subdomain,
        production_branch: project.productionBranch,
        domains: project.domains.map((domain) => domain.name),
        source: {
          type: 'github',
          config: {
            owner,
            repo_name: name,
            deployments_enabled: true,
            production_deployments_enabled: true,
          },
        },
      }),
    );
  }
  if (rest === '/deployments' && method === 'GET') {
    const environment = url.searchParams.get('env') ?? 'production';
    return send(
      response,
      200,
      ok(
        project.deployments
          .filter((deployment) => deployment.environment === environment)
          .slice(0, 15)
          .map((deployment) => rawDeployment(project, deployment)),
      ),
    );
  }
  match = /^\/deployments\/([0-9a-f-]+)\/history\/logs$/.exec(rest);
  if (match && method === 'GET') {
    return send(
      response,
      200,
      ok({ data: [{ line: 'npm run build' }, { line: 'Error: build failed (simulated)' }] }),
    );
  }
  match = /^\/deployments\/([0-9a-f-]+)\/retry$/.exec(rest);
  if (match && method === 'POST') {
    const original = project.deployments.find((deployment) => deployment.id === match[1]);
    if (!original)
      return send(response, 404, { success: false, errors: [{ message: 'Not Found' }] });
    const copy = {
      ...original,
      id: randomBytes(16).toString('hex'),
      created: now(),
      reads: 0,
      outcome: 'success',
    };
    project.deployments.unshift(copy);
    return send(response, 200, ok({ id: copy.id }));
  }
  if (rest === '/domains' && method === 'GET') {
    return send(response, 200, ok(project.domains));
  }
  if (rest === '/domains' && method === 'POST') {
    const body = (await readBody(request)) ?? {};
    project.domains.push({ name: body.name, status: 'active' });
    return send(response, 200, ok({ name: body.name, status: 'active' }));
  }
  return send(response, 404, { success: false, errors: [{ message: 'Not Found' }] });
}

/* ---------------------------- Controle ------------------------------------ */

async function control(request, response, path) {
  const method = request.method ?? 'GET';
  if (path === '/__fake/reset' && method === 'POST') {
    reset();
    return send(response, 200, { ok: true });
  }
  if (path === '/__fake/repositories' && method === 'POST') {
    const body = (await readBody(request)) ?? {};
    const repository = createRepository(body);
    return send(response, 201, {
      fullName: repository.fullName,
      head: repository.branches.get('main'),
    });
  }
  if (path === '/__fake/projects' && method === 'POST') {
    const body = (await readBody(request)) ?? {};
    const repository = repositories.get(String(body.repository).toLowerCase());
    if (!repository) return send(response, 404, { error: 'repository' });
    const project = {
      id: randomBytes(16).toString('hex'),
      name: body.name,
      accountId: body.accountId,
      subdomain: `${body.name}.pages.dev`,
      productionBranch: 'main',
      repository: repository.fullName.toLowerCase(),
      deployments: [],
      domains: (body.domains ?? []).map((name) => ({ name, status: 'active' })),
      failNext: 0,
    };
    projects.set(project.name, project);
    // Le site est deja en ligne : son commit actuel est deploye.
    onBranchMoved(repository, 'main', repository.branches.get('main'));
    // Deja construit et en ligne avant que StaX ne le regarde.
    const initial = project.deployments[0];
    initial.reads = 2;
    return send(response, 201, {
      id: project.id,
      productionUrl: `https://${project.subdomain}/`,
      deploymentId: initial.id,
      deploymentUrl: `https://${initial.id.slice(0, 8)}.${project.subdomain}`,
    });
  }
  let match = /^\/__fake\/projects\/([a-z0-9-]+)\/fail-next$/.exec(path);
  if (match && method === 'POST') {
    const project = projects.get(match[1]);
    if (!project) return send(response, 404, { error: 'project' });
    project.failNext += 1;
    return send(response, 200, { ok: true });
  }
  // « Requete HTTP sur le site en ligne » : le fichier de contenu du dernier
  // deploiement de production REUSSI et termine.
  match = /^\/__fake\/projects\/([a-z0-9-]+)\/live$/.exec(path);
  if (match && method === 'GET') {
    const project = projects.get(match[1]);
    if (!project) return send(response, 404, { error: 'project' });
    const live = project.deployments.find(
      (deployment) =>
        deployment.environment === 'production' &&
        deployment.outcome === 'success' &&
        deployment.reads > 1,
    );
    if (!live) return send(response, 404, { error: 'nothing live' });
    const repository = repositories.get(project.repository);
    const file = new URL(`http://x${request.url}`).searchParams.get('file') ?? '';
    const content = fileAt(repository, live.commit, file);
    return send(response, 200, {
      commit: live.commit,
      deploymentId: live.id,
      content: content ? content.toString('utf8') : null,
    });
  }
  match = /^\/__fake\/repositories\/([^/]+)\/([^/]+)$/.exec(path);
  if (match && method === 'GET') {
    const repository = repositories.get(`${match[1]}/${match[2]}`.toLowerCase());
    if (!repository) return send(response, 404, { error: 'repository' });
    const commits = [];
    let cursor = repository.branches.get('main');
    while (cursor) {
      const commit = repository.commits.get(cursor);
      if (!commit) break;
      commits.push({ sha: commit.sha, message: commit.message });
      cursor = commit.parents[0];
    }
    return send(response, 200, {
      branches: Object.fromEntries(repository.branches),
      commits,
      writes: writes.filter((write) => write.repository === repository.fullName),
    });
  }
  return send(response, 404, { error: 'unknown control' });
}

/* -------------------------------------------------------------------------- */

if (process.argv[2] === 'serve') {
  createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
      const path = url.pathname;
      if (path === '/health') return send(response, 200, { ok: true });
      if (path.startsWith('/__fake/')) return await control(request, response, path);
      if (path.startsWith('/github/')) return await github(request, response, path.slice(7), url);
      if (path.startsWith('/cloudflare/client/v4/')) {
        return await cloudflare(request, response, path.slice('/cloudflare/client/v4'.length), url);
      }
      return send(response, 404, { message: 'Not Found' });
    } catch (error) {
      send(response, 500, { message: error instanceof Error ? error.message : 'error' });
    }
  }).listen(PORT, '127.0.0.1', () => {
    process.stdout.write(`Faux GitHub et Cloudflare sur http://127.0.0.1:${PORT}\n`);
  });
}
