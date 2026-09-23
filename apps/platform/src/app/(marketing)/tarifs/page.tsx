import type { Metadata } from 'next';
import Link from 'next/link';
import { refundPolicyConfig } from '@stax/config';
import { formatMoney } from '@stax/payments';
import { Alert, Container, Panel, Section, SectionHeading, ButtonLink } from '@stax/ui';
import { PlanComparisonTable, PricingCards } from '~/components/marketing/pricing-cards';
import { entryPriceLabel, getPlans } from '~/lib/catalog';
import { FAQ_ITEMS } from '~/content/faq';

/**
 * Cette page affiche un TARIF. Prerendue, elle figerait le prix du jour de la
 * compilation : un changement de catalogue resterait invisible jusqu'au
 * deploiement suivant. Une heure de cache suffit a garder la page rapide tout
 * en la laissant se corriger seule.
 */
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const entry = await entryPriceLabel();
  return {
    title: 'Tarifs',
    description:
      'Un prix de création, puis une maintenance annuelle.' +
      (entry ? ` ${entry}.` : '') +
      ' Pas de commission sur vos ventes, pas de coût caché.',
    alternates: { canonical: '/tarifs' },
  };
}

export default async function PricingPage() {
  const plans = await getPlans();
  const refund = refundPolicyConfig();
  const pricingFaq = FAQ_ITEMS.filter((item) => item.category === 'tarifs');

  return (
    <>
      <Section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10"
        />
        <Container size="wide">
          <SectionHeading
            as="h1"
            align="center"
            eyebrow="Tarifs"
            title="Un prix clair, sans surprise"
            description="Vous payez la création de votre site, puis une maintenance annuelle qui couvre l’hébergement, la sécurité, les sauvegardes et le support. Rien d’autre."
            className="mx-auto"
          />
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="wide">
          <PricingCards plans={plans} />
          <p className="mt-6 text-center text-xs text-[var(--muted)]">
            Tous les prix sont indiqués hors taxes. TVA française de 20 % applicable.
          </p>
        </Container>
      </Section>

      <Section spacing="compact" className="border-y border-[var(--border)]">
        <Container size="wide">
          <SectionHeading
            eyebrow="Comparaison"
            title="Ce que contient chaque offre"
            description="Le tableau ci-dessous reflète exactement les droits appliqués par la plateforme : ce qui est marqué comme inclus l’est réellement, et ce qui ne l’est pas est refusé côté serveur."
          />
          <div className="mt-10">
            <PlanComparisonTable plans={plans} />
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel level={1} padding="lg">
              <h2 className="text-base font-medium">Aucune commission sur vos ventes</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Quand votre site encaisse un paiement, l’argent va directement sur votre compte
                Stripe. StaX ne prélève rien dessus, aujourd’hui comme demain — et si cela devait
                changer un jour, ce serait annoncé avant, jamais appliqué rétroactivement.
              </p>
            </Panel>
            <Panel level={1} padding="lg">
              <h2 className="text-base font-medium">Vos tarifs ne bougent pas</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Le prix de votre maintenance est figé au moment de votre commande. Une évolution de
                nos tarifs publics ne s’applique jamais aux contrats en cours.
              </p>
            </Panel>
            <Panel level={1} padding="lg">
              <h2 className="text-base font-medium">Résiliable en ligne, en quelques clics</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                La maintenance est annuelle et se reconduit chaque année. Vous résiliez depuis votre
                espace quand vous voulez : elle prend fin à l’échéance en cours, et nous vous
                rappelons la date de reconduction à l’avance. Vos données restent exportables.
              </p>
            </Panel>
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <Alert tone="neutral" title={`Garantie commerciale de ${refund.windowDays} jours`}>
            <p className="leading-relaxed">
              Si le site livré ne vous convient pas, vous disposez de {refund.windowDays} jours
              après sa mise en ligne pour demander un remboursement. Lorsqu’un nom de domaine a
              réellement été acheté pour vous, son coût —{' '}
              {formatMoney(refund.domainDeductionCents, refund.currency, {
                hideDecimalsWhenRound: true,
              })}{' '}
              — est déduit. Si aucun domaine n’a été acheté, rien n’est retenu. Cette garantie
              s’ajoute à vos droits légaux et ne s’y substitue pas.{' '}
              <Link href="/remboursements" className="underline underline-offset-4">
                Conditions détaillées
              </Link>
              .
            </p>
          </Alert>
        </Container>
      </Section>

      <Section spacing="compact" className="border-t border-[var(--border)]">
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.4fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <SectionHeading eyebrow="Questions" title="Sur les tarifs et l’abonnement" />
            </div>
            <dl className="divide-y divide-[var(--border)]">
              {pricingFaq.map((item) => (
                <div key={item.question} className="py-6 first:pt-0">
                  <dt className="text-base font-medium">{item.question}</dt>
                  <dd className="measure mt-2.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {item.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-medium tracking-[-0.03em]">Une question sur nos tarifs ?</h2>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/commander" size="lg">
              Commander mon site
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="lg">
              Nous écrire
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
