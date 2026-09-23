#!/usr/bin/env node
/**
 * Passerelle de la pile locale des tests de bout en bout.
 *
 * Un projet Supabase expose trois services derriere une seule origine :
 *
 *   /rest/v1     → PostgREST (les tables et les fonctions, sous RLS)
 *   /auth/v1     → GoTrue (inscription, connexion, jetons)
 *   /storage/v1  → le stockage des fichiers
 *
 * Les deux premiers tournent ici avec les VRAIS binaires, ceux que Supabase
 * execute en production. Le stockage est emule : quelques routes seulement,
 * celles que la plateforme appelle, avec la meme regle d'ecriture que la
 * policy de production (seul un membre ayant le droit `media.manage` sur
 * l'organisation designee par le premier segment du chemin peut ecrire).
 *
 * Usage :
 *   node gateway.mjs keys <jwt-secret>   → affiche les cles anon et service
 *   node gateway.mjs serve               → demarre la passerelle
 *
 * Aucune valeur de ce fichier n'a de sens hors de la pile locale.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import pg from 'pg';

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token, secret) {
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;
  const expected = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

if (process.argv[2] === 'keys') {
  const secret = process.argv[3];
  if (!secret) {
    process.stderr.write('Usage : node gateway.mjs keys <jwt-secret>\n');
    process.exit(1);
  }
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 60 * 60 * 24 * 365;
  process.stdout.write(
    `ANON_KEY=${signJwt({ role: 'anon', iss: 'stax-e2e', iat, exp }, secret)}\n` +
      `SERVICE_KEY=${signJwt({ role: 'service_role', iss: 'stax-e2e', iat, exp }, secret)}\n`,
  );
  process.exit(0);
}

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const REST_PORT = Number(process.env.POSTGREST_PORT ?? 54330);
const AUTH_PORT = Number(process.env.GOTRUE_PORT ?? 54340);
const JWT_SECRET = process.env.JWT_SECRET;
const STORAGE_DIR = process.env.STORAGE_DIR;
const DATABASE_URL = process.env.DATABASE_URL;

if (!JWT_SECRET || !STORAGE_DIR || !DATABASE_URL) {
  process.stderr.write('JWT_SECRET, STORAGE_DIR et DATABASE_URL sont requis.\n');
  process.exit(1);
}

const PUBLIC_BUCKETS = new Set(['site-media']);
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

function proxy(req, res, port, strip) {
  const target = req.url.slice(strip.length) || '/';
  const upstream = httpRequest(
    {
      host: '127.0.0.1',
      port,
      method: req.method,
      path: target,
      headers: { ...req.headers, host: `127.0.0.1:${port}` },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'service indisponible' }));
  });
  req.pipe(upstream);
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function claimsOf(req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token ? verifyJwt(token, JWT_SECRET) : null;
}

/** Chemin disque d'un objet, sans jamais sortir du repertoire du bucket. */
function objectPath(bucket, key) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) return null;
  const clean = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
  if (clean.startsWith('/') || clean.includes('..')) return null;
  return join(STORAGE_DIR, bucket, clean);
}

/**
 * Meme regle que la policy de production : le premier segment du chemin est
 * l'organisation, et il faut y detenir `media.manage`.
 */
async function canWrite(claims, key) {
  if (!claims) return false;
  if (claims.role === 'service_role') return true;
  if (claims.role !== 'authenticated' || !claims.sub) return false;
  const org = key.split('/')[0];
  if (!/^[0-9a-f-]{36}$/.test(org ?? '')) return false;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: claims.sub, role: 'authenticated' }),
    ]);
    await client.query('set local role authenticated');
    const { rows } = await client.query(`select public.org_can($1::uuid, 'media.manage') as ok`, [
      org,
    ]);
    await client.query('commit');
    return rows[0]?.ok === true;
  } catch {
    await client.query('rollback').catch(() => {});
    return false;
  } finally {
    client.release();
  }
}

async function serveObject(res, bucket, key) {
  const file = objectPath(bucket, key);
  if (!file) return json(res, 400, { message: 'chemin invalide' });
  try {
    await stat(file);
  } catch {
    return json(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
  }
  let meta = { contentType: 'application/octet-stream' };
  try {
    meta = JSON.parse(await readFile(`${file}.meta.json`, 'utf8'));
  } catch {
    // Pas de metadonnees : type generique.
  }
  const body = await readFile(file);
  res.writeHead(200, {
    'content-type': meta.contentType,
    'content-length': body.length,
    'cache-control': meta.cacheControl ?? 'max-age=3600',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

async function handleUpload(req, res, bucket, key) {
  const claims = claimsOf(req);
  if (!(await canWrite(claims, key))) {
    return json(res, 403, {
      statusCode: '403',
      error: 'Unauthorized',
      message: 'new row violates row-level security policy',
    });
  }
  const file = objectPath(bucket, key);
  if (!file) return json(res, 400, { message: 'chemin invalide' });

  const raw = await readBody(req);
  const contentType = req.headers['content-type'] ?? 'application/octet-stream';
  let bytes = raw;
  let objectType = contentType;
  let cacheControl = req.headers['cache-control'];

  if (contentType.startsWith('multipart/form-data')) {
    const form = await new Request('http://local/upload', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: raw,
    }).formData();
    for (const [name, value] of form.entries()) {
      if (typeof value === 'string') {
        if (name === 'cacheControl') cacheControl = `max-age=${value}`;
        continue;
      }
      bytes = Buffer.from(await value.arrayBuffer());
      objectType = value.type || 'application/octet-stream';
    }
  }

  const upsert = req.headers['x-upsert'] === 'true';
  if (!upsert) {
    try {
      await stat(file);
      return json(res, 409, { statusCode: '409', error: 'Duplicate', message: 'exists' });
    } catch {
      // Absent : on peut ecrire.
    }
  }

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
  await writeFile(
    `${file}.meta.json`,
    JSON.stringify({ contentType: objectType, cacheControl: cacheControl ?? 'max-age=3600' }),
  );
  return json(res, 200, { Key: `${bucket}/${key}`, Id: randomUUID() });
}

async function handleRemove(req, res, bucket) {
  const claims = claimsOf(req);
  let prefixes = [];
  try {
    prefixes = JSON.parse((await readBody(req)).toString('utf8')).prefixes ?? [];
  } catch {
    return json(res, 400, { message: 'corps illisible' });
  }
  const removed = [];
  for (const key of prefixes) {
    if (!(await canWrite(claims, key))) continue;
    const file = objectPath(bucket, key);
    if (!file) continue;
    await rm(file, { force: true });
    await rm(`${file}.meta.json`, { force: true });
    removed.push({ name: key, bucket_id: bucket });
  }
  return json(res, 200, removed);
}

async function handleStorage(req, res) {
  const url = new URL(req.url, 'http://local');
  const path = decodeURIComponent(url.pathname.slice('/storage/v1'.length));

  let match = path.match(/^\/object\/public\/([^/]+)\/(.+)$/);
  if (match && (req.method === 'GET' || req.method === 'HEAD')) {
    if (!PUBLIC_BUCKETS.has(match[1])) return json(res, 400, { message: 'bucket prive' });
    return serveObject(res, match[1], match[2]);
  }

  match = path.match(/^\/object\/([^/]+)\/(.+)$/);
  if (match && (req.method === 'POST' || req.method === 'PUT')) {
    return handleUpload(req, res, match[1], match[2]);
  }
  if (match && req.method === 'GET') {
    const claims = claimsOf(req);
    if (!claims) return json(res, 401, { message: 'jeton requis' });
    return serveObject(res, match[1], match[2]);
  }

  match = path.match(/^\/object\/([^/]+)\/?$/);
  if (match && req.method === 'DELETE') return handleRemove(req, res, match[1]);

  match = path.match(/^\/bucket\/?([^/]*)$/);
  if (match && req.method === 'GET') {
    return json(
      res,
      200,
      [...PUBLIC_BUCKETS].map((id) => ({ id, name: id, public: true })),
    );
  }

  return json(res, 404, { message: `route de stockage non emulee : ${req.method} ${path}` });
}

createServer((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/rest/v1')) return proxy(req, res, REST_PORT, '/rest/v1');
  if (url.startsWith('/auth/v1')) return proxy(req, res, AUTH_PORT, '/auth/v1');
  if (url.startsWith('/storage/v1')) {
    return void handleStorage(req, res).catch((error) => {
      process.stderr.write(`[gateway] ${error?.stack ?? error}\n`);
      if (!res.headersSent) json(res, 500, { message: 'erreur interne' });
    });
  }
  if (url === '/health') return json(res, 200, { ok: true });
  return json(res, 404, { message: 'route inconnue' });
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`[gateway] http://127.0.0.1:${PORT}\n`);
});
