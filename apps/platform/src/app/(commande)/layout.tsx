import Link from 'next/link';
import { Container, Logo } from '@stax/ui';

/**
 * Enveloppe du parcours d achat.
 *
 * Aucune navigation marketing : une personne en train de commander ne doit pas
 * etre distraite par dix liens sortants. Seuls le retour a l accueil et les
 * mentions indispensables restent accessibles.
 */
export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        aria-hidden="true"
        className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10"
      />
      <header className="border-b border-[var(--border)] py-5">
        <Container size="default">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="StaX — accueil" className="inline-flex">
              <Logo size={24} />
            </Link>
            <Link
              href="/tarifs"
              className="text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            >
              Revoir les offres
            </Link>
          </div>
        </Container>
      </header>

      <main id="contenu-principal" className="flex-1 py-10 sm:py-14">
        <Container size="default">{children}</Container>
      </main>

      <footer className="py-8 text-xs text-[var(--muted)]">
        <Container size="default">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Paiement sécurisé — aucune donnée de carte ne transite par StaX.</span>
            <Link href="/cgv" className="hover:text-[var(--foreground)]">
              Conditions générales de vente
            </Link>
            <Link href="/remboursements" className="hover:text-[var(--foreground)]">
              Garantie de remboursement
            </Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}
