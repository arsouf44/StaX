import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agree, countOf } from '~/lib/plural';

/**
 * « 1 élément(s) attendent une action » : un « (s) » se lit comme un
 * formulaire administratif. Les nombres affichés s'accordent, et 0 comme 1
 * restent au singulier, comme en français.
 */

describe('accord des nombres', () => {
  it('0 et 1 au singulier, 2 et plus au pluriel', () => {
    expect(countOf(0, 'visiteur')).toBe('0 visiteur');
    expect(countOf(1, 'visiteur')).toBe('1 visiteur');
    expect(countOf(2, 'visiteur')).toBe('2 visiteurs');
    expect(countOf(1240, 'commande payée', 'commandes payées')).toMatch(
      /^1\s240 commandes payées$/u,
    );
    expect(agree(1, 'attend', 'attendent')).toBe('attend');
    expect(agree(3, 'attend', 'attendent')).toBe('attendent');
  });

  it('aucun « (s) » dans les textes de la plateforme', () => {
    const root = join(import.meta.dirname, '..', '..', 'apps/platform/src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) {
          readFileSync(path, 'utf8')
            .split('\n')
            .forEach((line, index) => {
              const trimmed = line.trim();
              if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
              if (/\p{L}\(s\)/u.test(line))
                offenders.push(`${path.slice(root.length)}:${index + 1}`);
            });
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
