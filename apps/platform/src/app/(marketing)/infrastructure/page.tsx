import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Panel, Reveal, Section, SectionHeading, ButtonLink } from '@stax/ui';
import { DomainRoutingDiagram, OperationalIndicators } from '~/components/marketing/diagrams';

export const metadata: Metadata = {
  title: 'Infrastructure',
  description:
    'Où tournent vos sites, avec quelles garanties : réseau mondial Cloudflare, base PostgreSQL ' +
    'européenne chez Supabase, publication par versions figées et sauvegardes quotidiennes.',
  alternates: { canonical: '/infrastructure' },
};

const LAYERS = [
  {
    name: 'Périphérie du réseau',
    provider: 'Cloudflare',
    role: 'Sert vos pages depuis le point de présence le plus proche de votre visiteur, filtre le trafic malveillant et termine le chiffrement TLS.',
    facts: [
      'Certificat HTTPS émis et renouvelé automatiquement',
      'Protection contre les attaques par déni de service',
      'Cache invalidé à chaque publication, jamais partagé entre clients',
    ],
  },
  {
    name: 'Application',
    provider: 'Cloudflare Workers',
    role: 'Exécute le rendu de votre site et de votre espace client au plus près du visiteur, sans serveur à maintenir ni mise à l’échelle à prévoir.',
    facts: [
      'Aucune fenêtre de maintenance liée à un serveur',
      'Montée en charge automatique',
      'Déploiements sans interruption de service',
    ],
  },
  {
    name: 'Données',
    provider: 'Supabase (PostgreSQL)',
    role: 'Conserve vos contenus, vos messages, vos réservations et vos contacts dans une base relationnelle hébergée dans une région européenne.',
    facts: [
      'Isolation entre clients imposée par la base elle-même',
      'Sauvegardes quotidiennes avec restauration à un instant donné',
      'Chiffrement au repos et en transit',
    ],
  },
  {
    name: 'Paiements',
    provider: 'Stripe',
    role: 'Traite les paiements de la plateforme et les encaissements de vos clients finaux, sur son infrastructure certifiée PCI.',
    facts: [
      'Aucune donnée de carte chez StaX',
      'Vos encaissements sur votre propre compte connecté',
      'Événements vérifiés par signature cryptographique',
    ],
  },
];

export default function InfrastructurePage() {
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
            eyebrow="Infrastructure"
            title="Où tournent vos sites"
            description="Nous ne gérons pas de serveurs physiques et nous ne bricolons pas d’hébergement mutualisé. Chaque couche est confiée à un acteur dont c’est le métier, et nous documentons lequel."
          />
          <OperationalIndicators className="mt-12 lg:grid-cols-4" />
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="wide">
          <div className="grid gap-3 lg:grid-cols-2">
            {LAYERS.map((layer, index) => (
              <Reveal key={layer.name} delay={index * 50}>
                <Panel level={2} padding="lg" className="h-full">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg font-medium tracking-[-0.02em]">{layer.name}</h2>
                    <span className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)]">
                      {layer.provider}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {layer.role}
                  </p>
                  <ul className="mt-5 space-y-2 border-t border-[var(--border)] pt-5">
                    {layer.facts.map((fact) => (
                      <li key={fact} className="flex gap-2.5 text-sm">
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1 shrink-0 rounded-full bg-[var(--muted)]"
                        />
                        <span className="text-[var(--foreground-muted)]">{fact}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <Section spacing="compact" className="border-y border-[var(--border)]">
        <Container size="wide">
          <SectionHeading
            eyebrow="Multi-tenant"
            title="Comment un nom de domaine trouve le bon site"
            description="Tous les sites clients arrivent sur la même infrastructure. C’est le nom d’hôte de la requête — jamais un paramètre fourni par le navigateur — qui détermine quel site servir et quelles données charger."
          />
          <Panel level={2} padding="lg" className="mt-10">
            <DomainRoutingDiagram />
          </Panel>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Panel level={1} padding="lg">
              <h2 className="text-base font-medium">Publication par versions figées</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Publier crée un instantané complet et immuable de votre site. Ce que voient vos
                visiteurs ne change pas tant que vous ne republiez pas, même si vous modifiez votre
                brouillon entre-temps.
              </p>
            </Panel>
            <Panel level={1} padding="lg">
              <h2 className="text-base font-medium">Sauvegardes et restauration</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                La base est sauvegardée quotidiennement, avec possibilité de restauration à un
                instant donné. Chaque version publiée de votre site reste par ailleurs restaurable
                depuis votre espace.
              </p>
            </Panel>
            <Panel level={1} padding="lg">
              <h2 className="text-base font-medium">Disponibilité</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Nous publions l’état réel de nos services plutôt qu’un pourcentage invérifiable.
                Consultez la page{' '}
                <Link href="/status" className="underline underline-offset-4">
                  état des services
                </Link>
                .
              </p>
            </Panel>
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-medium tracking-[-0.03em]">
            La liste complète de nos sous-traitants
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
            Qui traite quelles données, où, et avec quelles garanties de transfert. Publiée et tenue
            à jour.
          </p>
          <ButtonLink href="/sous-traitants" size="pill-lg" className="mt-8">
            Voir les sous-traitants
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
