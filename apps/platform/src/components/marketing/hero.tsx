import Link from 'next/link';
import { ButtonLink, Container } from '@stax/ui';
import { Parallax, Reveal } from '@stax/ui';
import {
  BookingPanel,
  BrowserFrame,
  DashboardMock,
  DeployPanel,
  InboxPanel,
  PaymentPanel,
} from './product-visuals';

/**
 * Banniere d accueil.
 *
 * Composition en couches : une grille technique qui se prolonge sous la
 * section, une representation du produit posee dans un navigateur, et des
 * panneaux de verre qui flottent au-dessus. Le tout en HTML et SVG — rien a
 * telecharger, rien a maintenir en capture d ecran.
 */
export function Hero({
  entryPrice,
  businessCount,
}: {
  /**
   * Libelle tarifaire calcule depuis le catalogue, ou `null` s il est
   * injoignable : mieux vaut ne rien annoncer qu annoncer un prix perime sur
   * la page qui sert a vendre.
   */
  entryPrice: string | null;
  /** Nombre reel de metiers configures, lu dans le registre. */
  businessCount: number;
}) {
  return (
    <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-24">
      {/* Fond : grille + halo, purement decoratifs */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="grid-bg grid-bg-fade absolute inset-0" />
        <div className="absolute top-[-18rem] left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-40 blur-3xl" />
        <div className="beam absolute inset-x-0 top-16 h-px opacity-30" />
      </div>

      <Container size="wide">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <Link
              href="/metiers"
              className="glass-edge inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-[var(--foreground-muted)] glass-2 transition-colors hover:text-[var(--foreground)]"
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--success)]" />
              {businessCount} métiers configurés, du restaurant au plombier
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="size-3"
              >
                <path d="M6 3.5 10.5 8 6 12.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="mt-7 text-[2.5rem] leading-[1.02] font-medium tracking-[-0.045em] text-balance sm:text-6xl sm:leading-[0.98] lg:text-7xl">
              <span className="text-gradient">Votre site professionnel.</span>
              <br />
              Construit pour votre métier.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-pretty text-[var(--foreground-muted)]">
              Nous concevons, hébergeons et maintenons votre site. Vous modifiez vos contenus quand
              vous voulez, recevez vos messages et vos réservations, encaissez vos paiements —
              depuis un seul espace, sans rien installer.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <ButtonLink href="/commander" size="lg" className="w-full sm:w-auto">
                Commander mon site
              </ButtonLink>
              <ButtonLink
                href="/comment-ca-marche"
                variant="glass"
                size="lg"
                className="w-full sm:w-auto"
              >
                Découvrir la plateforme
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-[var(--muted)]">
              {entryPrice ? `${entryPrice} · ` : ''}Sans engagement de durée
            </p>
          </Reveal>
        </div>

        {/* Representation du produit */}
        <div className="relative mt-16 sm:mt-20">
          <Reveal delay={240}>
            <Parallax speed={0.05}>
              <div className="relative mx-auto max-w-5xl">
                <div
                  aria-hidden="true"
                  className="absolute inset-x-8 -top-6 bottom-0 rounded-[var(--radius-2xl)] bg-[var(--accent-glow)] opacity-20 blur-3xl"
                />
                <BrowserFrame url="stax.fr/app" className="relative">
                  <DashboardMock />
                </BrowserFrame>
              </div>
            </Parallax>
          </Reveal>

          {/* Panneaux flottants : masques sous 1024 px pour ne pas encombrer */}
          <Parallax
            speed={-0.12}
            className="pointer-events-none absolute -top-4 -left-2 hidden w-56 lg:block xl:-left-10"
          >
            <Reveal delay={420}>
              <InboxPanel />
            </Reveal>
          </Parallax>

          <Parallax
            speed={0.16}
            className="pointer-events-none absolute -right-2 bottom-24 hidden w-52 lg:block xl:-right-8"
          >
            <Reveal delay={520}>
              <PaymentPanel />
            </Reveal>
          </Parallax>

          <Parallax
            speed={-0.08}
            className="pointer-events-none absolute -bottom-8 left-8 hidden w-48 xl:block"
          >
            <Reveal delay={620}>
              <BookingPanel />
            </Reveal>
          </Parallax>

          <Parallax
            speed={0.1}
            className="pointer-events-none absolute -top-10 right-10 hidden w-44 xl:block"
          >
            <Reveal delay={720}>
              <DeployPanel />
            </Reveal>
          </Parallax>
        </div>
      </Container>
    </section>
  );
}
