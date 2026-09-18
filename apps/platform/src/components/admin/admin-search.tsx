'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Icon, Spinner } from '@stax/ui';
import type { AdminSearchResult } from '@stax/database';
import { adminSearchAction } from '~/app/admin/actions';

/**
 * Recherche globale.
 *
 * La recherche est faite COTE SERVEUR, avec le jeton de la personne : aucun
 * index client, aucune donnee prechargee dans le navigateur. Une frappe de
 * moins de deux caracteres ne declenche rien.
 */

const KIND_ICONS: Record<AdminSearchResult['kind'], string> = {
  organization: 'building',
  site: 'globe',
  order: 'receipt',
  domain: 'map-pin',
  user: 'user-round',
  quote: 'file-text',
};

const KIND_LABELS: Record<AdminSearchResult['kind'], string> = {
  organization: 'Organisation',
  site: 'Site',
  order: 'Commande',
  domain: 'Domaine',
  user: 'Utilisateur',
  quote: 'Devis',
};

export function AdminSearch() {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<AdminSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);

  const trimmed = term.trim();
  const searchable = trimmed.length >= 2;
  // Valeur DERIVEE : sous deux caracteres, on n affiche rien sans avoir a
  // vider l etat depuis un effet. Une saisie effacee ne laisse donc jamais
  // apparaitre les resultats precedents.
  const visible = searchable ? results : [];

  useEffect(() => {
    if (!searchable) return;
    // Attente courte : on interroge le serveur quand la frappe se stabilise,
    // pas a chaque caractere.
    const timer = window.setTimeout(() => {
      startTransition(() => {
        void adminSearchAction(trimmed).then(setResults);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [trimmed, searchable]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div ref={root} className="relative hidden max-w-md flex-1 sm:block">
      <label htmlFor={inputId} className="sr-only">
        Rechercher un client, un site, une commande ou un domaine
      </label>
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background-inset)] px-3 py-1.5">
        <Icon name="search" size={14} className="text-[var(--muted)]" />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={open && visible.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
        />
        {pending ? <Spinner /> : null}
      </div>

      {open && searchable ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Résultats"
          className="absolute glass-edge top-[calc(100%+6px)] left-0 z-50 w-full overflow-hidden rounded-[var(--radius-md)] p-1 glass-3"
        >
          {visible.length === 0 ? (
            <p className="px-3 py-3 text-sm text-[var(--muted)]">
              {pending ? 'Recherche…' : 'Aucun résultat.'}
            </p>
          ) : (
            <ul>
              {visible.map((result) => (
                <li key={`${result.kind}-${result.id}`}>
                  <Link
                    href={result.href}
                    role="option"
                    aria-selected="false"
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 hover:bg-[var(--surface-hover)]"
                  >
                    <Icon
                      name={KIND_ICONS[result.kind]}
                      size={14}
                      className="mt-0.5 text-[var(--muted)]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{result.title}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {KIND_LABELS[result.kind]}
                        {result.subtitle ? ` · ${result.subtitle}` : ''}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
