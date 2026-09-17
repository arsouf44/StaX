/**
 * Application des migrations SQL.
 *
 * Les migrations sont des fichiers numerotes, appliques dans l ordre, une seule
 * fois, et traces dans `app.schema_migrations`. Chaque fichier s execute dans sa
 * propre transaction : une migration qui echoue ne laisse jamais la base dans un
 * etat intermediaire.
 *
 * Usage :
 *   pnpm db:migrate                  applique ce qui manque
 *   pnpm db:migrate --status         liste l etat sans rien appliquer
 *   DATABASE_URL=... pnpm db:migrate
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { assertServerOnly, readEnv } from '@stax/config';
import { Client } from 'pg';

assertServerOnly('scripts/db-migrate');

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const statusOnly = process.argv.includes('--status');

function fail(message: string): never {
  process.stderr.write(`\n[StaX] ${message}\n\n`);
  process.exit(1);
}

const connectionString = readEnv('DATABASE_URL') ?? readEnv('SUPABASE_DB_URL');
if (!connectionString) {
  fail(
    'DATABASE_URL est absent. Fournissez la chaine de connexion PostgreSQL ' +
      '(onglet « Connection string » du projet Supabase).',
  );
}

const client = new Client({ connectionString });

function checksum(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

async function main(): Promise<void> {
  await client.connect();
  await client.query('create schema if not exists app');
  await client.query(`
    create table if not exists app.schema_migrations (
      version     text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `);

  const { rows } = await client.query<{ version: string; checksum: string }>(
    'select version, checksum from app.schema_migrations',
  );
  const applied = new Map<string, string>(rows.map((row) => [row.version, row.checksum]));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  let pending = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const digest = checksum(content);
    const previous = applied.get(version);

    if (previous) {
      // Une migration deja appliquee ne doit plus jamais changer : la modifier
      // apres coup ferait diverger silencieusement les environnements.
      if (previous !== digest) {
        fail(
          `La migration ${version} a ete modifiee apres son application ` +
            `(empreinte ${previous} → ${digest}).\n` +
            'Creez une nouvelle migration plutot que de modifier une migration passee.',
        );
      }
      process.stdout.write(`  =  ${version}\n`);
      continue;
    }

    pending += 1;
    if (statusOnly) {
      process.stdout.write(`  +  ${version} (a appliquer)\n`);
      continue;
    }

    process.stdout.write(`  →  ${version}\n`);
    // Une migration s applique dans sa propre transaction : en cas d echec,
    // la base revient exactement a son etat precedent.
    try {
      await client.query('begin');
      await client.query(content);
      await client.query('insert into app.schema_migrations (version, checksum) values ($1, $2)', [
        version,
        digest,
      ]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  process.stdout.write(
    pending === 0
      ? '\nLa base est a jour.\n\n'
      : statusOnly
        ? `\n${pending} migration(s) en attente.\n\n`
        : `\n${pending} migration(s) appliquee(s).\n\n`,
  );
}

main()
  .catch((error: unknown) => {
    fail(error instanceof Error ? error.message : 'Echec de la migration.');
  })
  .finally(() => {
    void client.end();
  });
