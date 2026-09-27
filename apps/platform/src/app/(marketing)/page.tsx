import type { Metadata } from 'next';
import Link from 'next/link';
import { listBusinesses } from '@stax/business';
import { refundPolicyConfig } from '@stax/config';
import { formatMoney } from '@stax/payments';
import {
  ButtonLink,
  Container,
  Panel,
  Parallax,
  Reveal,
  ScrollTilt,
  SectionHeading,
} from '@stax/ui';
import { Hero } from '~/components/marketing/hero';
import { BusinessSwitcher } from '~/components/marketing/business-switcher';
import { PricingCards } from '~/components/marketing/pricing-cards';
import {
  DomainRoutingDiagram,
  OperationalIndicators,
  PaymentRoutingDiagram,
} from '~/components/marketing/diagrams';
import {
  BookingPanel,
  BrowserFrame,
  EditorMock,
  InboxPanel,
  PaymentPanel,
} from '~/components/marketing/product-visuals';
import { entryPriceLabel, getPlans, listSectorsSafe } from '~/lib/catalog';
import { HOMEPAGE_FAQ } from '~/content/faq';
import { PRINCIPLE_POINTS, PROCESS_STEPS } from '~/content/process';

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

export default async function HomePage() {
  const [plans, sectors, entry] = await Promise.all([
    getPlans(),
    listSectorsSafe(),
    entryPriceLabel(),
  ]);
  const refund = refundPolicyConfig();
  const sectorList = sectors.length > 0 ? sectors : FALLBACK_SECTORS;

  return (
    <>
      <Hero entryPrice={entry} businessCount={listBusinesses().length} />

      <Container size="wide">
        {/* --- Le principe : le manifeste ------------------------------------- */}
        <section
          id="approche"
          aria-labelledby="approche-title"
          className="grid grid-cols-[27%_1fr] gap-[4vw] pt-[145px] pb-[125px] max-[800px]:grid-cols-1 max-[800px]:gap-[25px] max-[800px]:py-[82px]"
        >
          <p className="side-note self-start">
            Pas un générateur.
            <br />
            Une équipe qui construit.
          </p>
          <div>
            <h2 id="approche-title" className="display-statement max-w-[860px]">
              Chaque site est un projet à part, conçu pour une seule{' '}
              <span className="text-water-light">entreprise.</span>
            </h2>
            <p className="lead-text mt-[35px] max-w-[470px]">
              Vous ne construisez rien vous-même. Notre équipe conçoit et développe votre site, le
              met en ligne, puis vous le livre. C’est seulement à ce moment-là que l’éditeur StaX
              s’ouvre.
            </p>
            <ol className="mt-16 grid border-t border-[rgb(43_93_111/0.24)] md:grid-cols-2 md:gap-x-10">
              {PRINCIPLE_POINTS.map((point, index) => (
                <Reveal
                  key={point.title}
                  as="li"
                  delay={Math.min(index * 50, 300)}
                  className="grid grid-cols-[43px_1fr] gap-3 border-b border-[rgb(43_93_111/0.19)] py-5"
                >
                  <span className="step-number pt-1">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <h3 className="step-name text-[#284f60]">{point.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                      {point.description}
                    </p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* --- La methode : deux panneaux de verre ------------------------------ */}
        <section
          id="methode"
          aria-labelledby="methode-title"
          className="pb-[135px] max-[800px]:pb-[82px]"
        >
          <div className="grid grid-cols-[1.08fr_0.92fr] gap-5 max-[800px]:grid-cols-1">
            <Reveal
              as="article"
              className="glass-panel flex min-h-[470px] flex-col p-[33px] max-[800px]:min-h-[410px] max-[800px]:p-6"
            >
              <p className="kicker">Le parcours / en six étapes</p>
              <h2 id="methode-title" className="display-panel mt-[15px] mb-[46px] max-w-[475px]">
                De votre projet à votre site en ligne.
              </h2>
              <ol className="step-list">
                {PROCESS_STEPS.map((step, index) => (
                  <li key={step.title} className="step-row">
                    <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                    <h3 className="step-name">{step.title}</h3>
                    <span className="step-text max-[800px]:hidden">{step.detail}</span>
                    <span aria-hidden="true" className="step-arrow">
                      →
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-auto pt-9">
                <Link href="/comment-ca-marche" className="text-link">
                  Voir le détail de chaque étape
                  <span aria-hidden="true" className="arrow">
                    ↗
                  </span>
                </Link>
              </div>
            </Reveal>

            <Reveal
              as="article"
              delay={80}
              className="glass-panel glass-panel-warm glass-rings flex min-h-[470px] flex-col justify-between p-[33px] max-[800px]:min-h-[410px] max-[800px]:p-6"
            >
              <p className="kicker">Principe StaX</p>
              <blockquote className="mt-[65px] max-w-[415px] text-[clamp(2.15rem,4vw,4.1rem)] leading-[0.94] font-[725] tracking-[-0.08em] text-[#244758]">
                « Vous publiez. C’est réellement en ligne. »
              </blockquote>
              <p className="mt-10 border-t border-[rgb(68_104_113/0.24)] pt-4 text-xs font-[670] text-[#55737d]">
                Chaque publication est un vrai déploiement, daté et restaurable.
              </p>
            </Reveal>
          </div>
        </section>

        {/* --- Secteurs ------------------------------------------------------- */}
        <section
          aria-labelledby="secteurs-title"
          className="grid grid-cols-[27%_1fr] gap-[4vw] border-t border-[var(--line)] py-[110px] max-[800px]:grid-cols-1 max-[800px]:gap-[25px] max-[800px]:py-[72px]"
        >
          <h2 id="secteurs-title" className="side-note self-start">
            Des entreprises de tous les secteurs.
            <br />
            Un site pour chacune.
          </h2>
          <div>
            <ul className="flex flex-wrap items-baseline gap-y-1 text-[clamp(1.9rem,3.4vw,3.6rem)] leading-[1.02] font-[720] tracking-[-0.065em] text-[var(--heading)]">
              {sectorList.map((sector, index) => (
                <li key={sector.slug} className="inline-flex items-baseline">
                  <Link
                    href={`/metiers/${sector.slug}`}
                    className="transition-colors duration-300 hover:text-[var(--water-bright)]"
                  >
                    {sector.label}
                  </Link>
                  {'businessCount' in sector && sector.businessCount > 0 ? (
                    <sup className="ml-1 text-xs font-bold tracking-normal text-[var(--accent-text)] tabular-nums">
                      {sector.businessCount}
                    </sup>
                  ) : null}
                  {index < sectorList.length - 1 ? (
                    <span aria-hidden="true" className="mx-[0.3em] font-[400] text-[var(--water)]">
                      /
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <Link href="/metiers" className="text-link mt-10">
              Voir tous les métiers
              <span aria-hidden="true" className="arrow">
                ↗
              </span>
            </Link>
          </div>
        </section>

        {/* --- Proposition de valeur ------------------------------------------ */}
        <section className="border-t border-[var(--line)] py-[125px] max-[800px]:py-[82px]">
          <SectionHeading
            eyebrow="03 / Un seul espace"
            title={
              <>
                Votre site. Vos contenus. Vos clients.{' '}
                <span className="text-water-light">Vos paiements.</span>
              </>
            }
            description="Beaucoup d’entreprises jonglent avec un site chez un prestataire, un formulaire chez un autre, un outil de réservation ailleurs et un tableur pour les clients. Avec StaX, votre site est conçu pour vous, et ce qu’il reçoit arrive dans un seul espace, que nous maintenons."
          />

          <div className="mt-16 grid gap-16 lg:grid-cols-[1fr_1fr] lg:items-start">
            <dl className="step-list">
              <Reveal as="div" className="border-b border-[rgb(43_93_111/0.19)] py-8">
                <dt className="text-2xl font-bold tracking-[-0.045em] text-[#284f60]">
                  Un site qui reste à jour, sans que vous y pensiez
                </dt>
                <dd className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  Hébergement sur Cloudflare, certificat HTTPS, versions conservées, surveillance et
                  support sont inclus dans la maintenance mensuelle, qui démarre à la livraison. Ni
                  serveur à gérer, ni extension à mettre à jour.
                  <OperationalIndicators className="mt-6" />
                </dd>
              </Reveal>
              <Reveal as="div" delay={60} className="border-b border-[rgb(43_93_111/0.19)] py-8">
                <dt className="text-2xl font-bold tracking-[-0.045em] text-[#284f60]">
                  Vous gardez la main sur vos contenus
                </dt>
                <dd className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  Une fois votre site livré, vous changez un horaire, une photo ou un tarif
                  vous-même, puis vous publiez : la modification est réellement déployée.{' '}
                  <Link href="/fonctionnalites/editeur" className="font-bold text-accent">
                    Voir l’éditeur →
                  </Link>
                </dd>
              </Reveal>
              {VALUE_TILES.map((tile, index) => (
                <Reveal
                  key={tile.title}
                  as="div"
                  delay={120 + index * 60}
                  className="border-b border-[rgb(43_93_111/0.19)] py-6"
                >
                  <dt className="flex items-center gap-3 text-lg font-bold tracking-[-0.03em] text-[#284f60]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 shrink-0 text-[var(--water-bright)]"
                    >
                      {tile.icon}
                    </svg>
                    {tile.title}
                  </dt>
                  <dd className="mt-2 pl-7 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                    {tile.description}
                  </dd>
                </Reveal>
              ))}
            </dl>

            {/* Les memes ecrans, reunis : ce que le client voit dans son espace. */}
            <div className="relative hidden lg:sticky lg:top-12 lg:block">
              <div className="stage relative mx-auto h-[32rem] max-w-md">
                <Parallax speed={-0.1} className="absolute top-0 left-0 w-72">
                  <InboxPanel />
                </Parallax>
                <Parallax speed={0.12} className="absolute top-40 right-0 w-64">
                  <BookingPanel />
                </Parallax>
                <Parallax speed={-0.06} className="absolute bottom-0 left-10 w-60">
                  <PaymentPanel />
                </Parallax>
              </div>
            </div>
          </div>
        </section>

        {/* --- Metier -> site ------------------------------------------------- */}
        <section className="border-t border-[var(--line)] pt-[125px] pb-[110px] max-[800px]:py-[82px]">
          <SectionHeading
            align="center"
            eyebrow="04 / Adapté à votre activité"
            title="Votre métier oriente le projet. Il ne choisit pas votre site."
            description="Votre métier nous aide à comprendre vos besoins : il adapte le questionnaire, nous permet de vous suggérer les fonctionnalités utiles et donne à votre espace le bon vocabulaire. Le site, lui, est conçu pour votre entreprise."
            className="mx-auto"
          />
        </section>
      </Container>

      <div className="-mt-4 pb-[125px] max-[800px]:pb-[82px]">
        <BusinessSwitcher />
      </div>

      <Container size="wide">
        {/* --- Editeur -------------------------------------------------------- */}
        <section className="overflow-hidden border-t border-[var(--line)] py-[125px] max-[800px]:py-[82px]">
          <div className="grid gap-16 lg:grid-cols-[0.9fr_1.5fr] lg:items-center">
            <div>
              <SectionHeading
                eyebrow="05 / Après la livraison"
                title="Vous modifiez votre site, sans toucher à du code"
                description="Cliquez sur un texte ou une image dans l’aperçu de votre vrai site : StaX affiche les champs que votre site permet de modifier. Enregistrez un brouillon, vérifiez l’aperçu, puis publiez. Rien n’apparaît en ligne avant « Publier »."
              />
              <ul className="step-list mt-10">
                {EDITOR_POINTS.map((point) => (
                  <li
                    key={point}
                    className="flex gap-3 border-b border-[rgb(43_93_111/0.19)] py-3 text-sm"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      className="mt-0.5 size-3.5 shrink-0 text-[var(--water-bright)]"
                    >
                      <path d="m3 8.5 3.5 3.5L13 5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="leading-relaxed text-[var(--foreground-muted)]">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Reveal delay={80}>
              <ScrollTilt maxDeg={6}>
                <div className="stage lg:-mr-16 xl:-mr-24">
                  <BrowserFrame url="stax.fr/app/editeur">
                    <EditorMock />
                  </BrowserFrame>
                </div>
              </ScrollTilt>
            </Reveal>
          </div>
        </section>

        {/* --- Modules metier -------------------------------------------------- */}
        <section className="border-t border-[var(--line)] py-[125px] max-[800px]:py-[82px]">
          <SectionHeading
            eyebrow="06 / Modules"
            title="Ce dont votre métier a besoin, et rien de plus"
            description="Selon votre activité, nous vous suggérons les fonctionnalités utiles. Celles que votre offre comprend sont développées dans votre site, et vous les gérez ensuite depuis votre espace."
          />
          <ul className="step-list mt-14">
            {MODULE_TILES.map((module, index) => (
              <Reveal
                key={module.title}
                as="li"
                delay={Math.min(index * 40, 240)}
                className="group grid gap-2 border-b border-[rgb(43_93_111/0.19)] py-6 transition-colors duration-300 hover:bg-[rgb(255_255_255/0.32)] sm:grid-cols-[43px_1fr_1.4fr_1fr] sm:items-baseline sm:gap-6 sm:px-3"
              >
                <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="text-xl font-bold tracking-[-0.045em] text-[#284f60] transition-colors group-hover:text-[var(--water-bright)]">
                  {module.title}
                </h3>
                <p className="text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  {module.description}
                </p>
                <p className="text-[11px] font-[650] tracking-[0.06em] text-[var(--muted)] uppercase sm:text-right">
                  {module.who}
                </p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* --- Domaines ------------------------------------------------------ */}
        <section className="border-t border-[var(--line)] py-[125px] max-[800px]:py-[82px]">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.4fr] lg:items-center">
            <SectionHeading
              eyebrow="07 / Noms de domaine"
              title="Votre domaine, votre marque, votre adresse"
              description="Vous arrivez avec votre nom de domaine ou nous vous en trouvons un. Nous le connectons, le certificat HTTPS s’installe automatiquement, et votre site répond sous votre propre adresse."
            />
            <Reveal delay={80}>
              <DomainRoutingDiagram />
            </Reveal>
          </div>
          <div className="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[var(--line)] sm:border-t sm:border-[var(--line)] sm:pt-8">
            {DOMAIN_POINTS.map((point, index) => (
              <div key={point.title} className="sm:px-8 sm:first:pl-0 sm:last:pr-0">
                <p className="step-number">0{index + 1}</p>
                <h3 className="mt-3 text-lg font-bold tracking-[-0.03em] text-[#284f60]">
                  {point.title}
                </h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  {point.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* --- Paiements ----------------------------------------------------- */}
        <section className="border-t border-[var(--line)] py-[125px] max-[800px]:py-[82px]">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <SectionHeading
                eyebrow="08 / Paiements"
                title="L’argent de vos clients va sur votre compte, pas sur le nôtre"
                description="Quand votre site encaisse un acompte, une commande ou un don, la transaction passe par votre propre compte Stripe, ouvert à votre nom. StaX n’est pas dans ce circuit et ne prélève aucune commission dessus."
              />
              <div className="mt-10 max-w-[36rem] border-t border-[#6f98a8] pt-4">
                <p className="kicker">Ce que vous payez à StaX</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  La création de votre site, puis la maintenance mensuelle à partir de sa livraison.
                  C’est tout. Les frais bancaires de vos encaissements sont ceux de Stripe, facturés
                  directement par Stripe, en toute transparence.
                </p>
              </div>
            </div>
            <Reveal delay={80}>
              <div className="stage">
                <Panel level={2} padding="lg">
                  <PaymentRoutingDiagram />
                </Panel>
              </div>
            </Reveal>
          </div>
        </section>

        {/* --- Referencement, performance, securite -------------------------- */}
        <section className="border-t border-[var(--line)] py-[125px] max-[800px]:py-[82px]">
          <SectionHeading
            eyebrow="09 / Les fondations techniques"
            title="Ce qui ne se voit pas, mais qui fait la différence"
            description="Un site lent, mal référencé ou mal protégé coûte des clients. Ces points ne sont pas des options chez StaX : ils sont faits correctement dès le premier jour, sur tous les sites."
          />
          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {TECHNICAL_PILLARS.map((pillar, index) => (
              <Reveal
                key={pillar.title}
                as="article"
                delay={index * 70}
                className="glass-panel flex flex-col p-[33px] max-[800px]:p-6"
              >
                <p className="kicker">{String(index + 1).padStart(2, '0')} / Fondation</p>
                <h3 className="display-panel mt-4 text-[clamp(1.9rem,2.5vw,2.7rem)]">
                  {pillar.title}
                </h3>
                <p className="mt-4 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  {pillar.description}
                </p>
                <ul className="step-list mt-7">
                  {pillar.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-3 border-b border-[rgb(43_93_111/0.19)] py-2.5 text-sm text-[var(--foreground-muted)]"
                    >
                      <span aria-hidden="true" className="text-[#5b94aa]">
                        →
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  <Link href={pillar.href} className="text-link">
                    En savoir plus
                    <span aria-hidden="true" className="arrow">
                      ↗
                    </span>
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* --- Tarifs -------------------------------------------------------- */}
        <section className="border-t border-[var(--line)] py-[125px] max-[800px]:py-[82px]">
          <SectionHeading
            align="center"
            eyebrow="10 / Tarifs"
            title="Un prix de création, puis une maintenance mensuelle"
            description="La maintenance ne commence qu’à la livraison de votre site, sans durée minimale. Pas de coût caché, pas de commission sur vos ventes : vous voyez exactement ce que vous paierez."
            className="mx-auto"
          />
          <PricingCards plans={plans} compact className="mt-14" />
          <p className="mt-8 text-center text-sm text-[var(--foreground-muted)]">
            <Link href="/tarifs" className="font-bold underline underline-offset-4">
              Comparer les offres en détail
            </Link>{' '}
            · Tous les prix sont indiqués hors taxes.
          </p>
        </section>

        {/* --- Garantie ------------------------------------------------------ */}
        <section className="grid grid-cols-[27%_1fr] gap-[4vw] border-t border-[var(--line)] py-[110px] max-[800px]:grid-cols-1 max-[800px]:gap-[25px] max-[800px]:py-[72px]">
          <p className="side-note self-start">Garantie commerciale</p>
          <div>
            <h2 className="display-section max-w-[760px]">
              {refund.windowDays} jours pour{' '}
              <span className="text-water-light">changer d’avis.</span>
            </h2>
            <p className="lead-text mt-8 max-w-[560px]">
              Si le site livré ne vous convient pas, vous disposez de {refund.windowDays} jours
              après sa mise en ligne pour demander un remboursement. Lorsqu’un nom de domaine a
              réellement été acheté pour vous, son coût —{' '}
              {formatMoney(refund.domainDeductionCents, refund.currency, {
                hideDecimalsWhenRound: true,
              })}{' '}
              — est déduit du remboursement, puisqu’il est déjà engagé. Si aucun domaine n’a été
              acheté, rien n’est déduit.
            </p>
            <p className="mt-4 max-w-[560px] text-xs leading-relaxed text-[var(--muted)]">
              Cette garantie commerciale s’ajoute à vos droits légaux et ne s’y substitue pas. Les
              conditions exactes figurent dans nos{' '}
              <Link href="/remboursements" className="underline underline-offset-4">
                conditions de remboursement
              </Link>
              .
            </p>
          </div>
        </section>

        {/* --- Sur mesure ---------------------------------------------------- */}
        <section className="pb-[125px] max-[800px]:pb-[82px]">
          <Reveal className="glass-panel glass-panel-warm glass-rings p-12 max-[800px]:p-6">
            <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <SectionHeading
                  eyebrow="11 / Projets sur mesure"
                  title="Un besoin qui sort du cadre ? Parlons-en."
                  description="Application métier, intégration à votre logiciel de caisse ou de gestion, reprise d’un site existant, volumétries importantes, contraintes réglementaires : nous étudions votre besoin et établissons un devis détaillé, ligne par ligne."
                />
                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <ButtonLink href="/devis" variant="primary" size="pill-lg">
                    Demander un devis
                  </ButtonLink>
                  <ButtonLink href="/sur-mesure" variant="secondary" size="pill-lg">
                    Comment ça se passe
                  </ButtonLink>
                </div>
              </div>
              <ul className="step-list">
                {CUSTOM_EXAMPLES.map((example, index) => (
                  <li
                    key={example}
                    className="grid grid-cols-[43px_1fr] items-center border-b border-[rgb(43_93_111/0.19)] py-3.5 text-[0.9375rem] font-semibold tracking-[-0.015em] text-[#284f60]"
                  >
                    <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                    {example}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>

        {/* --- Temoignages --------------------------------------------------- */}
        <section className="border-t border-[var(--line)] py-[110px] max-[800px]:py-[72px]">
          <SectionHeading
            eyebrow="12 / Ils nous font confiance"
            title="Les premiers retours clients arrivent bientôt"
            description="StaX est un produit jeune. Nous préférons une page vide à des témoignages inventés : cet espace accueillera les avis de nos clients, avec leur nom, leur métier et leur accord."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="border border-dashed border-[var(--border-strong)] bg-[var(--glass-1)] p-7"
              >
                <div aria-hidden="true" className="space-y-2.5">
                  <div className="h-2 w-full bg-[var(--border)]" />
                  <div className="h-2 w-5/6 bg-[var(--border)]" />
                  <div className="h-2 w-3/5 bg-[var(--border)]" />
                </div>
                <p className="kicker mt-6">Emplacement réservé à un avis client</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs text-[var(--muted)]">
            <Link href="/realisations" className="underline underline-offset-4">
              Voir nos exemples de sites
            </Link>{' '}
            — clairement identifiés comme démonstrations.
          </p>
        </section>

        {/* --- FAQ ----------------------------------------------------------- */}
        <section className="border-t border-[var(--line)] py-[125px] max-[800px]:py-[82px]">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.4fr] lg:items-start">
            <div className="lg:sticky lg:top-12">
              <SectionHeading
                eyebrow="13 / Questions fréquentes"
                title="Les réponses aux questions qu’on nous pose"
              />
              <p className="mt-7 text-sm text-[var(--foreground-muted)]">
                Vous ne trouvez pas votre réponse ?{' '}
                <Link href="/contact" className="font-bold underline underline-offset-4">
                  Écrivez-nous
                </Link>
                , nous répondons rapidement.
              </p>
            </div>
            <dl className="step-list">
              {HOMEPAGE_FAQ.map((item, index) => (
                <div
                  key={item.question}
                  className="grid grid-cols-[43px_1fr] gap-3 border-b border-[rgb(43_93_111/0.19)] py-7"
                >
                  <span aria-hidden="true" className="step-number pt-1.5">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <dt className="text-xl font-bold tracking-[-0.04em] text-[#284f60]">
                      {item.question}
                    </dt>
                    <dd className="measure mt-3 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                      {item.answer}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* --- Cloture : l eau profonde ---------------------------------------- */}
        <section id="contact" aria-labelledby="closing-title" className="pt-5">
          <div
            data-theme="dark"
            className="closing-block flex min-h-[405px] flex-col justify-between gap-12 p-12 max-[800px]:min-h-[365px] max-[800px]:p-[31px]"
          >
            <p className="kicker">Votre prochain point de départ</p>
            <h2 id="closing-title" className="display-closing max-w-[780px]">
              Votre site, conçu pour votre <span className="text-[#9bc5d4]">entreprise.</span>
              <br />
              Vous le gérez ensuite.
            </h2>
            <div className="flex flex-wrap gap-x-10 gap-y-5">
              <Link href="/commander" className="text-link">
                Commander mon site
                <span aria-hidden="true" className="arrow">
                  ↗
                </span>
              </Link>
              <Link href="/contact" className="text-link">
                Poser une question
                <span aria-hidden="true" className="arrow">
                  ↗
                </span>
              </Link>
            </div>
          </div>
        </section>
      </Container>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Contenu de la page                                                         */
/* -------------------------------------------------------------------------- */

const FALLBACK_SECTORS = [
  { slug: 'restauration', label: 'Restauration', businessCount: 0 },
  { slug: 'beaute-bien-etre', label: 'Beauté & bien-être', businessCount: 0 },
  { slug: 'artisanat', label: 'Artisanat & bâtiment', businessCount: 0 },
  { slug: 'commerce', label: 'Commerce', businessCount: 0 },
  { slug: 'services-professionnels', label: 'Services professionnels', businessCount: 0 },
  { slug: 'immobilier', label: 'Immobilier', businessCount: 0 },
];

const VALUE_TILES = [
  {
    title: 'Vos messages, au même endroit',
    description:
      'Les demandes envoyées depuis votre site arrivent dans une boîte de réception claire, avec filtrage du spam et notification par e-mail.',
    icon: (
      <path d="M1.5 9.5h3l1 2h5l1-2h3M1.5 9.5 3 3h10l1.5 6.5v3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-3Z" />
    ),
  },
  {
    title: 'Vos réservations, gérées',
    description:
      'Dès l’offre Premium : créneaux, capacités, confirmations et annulations. Vos clients réservent en ligne, vous validez d’un geste.',
    icon: <path d="M2 4h12v10H2V4Zm3-2v3m6-3v3M2 7h12m-6 3.5 1.5 1.5 3-3" />,
  },
  {
    title: 'Des statistiques honnêtes',
    description:
      'Visiteurs et pages consultées, sans cookie de pistage ni adresse IP conservée. Sources de trafic et conversions dès l’offre Premium.',
    icon: <path d="M2 14V8m4 6V3m4 11V6m4 8V9" />,
  },
];

const EDITOR_POINTS = [
  'L’aperçu est votre vrai site, pas une imitation',
  'Un brouillon enregistré : rien n’est en ligne avant « Publier »',
  'Chaque publication est une version datée, que vous pouvez restaurer',
  '« Publié » ne s’affiche qu’une fois le déploiement confirmé',
  'Le design, la mise en page et le code restent protégés',
  'Un changement de structure ? Nous nous en chargeons, sur devis si nécessaire',
];

const MODULE_TILES = [
  {
    title: 'Carte et menus',
    description:
      'Catégories, plats, prix, photos, allergènes réglementaires, formules du midi et du soir.',
    who: 'Restaurants, brasseries, traiteurs',
  },
  {
    title: 'Réservations',
    description:
      'Créneaux paramétrables, capacité par service, délai minimum, fermetures exceptionnelles. Dès l’offre Premium.',
    who: 'Restaurants, coiffeurs, praticiens',
  },
  {
    title: 'Prestations et tarifs',
    description: 'Vos services avec leur durée et leur prix, ou la mention « sur devis ».',
    who: 'Artisans, coiffeurs, services',
  },
  {
    title: 'Zones d’intervention',
    description:
      'Les communes que vous couvrez, déterminantes pour apparaître dans les recherches locales.',
    who: 'Artisans, dépannage, services à domicile',
  },
  {
    title: 'Réalisations',
    description: 'Un portfolio avant/après qui prouve votre savoir-faire mieux qu’un discours.',
    who: 'Artisans, photographes, agences',
  },
  {
    title: 'Catalogue et commandes',
    description:
      'Produits, variantes, stock simplifié, panier, retrait ou livraison. Dès l’offre Ultra Premium.',
    who: 'Commerces, producteurs, boutiques',
  },
  {
    title: 'Biens immobiliers',
    description: 'Annonces avec surface, DPE, photos et statut, mises à jour en autonomie.',
    who: 'Agences et mandataires',
  },
  {
    title: 'Chambres et séjours',
    description: 'Hébergements, équipements, tarifs et demandes de réservation.',
    who: 'Hôtels, chambres d’hôtes, gîtes',
  },
  {
    title: 'Demandes de devis',
    description: 'Un formulaire structuré qui qualifie la demande avant même votre premier appel.',
    who: 'Artisans, événementiel, services',
  },
];

const DOMAIN_POINTS = [
  {
    title: 'Vous possédez déjà un domaine',
    description:
      'Nous vous indiquons précisément quels enregistrements ajouter chez votre registrar, et vérifions la configuration.',
  },
  {
    title: 'Vous n’en avez pas encore',
    description:
      'Nous vous aidons à le choisir et pouvons nous en occuper pour vous. Les conditions de propriété et de transfert sont précisées dans nos conditions générales.',
  },
  {
    title: 'Un domaine, un site',
    description:
      'Un nom de domaine actif ne peut être rattaché qu’à un seul site, après vérification de propriété. C’est une protection contre le détournement.',
  },
];

const TECHNICAL_PILLARS = [
  {
    title: 'Référencement technique',
    description:
      'Être trouvé sur Google commence par des fondations correctes, avant tout travail éditorial.',
    items: [
      'Balises titre et description sur chaque page',
      'Données structurées adaptées à votre métier',
      'Plan du site et robots.txt en place dès la mise en ligne',
      'URL lisibles, redirections soignées lors d’une refonte',
      'Page 404 personnalisée',
    ],
    href: '/fonctionnalites/seo',
  },
  {
    title: 'Performance',
    description:
      'Un site lent perd des visiteurs avant même d’avoir été lu. Le vôtre est déployé sur le réseau mondial de Cloudflare.',
    items: [
      'Pages légères, JavaScript limité au nécessaire',
      'Images redimensionnées et servies en formats modernes',
      'Mise en cache à la périphérie du réseau',
      'Nouveau déploiement à chaque publication',
      'Core Web Vitals vérifiés avant la livraison',
    ],
    href: '/infrastructure',
  },
  {
    title: 'Sécurité',
    description:
      'Votre site et les données de vos clients sont protégés par des mesures appliquées à tous les niveaux.',
    items: [
      'HTTPS obligatoire, certificat renouvelé automatiquement',
      'Un projet indépendant par site : dépôt et déploiement dédiés',
      'Données de vos clients isolées au niveau de la base de données',
      'Protection anti-spam et limitation de débit',
      'Aucune donnée de carte bancaire stockée',
      'Journal d’activité consultable',
    ],
    href: '/securite',
  },
];

const CUSTOM_EXAMPLES = [
  'Connexion à votre logiciel de caisse ou de gestion',
  'Reprise de contenu depuis un site existant',
  'Espace client avec documents et suivi de dossier',
  'Catalogue important ou tarification complexe',
  'Plusieurs établissements sous une même marque',
  'Contraintes réglementaires ou sectorielles spécifiques',
];
