import { cn } from '@nemasus/ui';

/**
 * L'exemple de site présenté par Nemasus : la page d'accueil d'Atelier
 * Voltaire, seule.
 *
 * La page est un fichier statique (`public/exemples/atelier-voltaire`) chargé
 * dans un cadre isolé : `sandbox="allow-scripts"` lui donne une origine
 * opaque (aucun accès à la page qui l'affiche ni à ses cookies), lui interdit
 * d'ouvrir une fenêtre, d'envoyer un formulaire ou de faire naviguer la page
 * parente. On y défile, on y ouvre le menu mobile ; ses liens ne mènent
 * nulle part ailleurs que dans la page d'accueil elle-même.
 */
export const SITE_EXAMPLE = {
  name: 'Atelier Voltaire',
  activity: 'Architecture intérieure · Paris',
  src: '/exemples/atelier-voltaire/accueil.html',
  poster: '/exemples/atelier-voltaire/salon-rive-droite.webp',
  sections: [
    'Ouverture plein écran',
    'Projets récents',
    'Approche et valeurs',
    'Présentation de l’atelier',
    'Prise de contact',
    'Lettre d’information',
  ],
} as const;

function FrameBar({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[rgb(20_24_28/0.13)] px-3 py-2.5">
      <div aria-hidden="true" className="flex gap-1.5">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="size-2.5 rounded-full border border-[rgb(20_24_28/0.35)]" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 border border-[rgb(20_24_28/0.12)] bg-white/80 px-2.5 py-1 text-2xs font-semibold text-[#2f5f86]">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="size-2.5 shrink-0 text-[var(--success)]"
        >
          <path d="M8 1a3.2 3.2 0 0 0-3.2 3.2V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6h-.3V4.2A3.2 3.2 0 0 0 8 1Zm1.8 5H6.2V4.2a1.8 1.8 0 1 1 3.6 0V6Z" />
        </svg>
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

/** La page d'accueil d'Atelier Voltaire, défilable dans un cadre de navigateur. */
export function SiteExampleFrame({
  className,
  size = 'default',
  eager = false,
}: {
  className?: string;
  /** `tall` : page Réalisations, où l'exemple est le sujet de la page. */
  size?: 'default' | 'tall';
  /** Chargement immédiat (exemple visible dès l'arrivée sur la page). */
  eager?: boolean;
}) {
  return (
    <figure className={cn('not-prose m-0', className)}>
      <div className="overflow-hidden border border-[rgb(255_255_255/0.85)] bg-[rgb(250_251_251/0.86)] shadow-[var(--shadow-stage)]">
        <FrameBar label={`${SITE_EXAMPLE.name} — page d’accueil`} />
        <div
          className={cn(
            'relative bg-[#5a4a3b] bg-cover bg-center',
            size === 'tall'
              ? 'h-[min(78vh,760px)] max-sm:h-[72vh]'
              : 'h-[min(70vh,640px)] max-sm:h-[64vh]',
          )}
          style={{ backgroundImage: `url(${SITE_EXAMPLE.poster})` }}
        >
          <iframe
            src={SITE_EXAMPLE.src}
            title={`Exemple de site réalisé par Nemasus : page d’accueil d’${SITE_EXAMPLE.name}, à faire défiler`}
            loading={eager ? 'eager' : 'lazy'}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="absolute inset-0 size-full border-0"
          />
        </div>
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12.5px] text-[var(--muted)]">
        <span>
          Faites défiler l’aperçu : la page d’accueil complète, telle qu’elle s’affiche sur
          ordinateur comme sur mobile.
        </span>
        <a
          href={SITE_EXAMPLE.src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link !text-[12.5px]"
        >
          Ouvrir en plein écran
          <span aria-hidden="true" className="arrow">
            ↗
          </span>
        </a>
      </figcaption>
    </figure>
  );
}

/**
 * Vignette fixe de l'exemple (sans cadre interactif), pour les pages où le
 * site n'est qu'une illustration : une image et le titre de la page d'accueil.
 */
export function SiteExampleStill({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label={`Exemple de site réalisé par Nemasus : page d’accueil d’${SITE_EXAMPLE.name}`}
      className={cn(
        'overflow-hidden border border-[rgb(255_255_255/0.85)] bg-[rgb(250_251_251/0.86)] shadow-[var(--shadow-stage)]',
        className,
      )}
    >
      <FrameBar label={`${SITE_EXAMPLE.name} — page d’accueil`} />
      <div
        className="relative flex min-h-[22rem] items-end bg-[#5a4a3b] bg-cover bg-center text-white"
        style={{
          backgroundImage: `linear-gradient(90deg,#16120db3 0%,#16120d66 50%,#16120d18 100%),linear-gradient(0deg,#17130d66,transparent 65%),url(${SITE_EXAMPLE.poster})`,
        }}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 flex items-center justify-between border-b border-white/20 px-[5.5%] py-4 text-[9px] tracking-[0.16em] uppercase"
        >
          <span className="tracking-[0.22em]">Atelier Voltaire</span>
          <span className="hidden gap-5 sm:flex">
            <span>Projets</span>
            <span>Approche</span>
            <span>Contact</span>
          </span>
        </div>
        <div aria-hidden="true" className="relative max-w-[30rem] px-[8%] pb-10">
          <p className="text-[9px] tracking-[0.23em] uppercase">Architecture intérieure · Paris</p>
          <p
            className="mt-3 text-[clamp(1.8rem,4vw,2.6rem)] leading-[1.02] tracking-[-0.03em]"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            L’art de concevoir des intérieurs uniques.
          </p>
          <span className="mt-5 inline-block border border-[#d6bd9b] px-4 py-2.5 text-[9px] tracking-[0.16em] uppercase">
            Découvrir nos projets ↗
          </span>
        </div>
      </div>
    </div>
  );
}
