'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ButtonLink, Sheet, Wordmark, cn } from '@nemasus/ui';
import { COMPANY_LINKS, PRIMARY_NAV, RESOURCE_LINKS } from '~/lib/navigation';

/**
 * En-tete du site public.
 *
 * Le mot Nemasus a gauche, cinq liens a droite, puis l action principale
 * soulignee. Transparent en haut de page, l en-tete devient une bande de verre
 * depoli des que la page defile. Sous 900 px, les liens passent dans un
 * panneau lateral qui reprend aussi les ressources et l entreprise.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState<{ path: string; open: boolean }>({
    path: pathname,
    open: false,
  });
  // Une navigation referme le panneau : l etat ne vaut que pour la page ou
  // il a ete ouvert.
  const mobileOpen = menu.path === pathname && menu.open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-500',
        scrolled
          ? 'border-[var(--border)] bg-[rgb(241_242_243/0.8)] backdrop-blur-[18px] backdrop-saturate-150'
          : 'border-transparent bg-transparent',
      )}
    >
      <div className="shell flex h-[68px] items-center justify-between gap-6 max-[720px]:h-[58px]">
        <Link href="/" aria-label="Nemasus, accueil" className="shrink-0">
          <Wordmark size={23} />
        </Link>

        <nav aria-label="Navigation principale" className="max-[900px]:hidden">
          <ul className="flex items-center gap-[clamp(18px,2.4vw,34px)] text-[13.5px] tracking-[0.01em] text-[var(--foreground-muted)]">
            {PRIMARY_NAV.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className={cn(
                    'nav-link transition-colors duration-300 hover:text-[var(--foreground)]',
                    isActive(link.href) && 'text-[var(--foreground)]',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-[clamp(16px,2vw,28px)] text-[13.5px] tracking-[0.01em]">
          <Link
            href="/connexion"
            className="nav-link text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)] max-[560px]:hidden"
          >
            Se connecter
          </Link>
          {/* L'action principale se distingue des liens : un bouton à partir de
              900 px, un lien souligné en dessous, où la place manque. */}
          <ButtonLink
            href="/commander"
            variant="primary"
            size="pill-sm"
            className="max-[900px]:hidden"
          >
            Commander mon site
          </ButtonLink>
          <Link
            href="/commander"
            className="text-link !pt-2 !text-[13.5px] max-[400px]:!text-[13px] min-[901px]:hidden"
          >
            Commander mon site
          </Link>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--foreground)] transition-colors hover:bg-[var(--background-inset)] min-[901px]:hidden"
            aria-label="Ouvrir le menu"
            aria-expanded={mobileOpen}
            onClick={() => setMenu({ path: pathname, open: true })}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              className="h-3 w-5"
            >
              <path d="M0 1h20M0 6h20M6 11h14" />
            </svg>
          </button>
        </div>
      </div>

      <Sheet
        open={mobileOpen}
        onClose={() => setMenu({ path: pathname, open: false })}
        title="Navigation"
      >
        <nav aria-label="Navigation mobile" className="space-y-9">
          <ul className="border-t border-[var(--border)]">
            {PRIMARY_NAV.map((link) => (
              <li key={link.href} className="border-b border-[var(--border)]">
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? 'page' : undefined}
                  className="flex items-center justify-between py-3.5 font-serif text-[1.45rem] leading-tight text-[var(--foreground)]"
                >
                  {link.label}
                  <span aria-hidden="true" className="text-base text-[var(--ink-3)]">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {[
            { title: 'Ressources', links: RESOURCE_LINKS },
            { title: 'Le studio', links: COMPANY_LINKS },
          ].map((group) => (
            <div key={group.title}>
              <p className="kicker">{group.title}</p>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="space-y-2 border-t border-[var(--border)] pt-6">
            <ButtonLink size="pill" href="/commander" variant="primary" block>
              Commander mon site
            </ButtonLink>
            <ButtonLink size="pill" href="/connexion" variant="secondary" block>
              Se connecter
            </ButtonLink>
          </div>
        </nav>
      </Sheet>
    </header>
  );
}
