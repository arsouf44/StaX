/**
 * Chargement des fichiers d environnement de la racine du depot.
 *
 * ============================== POURQUOI =================================
 *
 * `.env.example` vit a la racine et demande de le copier en `.env.local`.
 * Mais Next.js ne lit les fichiers `.env*` que dans le repertoire de
 * l application (`apps/platform`), et les scripts `tsx` n en lisent aucun :
 * ils se contentent de `process.env`.
 *
 * Resultat, en suivant la documentation a la lettre : la configuration est
 * silencieusement ignoree, `NEXT_PUBLIC_SUPABASE_URL` retombe sur sa valeur
 * de repli locale, et le visiteur voit « Le catalogue tarifaire est
 * momentanement indisponible » sans qu aucune erreur n apparaisse nulle part.
 * C est exactement le symptome qui a ete remonte en production.
 *
 * Ce module comble ce trou. Il est volontairement place dans un point d entree
 * separe (`@stax/config/dotenv`) : il importe `node:fs`, et ne doit donc
 * jamais etre embarque dans le bundle d un Worker Cloudflare, ou la
 * configuration arrive par les bindings.
 *
 * REGLE ABSOLUE : une variable deja presente dans `process.env` n est JAMAIS
 * remplacee. Les secrets d un deploiement (Cloudflare, GitHub Actions) gagnent
 * toujours sur un fichier local qui trainerait.
 * ==========================================================================
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Ordre de precedence Next.js : le premier trouve gagne. */
const FILES = ['.env.local', '.env'] as const;

/**
 * Remonte jusqu a la racine de l espace de travail pnpm.
 * On s arrete au premier repertoire contenant `pnpm-workspace.yaml`.
 */
export function findWorkspaceRoot(from: string = process.cwd()): string | null {
  let current = resolve(from);
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Analyse un fichier `.env`.
 *
 * Gere les commentaires, `export KEY=...`, les valeurs entre guillemets
 * simples ou doubles, et les sauts de ligne echappes dans les guillemets
 * doubles. Une ligne incomprehensible est ignoree plutot que de faire echouer
 * le demarrage.
 */
export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1];
    let value = (match[2] ?? '').trim();
    if (key === undefined) continue;

    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      // Commentaire de fin de ligne, uniquement hors guillemets.
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trimEnd();
    }

    result[key] = value;
  }
  return result;
}

let loaded = false;

/**
 * Charge `.env.local` puis `.env` depuis la racine du depot dans
 * `process.env`, sans jamais ecraser une variable deja definie.
 *
 * Idempotent : les appels suivants ne font rien.
 * Renvoie la liste des fichiers effectivement lus, pour journalisation.
 */
export function loadRootEnv(from?: string): string[] {
  if (loaded) return [];
  loaded = true;

  const root = findWorkspaceRoot(from);
  if (root === null) return [];

  const read: string[] = [];
  for (const file of FILES) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    read.push(file);
    const values = parseDotenv(readFileSync(path, 'utf8'));
    for (const [key, value] of Object.entries(values)) {
      // Deja defini (secret de deploiement, variable de CI, `FOO=bar pnpm ...`)
      // : on n y touche pas.
      if (process.env[key] !== undefined && process.env[key] !== '') continue;
      process.env[key] = value;
    }
  }
  return read;
}

/** Utilitaire de test : autorise un rechargement. */
export function resetRootEnvLoader(): void {
  loaded = false;
}
