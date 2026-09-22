import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  THEME_SCRIPT,
  THEME_SCRIPT_CSP_HASH,
  THEME_STORAGE_KEY,
} from '../../apps/platform/src/lib/theme-script';

/**
 * Script d application du theme.
 *
 * Ce script a deja echoue en silence : il lisait une cle accentuee que rien
 * n ecrivait, et posait un attribut qu aucune regle CSS n observait. Il
 * s executait donc parfaitement, sans le moindre effet — le genre de defaut
 * qu aucune exception ne signale.
 *
 * Ces trois verifications tiennent ensemble le script, le selecteur de theme,
 * la feuille de style et la politique de securite du contenu.
 */

describe('script d application du theme', () => {
  it('lit la cle que le selecteur ecrit reellement', () => {
    expect(THEME_STORAGE_KEY).toBe('stax-theme');
    expect(THEME_SCRIPT).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
  });

  it('pose l attribut que la feuille de style observe', () => {
    // `packages/ui/src/styles/globals.css` cible `[data-theme='dark'|'light']`.
    expect(THEME_SCRIPT).toContain(`setAttribute('data-theme'`);
    // Aucun identifiant accentue : ni cle de stockage, ni nom d attribut.
    const identifiers = THEME_SCRIPT.match(/'[^']*'/g) ?? [];
    for (const identifier of identifiers) {
      expect(identifier, `${identifier} contient un caractere accentue`).toMatch(
        /^'[\x20-\x7E]*'$/,
      );
    }
  });

  it('declare l empreinte exacte attendue par la CSP', () => {
    const digest = createHash('sha256').update(THEME_SCRIPT, 'utf8').digest('base64');
    expect(
      THEME_SCRIPT_CSP_HASH,
      'Le script a change : reportez la nouvelle empreinte dans THEME_SCRIPT_CSP_HASH.',
    ).toBe(`'sha256-${digest}'`);
  });
});
