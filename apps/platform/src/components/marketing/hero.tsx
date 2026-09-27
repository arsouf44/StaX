import Link from 'next/link';
import { HeroAtelier } from './hero-atelier';

/**
 * Banniere d accueil.
 *
 * Une page de garde : l index, le principe du produit en deux phrases — nous
 * creons le site, le client le gere ensuite —, un texte d appui decale, une
 * action. A droite, l atelier : le parcours reel d un site, anime.
 */

/** Le titre de l'accueil, phrase par phrase. Le dernier mot prend l'eau, puis le trait. */
const HEADLINE = ['Nous créons votre site.', 'Vous le gérez ensuite.'] as const;

function splitLastWord(sentence: string): [string, string] {
  const index = sentence.lastIndexOf(' ');
  return [sentence.slice(0, index), sentence.slice(index + 1)];
}

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
    <section
      aria-labelledby="hero-title"
      className="relative mx-auto grid min-h-[710px] w-[min(1370px,calc(100%-56px))] grid-cols-[1.1fr_0.9fr] pt-[70px] pb-[55px] max-[800px]:min-h-0 max-[800px]:w-[min(calc(100%-32px),620px)] max-[800px]:grid-cols-1 max-[800px]:gap-[38px] max-[800px]:pt-[62px] max-[800px]:pb-[45px]"
    >
      <div className="self-center py-5 pr-[3vw] max-[800px]:p-0">
        <p className="eyebrow-index hero-enter mb-[30px]" style={{ animationDelay: '0.05s' }}>
          01 / Création de sites professionnels
        </p>

        <h1 id="hero-title" className="display-hero max-w-[800px]">
          {HEADLINE.map((sentence, index) => {
            const [head, last] = splitLastWord(sentence);
            return (
              <span
                key={sentence}
                className="hero-enter block"
                style={{ animationDelay: `${0.12 + index * 0.12}s` }}
              >
                {index > 0 ? ' ' : null}
                {head} <span className={index === 0 ? 'text-water' : 'text-outline'}>{last}</span>
              </span>
            );
          })}
        </h1>

        <p
          className="lead-text hero-enter mt-[35px] ml-[18%] max-w-[430px] max-[800px]:ml-0"
          style={{ animationDelay: '0.36s' }}
        >
          Notre équipe conçoit et développe votre site, le met en ligne sur votre domaine et vous le
          livre. Ensuite, vous modifiez vos contenus depuis StaX et publiez quand vous voulez.{' '}
          {'Pas de modèle à personnaliser : votre site est conçu pour votre entreprise.'}
        </p>

        <div
          className="hero-enter mt-[30px] ml-[18%] flex flex-wrap items-center gap-x-9 gap-y-5 max-[800px]:ml-0"
          style={{ animationDelay: '0.46s' }}
        >
          <Link href="/commander" className="text-link">
            Commander mon site
            <span aria-hidden="true" className="arrow">
              ↗
            </span>
          </Link>
          <Link
            href="/comment-ca-marche"
            className="text-link border-[var(--line)] text-[var(--foreground-muted)] hover:text-[var(--ink)]"
          >
            Comment ça marche
            <span aria-hidden="true" className="arrow">
              →
            </span>
          </Link>
        </div>

        <p
          className="hero-enter mt-9 ml-[18%] max-w-[430px] text-[11px] leading-relaxed font-[650] tracking-[0.06em] text-[var(--muted)] uppercase max-[800px]:ml-0"
          style={{ animationDelay: '0.54s' }}
        >
          {entryPrice ? `${entryPrice} · ` : ''}Maintenance à la livraison, sans durée minimale ·{' '}
          <Link href="/metiers" className="underline decoration-[var(--line)] underline-offset-4">
            Questionnaire adapté à {businessCount} métiers
          </Link>
        </p>
      </div>

      <HeroAtelier className="ml-[4vw] max-[800px]:ml-0" />
    </section>
  );
}
