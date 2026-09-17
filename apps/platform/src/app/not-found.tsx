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

      <main id="contenu-principal" className="flex flex-1 items-center">
        <Container size="default">
          <div className="max-w-xl">
            <p className="text-2xs font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
              Erreur 404
            </p>
            <h1 className="mt-4 text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
              Cette page n’existe pas
            </h1>
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
                <Link href="/metiers" className="underline underline-offset-4">
                  Les sites par métier
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
