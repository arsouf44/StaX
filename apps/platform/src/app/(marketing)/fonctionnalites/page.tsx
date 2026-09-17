import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Panel, Reveal, Section, SectionHeading, ButtonLink, Badge } from '@stax/ui';
import { FEATURE_PAGES } from '~/content/features';

export const metadata: Metadata = {
  title: 'Fonctionnalités',
  description:
    'Éditeur de contenu, domaines, formulaires, messages, statistiques, référencement, ' +
    'paiements, réservations, vente en ligne : tout ce que fait la plateforme StaX.',
  alternates: { canonical: '/fonctionnalites' },
};

const PLAN_LABELS: Record<string, string> = {
  premium: 'Premium',
  signature: 'Signature',
  classique: 'Classique',
};

export default function FeaturesIndexPage() {
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
            eyebrow="Fonctionnalités"
            title="Tout ce que votre site sait faire"
            description="Chaque fonctionnalité est décrite telle qu’elle existe réellement, avec ses limites quand elle en a. Vous saurez exactement ce que vous achetez."
          />
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_PAGES.map((feature, index) => (
              <Reveal key={feature.slug} delay={index * 40}>
                <Link href={`/fonctionnalites/${feature.slug}`} className="block h-full">
                  <Panel level={1} padding="lg" interactive className="h-full">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-medium">{feature.name}</h2>
                      {feature.requiredPlan ? (
                        <Badge tone="accent" size="sm">
                          {PLAN_LABELS[feature.requiredPlan] ?? feature.requiredPlan}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="sm">
                          Toutes offres
                        </Badge>
                      )}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                      {feature.subtitle}
                    </p>
                    <p className="mt-5 text-xs font-medium text-[var(--accent)]">
                      En savoir plus →
                    </p>
                  </Panel>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-medium tracking-[-0.03em]">
            Une fonctionnalité qui manque ?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[var(--foreground-muted)]">
            Les projets sur mesure existent précisément pour cela. Décrivez votre besoin, nous
            étudions sa faisabilité et vous adressons un devis détaillé.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/devis" size="lg">
              Demander un devis
            </ButtonLink>
            <ButtonLink href="/tarifs" variant="secondary" size="lg">
              Voir les offres
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
