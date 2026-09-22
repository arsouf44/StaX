import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatMaintenance, maintenancePeriodLabel } from '@stax/payments/money';

/**
 * Periodicite de la maintenance.
 *
 * Ce test existe a cause d'un defaut reel : la maintenance StaX est facturee a
 * l'annee, et neuf ecrans affichaient pourtant « / mois » — dont le tunnel de
 * commande, la confirmation et la facturation. Un client lisait « 32 € / mois »
 * pour un contrat a 32 € / an : un prix douze fois trop eleve, annonce au
 * moment precis ou il decide d'acheter.
 *
 * Aucune exception ne signale ce genre d'erreur. Seule une regle le peut.
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
  /**
   * `Intl` separe les milliers et l'euro par des espaces insecables etroits.
   * Les comparer caractere par caractere rendrait le test fragile sans rien
   * verifier de plus : on normalise les espaces.
   */
  const spaces = (value: string) => value.replace(/\s+/gu, ' ');

  it('formate selon la periodicite du contrat, pas selon une hypothese', () => {
    expect(spaces(formatMaintenance(2200))).toBe('22 € / an');
    expect(spaces(formatMaintenance(3200, 'EUR', 'year'))).toBe('32 € / an');
    expect(spaces(formatMaintenance(3200, 'EUR', 'month'))).toBe('32 € / mois');
    expect(spaces(formatMaintenance(109_900, 'EUR', 'year'))).toBe('1 099 € / an');
    expect(maintenancePeriodLabel('year')).toBe('par an');
    expect(maintenancePeriodLabel('month')).toBe('par mois');
  });

  it('n’écrit « par mois » nulle part ailleurs que dans le formateur', () => {
    const offenders: string[] = [];

    for (const file of [
      ...sourceFiles(join(ROOT, 'apps/platform/src')),
      ...sourceFiles(join(ROOT, 'packages/site-engine/src')),
      ...sourceFiles(join(ROOT, 'packages/emails/src')),
    ]) {
      if (ALLOWED.has(file)) continue;
      const source = readFileSync(file, 'utf8');

      for (const [index, line] of source.split('\n').entries()) {
        // Les commentaires expliquent souvent POURQUOI la règle existe :
        // ils ne s'affichent nulle part.
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          continue;
        }
        // Une expression qui lit `billing_interval` choisit le libellé, elle
        // ne le suppose pas : c'est exactement ce qu'on veut.
        if (line.includes('billing_interval') || line.includes('billingInterval')) continue;

        if (/\/\s*mois|par mois|maintenance mensuelle|mensuelle\b/i.test(line)) {
          offenders.push(`${file.slice(ROOT.length)}:${index + 1} — ${trimmed.slice(0, 90)}`);
        }
      }
    }

    expect(
      offenders,
      `La maintenance est annuelle. Utilisez formatMaintenance() :\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
