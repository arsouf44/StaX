import type { Metadata } from 'next';
import Link from 'next/link';
import type { PlanView } from '@stax/database';
import { formatMoney, maintenancePeriodLabel } from '@stax/payments';
import { ButtonLink, Reveal } from '@stax/ui';
import { StudioArtSprite } from '~/components/marketing/studio-art';
import { ProcessShowcase } from '~/components/marketing/process-showcase';
import { deliveryWeeksLabel, entryPriceLabel, getPlans } from '~/lib/catalog';
import { PLAN_EXAMPLES, PLAN_FALLBACK } from '~/content/plan-examples';

/**
 * Cette page affiche un TARIF. Prerendue, elle figerait le prix du jour de la
 * compilation : un changement de catalogue resterait invisible jusqu'au
 * deploiement suivant. Une heure de cache suffit a garder la page rapide tout
 * en la laissant se corriger seule.
 */
export const revalidate = 3600;

/**
 * Le tarif d'appel vient du CATALOGUE, jamais d'une chaine recopiee : une
 * description de page qui annonce un prix perime le fait la ou les moteurs de
 * recherche la citent.
 */
export async function generateMetadata(): Promise<Metadata> {
  const entry = await entryPriceLabel();
  return {
    title: 'Nous créons votre site. Vous le gérez ensuite.',
    description:
      'StaX conçoit et développe le site de votre entreprise, le met en ligne sur votre domaine ' +
      'et vous le livre. Vous modifiez ensuite vos contenus et publiez quand vous voulez.' +
      (entry ? ` ${entry}.` : ''),
    alternates: { canonical: '/' },
  };
}

interface OfferCell {
  slug: string;
  name: string;
  /** « 300 € », « Sur devis », ou `null` si le catalogue est injoignable. */
  price: string | null;
  /** « 12 € HT par mois ». */
  maintenance: string | null;
  href: string;
  quote: boolean;
}

/** Les offres dans l'ordre du catalogue ; a defaut, leur seule structure. */
function offerCells(plans: PlanView[]): OfferCell[] {
  if (plans.length === 0) {
    return PLAN_FALLBACK.map((plan) => ({
      slug: plan.slug,
      name: plan.name,
      price: null,
      maintenance: null,
      href: '/tarifs',
      quote: plan.slug === 'sur-mesure',
    }));
  }
  return plans.map((plan) => ({
    slug: plan.slug,
    name: plan.name,
    price: plan.isQuoteOnly
      ? 'Sur devis'
      : formatMoney(plan.setupPriceCents, plan.currency, { hideDecimalsWhenRound: true }),
    maintenance: plan.isQuoteOnly
      ? null
      : `${formatMoney(plan.maintenancePriceCents, plan.currency, {
          hideDecimalsWhenRound: true,
        })} HT ${maintenancePeriodLabel(plan.billingInterval)}`,
    href: plan.isQuoteOnly ? '/devis' : `/commander?offre=${plan.slug}`,
    quote: plan.isQuoteOnly,
  }));
}

/**
 * Les reperes sous le titre : prix d'entree et delais lus dans le catalogue.
 * Un repere que le catalogue ne peut pas confirmer n'est pas affiche.
 */
function heroFacts(plans: PlanView[]): Array<{ label: string; value: string }> {
  const priced = plans.filter((plan) => !plan.isQuoteOnly);
  const cheapest = [...priced].sort((a, b) => a.setupPriceCents - b.setupPriceCents)[0];
  const weeks = priced.flatMap((plan) => (plan.deliveryWeeks ? [plan.deliveryWeeks] : []));
  const facts: Array<{ label: string; value: string }> = [];
  if (cheapest) {
    facts.push({
      label: 'Création',
      value: `dès ${formatMoney(cheapest.setupPriceCents, cheapest.currency, {
        hideDecimalsWhenRound: true,
      })} HT`,
    });
  }
  if (weeks.length > 0) {
    facts.push({
      label: 'Délai',
      value: deliveryWeeksLabel({
        min: Math.min(...weeks.map((range) => range.min)),
        max: Math.max(...weeks.map((range) => range.max)),
      }),
    });
  }
  facts.push(
    { label: 'Mise en ligne', value: 'Votre domaine, en HTTPS' },
    { label: 'Après la livraison', value: 'Éditeur StaX inclus' },
  );
  return facts;
}

export default async function HomePage() {
  const plans = await getPlans();
  const offers = offerCells(plans);
  const facts = heroFacts(plans);

  return (
    <>
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
            className="max-w-[17ch] font-serif text-[clamp(3rem,7vw,6.6rem)] leading-[1.01] font-normal tracking-[-0.018em] text-balance text-[var(--ink)]"
          >
            Un site fait à la main, à la hauteur de votre <em>entreprise.</em>
          </h1>

          <div className="mt-[clamp(40px,6vh,64px)] grid items-end gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <p className="max-w-[20ch] font-serif text-[clamp(1.55rem,2.3vw,2.1rem)] leading-[1.18] text-[var(--ink-2)]">
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
                <Link href="#offres" className="text-link">
                  Voir les offres
                  <span aria-hidden="true" className="arrow">
                    ↓
                  </span>
                </Link>
              </div>
            </div>
          </div>

          <dl className="mt-[clamp(48px,7vh,88px)] grid grid-cols-2 border-t border-[var(--border)] lg:grid-cols-4">
            {facts.map((fact, index) => (
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
                <dd className="font-serif text-[clamp(1.2rem,1.6vw,1.45rem)] leading-snug text-[var(--ink)]">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* --- Les offres ----------------------------------------------------- */}
      <section id="offres" aria-labelledby="offres-titre" className="py-[clamp(80px,12vh,148px)]">
        <div className="shell">
          <p className="eyebrow-index mb-6">Les offres</p>
          <h2 id="offres-titre" className="display-section max-w-[22ch]">
            Un site à la mesure de <em>votre ambition.</em>
          </h2>
          <p className="lead-text mt-6 max-w-[54ch]">
            Quatre offres et le sur-mesure. Chacune contient la précédente : plus de pages, un
            design plus poussé, plus de fonctionnalités. Vous réglez la création à la commande ; la
            maintenance mensuelle ne commence qu’à la livraison.
          </p>

          <div className="mt-16 grid grid-cols-6 gap-x-7 gap-y-11 max-[900px]:grid-cols-2 max-[900px]:gap-x-5 max-[560px]:grid-cols-1">
            {offers.map((offer, index) => {
              const example = PLAN_EXAMPLES[offer.slug];
              return (
                <Reveal
                  key={offer.slug}
                  as="article"
                  delay={Math.min(index * 70, 280)}
                  className={
                    index < 3
                      ? 'col-span-2 max-[900px]:col-span-1'
                      : 'col-span-3 max-[900px]:col-span-1 max-[900px]:last:col-span-2 max-[560px]:last:col-span-1'
                  }
                >
                  <div className="group relative flex h-full flex-col border-t border-[var(--border)] pt-6">
                    <span
                      aria-hidden="true"
                      className="absolute top-[-1px] left-0 h-px w-full origin-left scale-x-0 bg-[var(--ink)] transition-transform duration-700 ease-[cubic-bezier(0.19,0.85,0.22,1)] group-hover:scale-x-100"
                    />
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="font-serif text-[clamp(23px,2.1vw,29px)] leading-tight font-normal text-[var(--ink)]">
                        {offer.name}
                      </h3>
                      <span className="text-[13px] text-[var(--ink-3)] tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>

                    {offer.price ? (
                      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-serif text-[clamp(30px,2.6vw,38px)] leading-none text-[var(--ink)] tabular-nums">
                          {offer.price}
                        </span>
                        {offer.quote ? null : (
                          <span className="text-[13px] text-[var(--muted)]">
                            HT la création, puis {offer.maintenance}
                          </span>
                        )}
                      </p>
                    ) : null}

                    {example ? (
                      <>
                        <p className="mt-4 max-w-[36ch] text-[14.5px] leading-relaxed text-[var(--ink-2)]">
                          {example.audience}
                        </p>
                        <p className="sr-only">Par exemple :</p>
                        <ul className="mt-4 flex flex-wrap gap-1.5">
                          {example.examples.map((item) => (
                            <li
                              key={item}
                              className="rounded-full border border-[var(--border)] bg-[rgb(255_255_255/0.55)] px-2.5 py-1 text-[12px] text-[var(--ink-2)]"
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}

                    <div className="mt-auto pt-6">
                      <Link href={offer.href} className="text-link">
                        {offer.quote ? 'Demander un devis' : `Choisir ${offer.name}`}
                        <span aria-hidden="true" className="arrow">
                          ↗
                        </span>
                      </Link>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <p className="mt-12 text-[13.5px] text-[var(--muted)]">
            Prix hors taxes.{' '}
            <Link
              href="/tarifs"
              className="text-[var(--ink)] underline decoration-[var(--border-strong)] underline-offset-4 transition-colors hover:decoration-[var(--ink)]"
            >
              Comparer les offres en détail
            </Link>
          </p>
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
    body: 'Un site codé à la main dans son propre dépôt, déployé sur Cloudflare, relié à votre domaine en HTTPS. Pas de modèle à personnaliser, pas d’extensions à mettre à jour.',
    href: '/fonctionnalites',
    icon: 'M93.31,70,28,128l65.27,58a8,8,0,1,1-10.62,12l-72-64a8,8,0,0,1,0-12l72-64A8,8,0,1,1,93.31,70Zm152,52-72-64a8,8,0,0,0-10.62,12L228,128l-65.27,58a8,8,0,1,0,10.62,12l72-64a8,8,0,0,0,0-12Z',
  },
  {
    title: 'Suivi',
    body: 'À la livraison, l’éditeur StaX s’ouvre : vous modifiez textes, photos et horaires. Vous publiez, et c’est réellement en ligne. Hébergement, sauvegardes et surveillance sont compris dans la maintenance.',
    href: '/fonctionnalites/editeur',
    icon: 'M240,56v64a8,8,0,0,1-16,0V75.31l-82.34,82.35a8,8,0,0,1-11.32,0L96,123.31,29.66,189.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0L136,140.69,212.69,64H168a8,8,0,0,1,0-16h64A8,8,0,0,1,240,56Z',
  },
] as const;
