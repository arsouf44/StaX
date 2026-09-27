import Link from 'next/link';
import { Container, Wordmark } from '@stax/ui';

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
      <header className="mx-auto flex min-h-[96px] w-[min(1370px,calc(100%-56px))] items-center justify-between gap-4 border-b border-[var(--line)] max-[800px]:min-h-[82px] max-[800px]:w-[min(calc(100%-32px),620px)]">
        <Link href="/" aria-label="StaX — accueil" className="inline-flex">
          <Wordmark size={30} />
        </Link>
        <Link
          href="/tarifs"
          className="nav-link text-xs font-[680] tracking-[0.03em] text-[#476878] uppercase hover:text-[var(--ink)]"
        >
          Revoir les offres
        </Link>
      </header>

      <main id="contenu-principal" className="flex-1 py-10 sm:py-14">
        <Container size="default">{children}</Container>
      </main>

      <footer className="py-8 text-[11px] font-[650] tracking-[0.05em] text-[var(--muted)] uppercase">
        <Container size="default">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Paiement sécurisé — aucune donnée de carte ne transite par StaX.</span>
            <Link href="/cgv" className="hover:text-[var(--ink)]">
              Conditions générales de vente
            </Link>
            <Link href="/remboursements" className="hover:text-[var(--ink)]">
              Garantie de remboursement
            </Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}
