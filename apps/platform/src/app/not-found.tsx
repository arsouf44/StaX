import Link from 'next/link';
import { ButtonLink, Container, Logo } from '@stax/ui';

/**
 * Page introuvable.
 *
 * Elle propose des issues concretes plutot qu un cul-de-sac : la plupart des
 * 404 viennent d un lien ancien ou d une faute de frappe, pas d une intention.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="py-8">
        <Container size="default">
          <Link href="/" aria-label="StaX — accueil" className="inline-flex">
            <Logo />
          </Link>
        </Container>
      </header>

      <main id="contenu-principal" className="flex flex-1 items-center">
        <Container size="default">
          <div className="max-w-xl">
            <p className="eyebrow-index">Erreur 404</p>
            <h1 className="display-panel mt-4">Cette page n’existe pas</h1>
            <p className="mt-4 leading-relaxed text-[var(--foreground-muted)]">
              Le lien est peut-être ancien, ou l’adresse comporte une erreur. Voici où aller
              maintenant.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/">Retour à l’accueil</ButtonLink>
              <ButtonLink href="/tarifs" variant="secondary">
                Voir les offres
              </ButtonLink>
              <ButtonLink href="/contact" variant="ghost">
                Nous écrire
              </ButtonLink>
            </div>

            <ul className="mt-10 space-y-2 text-sm text-[var(--foreground-muted)]">
              <li>
                <Link href="/app" className="underline underline-offset-4">
                  Mon espace client
                </Link>
              </li>
              <li>
                <Link href="/tarifs" className="underline underline-offset-4">
                  Nos offres
                </Link>
              </li>
              <li>
                <Link href="/aide" className="underline underline-offset-4">
                  Centre d’aide
                </Link>
              </li>
            </ul>
          </div>
        </Container>
      </main>
    </div>
  );
}
