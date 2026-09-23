import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Reveal, Section, SectionHeading, ButtonLink, Badge } from '@stax/ui';
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
  'ultra-premium': 'Ultra Premium',
  essentiel: 'Essentiel',
};

export default function FeaturesIndexPage() {
  return (
    <>
      <Section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="spotlight absolute inset-0" />
          <div className="grid-bg grid-bg-fade absolute inset-0" />
        </div>
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
          <ul className="border-t border-[var(--border)]">
            {FEATURE_PAGES.map((feature, index) => (
              <Reveal key={feature.slug} as="li" delay={Math.min(index * 30, 210)}>
                <Link
                  href={`/fonctionnalites/${feature.slug}`}
                  className="group grid gap-3 border-b border-[var(--border)] py-7 transition-colors duration-300 hover:bg-[var(--glass-1)] md:grid-cols-[1fr_1.5fr_auto] md:items-center md:gap-10 md:px-4"
                >
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] transition-colors group-hover:text-[var(--accent-text)]">
                    {feature.name}
                  </h2>
                  <p className="text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                    {feature.subtitle}
                  </p>
                  <span className="flex items-center gap-4 md:justify-self-end">
                    {feature.requiredPlan ? (
                      <Badge tone="accent" size="sm">
                        {PLAN_LABELS[feature.requiredPlan] ?? feature.requiredPlan}
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">
                        Toutes offres
                      </Badge>
                    )}
                    <span
                      aria-hidden="true"
                      className="text-[var(--muted)] transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[var(--accent-text)]"
                    >
                      →
                    </span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow" className="text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Une fonctionnalité qui manque ?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[var(--foreground-muted)]">
            Les projets sur mesure existent précisément pour cela. Décrivez votre besoin, nous
            étudions sa faisabilité et vous adressons un devis détaillé.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/devis" size="pill-lg">
              Demander un devis
            </ButtonLink>
            <ButtonLink href="/tarifs" variant="secondary" size="pill-lg">
              Voir les offres
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
