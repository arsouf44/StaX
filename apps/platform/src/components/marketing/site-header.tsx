'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ButtonLink, Logo, Sheet, cn, useScrolledPast } from '@stax/ui';
import { PRIMARY_NAV, type NavGroup } from '~/lib/navigation';

/**
 * En-tete du site public.
 *
 * Verre translucide qui se densifie au defilement, menus deroulants au survol
 * ET au clavier, et panneau lateral sur mobile. La navigation reste
 * entierement utilisable sans souris : chaque groupe est un bouton, chaque
 * menu se ferme avec Echap.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const scrolled = useScrolledPast(12);
  const [menuState, setMenuState] = useState<{
    path: string;
    group: string | null;
    mobile: boolean;
  }>({ path: pathname, group: null, mobile: false });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Une navigation referme les menus : plutot que d'ecrire l'etat depuis un
  // effet, on invalide l'etat des qu'il se rapporte a une autre page.
  const fresh = menuState.path === pathname;
  const openGroup = fresh ? menuState.group : null;
  const mobileOpen = fresh ? menuState.mobile : false;

  const setOpenGroup = useCallback(
    (group: string | null) => setMenuState({ path: pathname, group, mobile: false }),
    [pathname],
  );
  const setMobileOpen = useCallback(
    (mobile: boolean) => setMenuState({ path: pathname, group: null, mobile }),
    [pathname],
  );

  useEffect(() => {
    if (!openGroup) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroup(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openGroup, setOpenGroup]);

  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenGroup(null), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  const isActive = (href?: string) =>
    Boolean(href) && (pathname === href || (href !== '/' && pathname.startsWith(`${href}/`)));

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--background)_78%,transparent)] backdrop-blur-xl'
          : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[88rem] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="StaX — accueil"
          className="shrink-0 rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        >
          <Logo size={26} />
        </Link>

        <nav aria-label="Navigation principale" className="hidden flex-1 lg:flex">
          <ul className="flex items-center gap-1">
            {PRIMARY_NAV.map((group) => (
              <li
                key={group.label}
                className="relative"
                onMouseEnter={() => {
                  if (group.items) {
                    cancelClose();
                    setOpenGroup(group.label);
                  }
                }}
                onMouseLeave={group.items ? scheduleClose : undefined}
              >
                {group.items ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={openGroup === group.label}
                      aria-haspopup="true"
                      onClick={() => setOpenGroup(openGroup === group.label ? null : group.label)}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-sm transition-colors',
                        openGroup === group.label || isActive(group.href)
                          ? 'text-[var(--foreground)]'
                          : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]',
                      )}
                    >
                      {group.label}
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className={cn(
                          'size-3 transition-transform duration-200',
                          openGroup === group.label && 'rotate-180',
                        )}
                      >
                        <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {openGroup === group.label ? (
                      <MegaMenu group={group} onNavigate={() => setOpenGroup(null)} />
                    ) : null}
                  </>
                ) : (
                  <Link
                    href={group.href ?? '/'}
                    className={cn(
                      'inline-flex h-9 items-center rounded-[var(--radius-sm)] px-3 text-sm transition-colors',
                      isActive(group.href)
                        ? 'text-[var(--foreground)]'
                        : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]',
                    )}
                  >
                    {group.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/connexion" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Se connecter
          </ButtonLink>
          <ButtonLink href="/commander" variant="primary" size="sm">
            Créer mon site
          </ButtonLink>
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-label="Ouvrir le menu"
            onClick={() => setMobileOpen(true)}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
            </svg>
          </Button>
        </div>
      </div>

      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} title="Navigation">
        <nav aria-label="Navigation mobile" className="space-y-6">
          {PRIMARY_NAV.map((group) => (
            <div key={group.label}>
              {group.href ? (
                <Link
                  href={group.href}
                  className="block text-sm font-medium text-[var(--foreground)]"
                >
                  {group.label}
                </Link>
              ) : (
                <p className="text-2xs font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
                  {group.label}
                </p>
              )}
              {group.items ? (
                <ul className="mt-3 space-y-1 border-l border-[var(--border)] pl-4">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block py-1.5 text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          <div className="space-y-2 border-t border-[var(--border)] pt-6">
            <ButtonLink href="/connexion" variant="secondary" block>
              Se connecter
            </ButtonLink>
            <ButtonLink href="/commander" variant="primary" block>
              Créer mon site
            </ButtonLink>
          </div>
        </nav>
      </Sheet>
    </header>
  );
}

function MegaMenu({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  const hasFeatured = Boolean(group.featured);
  return (
    <div
      className={cn(
        'absolute glass-edge top-[calc(100%+10px)] left-0 z-40 rounded-[var(--radius-lg)] p-2 glass-3',
        'animate-[reveal_0.18s_cubic-bezier(0.16,1,0.3,1)]',
        hasFeatured ? 'w-[46rem]' : 'w-[22rem]',
      )}
    >
      <div className={cn('grid gap-2', hasFeatured && 'grid-cols-[1fr_16rem]')}>
        <ul
          className={cn(
            'grid gap-0.5',
            hasFeatured && (group.items?.length ?? 0) > 6 ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {group.items?.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                className="group block rounded-[var(--radius-md)] p-3 transition-colors hover:bg-[var(--surface-hover)]"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  {item.label}
                  {item.badge ? (
                    <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-1.5 py-0.5 text-2xs text-[var(--accent)]">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                {item.description ? (
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted)]">
                    {item.description}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>

        {group.featured ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background-inset)] p-5">
            <p className="text-sm font-medium">{group.featured.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
              {group.featured.description}
            </p>
            <Link
              href={group.featured.href}
              onClick={onNavigate}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)]"
            >
              {group.featured.cta}
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="size-3"
              >
                <path d="M3 8h10m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
