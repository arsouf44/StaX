import Link from 'next/link';
import { Container, Wordmark } from '@nemasus/ui';
import { supportContact } from '~/lib/contact';

/**
 * Enveloppe du parcours de commande.
 *
 * Aucune navigation marketing : une personne en train de commander ne doit pas
 * etre distraite par dix liens sortants. Seuls le retour a l accueil, une
 * personne a joindre (le telephone, sans quitter la page) et les mentions
 * indispensables restent accessibles.
 */
export default function OrderLayout({ children }: { children: React.ReactNode }) {
  const contact = supportContact();
  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="mx-auto flex min-h-[76px] w-full max-w-[1280px] items-center justify-between gap-4 border-b border-[var(--line)] px-[clamp(20px,4.4vw,64px)] max-[800px]:min-h-[64px]">
        <Link href="/" aria-label="Nemasus — accueil" className="inline-flex">
          <Wordmark size={24} />
        </Link>
        {contact.phone && contact.phoneHref ? (
          <p className="text-right text-[13.5px] tracking-[0.01em] text-[var(--foreground-muted)]">
            <span className="max-[560px]:hidden">Une question ? </span>
            <a
              href={contact.phoneHref}
              className="nav-link text-[var(--ink)] hover:text-[var(--ink)]"
            >
              {contact.phone}
            </a>
          </p>
        ) : (
          <Link
            href="/comment-ca-marche"
            className="nav-link text-[13.5px] tracking-[0.01em] text-[var(--foreground-muted)] hover:text-[var(--ink)]"
          >
            Comment ça marche
          </Link>
        )}
      </header>

      <main id="contenu-principal" className="flex-1 py-10 sm:py-14">
        <Container size="default">{children}</Container>
      </main>

      <footer className="py-8 text-[12.5px] tracking-[0.01em] text-[var(--muted)]">
        <Container size="default">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>
              Gratuit et sans engagement. Paiement par virement, seulement après réception du
              montant et du délai.
            </span>
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
