'use client';

import { useMemo, useState } from 'react';
import { Dialog, Icon, Input, cn } from '@stax/ui';
import type { BlockMeta } from './types';

/**
 * « Ajouter une section ».
 *
 * Les sections sont groupees par intention (« Présenter », « Rassurer »,
 * « Faire agir »), et celles qui conviennent au metier du client sont
 * proposees en premier. Une section deja presente et unique (la bannière)
 * est grisee avec la raison, plutot que de disparaitre sans explication.
 */

/** Accents retires pour la recherche : « evenement » trouve « Événements ». */
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

const GROUPS: Array<{ id: string; label: string }> = [
  { id: 'structure', label: 'Présenter' },
  { id: 'contenu', label: 'Raconter' },
  { id: 'preuve', label: 'Rassurer' },
  { id: 'conversion', label: 'Faire agir' },
  { id: 'metier', label: 'Votre métier' },
];

export function SectionLibrary({
  open,
  onClose,
  metas,
  presentTypes,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  metas: Record<string, BlockMeta>;
  presentTypes: ReadonlySet<string>;
  onPick: (type: string) => void;
}) {
  const [query, setQuery] = useState('');

  const choices = useMemo(() => {
    const strip = (value: string) => value.toLowerCase().normalize('NFD').replace(DIACRITICS, '');
    const needle = strip(query.trim());
    return Object.values(metas)
      .filter((meta) => meta.available)
      .filter((meta) => {
        if (!needle) return true;
        const haystack = strip(`${meta.label} ${meta.description}`);
        return haystack.includes(needle);
      });
  }, [metas, query]);

  const recommended = choices.filter((meta) => meta.recommended);

  const card = (meta: BlockMeta) => {
    const disabled = meta.singleton && presentTypes.has(meta.type);
    return (
      <li key={meta.type}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onPick(meta.type)}
          data-testid={`add-section-${meta.type}`}
          className={cn(
            'flex h-full w-full items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-left transition-colors',
            disabled
              ? 'cursor-not-allowed opacity-50'
              : 'hover:border-[var(--accent)] hover:bg-[var(--surface)]',
          )}
        >
          <span className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-2 text-[var(--muted)]">
            <Icon name={meta.icon} size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">{meta.label}</span>
            <span className="mt-0.5 block text-xs text-[var(--foreground-muted)]">
              {disabled ? 'Déjà présente sur cette page (une seule possible).' : meta.description}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Ajouter une section">
      <div className="space-y-6">
        <p className="text-sm text-[var(--foreground-muted)]">
          Choisissez ce que vous voulez montrer. La section est ajoutée sous celle que vous avez
          sélectionnée, avec un contenu d’exemple que vous remplacerez.
        </p>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher : photos, avis, horaires…"
          aria-label="Rechercher une section"
        />

        {!query && recommended.length > 0 ? (
          <section>
            <h3 className="mb-2 text-xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Conseillées pour votre activité
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2">{recommended.slice(0, 6).map(card)}</ul>
          </section>
        ) : null}

        {GROUPS.map((group) => {
          const entries = choices.filter((meta) => meta.category === group.id);
          if (entries.length === 0) return null;
          return (
            <section key={group.id}>
              <h3 className="mb-2 text-xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
                {group.label}
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">{entries.map(card)}</ul>
            </section>
          );
        })}

        {choices.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            Aucune section ne correspond. Essayez un autre mot.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
