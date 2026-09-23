import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert, Container, Panel, Reveal, Section, SectionHeading, ButtonLink } from '@stax/ui';

export const metadata: Metadata = {
  title: 'Sécurité',
  description:
    'Isolation stricte entre clients garantie par la base de données, aucune donnée bancaire ' +
    'stockée, chiffrement en transit, journaux d’audit. Comment StaX protège vos données.',
  alternates: { canonical: '/securite' },
};

const PILLARS = [
  {
    title: 'Isolation entre clients',
    body: 'Chaque client dispose de son propre espace de données. L’isolation n’est pas assurée par un filtre dans l’interface : elle est imposée par la base de données elle-même, à chaque requête, y compris en cas de défaut applicatif.',
    points: [
      'Politiques de sécurité au niveau des lignes sur toutes les tables concernées',
      'Un identifiant fourni par le navigateur ne peut jamais désigner un autre client',
      'Le nom de domaine détermine le site servi, pas un paramètre de requête',
      'Tests automatisés vérifiant l’isolation à chaque modification du code',
    ],
  },
  {
    title: 'Données de paiement',
    body: 'Aucun numéro de carte, aucun cryptogramme, aucune donnée bancaire sensible ne transite par nos serveurs ni n’est stockée chez nous. Les paiements sont traités par Stripe, sur leur infrastructure certifiée.',
    points: [
      'Redirection vers une page de paiement Stripe',
      'Nous conservons un identifiant de transaction, un montant et un statut',
      'La vérité d’un paiement vient du webhook signé, jamais du navigateur',
      'Vos justificatifs d’identité sont vérifiés par Stripe, nous ne les voyons pas',
    ],
  },
  {
    title: 'Accès et authentification',
    body: 'Les comptes sont protégés par une politique de mot de passe exigeante et une double authentification disponible. L’accès à notre back-office impose un second facteur, sans exception.',
    points: [
      'Mot de passe de 12 caractères minimum, mots de passe courants refusés',
      'Double authentification disponible pour tous, obligatoire pour notre équipe',
      'Limitation stricte des tentatives de connexion',
      'Rôles distincts au sein de votre organisation : propriétaire, éditeur, facturation, lecture',
    ],
  },
  {
    title: 'Contenu et injections',
    body: 'Le contenu de votre site est stocké sous forme structurée et validé à l’écriture comme à la lecture. Aucun chemin ne permet qu’un texte saisi devienne du code exécuté.',
    points: [
      'Aucun code arbitraire insérable depuis l’éditeur',
      'Contenus enrichis assainis par liste blanche stricte',
      'Politique de sécurité de contenu active sur toutes les pages',
      'Fichiers vérifiés par type déclaré, extension et signature binaire',
    ],
  },
  {
    title: 'Traçabilité',
    body: 'Les actions sensibles sont journalisées de manière immuable : ni modifiables, ni supprimables, quel que soit le niveau de privilège. Vous pouvez consulter le journal de votre organisation.',
    points: [
      'Journal d’audit en ajout seul, au niveau de la base de données',
      'Aucun secret ni mot de passe dans les journaux',
      'Toute intervention de notre équipe sur votre espace est tracée et motivée',
      'Journal consultable depuis votre espace',
    ],
  },
  {
    title: 'Assistance encadrée',
    body: 'Pour vous dépanner, un membre de notre équipe peut consulter votre espace. Cette consultation est volontaire, motivée, limitée dans le temps, signalée par un bandeau et entièrement tracée.',
    points: [
      'Motif obligatoire, enregistré avec l’intervention',
      'Durée limitée, fin immédiate possible',
      'Opérations financières interdites pendant l’assistance',
      'Vous pouvez consulter l’historique de ces interventions',
    ],
  },
];

export default function SecurityPage() {
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
            eyebrow="Sécurité"
            title="Ce que nous protégeons, et comment"
            description="La sécurité d’un site professionnel n’est pas une option à cocher. Voici les mesures réellement en place, décrites sans jargon et sans promesse invérifiable."
          />
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="wide">
          <div className="grid gap-3 lg:grid-cols-2">
            {PILLARS.map((pillar, index) => (
              <Reveal key={pillar.title} delay={index * 50}>
                <Panel level={2} padding="lg" className="h-full">
                  <h2 className="text-lg font-medium tracking-[-0.02em]">{pillar.title}</h2>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {pillar.body}
                  </p>
                  <ul className="mt-5 space-y-2 border-t border-[var(--border)] pt-5">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex gap-2.5 text-sm">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]"
                        >
                          <path
                            d="m3 8.5 3.5 3.5L13 5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="text-[var(--foreground-muted)]">{point}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <Alert tone="info" title="Signaler une vulnérabilité">
            <p className="leading-relaxed">
              Si vous pensez avoir trouvé une faille de sécurité, écrivez-nous avant toute
              divulgation publique. Nous accusons réception rapidement, nous vous tenons informé du
              traitement, et nous n’engageons aucune poursuite contre une recherche menée de bonne
              foi et sans atteinte aux données de nos clients.{' '}
              <Link href="/contact" className="underline underline-offset-4">
                Nous contacter
              </Link>
              .
            </p>
          </Alert>
        </Container>
      </Section>

      <Section spacing="compact" className="border-t border-[var(--border)]">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-medium tracking-[-0.03em]">
            Des questions plus techniques ?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
            Nous documentons publiquement notre infrastructure, nos sous-traitants et notre
            traitement des données personnelles.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink size="pill" href="/infrastructure" variant="secondary">
              Infrastructure
            </ButtonLink>
            <ButtonLink size="pill" href="/sous-traitants" variant="secondary">
              Sous-traitants
            </ButtonLink>
            <ButtonLink size="pill" href="/donnees-personnelles" variant="secondary">
              Données personnelles
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
