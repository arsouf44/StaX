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
}

export function AppShell({ groups, header, children }: AppShellProps) {
  const pathname = usePathname();
  const drawerId = useId();
  // L etat du tiroir est deliberement per-appareil : un telephone et un
  // ordinateur n ont pas les memes contraintes de place.
  const open = useLocalStorageValue('stax.nav.open') === 'true';

  const isActive = (href: string) =>
    href === '/app' ? pathname === '/app' : pathname.startsWith(href);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur-xl">
        {header}
      </header>

      <div className="mx-auto flex w-full max-w-[100rem] flex-1 gap-0 px-4 sm:px-6 lg:gap-8 lg:px-8">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={drawerId}
          onClick={() => writeLocalStorage('stax.nav.open', open ? 'false' : 'true')}
          className="my-4 inline-flex items-center gap-2 self-start rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm lg:hidden"
        >
          <Icon name="menu" />
          Menu
        </button>

        <nav
          id={drawerId}
          aria-label="Navigation de l’espace client"
          className={cn(
            'shrink-0 pb-10 lg:block lg:w-60 lg:py-8',
            open ? 'block w-full py-4' : 'hidden',
          )}
        >
          {groups.map((group) => (
            <div key={group.id} className="mb-7">
              <p className="mb-2 px-3 text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm transition-colors',
                        isActive(item.href)
                          ? 'bg-[var(--surface-elevated)] font-medium text-[var(--foreground)]'
                          : 'text-[var(--foreground-muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]',
                      )}
                    >
                      <Icon name={item.icon} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <main id="contenu-principal" className="min-w-0 flex-1 py-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
