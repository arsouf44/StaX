import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findWorkspaceRoot,
  loadRootEnv,
  parseDotenv,
  resetRootEnvLoader,
} from '@stax/config/dotenv';

/**
 * Le chargement des fichiers `.env` de la racine.
 *
 * Ce module est apparu apres un incident reel : `.env.example` vit a la racine
 * et demande d'y creer `.env.local`, mais Next.js ne lit les fichiers `.env*`
 * que dans `apps/platform`. La configuration etait donc ignoree en silence, et
 * les pages publiques affichaient « catalogue indisponible » sans qu'aucune
 * erreur n'apparaisse. Ces tests verrouillent le comportement attendu.
 */

const created: string[] = [];

function workspace(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'stax-dotenv-'));
  created.push(root);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, name), content);
  }
  mkdirSync(join(root, 'apps', 'platform'), { recursive: true });
  return root;
}

afterEach(() => {
  resetRootEnvLoader();
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('parseDotenv', () => {
  it('lit les paires simples et ignore commentaires et lignes vides', () => {
    expect(parseDotenv('# titre\n\nA=1\nB = deux\n')).toEqual({ A: '1', B: 'deux' });
  });

  it('accepte le prefixe export', () => {
    expect(parseDotenv('export TOKEN=abc')).toEqual({ TOKEN: 'abc' });
  });

  it('retire les guillemets et restitue les sauts de ligne echappes', () => {
    expect(parseDotenv('A="un\\ndeux"\nB=\'brut\'')).toEqual({ A: 'un\ndeux', B: 'brut' });
  });

  it('conserve un « # » colle a la valeur mais coupe un commentaire de fin de ligne', () => {
    expect(parseDotenv('A=abc#def\nB=abc # commentaire')).toEqual({ A: 'abc#def', B: 'abc' });
  });

  it('ne casse pas sur une cle contenant un « = » dans la valeur', () => {
    const key = 'KEY=eyJhbGciOiJIUzI1NiJ9.payload==';
    expect(parseDotenv(key)).toEqual({ KEY: 'eyJhbGciOiJIUzI1NiJ9.payload==' });
  });

  it('ignore une ligne incomprehensible plutot que d echouer', () => {
    expect(parseDotenv('ceci n est pas une variable\nOK=1')).toEqual({ OK: '1' });
  });
});

describe('findWorkspaceRoot', () => {
  it('remonte depuis un sous-repertoire jusqu a pnpm-workspace.yaml', () => {
    const root = workspace({});
    expect(findWorkspaceRoot(join(root, 'apps', 'platform'))).toBe(root);
  });

  it('renvoie null hors de tout espace de travail', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'stax-orphan-'));
    created.push(orphan);
    expect(findWorkspaceRoot(orphan)).toBeNull();
  });
});

describe('loadRootEnv', () => {
  it('charge .env.local depuis la racine quand on part du repertoire d une application', () => {
    const root = workspace({ '.env.local': 'STAX_TEST_FROM_LOCAL=ok\n' });
    delete process.env.STAX_TEST_FROM_LOCAL;

    loadRootEnv(join(root, 'apps', 'platform'));

    expect(process.env.STAX_TEST_FROM_LOCAL).toBe('ok');
    delete process.env.STAX_TEST_FROM_LOCAL;
  });

  it('donne la priorite a .env.local sur .env', () => {
    const root = workspace({
      '.env.local': 'STAX_TEST_PRIORITE=local\n',
      '.env': 'STAX_TEST_PRIORITE=partage\nSTAX_TEST_SEULEMENT_ENV=present\n',
    });
    delete process.env.STAX_TEST_PRIORITE;
    delete process.env.STAX_TEST_SEULEMENT_ENV;

    loadRootEnv(root);

    expect(process.env.STAX_TEST_PRIORITE).toBe('local');
    expect(process.env.STAX_TEST_SEULEMENT_ENV).toBe('present');
    delete process.env.STAX_TEST_PRIORITE;
    delete process.env.STAX_TEST_SEULEMENT_ENV;
  });

  it('n ecrase JAMAIS une variable deja definie : un secret de deploiement gagne', () => {
    const root = workspace({ '.env.local': 'STAX_TEST_DEJA_DEFINI=fichier\n' });
    process.env.STAX_TEST_DEJA_DEFINI = 'secret-de-deploiement';

    loadRootEnv(root);

    expect(process.env.STAX_TEST_DEJA_DEFINI).toBe('secret-de-deploiement');
    delete process.env.STAX_TEST_DEJA_DEFINI;
  });

  it('est idempotent : le second appel ne relit rien', () => {
    const root = workspace({ '.env.local': 'STAX_TEST_IDEMPOTENT=1\n' });
    delete process.env.STAX_TEST_IDEMPOTENT;

    expect(loadRootEnv(root)).toEqual(['.env.local']);
    expect(loadRootEnv(root)).toEqual([]);
    delete process.env.STAX_TEST_IDEMPOTENT;
  });

  it('ne fait rien, sans lever, hors de tout espace de travail', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'stax-orphan-'));
    created.push(orphan);
    expect(loadRootEnv(orphan)).toEqual([]);
  });
});
