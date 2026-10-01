import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Les heures s'affichent à l'heure de Paris.
 *
 * Audit du 2026-10-01 : une trentaine de formats de date n'indiquaient pas de
 * fuseau. Le serveur (Vercel, où `TZ` est réservé) formate alors en UTC : une
 * publication faite à 07 h 42 s'affichait « 05:42 », et un composant client
 * rendait une heure différente sur le serveur et dans le navigateur (erreur
 * d'hydratation). Chaque format porte donc son fuseau, explicitement.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const SCANNED = ['apps/platform/src', 'apps/site-runtime/src', 'packages'];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', 'dist', '.wrangler'].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

/** Les options passées à `new Intl.DateTimeFormat(…)`, accolades équilibrées. */
function formatterOptions(source: string): Array<{ line: number; options: string }> {
  const out: Array<{ line: number; options: string }> = [];
  for (const match of source.matchAll(/new Intl\.DateTimeFormat\(/g)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let end = start;
    while (end < source.length && depth > 0) {
      if (source[end] === '(') depth += 1;
      if (source[end] === ')') depth -= 1;
      end += 1;
    }
    out.push({
      line: source.slice(0, match.index).split('\n').length,
      options: source.slice(start, end - 1),
    });
  }
  return out;
}

describe('fuseau horaire', () => {
  it('chaque format de date indique son fuseau', () => {
    const missing: string[] = [];
    for (const dir of SCANNED) {
      for (const file of files(join(ROOT, dir))) {
        for (const { line, options } of formatterOptions(readFileSync(file, 'utf8'))) {
          if (!options.includes('timeZone')) missing.push(`${relative(ROOT, file)}:${line}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
