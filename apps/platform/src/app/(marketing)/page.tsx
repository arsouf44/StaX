import type { Metadata } from 'next';
import Link from 'next/link';
import { deliveryPolicyConfig } from '@nemasus/config';
import { ButtonLink, Reveal } from '@nemasus/ui';
import { StudioArtSprite } from '~/components/marketing/studio-art';
import { ProcessShowcase } from '~/components/marketing/process-showcase';
import { SITE_EXAMPLE, SiteExampleFrame } from '~/components/marketing/site-example';
import { supportContact } from '~/lib/contact';
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
  'Studio français de sites web professionnels sur mesure : nous concevons, développons et ' +
  'mettons en ligne votre site, puis vous le gérez. Commande gratuite et sans engagement.';

export const metadata: Metadata = {
  title: { absolute: 'Nemasus — Studio de sites web professionnels sur mesure' },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Nemasus',
    title: 'Nemasus — Nous créons votre site. Vous le gérez ensuite.',
    description: DESCRIPTION,
    url: '/',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Nemasus' }],
  },
};

/**
 * Les repères sous le titre : ce que le visiteur doit retenir, sans chiffre
 * inventé. Le délai est celui des CGV (article 8), lu dans la même
 * configuration qu'elles.
 */
function facts(): ReadonlyArray<{ label: string; value: string }> {
  return [
    { label: 'Conception', value: 'Sur mesure, sans modèle' },
    { label: 'Délai de référence', value: `${deliveryPolicyConfig().label} après vos éléments` },
    { label: 'Sans risque', value: 'Remboursé tant que rien n’a commencé' },
    { label: 'Après la livraison', value: 'Vos textes et photos, modifiés par vous' },
  ];
}

export default function HomePage() {
  const contact = supportContact();
  const keyFacts = facts();
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
            Un site fait pour vous, qui donne envie <em>de vous choisir.</em>
          </h1>

          <div className="mt-[clamp(40px,6vh,64px)] grid items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <p className="max-w-[20ch] font-serif text-[clamp(1.45rem,2.3vw,2.1rem)] leading-[1.18] text-[var(--ink-2)]">
              Nous créons votre site. <em>Vous le gérez ensuite.</em>
            </p>
            <div>
              <p className="lead-text max-w-[46ch]">
                Votre site est souvent le premier contact d’un client avec vous. Notre équipe le
                conçoit et le développe pour votre activité, le met en ligne sur votre domaine, puis
                vous le confie avec un éditeur simple pour modifier vos textes, vos photos et vos
                horaires.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-9 gap-y-5">
                <ButtonLink href="/commander" variant="primary" size="pill-lg">
                  Commander mon site
                  <span aria-hidden="true">→</span>
                </ButtonLink>
                <Link href="#exemple" className="text-link">
                  Voir un exemple
                  <span aria-hidden="true" className="arrow">
                    ↓
                  </span>
                </Link>
              </div>
              <p className="mt-5 max-w-[52ch] text-[13px] leading-relaxed text-[var(--muted)]">
                Gratuit et sans engagement : aucun paiement à la commande. Vous recevez le montant
                et le délai par écrit, puis vous décidez.
              </p>
            </div>
          </div>

          <dl className="mt-[clamp(48px,7vh,88px)] grid grid-cols-2 border-t border-[var(--border)] lg:grid-cols-4">
            {keyFacts.map((fact, index) => (
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

      {/* --- Exemple ---------------------------------------------------------- */}
      <section
        id="exemple"
        aria-labelledby="exemple-titre"
        className="scroll-mt-20 py-[clamp(72px,11vh,132px)]"
      >
        <div className="shell">
          <p className="eyebrow-index mb-6">Exemple</p>
          <div className="grid items-end gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <h2 id="exemple-titre" className="display-section max-w-[20ch]">
              Le niveau de finition <em>que nous livrons.</em>
            </h2>
            <p className="lead-text max-w-[52ch]">
              Voici la page d’accueil d’{SITE_EXAMPLE.name}, architecture intérieure à Paris, une
              maquette de présentation réalisée par notre studio. Une promesse claire dès le premier
              écran, des réalisations mises en valeur, un contact toujours à portée de main.
              Faites-la défiler.
            </p>
          </div>
          <Reveal>
            <SiteExampleFrame className="mt-12" />
          </Reveal>
          <div className="mt-10 flex flex-wrap items-center gap-x-9 gap-y-5">
            <ButtonLink href="/commander" variant="primary" size="pill">
              Je veux un site de ce niveau
            </ButtonLink>
            <Link href="/realisations" className="text-link">
              Ce qui rend cette page efficace
              <span aria-hidden="true" className="arrow">
                ↗
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* --- Pourquoi --------------------------------------------------------- */}
      <section
        id="pourquoi"
        aria-labelledby="pourquoi-titre"
        className="py-[clamp(80px,12vh,148px)]"
      >
        <div className="shell">
          <p className="eyebrow-index mb-6">Pourquoi un vrai site</p>
          <h2 id="pourquoi-titre" className="display-section max-w-[22ch]">
            Avant de vous appeler, vos clients <em>regardent votre site.</em>
          </h2>
          <p className="lead-text mt-6 max-w-[58ch]">
            Un site daté, lent ou illisible sur téléphone fait douter, même d’un excellent
            professionnel. Un site clair rassure et donne envie de prendre contact. C’est ce que
            nous construisons, sans vous demander de devenir technicien.
          </p>
          <ul className="mt-14 grid gap-x-7 gap-y-11 md:grid-cols-3">
            {REASONS.map((reason, index) => (
              <Reveal key={reason.title} as="li" delay={index * 70}>
                <div className="flex h-full flex-col border-t border-[var(--border)] pt-6">
                  <span className="kicker">{reason.kicker}</span>
                  <h3 className="mt-3 font-serif text-[clamp(23px,2.1vw,29px)] leading-tight font-normal text-[var(--ink)]">
                    {reason.title}
                  </h3>
                  <p className="mt-4 max-w-[38ch] text-[14.5px] leading-relaxed text-[var(--ink-2)]">
                    {reason.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
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
            Pas de grille tarifaire ni de formule à choisir : chaque site est conçu sur mesure. Vous
            décrivez votre projet, nous vous adressons par écrit le montant convenu et le délai, et
            vous ne payez qu’une fois d’accord. Votre code d’accès personnel crée ensuite votre
            compte.
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

          <div className="mt-14 grid gap-6 border border-[var(--border)] bg-[rgb(255_255_255/0.55)] p-[clamp(22px,3vw,36px)] md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
            <svg
              aria-hidden="true"
              viewBox="0 0 256 256"
              fill="currentColor"
              className="size-10 text-[var(--ink-3)]"
            >
              <path d="M208,40H48A16,16,0,0,0,32,56v58.77c0,89.62,75.82,119.34,91,124.38a15.44,15.44,0,0,0,10,0c15.2-5.05,91-34.77,91-124.39V56A16,16,0,0,0,208,40Zm0,74.79c0,78.42-66.35,104.62-80,109.18-13.53-4.51-80-30.69-80-109.18V56H208ZM82.34,141.66a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32l-56,56a8,8,0,0,1-11.32,0Z" />
            </svg>
            <div>
              <p className="font-serif text-[clamp(1.25rem,1.8vw,1.6rem)] leading-snug text-[var(--ink)]">
                Votre engagement commence au virement, pas avant.
              </p>
              <p className="mt-2 max-w-[70ch] text-[14.5px] leading-relaxed text-[var(--ink-2)]">
                Commander est gratuit. Le montant et le délai vous sont communiqués par écrit avant
                tout paiement, et tant que la réalisation n’a pas commencé, vous pouvez annuler et
                être intégralement remboursé.{' '}
                <Link href="/cgv#remboursement" className="underline underline-offset-4">
                  Conditions de remboursement
                </Link>
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-x-9 gap-y-5">
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
            Un site dont vous serez <em>fier de donner l’adresse.</em>
          </h2>
          <p className="lead-text mx-auto mt-7 max-w-[52ch]">
            Décrivez votre activité en quelques minutes : nous revenons vers vous par écrit avec le
            montant et le délai. Vous préférez en parler d’abord ? Une personne de l’équipe vous
            répond.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            <ButtonLink href="/commander" variant="primary" size="pill-lg">
              Commander mon site
              <span aria-hidden="true">→</span>
            </ButtonLink>
            {contact.phone && contact.phoneHref ? (
              <a href={contact.phoneHref} className="text-link !text-[clamp(16px,1.5vw,19px)]">
                Appeler le {contact.phone}
              </a>
            ) : null}
            <Link href="/contact" className="text-link !text-[clamp(16px,1.5vw,19px)]">
              Nous écrire
            </Link>
          </div>
          <p className="mt-6 text-[13px] text-[var(--muted)]">
            Sans engagement · aucun paiement à la commande · remboursé tant que rien n’a commencé
          </p>
        </div>
      </section>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Contenu de la page                                                         */
/* -------------------------------------------------------------------------- */

/** Les trois inquiétudes d'un dirigeant devant son site, et la réponse que nous y apportons. */
const REASONS = [
  {
    kicker: 'Votre image',
    title: 'Paraître aussi sérieux que vous l’êtes',
    body: 'Un design conçu pour votre activité, des pages rapides, une lecture parfaite sur téléphone : votre site inspire confiance dès le premier écran.',
  },
  {
    kicker: 'Votre temps',
    title: 'Rien de technique à faire',
    body: 'Nous concevons, développons et mettons en ligne votre site, jusqu’au branchement de votre nom de domaine en HTTPS. Vous transmettez vos éléments et validez les étapes importantes depuis votre espace.',
  },
  {
    kicker: 'Votre liberté',
    title: 'Un site qui vous appartient',
    body: 'Le code écrit pour votre site vous est cédé dès son paiement intégral, votre nom de domaine est à vous, vos contenus s’exportent à tout moment. Aucune commission sur vos ventes.',
  },
] as const;

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
