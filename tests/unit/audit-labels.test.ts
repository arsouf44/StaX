import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTION_LABELS, auditActionLabel } from '~/lib/audit-labels';

/**
 * Le journal se lit en français, côté client comme côté équipe.
 *
 * Audit du 2026-10-01 : les publications (les lignes les plus fréquentes du
 * journal d'un site livré) s'affichaient « site.release_published ». Ce test
 * relève chaque action écrite dans le journal, par les migrations comme par le
 * code de la plateforme, et exige qu'elle ait son libellé.
 */

const ROOT = join(import.meta.dirname, '..', '..');

function files(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...files(path, extensions));
    else if (extensions.some((extension) => entry.endsWith(extension))) out.push(path);
  }
  return out;
}

function auditedActions(): Set<string> {
  const actions = new Set<string>();
  const code = /'([a-z_]+\.[a-z_]+)'/g;
  for (const file of files(join(ROOT, 'supabase/migrations'), ['.sql'])) {
    const sql = readFileSync(file, 'utf8');
    for (const call of sql.matchAll(/write_audit\(([\s\S]{0,400}?)\);/g)) {
      const first = code.exec(call[1] ?? '');
      code.lastIndex = 0;
      if (first?.[1]) actions.add(first[1]);
    }
  }
  for (const file of files(join(ROOT, 'apps/platform/src'), ['.ts', '.tsx'])) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\b(?:p_)?action:\s*'([a-z_]+\.[a-z_]+)'/g)) {
      if (match[1]) actions.add(match[1]);
    }
  }
  return actions;
}

describe('libellés du journal', () => {
  it('chaque action écrite dans le journal a son libellé français', () => {
    const actions = auditedActions();
    expect(actions.size).toBeGreaterThan(20);
    const missing = [...actions].filter((action) => !(action in AUDIT_ACTION_LABELS)).sort();
    expect(missing).toEqual([]);
  });

  it('une action inconnue reste affichée telle quelle', () => {
    expect(auditActionLabel('site.release_published')).toBe('Nouvelle version en ligne');
    expect(auditActionLabel('inconnue.action')).toBe('inconnue.action');
  });
});
