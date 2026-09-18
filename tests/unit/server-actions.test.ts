import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrat des fichiers d actions serveur.
 *
 * Next.js impose qu un module marque `'use server'` n exporte QUE des fonctions
 * asynchrones. Une constante exportee depuis un tel fichier compile sans erreur,
 * passe le typage, passe le build — et casse a la premiere requete.
 *
 * Ce test remplace la boucle « deployer, casser, corriger » par une seconde de
 * verification statique.
 */

const APP_ROOT = join(process.cwd(), 'apps', 'platform', 'src');

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      files.push(...walk(path));
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) files.push(path);
  }
  return files;
}

function serverActionFiles(): Array<{ path: string; source: string }> {
  return walk(APP_ROOT)
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => /^\s*['"]use server['"];/m.test(source));
}

describe('fichiers « use server »', () => {
  const files = serverActionFiles();

  it('il en existe au moins un (sinon ce test ne vérifie rien)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((file) => [file.path.replace(process.cwd(), ''), file.source]))(
    '%s n’exporte que des fonctions asynchrones',
    (path, source) => {
      // Les exports de TYPE sont effaces a la compilation : ils sont autorises.
      const runtimeExports = [...source.matchAll(/^export\s+(?!type\b|interface\b)(\w+)/gm)].map(
        (match) => ({ keyword: match[1], line: match[0] }),
      );

      for (const entry of runtimeExports) {
        expect(
          entry.keyword,
          `${path} : « export ${entry.keyword} » est interdit dans un fichier « use server ». ` +
            'Deplacez cette valeur dans un module ordinaire.',
        ).toBe('async');
      }
    },
  );

  it.each(files.map((file) => [file.path.replace(process.cwd(), ''), file.source]))(
    '%s ne réexporte rien',
    (path, source) => {
      // `export * from` et `export { x } from` echapperaient a la regle
      // ci-dessus tout en exportant potentiellement des valeurs.
      expect(/^export\s+\*/m.test(source), `${path} contient un « export * »`).toBe(false);
      expect(/^export\s+\{[^}]*\}\s+from/m.test(source), `${path} contient une reexportation`).toBe(
        false,
      );
    },
  );
});
