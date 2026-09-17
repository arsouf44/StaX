import Link from 'next/link';
import { cn } from '@stax/ui';

/**
 * Onglets de filtrage rendus par des LIENS.
 *
 * Choix delibere : chaque filtre a sa propre URL. Le filtre survit donc au
 * rechargement, se partage, se met en favori, et fonctionne sans JavaScript.
 * Le filtrage lui-meme est fait en base, pas dans le navigateur.
 */
export interface FilterTab {
  value: string;
  label: string;
  count?: number;
}

export function FilterTabs({
  tabs,
  active,
  buildHref,
  ariaLabel,
}: {
  tabs: FilterTab[];
  active: string;
  buildHref: (value: string) => string;
  ariaLabel: string;
}) {
  return (
    <nav aria-label={ariaLabel}>
      <ul className="flex flex-wrap gap-1 border-b border-[var(--border)]">
        {tabs.map((tab) => {
          const current = tab.value === active;
          return (
            <li key={tab.value}>
              <Link
                href={buildHref(tab.value)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors',
                  current
                    ? 'border-[var(--accent)] font-medium text-[var(--foreground)]'
                    : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]',
                )}
              >
                {tab.label}
                {tab.count && tab.count > 0 ? (
                  <span className="rounded-full bg-[var(--surface-elevated)] px-1.5 py-0.5 text-2xs tabular-nums">
                    {tab.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
