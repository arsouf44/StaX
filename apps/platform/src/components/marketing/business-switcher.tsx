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
 * Exemples de projets, metier par metier.
 *
 * Le metier ne choisit PAS le site : aucun modele n'existe. Il nous aide a
 * comprendre le besoin, adapte le questionnaire, oriente les fonctionnalites
 * que nous suggerons et le vocabulaire de l'espace client. Les apercus sont
 * des illustrations de projets, jamais des gabarits proposes au client.
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
        aria-label="Exemples de projets par métier"
        className="glass-edge mx-auto flex w-fit max-w-full gap-1 rounded-full p-1 glass-2 sm:p-1.5"
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
              'rounded-full px-3 py-2 text-sm transition-[background-color,color,box-shadow] duration-300 sm:px-5 sm:py-2.5 sm:text-[0.9375rem]',
              active === variant.id
                ? 'bg-[var(--foreground)] font-medium text-[var(--background)] shadow-[0_8px_24px_-12px_rgb(0_0_0/0.8)]'
                : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]',
            )}
          >
            {variant.label}
          </button>
        ))}
      </div>

      <div className="mt-12 grid gap-8 lg:mt-16 lg:grid-cols-[1fr_19rem] lg:items-center">
        {/* La scene : un exemple de projet pour ce metier, qui change au clic. */}
        <div className="stage relative order-2 lg:order-1">
          <div
            key={current.id}
            className="animate-[reveal_0.55s_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none"
          >
            <BrowserFrame url={current.host} tone={current.id === 'coiffeur' ? 'light' : 'dark'}>
              <SitePreview variant={current.id} />
            </BrowserFrame>
          </div>

          {/* Le tableau de bord du meme metier, pose en surimpression. */}
          <div
            key={`${current.id}-dashboard`}
            className="glass-edge mt-4 rounded-[var(--radius-lg)] p-4 glass-3 motion-reduce:animate-none lg:absolute lg:right-6 lg:-bottom-10 lg:mt-0 lg:w-72 lg:animate-[reveal_0.7s_cubic-bezier(0.16,1,0.3,1)]"
          >
            <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Votre tableau de bord
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {current.dashboard.map((entry) => (
                <span
                  key={entry}
                  className="rounded-full border border-[var(--border)] bg-[var(--background-inset)] px-2.5 py-1 text-xs text-[var(--foreground-muted)]"
                >
                  {entry}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <p className="text-sm font-medium text-accent">{current.sector}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
            Fonctionnalités souvent utiles
          </p>
          <ul className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {current.modules.map((module) => (
              <li key={module} className="flex items-center gap-3 py-3 text-[0.9375rem]">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="size-4 shrink-0 text-[var(--accent-text)]"
                >
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.2 4.55-4 4.25-2.4-2.3 1.04-1.08 1.33 1.28 2.96-3.15 1.07 1Z" />
                </svg>
                <span>{module}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-relaxed text-[var(--foreground-muted)]">
            Nous vous les suggérons selon votre activité ; celles que vous retenez sont développées
            dans votre site, selon votre offre. Votre espace StaX parle ensuite votre métier : un
            plombier n’y voit jamais « Carte du restaurant ».
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            Aperçus d’illustration : chaque site est conçu individuellement, il n’existe pas de
            modèle à personnaliser.
          </p>
        </div>
      </div>
    </Container>
  );
}
