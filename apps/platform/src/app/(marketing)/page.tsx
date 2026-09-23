import type { Metadata } from 'next';
import Link from 'next/link';
import { listBusinesses } from '@stax/business';
import { refundPolicyConfig } from '@stax/config';
import { formatMoney } from '@stax/payments';
import {
  Beam,
  ButtonLink,
  Container,
  Panel,
  Parallax,
  Reveal,
  ScrollTilt,
  Section,
  SectionHeading,
} from '@stax/ui';
import { Hero } from '~/components/marketing/hero';
import { BusinessSwitcher } from '~/components/marketing/business-switcher';
import { PricingCards } from '~/components/marketing/pricing-cards';
import {
  CreationTimeline,
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
    title: 'Votre site professionnel, construit pour votre métier',
    description:
      'StaX conçoit, héberge et maintient le site de votre entreprise. Réservations, messages, ' +
      'paiements et contenus : un seul espace, adapté à votre métier.' +
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

  return (
    <>
      <Hero entryPrice={entry} businessCount={listBusinesses().length} />

      {/* --- Secteurs ---------------------------------------------------- */}
      <Section spacing="compact">
        <Container size="wide">
          <p className="text-center text-sm text-[var(--muted)]">
            Des sites conçus métier par métier
          </p>
          <ul className="mx-auto mt-8 flex max-w-5xl flex-wrap justify-center gap-2">
            {(sectors.length > 0 ? sectors : FALLBACK_SECTORS).map((sector) => (
              <li key={sector.slug}>
                <Link
                  href={`/metiers/${sector.slug}`}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-1)] px-4 py-2 text-sm text-[var(--foreground-muted)] transition-[border-color,color,background-color] duration-300 hover:border-[var(--accent)]/50 hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]"
                >
                  {sector.label}
                  {'businessCount' in sector && sector.businessCount > 0 ? (
                    <span className="text-xs text-[var(--muted)] tabular-nums">
                      {sector.businessCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* --- Proposition de valeur --------------------------------------- */}
      <Section>
        <Container size="wide">
          <SectionHeading
            eyebrow="Un seul espace"
            title="Votre site. Vos contenus. Vos clients. Vos paiements."
            description="Beaucoup d’entreprises jonglent avec un site chez un prestataire, un formulaire chez un autre, un outil de réservation ailleurs et un tableur pour les clients. StaX réunit tout au même endroit, et en assure la maintenance."
          />

          <div className="mt-16 grid gap-16 lg:grid-cols-[1fr_1fr] lg:items-start">
            <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              <Reveal as="div" className="py-8">
                <dt className="text-2xl font-semibold tracking-[-0.03em]">
                  Un site qui reste à jour, sans que vous y pensiez
                </dt>
                <dd className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  Hébergement, certificat HTTPS, sauvegardes, mises à jour de sécurité et
                  surveillance sont inclus dans la maintenance annuelle. Ni serveur à gérer, ni
                  extension à mettre à jour, ni panne à surveiller.
                  <OperationalIndicators className="mt-6" />
                </dd>
              </Reveal>
              <Reveal as="div" delay={60} className="py-8">
                <dt className="text-2xl font-semibold tracking-[-0.03em]">
                  Vous gardez la main sur vos contenus
                </dt>
                <dd className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  Changer un horaire, ajouter une photo, modifier un tarif : c’est vous, en quelques
                  secondes, sans dépendre de personne.{' '}
                  <Link href="/fonctionnalites/editeur" className="font-medium text-accent">
                    Voir l’éditeur →
                  </Link>
                </dd>
              </Reveal>
              {VALUE_TILES.map((tile, index) => (
                <Reveal key={tile.title} as="div" delay={120 + index * 60} className="py-6">
                  <dt className="flex items-center gap-3 text-lg font-semibold tracking-[-0.02em]">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-4 shrink-0 text-[var(--accent-text)]"
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
            <div className="relative hidden lg:sticky lg:top-28 lg:block">
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
        </Container>
      </Section>

      {/* --- Comment ca marche -------------------------------------------- */}
      <Section className="relative bg-[var(--background-subtle)]">
        <div
          aria-hidden="true"
          className="grid-bg pointer-events-none absolute inset-0 -z-10 opacity-40"
        />
        <Container size="wide">
          <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <SectionHeading
                eyebrow="Le parcours"
                title="De la commande à la mise en ligne, en quelques jours"
                description="Vous n’avez rien à construire. Vous nous dites qui vous êtes et ce que vous faites ; nous nous occupons du reste, avec votre validation à chaque étape."
              />
              <ButtonLink
                size="pill"
                href="/comment-ca-marche"
                variant="secondary"
                className="mt-8"
              >
                Voir le détail de chaque étape
              </ButtonLink>
            </div>
            <Reveal>
              <CreationTimeline steps={CREATION_STEPS} />
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* --- Metier -> site ----------------------------------------------- */}
      <Section>
        <Container size="wide">
          <SectionHeading
            align="center"
            eyebrow="Adapté à votre activité"
            title="Choisissez votre métier. Le site et l’espace suivent."
            description="Le métier que vous sélectionnez détermine les pages proposées, les fonctionnalités activées, le vocabulaire de votre espace et les informations transmises aux moteurs de recherche."
            className="mx-auto"
          />
        </Container>
        <div className="mt-14">
          <BusinessSwitcher />
        </div>
      </Section>

      {/* --- Editeur ------------------------------------------------------ */}
      <Section className="overflow-hidden bg-[var(--background-subtle)]">
        <Container size="wide">
          <div className="grid gap-16 lg:grid-cols-[0.9fr_1.5fr] lg:items-center">
            <div>
              <SectionHeading
                eyebrow="Édition"
                title="Modifier votre site, sans jamais toucher à du code"
                description="Vos sections se réorganisent par glisser-déposer. Vous voyez le résultat avant de publier, sur ordinateur, tablette et mobile. Rien n’apparaît en ligne tant que vous n’avez pas cliqué sur « Publier »."
              />
              <ul className="mt-8 space-y-3">
                {EDITOR_POINTS.map((point) => (
                  <li key={point} className="flex gap-3 text-sm">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      className="mt-0.5 size-3.5 shrink-0 text-[var(--accent-text)]"
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
                <div className="stage lg:-mr-24 xl:-mr-40">
                  <BrowserFrame url="stax.fr/app/editeur">
                    <EditorMock />
                  </BrowserFrame>
                </div>
              </ScrollTilt>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* --- Modules metier ------------------------------------------------ */}
      <Section>
        <Container size="wide">
          <SectionHeading
            eyebrow="Modules"
            title="Ce dont votre métier a besoin, et rien de plus"
            description="Chaque module ajoute une fonctionnalité à votre site et une section à votre espace. Ils s’activent automatiquement selon votre activité, et restent modifiables à tout moment."
          />
          <ul className="mt-14 border-t border-[var(--border)]">
            {MODULE_TILES.map((module, index) => (
              <Reveal
                key={module.title}
                as="li"
                delay={Math.min(index * 40, 240)}
                className="group grid gap-2 border-b border-[var(--border)] py-6 transition-colors duration-300 hover:bg-[var(--glass-1)] sm:grid-cols-[1fr_1.4fr_1fr] sm:items-baseline sm:gap-8 sm:px-4"
              >
                <h3 className="text-xl font-semibold tracking-[-0.025em] transition-colors group-hover:text-[var(--accent-text)]">
                  {module.title}
                </h3>
                <p className="text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  {module.description}
                </p>
                <p className="text-sm text-[var(--muted)] sm:text-right">{module.who}</p>
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>

      {/* --- Domaines ------------------------------------------------------ */}
      <Section className="bg-[var(--background-subtle)]">
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.4fr] lg:items-center">
            <SectionHeading
              eyebrow="Noms de domaine"
              title="Votre domaine, votre marque, votre adresse"
              description="Vous arrivez avec votre nom de domaine ou nous vous en trouvons un. Nous le connectons, le certificat HTTPS s’installe automatiquement, et votre site répond sous votre propre adresse."
            />
            <Reveal delay={80}>
              <DomainRoutingDiagram />
            </Reveal>
          </div>
          <div className="mt-16 grid gap-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-[var(--border)]">
            {DOMAIN_POINTS.map((point, index) => (
              <div key={point.title} className="sm:px-8 sm:first:pl-0 sm:last:pr-0">
                <p className="font-mono text-xs text-accent">0{index + 1}</p>
                <h3 className="mt-3 text-lg font-semibold tracking-[-0.02em]">{point.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  {point.description}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </Section>

      {/* --- Paiements ----------------------------------------------------- */}
      <Section>
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <SectionHeading
                eyebrow="Paiements"
                title="L’argent de vos clients va sur votre compte, pas sur le nôtre"
                description="Quand votre site encaisse un acompte, une commande ou un don, la transaction passe par votre propre compte Stripe, ouvert à votre nom. StaX n’est pas dans ce circuit et ne prélève aucune commission dessus."
              />
              <div className="mt-10 border-l-2 border-[var(--accent)] pl-5">
                <p className="text-sm font-medium">Ce que vous payez à StaX</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  La création de votre site, puis la maintenance annuelle. C’est tout. Les frais
                  bancaires de vos encaissements sont ceux de Stripe, facturés directement par
                  Stripe, en toute transparence.
                </p>
              </div>
            </div>
            <Reveal delay={80}>
              <div className="stage">
                <Panel level={2} padding="lg" className="rounded-[var(--radius-xl)]">
                  <PaymentRoutingDiagram />
                </Panel>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>

      {/* --- Referencement, performance, securite -------------------------- */}
      <Section className="bg-[var(--background-subtle)]">
        <Container size="wide">
          <SectionHeading
            eyebrow="Les fondations techniques"
            title="Ce qui ne se voit pas, mais qui fait la différence"
            description="Un site lent, mal référencé ou mal protégé coûte des clients. Ces points ne sont pas des options chez StaX : ils sont faits correctement dès le premier jour, sur tous les sites."
          />
          <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-0 md:divide-x md:divide-[var(--border)]">
            {TECHNICAL_PILLARS.map((pillar, index) => (
              <Reveal
                key={pillar.title}
                delay={index * 70}
                className="md:px-8 md:first:pl-0 md:last:pr-0"
              >
                <h3 className="text-2xl font-semibold tracking-[-0.03em]">{pillar.title}</h3>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                  {pillar.description}
                </p>
                <ul className="mt-6 space-y-2.5">
                  {pillar.items.map((item) => (
                    <li key={item} className="flex gap-3 text-sm">
                      <span
                        aria-hidden="true"
                        className="mt-2 size-1 shrink-0 rounded-full bg-[var(--accent-text)]"
                      />
                      <span className="text-[var(--foreground-muted)]">{item}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={pillar.href}
                  className="mt-6 inline-block text-sm font-medium text-accent"
                >
                  En savoir plus →
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      {/* --- Tarifs -------------------------------------------------------- */}
      <Section>
        <Container size="wide">
          <SectionHeading
            align="center"
            eyebrow="Tarifs"
            title="Un prix de création, puis une maintenance annuelle"
            description="Pas de coût caché, pas de facturation à la page vue, pas de commission sur vos ventes. Vous voyez exactement ce que vous paierez."
            className="mx-auto"
          />
          <PricingCards plans={plans} compact className="mt-14" />
          <p className="mt-8 text-center text-sm text-[var(--foreground-muted)]">
            <Link href="/tarifs" className="font-medium underline underline-offset-4">
              Comparer les offres en détail
            </Link>{' '}
            · Tous les prix sont indiqués hors taxes.
          </p>
        </Container>
      </Section>

      {/* --- Garantie ------------------------------------------------------ */}
      <Section spacing="compact" className="bg-[var(--background-subtle)]">
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-center">
            <SectionHeading
              eyebrow="Garantie commerciale"
              title={`${refund.windowDays} jours pour changer d’avis`}
            />
            <div>
              <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
                Si le site livré ne vous convient pas, vous disposez de {refund.windowDays} jours
                après sa mise en ligne pour demander un remboursement. Lorsqu’un nom de domaine a
                réellement été acheté pour vous, son coût —{' '}
                {formatMoney(refund.domainDeductionCents, refund.currency, {
                  hideDecimalsWhenRound: true,
                })}{' '}
                — est déduit du remboursement, puisqu’il est déjà engagé. Si aucun domaine n’a été
                acheté, rien n’est déduit.
              </p>
              <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
                Cette garantie commerciale s’ajoute à vos droits légaux et ne s’y substitue pas. Les
                conditions exactes figurent dans nos{' '}
                <Link href="/remboursements" className="underline underline-offset-4">
                  conditions de remboursement
                </Link>
                .
              </p>
            </div>
          </div>
        </Container>
      </Section>

      {/* --- Sur mesure ---------------------------------------------------- */}
      <Section>
        <Container size="wide">
          <Panel
            level={2}
            padding="xl"
            className="halo relative overflow-hidden rounded-[var(--radius-2xl)]"
          >
            <div aria-hidden="true" className="absolute noise inset-0" />
            <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
              <div>
                <SectionHeading
                  eyebrow="Projets sur mesure"
                  title="Un besoin qui sort du cadre ? Parlons-en."
                  description="Application métier, intégration à votre logiciel de caisse ou de gestion, reprise d’un site existant, volumétries importantes, contraintes réglementaires : nous étudions votre besoin et établissons un devis détaillé, ligne par ligne."
                />
                <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                  <ButtonLink href="/devis" variant="primary" size="pill-lg">
                    Demander un devis
                  </ButtonLink>
                  <ButtonLink href="/sur-mesure" variant="glass" size="pill-lg">
                    Comment ça se passe
                  </ButtonLink>
                </div>
              </div>
              <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {CUSTOM_EXAMPLES.map((example) => (
                  <li
                    key={example}
                    className="flex items-center gap-3 py-3.5 text-[0.9375rem] text-[var(--foreground-muted)]"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full bg-[var(--accent-text)]"
                    />
                    {example}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </Container>
      </Section>

      {/* --- Temoignages --------------------------------------------------- */}
      <Section spacing="compact">
        <Container size="wide">
          <SectionHeading
            eyebrow="Ils nous font confiance"
            title="Les premiers retours clients arrivent bientôt"
            description="StaX est un produit jeune. Nous préférons une page vide à des témoignages inventés : cet espace accueillera les avis de nos clients, avec leur nom, leur métier et leur accord."
          />
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-6"
              >
                <div aria-hidden="true" className="space-y-2">
                  <div className="h-2 w-full rounded-full bg-[var(--border)]" />
                  <div className="h-2 w-5/6 rounded-full bg-[var(--border)]" />
                  <div className="h-2 w-3/5 rounded-full bg-[var(--border)]" />
                </div>
                <p className="mt-5 text-xs text-[var(--muted)]">
                  Emplacement réservé à un avis client
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-[var(--muted)]">
            <Link href="/realisations" className="underline underline-offset-4">
              Voir nos exemples de sites
            </Link>{' '}
            — clairement identifiés comme démonstrations.
          </p>
        </Container>
      </Section>

      {/* --- FAQ ----------------------------------------------------------- */}
      <Section>
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.4fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <SectionHeading
                eyebrow="Questions fréquentes"
                title="Les réponses aux questions qu’on nous pose"
              />
              <p className="mt-6 text-sm text-[var(--foreground-muted)]">
                Vous ne trouvez pas votre réponse ?{' '}
                <Link href="/contact" className="font-medium underline underline-offset-4">
                  Écrivez-nous
                </Link>
                , nous répondons rapidement.
              </p>
            </div>
            <dl className="divide-y divide-[var(--border)]">
              {HOMEPAGE_FAQ.map((item) => (
                <div key={item.question} className="py-6 first:pt-0">
                  <dt className="text-lg font-semibold tracking-[-0.02em]">{item.question}</dt>
                  <dd className="measure mt-3 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      {/* --- CTA finale ---------------------------------------------------- */}
      <Section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="grid-bg grid-bg-fade absolute inset-0 rotate-180 opacity-60" />
          <div className="absolute bottom-[-22rem] left-1/2 h-[34rem] w-[56rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--accent-glow),transparent)] opacity-40 blur-3xl" />
        </div>
        <Beam className="absolute inset-x-0 top-0 opacity-40" />
        <Container size="default" className="text-center">
          <h2 className="display text-5xl sm:text-7xl lg:text-8xl">
            Votre site professionnel vous attend.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-[var(--foreground-muted)]">
            Choisissez votre métier, répondez à quelques questions, et notre équipe construit votre
            site. Vous validez avant la mise en ligne.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink
              href="/commander"
              variant="accent"
              size="pill-lg"
              className="w-full sm:w-auto"
            >
              Commander mon site
            </ButtonLink>
            <ButtonLink href="/contact" variant="glass" size="pill-lg" className="w-full sm:w-auto">
              Poser une question
            </ButtonLink>
          </div>
        </Container>
      </Section>
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
      'Créneaux, capacités, confirmations et annulations. Vos clients réservent en ligne, vous validez d’un geste.',
    icon: <path d="M2 4h12v10H2V4Zm3-2v3m6-3v3M2 7h12m-6 3.5 1.5 1.5 3-3" />,
  },
  {
    title: 'Des statistiques honnêtes',
    description:
      'Visiteurs, pages consultées, sources de trafic. Sans cookie de pistage et sans conserver d’adresse IP.',
    icon: <path d="M2 14V8m4 6V3m4 11V6m4 8V9" />,
  },
];

const CREATION_STEPS = [
  {
    title: 'Vous choisissez votre offre et votre métier',
    description:
      'Deux questions suffisent : votre secteur, puis votre métier précis. Les fonctionnalités adaptées sont présélectionnées.',
    detail: 'Environ 2 minutes',
  },
  {
    title: 'Vous répondez au questionnaire',
    description:
      'Vos coordonnées, votre activité, ce qui vous distingue, vos photos et vos textes si vous en avez. Rien n’est obligatoire d’un coup : vous pouvez revenir le compléter.',
    detail: 'Sauvegardé automatiquement',
  },
  {
    title: 'Notre équipe conçoit votre site',
    description:
      'Design, rédaction, mise en page, configuration des modules métier et référencement technique. Vous suivez l’avancement dans votre espace.',
  },
  {
    title: 'Vous relisez et demandez vos corrections',
    description:
      'Le site vous est présenté en aperçu privé. Vous indiquez ce qui doit changer, autant de fois que nécessaire, directement depuis votre espace.',
  },
  {
    title: 'Mise en ligne sur votre domaine',
    description:
      'Nous publions le site, connectons votre nom de domaine et activons le certificat HTTPS. La garantie commerciale démarre à cet instant.',
  },
  {
    title: 'Maintenance et autonomie',
    description:
      'Vous modifiez vos contenus quand vous voulez. Nous assurons l’hébergement, la sécurité, les sauvegardes et le support.',
  },
];

const EDITOR_POINTS = [
  'Aperçu avant publication, sur les trois formats d’écran',
  'Enregistrement automatique de votre travail en cours',
  'Historique des versions : revenez en arrière à tout moment',
  'Vos modifications n’apparaissent en ligne qu’après publication',
  'Aucun vocabulaire technique : des pages, du contenu, de l’apparence',
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
      'Créneaux paramétrables, capacité par service, délai minimum, fermetures exceptionnelles.',
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
    description: 'Produits, variantes, stock simplifié, panier, retrait ou livraison.',
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
      'Votre site démarre sur une adresse StaX, et nous vous accompagnons pour choisir puis connecter votre propre nom.',
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
      'Plan de site et robots.txt générés automatiquement',
      'URL lisibles et redirections administrables',
      'Page 404 personnalisée',
    ],
    href: '/fonctionnalites/seo',
  },
  {
    title: 'Performance',
    description:
      'Un site lent perd des visiteurs avant même d’avoir été lu. Le vôtre est servi depuis le réseau mondial de Cloudflare.',
    items: [
      'Rendu côté serveur, JavaScript minimal',
      'Images redimensionnées et servies en formats modernes',
      'Mise en cache à la périphérie du réseau',
      'Invalidation automatique à chaque publication',
      'Conçu pour les Core Web Vitals',
    ],
    href: '/infrastructure',
  },
  {
    title: 'Sécurité',
    description:
      'Votre site et les données de vos clients sont protégés par des mesures appliquées à tous les niveaux.',
    items: [
      'HTTPS obligatoire, certificat renouvelé automatiquement',
      'Isolation stricte entre clients, garantie par la base de données',
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
