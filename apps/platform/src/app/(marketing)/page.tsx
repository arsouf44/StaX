import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink, Reveal } from '@nemasus/ui';
import { StudioArtSprite } from '~/components/marketing/studio-art';
import { ProcessShowcase } from '~/components/marketing/process-showcase';
import { HOMEPAGE_FAQ } from '~/content/faq';
import { ORDER_JOURNEY } from '~/content/process';
import {
  faqJsonLd,
  JsonLd,
  organizationJsonLd,
  serviceJsonLd,
  webPageJsonLd,
  websiteJsonLd,
} from '~/lib/structured-data';

const DESCRIPTION =
  'Nemasus conçoit et développe le site de votre entreprise, le met en ligne sur votre domaine ' +
  'et vous le livre avec un éditeur simple. Commande en ligne, paiement par virement, accès ' +
  'à votre espace par code personnel.';

export const metadata: Metadata = {
  title: { absolute: 'Nemasus — Studio de sites web professionnels sur mesure' },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Nemasus — Nous créons votre site. Vous le gérez ensuite.',
    description: DESCRIPTION,
    url: '/',
  },
};

/** Les repères sous le titre : ce que le visiteur doit retenir, sans chiffre inventé. */
const FACTS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Conception', value: 'Sur mesure, sans modèle' },
  { label: 'Paiement', value: 'Par virement bancaire' },
  { label: 'Accès', value: 'Code personnel, vérifié' },
  { label: 'Après la livraison', value: 'Éditeur Nemasus inclus' },
];

export default function HomePage() {
  return (
    <>
      <JsonLd
        graph={[
          organizationJsonLd(),
          websiteJsonLd(),
          serviceJsonLd(),
          webPageJsonLd({
            path: '/',
            name: 'Nemasus — Studio de sites web professionnels sur mesure',
            description: DESCRIPTION,
          }),
          faqJsonLd(HOMEPAGE_FAQ, '/'),
        ]}
      />
      <StudioArtSprite />

      {/* --- Titre ------------------------------------------------------------ */}
      <section
        aria-labelledby="accueil-titre"
        className="pt-[clamp(48px,9vh,128px)] pb-[clamp(72px,11vh,132px)]"
      >
        <div className="shell">
          <p className="eyebrow-index mb-8">Studio de sites web sur mesure</p>
          <h1
            id="accueil-titre"
            className="max-w-[17ch] font-serif text-[clamp(2.6rem,7vw,6.6rem)] leading-[1.01] font-normal tracking-[-0.018em] text-balance text-[var(--ink)]"
          >
            Un site fait pour vous, à la hauteur de votre <em>entreprise.</em>
          </h1>

          <div className="mt-[clamp(40px,6vh,64px)] grid items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <p className="max-w-[20ch] font-serif text-[clamp(1.45rem,2.3vw,2.1rem)] leading-[1.18] text-[var(--ink-2)]">
              Nous créons votre site. <em>Vous le gérez ensuite.</em>
            </p>
            <div>
              <p className="lead-text max-w-[46ch]">
                Notre équipe conçoit et code chaque site, un par un, le met en ligne sur votre
                domaine, puis vous le livre avec un éditeur simple pour modifier vos textes, vos
                photos et vos horaires.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-9 gap-y-5">
                <ButtonLink href="/commander" variant="primary" size="pill-lg">
                  Commander mon site
                  <span aria-hidden="true">→</span>
                </ButtonLink>
                <Link href="#commander" className="text-link">
                  Comment ça se passe
                  <span aria-hidden="true" className="arrow">
                    ↓
                  </span>
                </Link>
              </div>
            </div>
          </div>

          <dl className="mt-[clamp(48px,7vh,88px)] grid grid-cols-2 border-t border-[var(--border)] lg:grid-cols-4">
            {FACTS.map((fact, index) => (
              <div
                key={fact.label}
                className={
                  'grid content-start gap-2 border-[var(--border)] py-6 ' +
                  (index % 2 === 1 ? 'border-l pl-6 ' : 'max-lg:pr-6 ') +
                  (index >= 2 ? 'max-lg:border-t ' : '') +
                  (index === 2 ? 'lg:border-l lg:pl-6' : '')
                }
              >
                <dt className="kicker">{fact.label}</dt>
                <dd className="font-serif text-[clamp(1.1rem,1.6vw,1.45rem)] leading-snug text-[var(--ink)]">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* --- Commander -------------------------------------------------------- */}
      <section
        id="commander"
        aria-labelledby="commander-titre"
        className="py-[clamp(80px,12vh,148px)]"
      >
        <div className="shell">
          <p className="eyebrow-index mb-6">Commander</p>
          <h2 id="commander-titre" className="display-section max-w-[22ch]">
            Quatre étapes, <em>sans surprise.</em>
          </h2>
          <p className="lead-text mt-6 max-w-[56ch]">
            Pas de grille tarifaire ni d’abonnement à choisir : chaque site est conçu sur mesure.
            Vous commandez, nous vous adressons le montant convenu et les modalités de virement,
            puis votre code d’accès personnel ouvre votre espace.
          </p>

          <ol className="mt-16 grid gap-x-7 gap-y-11 md:grid-cols-2 xl:grid-cols-4">
            {ORDER_JOURNEY.map((step, index) => (
              <Reveal key={step.title} as="li" delay={Math.min(index * 70, 280)}>
                <div className="group relative flex h-full flex-col border-t border-[var(--border)] pt-6">
                  <span
                    aria-hidden="true"
                    className="absolute top-[-1px] left-0 h-px w-full origin-left scale-x-0 bg-[var(--ink)] transition-transform duration-700 ease-[cubic-bezier(0.19,0.85,0.22,1)] group-hover:scale-x-100"
                  />
                  <span className="text-[13px] text-[var(--ink-3)] tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 font-serif text-[clamp(23px,2.1vw,29px)] leading-tight font-normal text-[var(--ink)]">
                    {step.title}
                  </h3>
                  <p className="mt-4 max-w-[36ch] text-[14.5px] leading-relaxed text-[var(--ink-2)]">
                    {step.description}
                  </p>
                  {step.detail ? (
                    <p className="mt-auto pt-5 text-[12.5px] tracking-[0.02em] text-[var(--muted)]">
                      {step.detail}
                    </p>
                  ) : null}
                </div>
              </Reveal>
            ))}
          </ol>

          <div className="mt-14 flex flex-wrap items-center gap-x-9 gap-y-5">
            <ButtonLink href="/commander" variant="primary" size="pill">
              Commander mon site
            </ButtonLink>
            <Link href="/acces" className="text-link">
              J’ai reçu mon code d’accès
              <span aria-hidden="true" className="arrow">
                ↗
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* --- Savoir-faire --------------------------------------------------- */}
      <section
        id="savoir-faire"
        aria-labelledby="savoir-faire-titre"
        className="py-[clamp(80px,12vh,148px)]"
      >
        <div className="shell">
          <p className="eyebrow-index mb-6">Savoir-faire</p>
          <h2 id="savoir-faire-titre" className="display-section max-w-[22ch]">
            Trois savoir-faire, un seul studio, <em>aucun relais.</em>
          </h2>
          <div className="mt-14 flex flex-col">
            {SERVICES.map((service, index) => (
              <Reveal key={service.title} delay={index * 70}>
                <Link
                  href={service.href}
                  className="group relative isolate grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1.15fr)_40px] items-baseline gap-7 border-t border-[var(--border)] py-[34px] max-[900px]:grid-cols-[40px_minmax(0,1fr)] max-[900px]:gap-x-4 max-[900px]:gap-y-3 max-[900px]:py-7"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-[-20px] inset-y-0 -z-10 scale-[0.985] rounded-[14px] bg-[linear-gradient(100deg,rgb(255_255_255/0.9),rgb(250_251_251/0.5))] opacity-0 shadow-[0_30px_68px_-46px_rgb(24_36_50/0.55)] transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.19,0.85,0.22,1)] group-hover:scale-100 group-hover:opacity-100 max-[900px]:inset-x-[-12px]"
                  />
                  <span className="text-[13px] text-[var(--ink-3)] tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="flex items-center gap-3.5 font-serif text-[clamp(24px,2.4vw,34px)] leading-tight text-[var(--ink)]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 256 256"
                      fill="currentColor"
                      className="size-[0.9em] shrink-0 text-[var(--ink-3)] transition-colors duration-300 group-hover:text-[var(--ink)]"
                    >
                      <path d={service.icon} />
                    </svg>
                    {service.title}
                  </span>
                  <span className="max-w-[46ch] text-[15px] leading-relaxed text-[var(--ink-2)] max-[900px]:col-start-2">
                    {service.body}
                  </span>
                  <span
                    aria-hidden="true"
                    className="justify-self-end text-[var(--ink-3)] transition-[transform,color] duration-300 ease-[cubic-bezier(0.19,0.85,0.22,1)] group-hover:translate-x-[3px] group-hover:-translate-y-[3px] group-hover:text-[var(--ink)] max-[900px]:hidden"
                  >
                    ↗
                  </span>
                </Link>
              </Reveal>
            ))}
            <div className="border-t border-[var(--border)]" />
          </div>
        </div>
      </section>

      {/* --- Methode --------------------------------------------------------- */}
      <section id="methode" aria-labelledby="methode-titre" className="py-[clamp(80px,12vh,148px)]">
        <div className="shell">
          <p className="eyebrow-index mb-6">Méthode</p>
          <h2 id="methode-titre" className="display-section max-w-[22ch]">
            Concevoir. Développer. Livrer. <em>Suivre.</em>
          </h2>
          <ProcessShowcase />
          <div className="mt-12">
            <Link href="/comment-ca-marche" className="text-link">
              Le détail de chaque étape
              <span aria-hidden="true" className="arrow">
                ↗
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* --- Questions -------------------------------------------------------- */}
      <section
        id="questions"
        aria-labelledby="questions-titre"
        className="py-[clamp(80px,12vh,148px)]"
      >
        <div className="shell">
          <p className="eyebrow-index mb-6">Questions</p>
          <h2 id="questions-titre" className="display-section max-w-[22ch]">
            Ce que l’on nous demande <em>le plus souvent.</em>
          </h2>
          <dl className="mt-14 grid gap-x-16 gap-y-10 md:grid-cols-2">
            {HOMEPAGE_FAQ.map((item) => (
              <div key={item.question} className="border-t border-[var(--border)] pt-6">
                <dt className="font-serif text-[clamp(1.25rem,1.7vw,1.5rem)] leading-snug text-[var(--ink)]">
                  {item.question}
                </dt>
                <dd className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-12">
            <Link href="/faq" className="text-link">
              Toutes les questions
              <span aria-hidden="true" className="arrow">
                ↗
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* --- Cloture --------------------------------------------------------- */}
      <section
        id="contact"
        aria-labelledby="cloture-titre"
        className="py-[clamp(96px,15vh,176px)] text-center"
      >
        <div className="shell">
          <div aria-hidden="true" className="relative mx-auto mb-10 h-[46px] w-[88px]">
            <i className="absolute top-0 left-0 h-[11px] w-16 rounded-[4px] border border-[rgb(20_24_28/0.08)] bg-[linear-gradient(158deg,#fcfdfd,#e3e8ec)] shadow-[inset_0_1px_0_#fff,0_12px_22px_-12px_rgb(24_36_50/0.5)]" />
            <i className="metal absolute top-[17px] left-[22px] h-[11px] w-16 rounded-[4px] shadow-[0_12px_22px_-12px_rgb(24_36_50/0.5)]" />
            <i className="absolute top-[34px] left-[9px] h-[11px] w-16 rounded-[4px] bg-[linear-gradient(180deg,#2a3138,#1d2328)] shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_12px_22px_-12px_rgb(20_24_28/0.7)]" />
          </div>
          <h2 id="cloture-titre" className="display-closing mx-auto max-w-[20ch]">
            Votre site est la seule partie de votre entreprise que vous maîtrisez{' '}
            <em>entièrement.</em>
          </h2>
          <div className="mt-11 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
            <Link href="/commander" className="text-link !text-[clamp(16px,1.5vw,19px)]">
              Commander mon site
            </Link>
            <Link href="/contact" className="text-link !text-[clamp(16px,1.5vw,19px)]">
              Nous écrire
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Contenu de la page                                                         */
/* -------------------------------------------------------------------------- */

const SERVICES = [
  {
    title: 'Conception',
    body: 'Positionnement, structure du site, direction artistique et maquettes validés avant la première ligne de code. Vous voyez votre site entier avant qu’il ne coûte cher de le changer.',
    href: '/comment-ca-marche',
    icon: 'M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z',
  },
  {
    title: 'Développement',
    body: 'Un site développé pour vous dans son propre dépôt, déployé sur Cloudflare, relié à votre domaine en HTTPS. Pas de modèle à personnaliser, pas d’extensions à mettre à jour.',
    href: '/fonctionnalites',
    icon: 'M93.31,70,28,128l65.27,58a8,8,0,1,1-10.62,12l-72-64a8,8,0,0,1,0-12l72-64A8,8,0,1,1,93.31,70Zm152,52-72-64a8,8,0,0,0-10.62,12L228,128l-65.27,58a8,8,0,1,0,10.62,12l72-64a8,8,0,0,0,0-12Z',
  },
  {
    title: 'Suivi',
    body: 'À la livraison, l’éditeur Nemasus s’ouvre : vous modifiez textes, photos et horaires. Vous publiez, et c’est réellement en ligne. Chaque version reste restaurable, et la disponibilité de votre site est surveillée.',
    href: '/fonctionnalites/editeur',
    icon: 'M240,56v64a8,8,0,0,1-16,0V75.31l-82.34,82.35a8,8,0,0,1-11.32,0L96,123.31,29.66,189.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0L136,140.69,212.69,64H168a8,8,0,0,1,0-16h64A8,8,0,0,1,240,56Z',
  },
] as const;
