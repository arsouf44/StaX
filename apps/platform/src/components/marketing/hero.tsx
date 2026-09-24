import Link from 'next/link';
import { ButtonLink, Container } from '@stax/ui';
import { Parallax, Reveal, ScrollTilt } from '@stax/ui';
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
 * Une affiche : le principe du produit en deux phrases — nous creons le site,
 * le client le gere ensuite —, deux actions, puis l'espace client lui-meme,
 * pose sur une scene eclairee par le dessous, qui se redresse au defilement.
 * Les panneaux de verre (messages, paiement, reservation, publication) sont
 * de vrais ecrans de l espace client d'un site livre. Le tout en HTML et SVG —
 * rien a telecharger, rien a maintenir en capture d ecran.
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
    <section className="relative overflow-hidden pt-24 pb-20 sm:pt-32 sm:pb-28">
      {/* Fond : une seule source de lumiere froide, et une grille qui s eteint */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="spotlight absolute inset-0" />
        <div className="grid-bg grid-bg-fade absolute inset-0 opacity-70" />
      </div>

      <Container size="wide">
        <div className="mx-auto max-w-6xl text-center">
          <Reveal>
            <Link
              href="/metiers"
              className="glass-edge inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-[var(--foreground-muted)] glass-2 transition-colors hover:text-[var(--foreground)]"
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--success)]" />
              Un questionnaire adapté à {businessCount} métiers, du restaurant au plombier
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
            <h1 className="display mt-8 text-[2.75rem] sm:text-6xl lg:text-[4.75rem] xl:text-[5.75rem]">
              <span className="text-gradient">Nous créons votre site.</span>
              <br />
              Vous le gérez ensuite.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-pretty text-[var(--foreground-muted)] sm:text-xl">
              Notre équipe conçoit et développe votre site, le met en ligne sur votre domaine et
              vous le livre. Ensuite, vous modifiez vos contenus depuis StaX et publiez quand vous
              voulez. Pas de modèle à personnaliser : votre site est conçu pour votre entreprise.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonLink
                href="/commander"
                variant="accent"
                size="pill-lg"
                className="w-full sm:w-auto"
              >
                Commander mon site
              </ButtonLink>
              <ButtonLink
                href="/comment-ca-marche"
                variant="glass"
                size="pill-lg"
                className="w-full sm:w-auto"
              >
                Comment ça marche
              </ButtonLink>
            </div>
            <p className="mt-5 text-xs text-[var(--muted)]">
              {entryPrice ? `${entryPrice} · ` : ''}La maintenance commence à la livraison, sans
              durée minimale
            </p>
          </Reveal>
        </div>

        {/* Representation du produit */}
        <div className="relative mt-16 sm:mt-24">
          <Reveal delay={240}>
            <ScrollTilt>
              <div className="stage relative mx-auto max-w-5xl">
                <BrowserFrame url="stax.fr/app" className="relative">
                  <DashboardMock />
                </BrowserFrame>
              </div>
            </ScrollTilt>
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
