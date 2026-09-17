import type { Metadata } from 'next';
import { ButtonLink, Container, Panel, Reveal, Section, SectionHeading } from '@stax/ui';
import { CreationTimeline } from '~/components/marketing/diagrams';

export const metadata: Metadata = {
  title: 'Projets sur mesure',
  description:
    'Application métier, intégrations, reprise de données, volumétries importantes : ' +
    'StaX étudie votre besoin et établit un devis détaillé, ligne par ligne.',
  alternates: { canonical: '/sur-mesure' },
};

const CASES = [
  {
    title: 'Intégration à vos outils',
    body: 'Logiciel de caisse, gestion commerciale, agenda partagé, outil de comptabilité : nous étudions la faisabilité de la connexion et son coût de maintien dans le temps.',
  },
  {
    title: 'Espace client avancé',
    body: 'Documents, historique de dossier, suivi de commande, facturation : un espace réservé à vos clients, avec les règles d’accès de votre activité.',
  },
  {
    title: 'Catalogue important',
    body: 'Plusieurs milliers de références, tarification par volume ou par client, disponibilités complexes : nous adaptons le modèle de données.',
  },
  {
    title: 'Plusieurs établissements',
    body: 'Une marque, plusieurs adresses : pages locales, horaires distincts, réservations par établissement, tableau de bord consolidé.',
  },
  {
    title: 'Reprise d’un site existant',
    body: 'Migration de contenus, conservation des adresses de pages et des redirections, pour ne pas perdre votre référencement acquis.',
  },
  {
    title: 'Contraintes réglementaires',
    body: 'Mentions obligatoires de votre secteur, accessibilité renforcée, conservation de données spécifiques, engagements de service.',
  },
];

const PROCESS = [
  {
    title: 'Vous décrivez votre besoin',
    description:
      'Un formulaire structuré nous permet de comprendre votre activité, vos objectifs, vos contraintes et votre budget indicatif. Comptez dix minutes.',
    detail: 'Sans engagement',
  },
  {
    title: 'Nous vous rappelons',
    description:
      'Un échange pour préciser ce qui compte vraiment, écarter ce qui n’est pas nécessaire et identifier les points techniques à vérifier.',
  },
  {
    title: 'Nous établissons un devis détaillé',
    description:
      'Chaque ligne est chiffrée séparément : vous voyez ce que coûte chaque fonctionnalité et vous pouvez en retirer. Le devis précise aussi la maintenance mensuelle associée.',
    detail: 'Valable 30 jours',
  },
  {
    title: 'Vous acceptez, le projet démarre',
    description:
      'L’acceptation du devis ouvre automatiquement votre projet et votre espace client. Vous suivez ensuite l’avancement comme pour toute commande StaX.',
  },
];

export default function CustomPage() {
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
            eyebrow="Sur mesure"
            title="Quand le cadre standard ne suffit pas"
            description="Nos trois offres couvrent la grande majorité des besoins. Quand ce n’est pas le cas, nous étudions votre projet et nous le chiffrons précisément, plutôt que de vous vendre une offre inadaptée."
            className="mx-auto"
          />
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/devis" size="lg">
              Demander un devis
            </ButtonLink>
            <ButtonLink href="/tarifs" variant="glass" size="lg">
              Comparer avec les offres standard
            </ButtonLink>
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <SectionHeading eyebrow="Exemples" title="Ce que couvre un projet sur mesure" />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CASES.map((item, index) => (
              <Reveal key={item.title} delay={index * 45}>
                <Panel level={1} padding="lg" className="h-full">
                  <h2 className="text-base font-medium">{item.title}</h2>
                  <p className="mt-2.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {item.body}
                  </p>
                </Panel>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <Section spacing="compact" className="border-y border-[var(--border)]">
        <Container size="wide">
          <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <SectionHeading
                eyebrow="Le déroulé"
                title="Comment se passe un devis"
                description="Pas de chiffrage au doigt mouillé, pas de forfait opaque. Vous savez ce que vous payez, et pourquoi."
              />
            </div>
            <Reveal>
              <CreationTimeline steps={PROCESS} />
            </Reveal>
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow">
          <Panel level={2} padding="xl" className="text-center">
            <h2 className="text-3xl font-medium tracking-[-0.03em]">Parlons de votre projet</h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
              Le formulaire prend une dizaine de minutes. Plus vos réponses sont précises, plus le
              devis sera juste — et plus vite nous pourrons vous répondre.
            </p>
            <ButtonLink href="/devis" size="lg" className="mt-8">
              Remplir le formulaire de devis
            </ButtonLink>
          </Panel>
        </Container>
      </Section>
    </>
  );
}
