import Link from 'next/link';
import { Container, Wordmark } from '@nemasus/ui';

/**
 * Enveloppe du parcours de commande.
 *
 * Aucune navigation marketing : une personne en train de commander ne doit pas
 * etre distraite par dix liens sortants. Seuls le retour a l accueil, l aide
 * et les mentions indispensables restent accessibles.
 */
export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="mx-auto flex min-h-[76px] w-full max-w-[1280px] items-center justify-between gap-4 border-b border-[var(--line)] px-[clamp(20px,4.4vw,64px)] max-[800px]:min-h-[64px]">
        <Link href="/" aria-label="Nemasus — accueil" className="inline-flex">
          <Wordmark size={24} />
        </Link>
        <Link
          href="/comment-ca-marche"
          className="nav-link text-[13.5px] tracking-[0.01em] text-[var(--foreground-muted)] hover:text-[var(--ink)]"
        >
          Comment ça marche
        </Link>
      </header>

      <main id="contenu-principal" className="flex-1 py-10 sm:py-14">
        <Container size="default">{children}</Container>
      </main>

      <footer className="py-8 text-[12.5px] tracking-[0.01em] text-[var(--muted)]">
        <Container size="default">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>Paiement par virement bancaire, après réception des modalités.</span>
            <Link href="/cgv" className="hover:text-[var(--ink)]">
              Conditions générales de vente
            </Link>
            <Link href="/confidentialite" className="hover:text-[var(--ink)]">
              Confidentialité
            </Link>
            <Link href="/contact" className="hover:text-[var(--ink)]">
              Nous écrire
            </Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}
