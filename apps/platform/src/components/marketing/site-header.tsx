'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ButtonLink, Sheet, Wordmark, cn } from '@stax/ui';
import { PRIMARY_NAV, type NavGroup } from '~/lib/navigation';

/**
 * En-tete du site public.
 *
 * Trois colonnes, comme une page de garde : la navigation en petites
 * capitales a gauche, le mot StaX au centre, l action a droite, le tout pose
 * sur un trait de 1 px. Menus deroulants au survol ET au clavier, panneau
 * lateral sous 1180 px. La navigation reste entierement utilisable sans
 * souris : chaque groupe est un bouton, chaque menu se ferme avec Echap.
 *
 * Le groupe « Entreprise » ne figure que dans le panneau mobile et le pied de
 * page : six entrees ne tiennent pas dans la moitie gauche sans se serrer.
 */
const DESKTOP_NAV = PRIMARY_NAV.filter((group) => group.label !== 'Entreprise');

export function SiteHeader() {
  const pathname = usePathname();
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
    <header className="relative z-50">
      <div className="mx-auto grid min-h-[82px] w-[min(1370px,calc(100%-56px))] grid-cols-[1fr_auto] items-center border-b border-[var(--line)] max-[800px]:w-[min(calc(100%-32px),620px)] min-[1180px]:min-h-[114px] min-[1180px]:grid-cols-[1fr_auto_1fr]">
        <nav aria-label="Navigation principale" className="hidden min-[1180px]:block">
          <ul className="flex items-center gap-[27px] text-xs font-[690] tracking-[0.03em] text-[#4f6c79] uppercase">
            {DESKTOP_NAV.map((group) => (
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
                        'nav-link uppercase transition-colors hover:text-[var(--ink)]',
                        (openGroup === group.label || isActive(group.href)) && 'text-[var(--ink)]',
                      )}
                    >
                      {group.label}
                    </button>
                    {openGroup === group.label ? (
                      <MegaMenu group={group} onNavigate={() => setOpenGroup(null)} />
                    ) : null}
                  </>
                ) : (
                  <Link
                    href={group.href ?? '/'}
                    aria-current={isActive(group.href) ? 'page' : undefined}
                    className={cn(
                      'nav-link transition-colors hover:text-[var(--ink)]',
                      isActive(group.href) && 'text-[var(--ink)]',
                    )}
                  >
                    {group.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <Link
          href="/"
          aria-label="StaX — accueil"
          className="justify-self-start min-[1180px]:justify-self-center"
        >
          <Wordmark size={30} />
        </Link>

        <div className="flex items-center gap-6 justify-self-end text-xs font-[680] tracking-[0.03em] text-[#476878] uppercase">
          <Link
            href="/connexion"
            className="nav-link hidden transition-colors hover:text-[var(--ink)] sm:inline-block"
          >
            Se connecter
          </Link>
          <Link
            href="/commander"
            className="group inline-flex items-center gap-[9px] text-[var(--ink)] transition-colors"
          >
            <span className="max-[480px]:sr-only">Créer mon site</span>
            <span
              aria-hidden="true"
              className="text-base leading-none text-[#1c586f] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 max-[480px]:text-lg"
            >
              ↗
            </span>
          </Link>
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2.5 uppercase transition-colors hover:text-[var(--ink)] min-[1180px]:hidden"
            aria-label="Ouvrir le menu"
            onClick={() => setMobileOpen(true)}
          >
            <span className="max-sm:sr-only">Menu</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              className="h-3 w-5"
            >
              <path d="M0 1h20M0 6h20M6 11h14" />
            </svg>
          </button>
        </div>
      </div>

      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)} title="Navigation">
        <nav aria-label="Navigation mobile" className="space-y-7">
          {PRIMARY_NAV.map((group) => (
            <div key={group.label}>
              {group.href ? (
                <Link
                  href={group.href}
                  className="kicker block !text-[var(--ink)] transition-colors hover:!text-[var(--accent)]"
                >
                  {group.label}
                </Link>
              ) : (
                <p className="kicker">{group.label}</p>
              )}
              {group.items ? (
                <ul className="mt-3 border-t border-[var(--line)]">
                  {group.items.map((item) => (
                    <li key={item.href} className="border-b border-[var(--line)]">
                      <Link
                        href={item.href}
                        className="flex items-center justify-between py-2.5 text-sm font-semibold text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                      >
                        {item.label}
                        <span aria-hidden="true" className="text-[#5b94aa]">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          <div className="space-y-2 border-t border-[var(--line)] pt-6">
            <ButtonLink size="pill" href="/connexion" variant="secondary" block>
              Se connecter
            </ButtonLink>
            <ButtonLink size="pill" href="/commander" variant="primary" block>
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
        'absolute top-[calc(100%+22px)] left-0 z-40 p-2 normal-case glass-3',
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
                className="group block p-3 tracking-normal transition-colors hover:bg-[rgb(255_255_255/0.7)]"
              >
                <span className="flex items-center gap-2 text-sm font-bold tracking-[-0.015em] text-[var(--foreground)]">
                  {item.label}
                  {item.badge ? (
                    <span className="border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-1.5 py-0.5 text-2xs text-accent">
                      {item.badge}
                    </span>
                  ) : null}
                </span>
                {item.description ? (
                  <span className="mt-0.5 block text-xs leading-relaxed font-normal text-[var(--muted)]">
                    {item.description}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>

        {group.featured ? (
          <div className="glass-rings flex flex-col justify-between border border-[rgb(255_255_255/0.76)] bg-[var(--glass-warm)] p-5 tracking-normal">
            <div>
              <p className="kicker">Principe StaX</p>
              <p className="mt-4 text-2xl leading-[0.98] font-[725] tracking-[-0.06em] text-[#244758]">
                {group.featured.title}
              </p>
              <p className="mt-3 text-xs leading-relaxed font-normal text-[var(--foreground-muted)]">
                {group.featured.description}
              </p>
            </div>
            <Link
              href={group.featured.href}
              onClick={onNavigate}
              className="text-link mt-5 self-start"
            >
              {group.featured.cta}
              <span aria-hidden="true" className="arrow">
                ↗
              </span>
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
