import { createHmac, generateKeyPairSync, verify } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearEnvSource, resetEnvCache, setEnvSource } from '@stax/config';
import {
  createAppJwt,
  GitHubError,
  pagesDeploymentStatus,
  RepositoryClient,
  resetGitHubTokenCache,
  verifyCloudflareWebhook,
  verifyCronSecret,
  verifyGitHubSignature,
  workersBuildStatus,
} from '@stax/infrastructure';
import { bridgeScript } from '@stax/site-contract';
import { POST as githubWebhook } from '~/app/api/webhooks/github/route';
import { POST as cloudflareWebhook } from '~/app/api/webhooks/cloudflare/route';
import { GET as cronSites } from '~/app/api/cron/sites/route';

/**
 * Sites independants : ce qui protege le lien entre StaX, GitHub et Cloudflare.
 *
 *  - un webhook falsifie est refuse AVANT toute lecture, par la vraie route ;
 *  - le jeton GitHub est limite a UN depot et au strict necessaire ;
 *  - la branche de production n'avance qu'en avance rapide, jamais en force ;
 *  - un echec GitHub ou Cloudflare n'est jamais lu comme un succes ;
 *  - aucun secret GitHub, Cloudflare ou Stripe n'atteint le navigateur.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const WEBHOOK_SECRET = 'whsec-github-de-test-0123456789';
const CLOUDFLARE_SECRET = 'cf-destination-secret-0123456789';
const CRON_SECRET = 'cron-secret-de-test-0123456789';

function installEnv(extra: Record<string, string> = {}) {
  setEnvSource({
    GITHUB_APP_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CLOUDFLARE_WEBHOOK_SECRET: CLOUDFLARE_SECRET,
    CRON_SECRET,
    // Aucune base : une requete authentique s'arrete a « indisponible ».
    SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
    SUPABASE_SECRET_KEY: '',
    SUPABASE_SERVICE_KEY: '',
    ...extra,
  });
  resetEnvCache();
}

afterEach(() => {
  clearEnvSource();
  resetEnvCache();
  resetGitHubTokenCache();
});

/* -------------------------------------------------------------------------- */
/*  Webhooks                                                                   */
/* -------------------------------------------------------------------------- */

const sign = (body: string, secret = WEBHOOK_SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('webhook GitHub', () => {
  const body = JSON.stringify({ action: 'completed', repository: { id: 42 } });

  it('accepte la signature HMAC calculée sur le corps brut', async () => {
    expect(await verifyGitHubSignature(body, sign(body), WEBHOOK_SECRET)).toBe(true);
  });

  it('refuse une signature absente, forgée, d’un autre secret ou d’un corps modifié', async () => {
    expect(await verifyGitHubSignature(body, null, WEBHOOK_SECRET)).toBe(false);
    expect(await verifyGitHubSignature(body, 'sha256=' + '0'.repeat(64), WEBHOOK_SECRET)).toBe(
      false,
    );
    expect(
      await verifyGitHubSignature(body, sign(body, 'un-autre-secret-123456'), WEBHOOK_SECRET),
    ).toBe(false);
    expect(await verifyGitHubSignature(`${body} `, sign(body), WEBHOOK_SECRET)).toBe(false);
    // Ancien format SHA-1 : jamais accepte.
    const sha1 = `sha1=${createHmac('sha1', WEBHOOK_SECRET).update(body).digest('hex')}`;
    expect(await verifyGitHubSignature(body, sha1, WEBHOOK_SECRET)).toBe(false);
  });

  it('refuse tout quand le secret n’est pas configuré (ou trop court)', async () => {
    expect(await verifyGitHubSignature(body, sign(body, ''), '')).toBe(false);
    expect(await verifyGitHubSignature(body, sign(body, 'court'), 'court')).toBe(false);
  });

  it('la route répond 401 à une livraison falsifiée, sans rien traiter', async () => {
    installEnv();
    const forged = await githubWebhook(
      new Request('https://stax.test/api/webhooks/github', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': sign(body, 'secret-de-l-attaquant-123'),
          'x-github-event': 'check_suite',
          'x-github-delivery': '0f0e0d0c-0b0a-0908-0706-050403020100',
        },
        body,
      }),
    );
    expect(forged.status).toBe(401);

    const unsigned = await githubWebhook(
      new Request('https://stax.test/api/webhooks/github', { method: 'POST', body }),
    );
    expect(unsigned.status).toBe(401);
  });

  it('la route laisse passer une livraison authentique jusqu’au traitement', async () => {
    installEnv();
    const genuine = await githubWebhook(
      new Request('https://stax.test/api/webhooks/github', {
        method: 'POST',
        headers: {
          'x-hub-signature-256': sign(body),
          'x-github-event': 'check_suite',
          'x-github-delivery': '0f0e0d0c-0b0a-0908-0706-050403020100',
        },
        body,
      }),
    );
    // Sans base dans ce test : « indisponible », mais PAS « non authentifie ».
    expect(genuine.status).toBe(503);
  });
});

describe('notifications Cloudflare et tâche de fond', () => {
  it('comparent le secret à temps constant et refusent tout le reste', () => {
    expect(verifyCloudflareWebhook(CLOUDFLARE_SECRET, CLOUDFLARE_SECRET)).toBe(true);
    expect(verifyCloudflareWebhook(null, CLOUDFLARE_SECRET)).toBe(false);
    expect(verifyCloudflareWebhook(`${CLOUDFLARE_SECRET}x`, CLOUDFLARE_SECRET)).toBe(false);
    expect(verifyCloudflareWebhook('', '')).toBe(false);

    expect(verifyCronSecret(`Bearer ${CRON_SECRET}`, CRON_SECRET)).toBe(true);
    expect(verifyCronSecret(CRON_SECRET, CRON_SECRET)).toBe(false);
    expect(verifyCronSecret('Bearer mauvais-secret-0123456789', CRON_SECRET)).toBe(false);
    expect(verifyCronSecret(null, CRON_SECRET)).toBe(false);
  });

  it('les routes répondent 401 sans le bon secret', async () => {
    installEnv();
    const payload = JSON.stringify({ data: { project_name: 'atelier-x' } });
    for (const header of [null, 'secret-devine-0123456789']) {
      const response = await cloudflareWebhook(
        new Request('https://stax.test/api/webhooks/cloudflare', {
          method: 'POST',
          headers: header ? { 'cf-webhook-auth': header } : {},
          body: payload,
        }),
      );
      expect(response.status).toBe(401);
    }

    for (const header of [null, 'Bearer mauvais-secret-0123456789', CRON_SECRET]) {
      const response = await cronSites(
        new Request('https://stax.test/api/cron/sites', {
          headers: header ? { authorization: header } : {},
        }),
      );
      expect(response.status).toBe(401);
    }
  });
});

/* -------------------------------------------------------------------------- */
/*  Application GitHub : jetons et commits                                      */
/* -------------------------------------------------------------------------- */

interface Recorded {
  method: string;
  path: string;
  authorization: string | null;
  body: Record<string, unknown> | null;
}

const HEAD = 'a'.repeat(40);
const RACED_HEAD = 'b'.repeat(40);
const NEW_COMMIT = 'c'.repeat(40);

/**
 * Faux GitHub : repond aux appels de l'API Git Data et enregistre tout ce que
 * StaX lui envoie. `refUpdate` decide de la reponse a l'avance de branche.
 */
function fakeGitHub(options: { refUpdate: (attempt: number) => number }) {
  const calls: Recorded[] = [];
  let refAttempts = 0;
  let head = HEAD;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const headers = new Headers(init?.headers);
    calls.push({ method, path: url.pathname, authorization: headers.get('authorization'), body });
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    if (method === 'POST' && url.pathname.endsWith('/access_tokens')) {
      return json(201, {
        token: 'ghs_jeton_de_test',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      });
    }
    if (method === 'GET' && url.pathname.endsWith('/git/ref/heads/main')) {
      return json(200, { object: { sha: head } });
    }
    if (method === 'GET' && url.pathname.includes('/git/commits/')) {
      const sha = url.pathname.split('/').pop() ?? '';
      return json(200, {
        sha,
        message: 'x',
        tree: { sha: 'd'.repeat(40) },
        html_url: `https://github.com/c/${sha}`,
      });
    }
    if (method === 'GET' && url.pathname.includes('/contents')) return json(200, []);
    if (method === 'POST' && url.pathname.endsWith('/git/blobs'))
      return json(201, { sha: 'e'.repeat(40) });
    if (method === 'POST' && url.pathname.endsWith('/git/trees'))
      return json(201, { sha: 'f'.repeat(40) });
    if (method === 'POST' && url.pathname.endsWith('/git/commits')) {
      return json(201, { sha: NEW_COMMIT, html_url: `https://github.com/c/${NEW_COMMIT}` });
    }
    if (method === 'PATCH' && url.pathname.endsWith('/git/refs/heads/main')) {
      refAttempts += 1;
      const status = options.refUpdate(refAttempts);
      if (status === 422) {
        // Le developpeur a pousse entre-temps : la branche a avance.
        head = RACED_HEAD;
        return json(422, { message: 'Update is not a fast forward' });
      }
      return status >= 400
        ? json(status, { message: 'indisponible' })
        : json(200, { object: { sha: NEW_COMMIT } });
    }
    return json(404, { message: 'Not Found' });
  }) as typeof fetch;

  return { calls, fetchImpl };
}

describe('application GitHub', () => {
  let publicKey = '';

  beforeEach(() => {
    const pair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    publicKey = pair.publicKey;
    installEnv({ GITHUB_APP_ID: '424242', GITHUB_APP_PRIVATE_KEY: pair.privateKey });
  });

  it('signe un jeton d’application RS256 valide, de moins de dix minutes', async () => {
    const jwt = await createAppJwt();
    const [header = '', payload = '', signature = ''] = jwt.split('.');
    const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    const claims = decode(payload) as { iss: string; iat: number; exp: number };
    expect(claims.iss).toBe('424242');
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('demande un jeton limité à UN dépôt, avec les seules permissions utiles', async () => {
    const github = fakeGitHub({ refUpdate: () => 200 });
    await RepositoryClient.open(
      { installationId: 7, repositoryId: 99, fullName: 'stax-sites/atelier-x' },
      'write',
      github.fetchImpl,
    );
    const tokenCall = github.calls.find((call) => call.path.endsWith('/access_tokens'));
    expect(tokenCall?.path).toBe('/app/installations/7/access_tokens');
    expect(tokenCall?.body).toEqual({
      repository_ids: [99],
      permissions: { contents: 'write', metadata: 'read' },
    });
    expect(tokenCall?.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('publie en avance rapide, jamais en force, sur la branche de production', async () => {
    const github = fakeGitHub({ refUpdate: () => 200 });
    const repo = await RepositoryClient.open(
      { installationId: 7, repositoryId: 99, fullName: 'stax-sites/atelier-x' },
      'write',
      github.fetchImpl,
    );
    const result = await repo.commitFiles({
      branch: 'main',
      files: [{ path: 'content/stax.content.json', content: '{"pages":{}}' }],
      message: 'stax: publication client v2',
    });
    expect(result).toMatchObject({ commitSha: NEW_COMMIT, baseSha: HEAD, unchanged: false });

    const refUpdates = github.calls.filter((call) => call.method === 'PATCH');
    expect(refUpdates).toHaveLength(1);
    expect(refUpdates[0]?.body).toEqual({ sha: NEW_COMMIT, force: false });
    // Le jeton d'installation, jamais le JWT de l'application, ecrit dans le depot.
    expect(refUpdates[0]?.authorization).toBe('Bearer ghs_jeton_de_test');
  });

  it('rejoue au-dessus du nouveau sommet si le développeur a poussé entre-temps', async () => {
    const github = fakeGitHub({ refUpdate: (attempt) => (attempt === 1 ? 422 : 200) });
    const repo = await RepositoryClient.open(
      { installationId: 7, repositoryId: 99, fullName: 'stax-sites/atelier-x' },
      'write',
      github.fetchImpl,
    );
    const result = await repo.commitFiles({
      branch: 'main',
      files: [{ path: 'content/stax.content.json', content: '{"pages":{}}' }],
      message: 'stax: publication client v3',
    });
    expect(result.baseSha).toBe(RACED_HEAD);
    const commits = github.calls.filter(
      (call) => call.method === 'POST' && call.path.endsWith('/git/commits'),
    );
    expect(commits.at(-1)?.body?.['parents']).toEqual([RACED_HEAD]);
    expect(github.calls.every((call) => call.body?.['force'] !== true)).toBe(true);
  });

  it('un refus de GitHub est une erreur, jamais un commit réussi', async () => {
    const github = fakeGitHub({ refUpdate: () => 503 });
    const repo = await RepositoryClient.open(
      { installationId: 7, repositoryId: 99, fullName: 'stax-sites/atelier-x' },
      'write',
      github.fetchImpl,
    );
    await expect(
      repo.commitFiles({
        branch: 'main',
        files: [{ path: 'content/stax.content.json', content: '{"pages":{}}' }],
        message: 'stax: publication client v4',
      }),
    ).rejects.toBeInstanceOf(GitHubError);
  });

  it('refuse un nom de dépôt forgé avant tout appel', async () => {
    const github = fakeGitHub({ refUpdate: () => 200 });
    await expect(
      RepositoryClient.open(
        { installationId: 7, repositoryId: 99, fullName: '../../orgs/autre/repos' },
        'write',
        github.fetchImpl,
      ),
    ).rejects.toBeInstanceOf(GitHubError);
    expect(github.calls).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/*  Cloudflare : seul un deploiement reussi est un succes                       */
/* -------------------------------------------------------------------------- */

describe('état des déploiements Cloudflare', () => {
  type Pages = Parameters<typeof pagesDeploymentStatus>[0];
  type Workers = Parameters<typeof workersBuildStatus>[0];
  const pages = (name: string, status: string, extra: Partial<Pages> = {}) =>
    pagesDeploymentStatus({ id: 'd', latest_stage: { name, status }, ...extra } as Pages);

  it('Pages : seule l’étape « deploy » réussie vaut succès', () => {
    expect(pages('deploy', 'success')).toBe('success');
    expect(pages('build', 'success')).not.toBe('success');
    expect(pages('deploy', 'active')).toBe('deploying');
    expect(pages('build', 'active')).toBe('building');
    expect(pages('build', 'failure')).toBe('failure');
    expect(pages('deploy', 'failure')).toBe('failure');
    expect(pages('build', 'canceled')).toBe('canceled');
    expect(pages('deploy', 'success', { is_skipped: true } as Partial<Pages>)).toBe('skipped');
  });

  it('Workers Builds : un build arrêté sans issue explicite est un échec', () => {
    const build = (status: string, outcome: string | null) =>
      workersBuildStatus({ build_uuid: 'b', status, build_outcome: outcome } as Workers);
    expect(build('stopped', 'success')).toBe('success');
    expect(build('stopped', 'fail')).toBe('failure');
    expect(build('stopped', null)).toBe('failure');
    expect(build('stopped', 'cancelled')).toBe('canceled');
    expect(build('running', null)).toBe('building');
    expect(build('queued', null)).toBe('queued');
  });
});

/* -------------------------------------------------------------------------- */
/*  Aucun secret cote navigateur                                               */
/* -------------------------------------------------------------------------- */

function sourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, files);
    else if (/\.(ts|tsx)$/.test(full)) files.push(full);
  }
  return files;
}

const SERVER_SECRETS = [
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_APP_WEBHOOK_SECRET',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_WEBHOOK_SECRET',
  'CRON_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];

describe('aucun secret GitHub, Cloudflare ou Stripe côté navigateur', () => {
  const platform = sourceFiles(join(ROOT, 'apps/platform/src'));
  const clientFiles = platform.filter((file) =>
    /^\s*['"]use client['"]/.test(readFileSync(file, 'utf8')),
  );

  it('recense bien des composants client', () => {
    expect(clientFiles.length).toBeGreaterThan(20);
  });

  it('aucun composant client ne lit l’environnement ni les modules d’infrastructure', () => {
    const offenders: string[] = [];
    for (const file of clientFiles) {
      const source = readFileSync(file, 'utf8');
      const relative = file.slice(ROOT.length);
      if (/process\.env\.(?!NEXT_PUBLIC_)/.test(source))
        offenders.push(`${relative} : process.env`);
      if (/from ['"]@stax\/infrastructure['"]/.test(source))
        offenders.push(`${relative} : @stax/infrastructure`);
      if (/^import (?!type)[^;]*from ['"]@stax\/payments\/stripe-client['"]/m.test(source)) {
        offenders.push(`${relative} : client Stripe serveur`);
      }
      for (const secret of SERVER_SECRETS) {
        if (source.includes(secret)) offenders.push(`${relative} : ${secret}`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('aucune variable publique (NEXT_PUBLIC_) ne porte un secret', () => {
    const names = new Set<string>();
    for (const file of [...platform, ...sourceFiles(join(ROOT, 'packages'))]) {
      for (const match of readFileSync(file, 'utf8').matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        names.add(match[0]);
      }
    }
    const suspicious = [...names].filter((name) =>
      /SECRET|PRIVATE|TOKEN|SERVICE_ROLE|WEBHOOK|GITHUB_APP|CLOUDFLARE_API/.test(name),
    );
    expect(suspicious).toEqual([]);
  });

  it('les données envoyées à l’éditeur ne décrivent aucun accès d’infrastructure', () => {
    const types = readFileSync(
      join(ROOT, 'apps/platform/src/app/app/editeur/contract/types.ts'),
      'utf8',
    );
    expect(types).not.toMatch(/token|secret|privateKey|installationId|accountId/i);
  });

  it('le script de pont publié ne parle qu’à l’origine de StaX, sans secret', () => {
    const script = bridgeScript('https://stax.fr');
    expect(script).toContain('https://stax.fr');
    expect(script).not.toMatch(/postMessage\([^)]*['"]\*['"]/);
    expect(script).not.toMatch(/token|secret/i);
  });

  it('le runtime des sites n’a besoin d’aucun jeton GitHub ou Cloudflare', () => {
    const runtime = sourceFiles(join(ROOT, 'apps/site-runtime/src'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    for (const secret of [
      'GITHUB_APP_PRIVATE_KEY',
      'GITHUB_APP_WEBHOOK_SECRET',
      'CLOUDFLARE_API_TOKEN',
    ]) {
      expect(runtime).not.toContain(secret);
    }
  });
});
