import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Panel, Reveal, Section, SectionHeading, ButtonLink } from '@nemasus/ui';
import { DomainRoutingDiagram, OperationalIndicators } from '~/components/marketing/diagrams';

export const metadata: Metadata = {
  title: 'Infrastructure',
  description:
    'Où tournent vos sites : un dépôt GitHub et un projet Cloudflare par site, une base ' +
    'européenne pour votre espace, chaque publication suivie jusqu’en ligne.',
  alternates: { canonical: '/infrastructure' },
};

const LAYERS = [
  {
    name: 'Code source',
    provider: 'GitHub',
    role: 'Chaque site possède son propre dépôt de code, créé pour lui. Chaque publication y devient un commit identifiable : l’historique de votre site est celui de son code.',
    facts: [
      'Un dépôt par site, jamais partagé entre clients',
      'Accès de Nemasus limité aux dépôts autorisés, avec des droits minimaux',
      'Chaque version publiée correspond à un commit',
    ],
  },
  {
    name: 'Hébergement et diffusion',
    provider: 'Cloudflare',
    role: 'Chaque site est déployé sur son propre projet Cloudflare et servi depuis le point de présence le plus proche du visiteur. Votre domaine pointe vers ce déploiement.',
    facts: [
      'Certificat HTTPS émis et renouvelé automatiquement',
      'Protection contre les attaques par déni de service',
      'Un déploiement par publication, suivi jusqu’à sa confirmation',
    ],
  },
  {
    name: 'Plateforme',
    provider: 'Vercel',
    role: 'Exécute le site Nemasus, votre espace client et l’éditeur, dans la région de Paris : au plus près de la base de données qui conserve vos informations.',
    facts: [
      'Exécution dans la région de Paris',
      'Chaque mise à jour de la plateforme est un déploiement distinct, activé d’un seul coup',
      'Secrets et clés conservés côté serveur, jamais dans le navigateur',
    ],
  },
  {
    name: 'Espace client et données',
    provider: 'Supabase (PostgreSQL)',
    role: 'Conserve vos brouillons, vos médias, vos messages, vos réservations et vos contacts dans une base relationnelle hébergée en France, dans la région de Paris.',
    facts: [
      'Isolation entre clients imposée par la base elle-même',
      'Sauvegarde quotidienne chiffrée de la base, conservée hors de Supabase',
      'Chiffrement au repos et en transit',
    ],
  },
  {
    name: 'Encaissements de votre site',
    provider: 'Stripe',
    role: 'Si votre site vend en ligne ou prend des acomptes, Stripe traite ces paiements sur son infrastructure certifiée PCI. Votre commande Nemasus, elle, se règle par virement bancaire.',
    facts: [
      'Aucune donnée de carte chez Nemasus',
      'Vos encaissements sur votre propre compte connecté',
      'Événements vérifiés par signature cryptographique',
    ],
  },
];

export default function InfrastructurePage() {
  return (
    <>
      <Section className="relative overflow-hidden">
        <Container size="wide">
          <SectionHeading
            as="h1"
            eyebrow="Infrastructure"
            title="Où tournent vos sites"
            description="Chaque site est un projet indépendant, avec son propre code et son propre déploiement. Nous ne gérons pas de serveurs physiques : chaque couche est confiée à un acteur dont c’est la spécialité, et nous documentons lequel."
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
            eyebrow="Un site, un projet"
            title="Votre domaine pointe vers votre site, pas vers une plateforme partagée"
            description="Chaque site a son dépôt, son projet Cloudflare et son domaine. Nemasus n’est pas sur le chemin de vos visiteurs : il intervient quand vous publiez, pour enregistrer vos modifications dans le code de votre site et les déployer."
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
              <h2 className="text-base font-medium">Publication suivie jusqu’au bout</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Publier crée un commit dans le dépôt de votre site, puis un déploiement Cloudflare.
                Ce que voient vos visiteurs ne change qu’une fois ce déploiement confirmé ; en cas
                d’échec, la version précédente reste en ligne.
              </p>
            </Panel>
            <Panel level={1} padding="lg">
              <h2 className="text-base font-medium">Sauvegardes et restauration</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Le code de chaque site est versionné, et chaque version publiée reste restaurable
                depuis votre espace : la restauration est un vrai redéploiement. La base de votre
                espace est sauvegardée chaque jour, chiffrée, hors de Supabase.
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
          <h2 className="font-serif text-[2.4rem] leading-tight font-normal">
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
