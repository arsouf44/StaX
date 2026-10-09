'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@nemasus/ui';

/**
 * Barre d'action du site public, sur téléphone seulement.
 *
 * Elle apparaît une fois le premier écran passé (l'action y est déjà
 * visible) et s'efface en bas de page, où le pied de page reprend les mêmes
 * liens : elle ne cache jamais un contenu que l'on cherche à lire. Deux
 * gestes, pas davantage : commander, ou appeler une personne.
 */
export function MobileCtaBar({
  phone,
  phoneHref,
}: {
  phone: string | null;
  phoneHref: string | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      const scrolled = window.scrollY > window.innerHeight * 0.75;
      const nearEnd =
        window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 480;
      setVisible(scrolled && !nearEnd);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <nav
      aria-label="Actions rapides"
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[rgb(241_242_243/0.92)] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[18px] transition-transform duration-300 ease-[cubic-bezier(0.19,0.85,0.22,1)] motion-reduce:transition-none min-[720px]:hidden',
        visible ? 'translate-y-0' : 'translate-y-full',
      )}
    >
      <div className="flex items-center gap-3">
        <Link
          href="/commander"
          className="flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--ink)] px-5 text-[15px] font-medium text-[var(--background)]"
        >
          Commander mon site
        </Link>
        {phone && phoneHref ? (
          <a
            href={phoneHref}
            aria-label={`Appeler le ${phone}`}
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-white/80 text-[var(--ink)]"
          >
            <svg aria-hidden="true" viewBox="0 0 256 256" fill="currentColor" className="size-5">
              <path d="M222.37,158.46l-47.11-21.11-.13-.06a16,16,0,0,0-15.17,1.4,8.12,8.12,0,0,0-.75.56L134.87,160c-15.42-7.49-31.34-23.29-38.83-38.51l20.78-24.71c.2-.25.39-.5.57-.77a16,16,0,0,0,1.32-15.06l0-.12L97.54,33.64a16,16,0,0,0-16.62-9.52A56.26,56.26,0,0,0,32,80c0,79.4,64.6,144,144,144a56.26,56.26,0,0,0,55.88-48.92A16,16,0,0,0,222.37,158.46ZM176,208A128.14,128.14,0,0,1,48,80,40.2,40.2,0,0,1,82.87,40a.61.61,0,0,0,0,.12l21,47L83.2,111.86a6.13,6.13,0,0,0-.57.77,16,16,0,0,0-1,15.7c9.06,18.53,27.73,37.06,46.46,46.11a16,16,0,0,0,15.75-1.14,8.44,8.44,0,0,0,.74-.56L168.89,152l47,21.05h0s.08,0,.11,0A40.21,40.21,0,0,1,176,208Z" />
            </svg>
          </a>
        ) : null}
      </div>
    </nav>
  );
}
