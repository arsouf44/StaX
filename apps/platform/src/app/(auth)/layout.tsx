import Link from 'next/link';
import { Wordmark } from '@nemasus/ui';
import { legalValue } from '@nemasus/config';

/**
 * Enveloppe des pages d authentification.
 *
 * Volontairement depouillee : pas de navigation marketing, pas de liens
 * secondaires. Une page de connexion doit avoir un seul objectif visible, et
 * ne rien offrir d autre a cliquer par erreur.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const company = legalValue('LEGAL_COMPANY_NAME');

  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="mx-auto flex min-h-[76px] w-full max-w-[1280px] items-center justify-center border-b border-[var(--line)] px-[clamp(20px,4.4vw,64px)] max-[800px]:min-h-[64px]">
        <Link href="/" aria-label="Nemasus — accueil" className="inline-flex">
          <Wordmark size={24} />
        </Link>
      </header>

      <main id="contenu-principal" className="flex flex-1 items-center py-12">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>
      </main>

      <footer className="mx-auto w-full max-w-[1280px] px-[clamp(20px,4.4vw,64px)] pb-7">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 text-[12.5px] tracking-[0.01em] text-[var(--muted)]">
          <span>
            {company} © {new Date().getFullYear()}
          </span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/mentions-legales" className="hover:text-[var(--ink)]">
              Mentions légales
            </Link>
            <Link href="/confidentialite" className="hover:text-[var(--ink)]">
              Confidentialité
            </Link>
            <Link href="/aide" className="hover:text-[var(--ink)]">
              Aide
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
