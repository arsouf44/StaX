import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Le français affiché aux clients porte ses accents.
 *
 * Audit du 2026-09-30 : « Comment ca marche », « Centre d aide », « A propos »
 * dans le menu du site public, « Creneaux, capacites », « vous etes »,
 * « caracteres » dans des messages d'erreur, « 3 reservations à confirmer »
 * dans l'espace client… Chaque faute était isolée ; ensemble, elles donnaient
 * l'image d'un produit bâclé à ceux à qui on demande de nous confier leur site.
 *
 * Ce test balaie les chaînes du code (littéraux et texte JSX, hors
 * commentaires, hors journaux techniques `[nemasus:…]`) à la recherche de
 * mots qui n'existent PAS sans accent. Les mots ambigus (« publie », verbe,
 * contre « publié ») n'y figurent pas : un faux positif ferait ignorer le test.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const SCANNED = ['apps/platform/src', 'apps/site-runtime/src', 'packages'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.open-next',
  'dist',
  '.wrangler',
  'generated',
]);

const MISSPELLINGS = [
  'deja',
  'etre',
  'tres',
  'apres',
  'premiere',
  'derniere',
  'donnees',
  'securite',
  'equipe',
  'telephone',
  'prenom',
  'caracteres',
  'parametres',
  'reglages',
  'periode',
  'creneau',
  'creneaux',
  'capacites',
  'actualites',
  'sejour',
  'sejours',
  'etes',
  'etape',
  'etapes',
  'evenement',
  'evenements',
  'reessayez',
  'acceder',
  'recurrentes',
  'reguliers',
  'debut',
  'inferieur',
  'superieur',
  'concernee',
  'desactive',
  'reservations',
  'personnalise',
  'agregation',
  'execution',
];

// Limites de mot Unicode (« vôtres » ne contient pas « tres »), hors chemins d'URL.
const WORD = new RegExp(`(?<![\\p{L}\\w/-])(${MISSPELLINGS.join('|')})(?![\\p{L}\\w/-])`, 'iu');
// Élisions et prépositions sans apostrophe ni accent : « d aide », « a cette ».
const ELISION =
  /(?<![\w’'-])(?:d|l|qu) (?=[aeiouyhéèêàâîôû])|(?<![\w’'])a (?:cette|partir|venir|jour|vos|votre)\b/;
const STRING = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const JSX_TEXT = />([^<>{}\n][^<>{}]*)</g;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => '\n'.repeat(block.split('\n').length - 1))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Un identifiant, un chemin, une liste de colonnes : pas du texte affiché. */
function isTechnical(chunk: string): boolean {
  const text = chunk.trim();
  if (!text.includes(' ')) return true;
  if (text.startsWith('[nemasus:') || text.startsWith('[Nemasus]')) return true;
  if (
    /^[\w.,()!:\s*-]+$/.test(text) &&
    /\b(select|from|where|order by)\b|_id\b|\w+,\s*\w+\s*\(/.test(text)
  )
    return true;
  return false;
}

describe('orthographe des textes visibles', () => {
  it('aucun mot courant n’a perdu son accent ni son apostrophe', () => {
    const offenders: string[] = [];
    for (const base of SCANNED) {
      for (const file of files(join(ROOT, base))) {
        const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
        lines.forEach((line, index) => {
          const chunks = [
            ...[...line.matchAll(STRING)].map((match) => match[0].slice(1, -1)),
            ...[...line.matchAll(JSX_TEXT)].map((match) => match[1] ?? ''),
          ];
          for (const chunk of chunks) {
            if (isTechnical(chunk)) continue;
            const hit = WORD.exec(chunk) ?? ELISION.exec(chunk);
            if (hit) {
              offenders.push(
                `${relative(ROOT, file)}:${index + 1} « ${hit[0]} » dans « ${chunk.trim().slice(0, 90)} »`,
              );
            }
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('le vocabulaire des métiers, repris dans l’espace client, est accentué', async () => {
    const { listBusinesses } = await import('@nemasus/business');
    const words = listBusinesses().flatMap((business) =>
      Object.values(business.vocabulary ?? {}).filter(
        (value): value is string => typeof value === 'string',
      ),
    );
    for (const word of words) expect(word).not.toMatch(WORD);
  });
});
