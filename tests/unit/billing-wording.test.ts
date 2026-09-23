import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatMaintenance, maintenancePeriodLabel } from '@stax/payments/money';

/**
 * Periodicite de la maintenance.
 *
 * La maintenance StaX est MENSUELLE et commence a la LIVRAISON du site. Un
 * libelle « / an », « annuelle » ou « premiere annee de maintenance » oublie
 * dans un ecran annoncerait un prix ou un engagement faux au moment ou la
 * personne decide d'acheter. Aucune exception ne signale ce genre d'erreur :
 * seule une regle le peut.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Fichiers ou la periodicite a le droit de s'ecrire. */
const ALLOWED = new Set([
  join(ROOT, 'packages/payments/src/money.ts'),
  join(ROOT, 'packages/types/src/entities.ts'),
]);

function sourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue;
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, files);
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

describe('periodicite de la maintenance', () => {
  const spaces = (value: string) => value.replace(/\s+/gu, ' ');

  it('formate en mensuel par defaut, et respecte un contrat annuel ancien', () => {
    expect(spaces(formatMaintenance(1200))).toBe('12 € / mois');
    expect(spaces(formatMaintenance(1600, 'EUR', 'month'))).toBe('16 € / mois');
    expect(spaces(formatMaintenance(3200, 'EUR', 'year'))).toBe('32 € / an');
    expect(maintenancePeriodLabel()).toBe('par mois');
    expect(maintenancePeriodLabel('year')).toBe('par an');
  });

  it('n’annonce nulle part une maintenance annuelle', () => {
    const offenders: string[] = [];

    for (const file of [
      ...sourceFiles(join(ROOT, 'apps/platform/src')),
      ...sourceFiles(join(ROOT, 'packages/emails/src')),
      ...sourceFiles(join(ROOT, 'packages/config/src')),
    ]) {
      if (ALLOWED.has(file)) continue;
      const source = readFileSync(file, 'utf8');

      for (const [index, line] of source.split('\n').entries()) {
        // Les commentaires expliquent souvent POURQUOI la regle existe :
        // ils ne s'affichent nulle part.
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }
        // Une expression qui lit `billing_interval` choisit le libelle selon le
        // contrat (anciens contrats annuels) : c'est exactement ce qu'on veut.
        if (line.includes('billing_interval') || line.includes('billingInterval')) continue;

        if (
          /\/\s*an\b|par an\b|maintenance annuelle|annuelle de maintenance|première année de maintenance|abonnement annuel/i.test(
            line,
          )
        ) {
          offenders.push(`${file.slice(ROOT.length)}:${index + 1} — ${trimmed.slice(0, 90)}`);
        }
      }
    }

    expect(
      offenders,
      `La maintenance est mensuelle. Utilisez formatMaintenance() :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
