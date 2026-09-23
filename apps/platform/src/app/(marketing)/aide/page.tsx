import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink, Container, Panel, Section, SectionHeading } from '@stax/ui';

export const metadata: Metadata = {
  title: 'Centre d’aide',
  description:
    'Guides pratiques pour utiliser votre espace StaX : modifier votre site, gérer vos ' +
    'messages, connecter un domaine, encaisser des paiements.',
  alternates: { canonical: '/aide' },
};

const TOPICS = [
  {
    title: 'Premiers pas',
    description: 'Activer votre espace, comprendre le tableau de bord, inviter un collaborateur.',
    articles: [
      'Activer mon espace avec le code reçu',
      'Comprendre mon tableau de bord',
      'Inviter un collaborateur et choisir son rôle',
      'Activer la double authentification',
    ],
  },
  {
    title: 'Modifier mon site',
    description: 'Textes, photos, sections, pages, apparence, publication.',
    articles: [
      'Modifier un texte ou une photo',
      'Ajouter, masquer ou réorganiser une section',
      'Créer une nouvelle page',
      'Publier mes modifications',
      'Revenir à une version antérieure',
    ],
  },
  {
    title: 'Messages et clients',
    description: 'Boîte de réception, contacts, réponses, indésirables.',
    articles: [
      'Consulter et traiter mes messages',
      'Récupérer un message classé en indésirable',
      'Exporter mes contacts',
      'Choisir qui reçoit les notifications par e-mail',
    ],
  },
  {
    title: 'Nom de domaine',
    description: 'Connecter votre domaine, vérifier la configuration, HTTPS.',
    articles: [
      'Connecter un domaine que je possède déjà',
      'Comprendre les enregistrements DNS à ajouter',
      'Pourquoi mon domaine n’est-il pas encore actif ?',
      'Passer mon site sur une nouvelle adresse',
    ],
  },
  {
    title: 'Réservations et paiements',
    description: 'Créneaux, capacités, acomptes, encaissements.',
    articles: [
      'Paramétrer mes créneaux de réservation',
      'Déclarer une fermeture exceptionnelle',
      'Activer les paiements en ligne',
      'Suivre mes encaissements',
    ],
  },
  {
    title: 'Facturation',
    description: 'Factures, moyen de paiement, maintenance, résiliation.',
    articles: [
      'Télécharger mes factures',
      'Changer de moyen de paiement',
      'Comprendre ma maintenance annuelle',
      'Résilier ma maintenance',
    ],
  },
];

export default function HelpPage() {
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
            eyebrow="Centre d’aide"
            title="Comment pouvons-nous vous aider ?"
            description="Les guides détaillés arrivent au fil des questions réelles de nos clients. En attendant, le support est inclus dans votre maintenance : écrivez-nous depuis votre espace, nous répondons."
          />
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="wide">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map((topic) => (
              <Panel key={topic.title} level={1} padding="lg" className="h-full">
                <h2 className="text-base font-medium">{topic.title}</h2>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">{topic.description}</p>
                <ul className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-4">
                  {topic.articles.map((article) => (
                    <li key={article} className="text-sm text-[var(--muted)]">
                      {article}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-[var(--muted)]">
            Ces sujets listent les guides en cours de rédaction. Nous les publions au fur et à
            mesure plutôt que d’annoncer une documentation qui n’existe pas encore.
          </p>
        </Container>
      </Section>

      <Section spacing="compact" className="border-t border-[var(--border)]">
        <Container size="narrow">
          <Panel level={2} padding="xl" className="text-center">
            <h2 className="text-3xl font-medium tracking-[-0.03em]">Vous êtes déjà client ?</h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
              Le support est inclus dans votre maintenance. Écrivez-nous depuis votre espace : nous
              avons le contexte de votre site sous les yeux, la réponse est plus rapide.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/app/support" size="pill-lg">
                Contacter le support
              </ButtonLink>
              <ButtonLink href="/faq" variant="secondary" size="pill-lg">
                Questions fréquentes
              </ButtonLink>
            </div>
            <p className="mt-6 text-xs text-[var(--muted)]">
              Pas encore client ?{' '}
              <Link href="/contact" className="underline underline-offset-4">
                Écrivez-nous ici
              </Link>
              .
            </p>
          </Panel>
        </Container>
      </Section>
    </>
  );
}
