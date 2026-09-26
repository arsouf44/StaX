'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, type ReactNode } from 'react';
import { Icon, cn, useLocalStorageValue, writeLocalStorage } from '@stax/ui';
import type { NavGroup } from '@stax/business';

/**
 * Cadre de l espace client.
 *
 * Deux exigences guident cette mise en page :
 *  - le vocabulaire reste celui du metier du client (« Carte », « Prestations »,
 *    « Biens »), jamais celui du produit (« entites », « collections ») ;
 *  - la navigation est identique sur mobile et sur grand ecran, simplement
 *    repliee dans un tiroir : rien n est retire aux petits ecrans.
 */

export interface AppShellProps {
  groups: NavGroup[];
  header: ReactNode;
  children: ReactNode;
  /** Pastilles de nombre par entrée (messages non lus…), lues côté serveur. */
  badges?: Record<string, number>;
}

export function AppShell({ groups, header, children, badges = {} }: AppShellProps) {
  const totalBadges = Object.values(badges).reduce((sum, count) => sum + count, 0);
  const pathname = usePathname();
  const drawerId = useId();
  // L etat du tiroir est deliberement per-appareil : un telephone et un
  // ordinateur n ont pas les memes contraintes de place.
  const open = useLocalStorageValue('stax.nav.open') === 'true';

  const isActive = (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);
  // Les réglages rarement utiles sont regroupés en bas, sous un seul libellé.
  const secondary = groups.flatMap((group) => group.items.filter((item) => item.secondary));

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-xl">
        {header}
      </header>

      <div className="mx-auto flex w-full max-w-[100rem] flex-1 flex-col gap-0 px-4 sm:px-6 lg:flex-row lg:gap-8 lg:px-8">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={drawerId}
          onClick={() => writeLocalStorage('stax.nav.open', open ? 'false' : 'true')}
          className="my-4 inline-flex items-center gap-2 self-start rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm lg:hidden"
        >
          <Icon name="menu" />
          Menu
          {totalBadges > 0 ? (
            <span className="rounded-full bg-[var(--accent)] px-1.5 text-2xs font-medium text-[var(--accent-foreground)]">
              {totalBadges}
            </span>
          ) : null}
        </button>

        <nav
          id={drawerId}
          aria-label="Navigation de l’espace client"
          className={cn(
            'shrink-0 pb-10 lg:block lg:w-60 lg:py-8',
            open ? 'block w-full py-4' : 'hidden',
          )}
        >
          {groups.map((group) => {
            const primary = group.items.filter((item) => !item.secondary);
            if (primary.length === 0) return null;
            return (
              <div key={group.id} className="mb-7">
                <p className="mb-2 px-3 text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {primary.map((item) => (
                    <li key={item.href}>
                      <NavItem item={item} active={isActive(item.href)} badge={badges[item.href]} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {secondary.length > 0 ? (
            <details className="mb-7" open={secondary.some((item) => isActive(item.href))}>
              <summary className="cursor-pointer list-none px-3 py-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]">
                Plus d’options
              </summary>
              <ul className="mt-1 space-y-0.5">
                {secondary.map((item) => (
                  <li key={item.href}>
                    <NavItem item={item} active={isActive(item.href)} badge={badges[item.href]} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </nav>

        <main id="contenu-principal" className="min-w-0 flex-1 py-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavItem({
  item,
  active,
  badge,
}: {
  item: NavGroup['items'][number];
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-[var(--surface-elevated)] font-medium text-[var(--foreground)]'
          : 'text-[var(--foreground-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]',
      )}
    >
      <Icon name={item.icon} />
      <span className="truncate">{item.label}</span>
      {badge ? (
        <span
          className="ml-auto rounded-full bg-[var(--accent)] px-1.5 text-2xs font-medium text-[var(--accent-foreground)]"
          aria-label={`${badge} non lu(s)`}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
