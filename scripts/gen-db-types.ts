/**
 * Generation des types TypeScript a partir du schema PostgreSQL.
 *
 * Les types generes sont COMMITES : le typage ne doit pas dependre de la
 * disponibilite d un service externe au moment de la compilation, et une
 * divergence entre le code et la base devient visible dans une revue de code
 * plutot qu a l execution.
 *
 * Usage :
 *   pnpm db:types                 (utilise SUPABASE_PROJECT_REF)
 *   DATABASE_URL=... pnpm db:types --local
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { assertServerOnly, readEnv } from '@stax/config';
import { loadRootEnv } from '@stax/config/dotenv';

/**
 * Les variables viennent de `.env.local` a la racine du depot (copie de
 * `.env.example`) ou de l environnement d execution. Une variable deja definie
 * — `VAR=... pnpm <script>`, secret de CI — n est jamais ecrasee.
 */
loadRootEnv(import.meta.dirname);

assertServerOnly('scripts/gen-db-types');

const OUTPUT = join(process.cwd(), 'packages', 'database', 'src', 'generated', 'supabase.ts');
const HEADER = `/**
 * FICHIER GENERE — NE PAS MODIFIER A LA MAIN.
 *
 * Regenerez-le avec : pnpm db:types
 * Toute correction doit passer par une migration SQL, jamais par une retouche
 * de ce fichier : il serait ecrase a la prochaine generation.
 */

`;

function fail(message: string): never {
  process.stderr.write(`\n[StaX] ${message}\n\n`);
  process.exit(1);
}

const local = process.argv.includes('--local');
const databaseUrl = readEnv('DATABASE_URL') ?? readEnv('SUPABASE_DB_URL');
const projectRef = readEnv('SUPABASE_PROJECT_REF');

if (local && !databaseUrl) fail('--local exige DATABASE_URL.');
if (!local && !projectRef) {
  fail(
    'SUPABASE_PROJECT_REF est absent. Utilisez --local avec DATABASE_URL ' +
      'pour generer depuis une base locale.',
  );
}

const args = local
  ? [
      'supabase',
      'gen',
      'types',
      'typescript',
      '--db-url',
      databaseUrl as string,
      '--schema',
      'public',
    ]
  : [
      'supabase',
      'gen',
      'types',
      'typescript',
      '--project-id',
      projectRef as string,
      '--schema',
      'public',
    ];

let generated: string;
try {
  generated = execFileSync('pnpm', ['dlx', ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
} catch (error) {
  fail(
    'La generation a echoue. Verifiez que la CLI Supabase est accessible et que ' +
      `la base est joignable.\n${error instanceof Error ? error.message : ''}`,
  );
}

if (!generated.includes('export type Database')) {
  fail('La sortie ne contient pas de definition `Database` : generation abandonnee.');
}

mkdirSync(dirname(OUTPUT), { recursive: true });

let previous = '';
try {
  previous = readFileSync(OUTPUT, 'utf8');
} catch {
  previous = '';
}

const next = HEADER + generated;
if (previous === next) {
  process.stdout.write('\nLes types sont deja a jour.\n\n');
  process.exit(0);
}

writeFileSync(OUTPUT, next, 'utf8');
process.stdout.write(`\nTypes regeneres : ${OUTPUT}\n\n`);
