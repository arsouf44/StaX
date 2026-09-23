import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_STACKS, fontFaceCss } from '@stax/site-engine';

/**
 * Les polices des sites clients sont auto-hebergees : servies par le Worker
 * (packages/site-engine/public) et, pour l'apercu de l'editeur, par la
 * plateforme (apps/platform/public). Les deux copies doivent etre identiques,
 * et chaque police declaree doit exister.
 */

const ROOT = join(__dirname, '..', '..');
const ENGINE = join(ROOT, 'packages/site-engine/public/_stax/fonts');
const PLATFORM = join(ROOT, 'apps/platform/public/_stax/fonts');

const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('polices des sites clients', () => {
  it('la copie de la plateforme est identique a celle du moteur', () => {
    const engine = readdirSync(ENGINE).sort();
    expect(readdirSync(PLATFORM).sort()).toEqual(engine);
    for (const file of engine) {
      expect(digest(join(PLATFORM, file)), file).toBe(digest(join(ENGINE, file)));
    }
  });

  it('chaque police declaree a son fichier', () => {
    const files = new Set(readdirSync(ENGINE));
    for (const font of Object.values(FONT_STACKS)) {
      for (const face of font.faces ?? []) expect(files.has(face.file), face.file).toBe(true);
    }
  });

  it('aucune police ne vient d un service tiers', () => {
    const css = fontFaceCss(Object.keys(FONT_STACKS));
    expect(css).toContain('url(/_stax/fonts/inter.woff2)');
    expect(css).not.toMatch(/googleapis|gstatic|https?:/);
  });
});
