'use client';

import { useState } from 'react';
import { Container, cn } from '@stax/ui';
import { BrowserFrame, SitePreview, type SitePreviewVariant } from './product-visuals';

interface BusinessVariant {
  id: SitePreviewVariant;
  label: string;
  sector: string;
  host: string;
  modules: string[];
  dashboard: string[];
}

/**
 * Demonstration : le metier choisi change le site produit.
 *
 * Ce n est pas une illustration decorative — c est exactement ce que fait le
 * produit : le metier determine les modules actives, les pages proposees, le
 * vocabulaire de l espace client et les donnees structurees du site public.
 */

const VARIANTS: [BusinessVariant, ...BusinessVariant[]] = [
  {
    id: 'restaurant',
    label: 'Restaurant',
    sector: 'Restauration',
    host: 'restaurant-dupont.fr',
    modules: ['Carte & menus', 'Réservations', 'Horaires', 'Galerie', 'Avis clients'],
    dashboard: ['Carte', 'Réservations', 'Messages', 'Horaires', 'Statistiques'],
  },
  {
    id: 'coiffeur',
    label: 'Coiffeur',
    sector: 'Beauté & bien-être',
    host: 'atelier-camille.fr',
    modules: ['Prestations & tarifs', 'Rendez-vous', 'Équipe', 'Galerie', 'Avis clients'],
    dashboard: ['Prestations', 'Rendez-vous', 'Équipe', 'Messages', 'Statistiques'],
  },
  {
    id: 'artisan',
    label: 'Plombier',
    sector: 'Artisanat & bâtiment',
    host: 'martin-plomberie.fr',
    modules: ['Prestations', 'Zones d’intervention', 'Réalisations', 'Devis', 'Avis clients'],
    dashboard: ['Prestations', 'Prospects', 'Réalisations', 'Zones', 'Messages'],
  },
];

export function BusinessSwitcher() {
  const [active, setActive] = useState<SitePreviewVariant>('restaurant');
  // Le premier element est garanti present par le type tuple non vide.
  const [fallback] = VARIANTS;
  const current = VARIANTS.find((variant) => variant.id === active) ?? fallback;

  return (
    <Container size="wide">
      <div
        role="tablist"
        aria-label="Aperçu par métier"
        className="mx-auto flex w-fit gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const index = VARIANTS.findIndex((v) => v.id === active);
          const next =
            event.key === 'ArrowRight'
              ? VARIANTS[(index + 1) % VARIANTS.length]
              : VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length];
          if (next) setActive(next.id);
        }}
      >
        {VARIANTS.map((variant) => (
          <button
            key={variant.id}
            type="button"
            role="tab"
            aria-selected={active === variant.id}
            tabIndex={active === variant.id ? 0 : -1}
            onClick={() => setActive(variant.id)}
            className={cn(
              'rounded-full px-4 py-2 text-sm transition-colors',
              active === variant.id
                ? 'bg-[var(--primary)] font-medium text-[var(--primary-foreground)]'
                : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]',
            )}
          >
            {variant.label}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <BrowserFrame
          url={current.host}
          tone={current.id === 'coiffeur' ? 'light' : 'dark'}
          className="order-2 lg:order-1"
        >
          <SitePreview variant={current.id} />
        </BrowserFrame>

        <div className="order-1 space-y-4 lg:order-2">
          <div className="glass-edge rounded-[var(--radius-lg)] p-5 glass-2">
            <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Secteur
            </p>
            <p className="mt-1.5 text-sm font-medium">{current.sector}</p>

            <p className="mt-5 text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Modules activés automatiquement
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {current.modules.map((module) => (
                <li key={module} className="flex items-center gap-2 text-xs">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className="size-3 shrink-0 text-[var(--success)]"
                  >
                    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.2 4.55-4 4.25-2.4-2.3 1.04-1.08 1.33 1.28 2.96-3.15 1.07 1Z" />
                  </svg>
                  <span className="text-[var(--foreground-muted)]">{module}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Votre tableau de bord
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {current.dashboard.map((entry) => (
                <span
                  key={entry}
                  className="rounded-md border border-[var(--border)] bg-[var(--background-inset)] px-2 py-1 text-xs text-[var(--foreground-muted)]"
                >
                  {entry}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
              Un plombier ne voit jamais « Carte du restaurant ». L’interface s’adapte à votre
              métier, pas l’inverse.
            </p>
          </div>
        </div>
      </div>
    </Container>
  );
}
