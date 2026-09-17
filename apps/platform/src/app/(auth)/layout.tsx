import Link from 'next/link';
import { Container, Logo } from '@stax/ui';
import { legalValue } from '@stax/config';

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
      <div
        aria-hidden="true"
        className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10"
      />
      <header className="py-8">
        <Container size="default">
          <Link href="/" aria-label="StaX — accueil" className="inline-flex">
            <Logo />
          </Link>
        </Container>
      </header>

      <main id="contenu-principal" className="flex flex-1 items-center py-6">
        <Container size="default">{children}</Container>
      </main>

      <footer className="py-8 text-xs text-[var(--muted)]">
        <Container size="default">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>{company}</span>
            <Link href="/mentions-legales" className="hover:text-[var(--foreground)]">
              Mentions légales
            </Link>
            <Link href="/confidentialite" className="hover:text-[var(--foreground)]">
              Confidentialité
            </Link>
            <Link href="/aide" className="hover:text-[var(--foreground)]">
              Aide
            </Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}
