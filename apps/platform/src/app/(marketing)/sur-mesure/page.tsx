import type { Metadata } from 'next';
import { ButtonLink, Container, Panel, Reveal, Section, SectionHeading } from '@nemasus/ui';
import { CreationTimeline } from '~/components/marketing/diagrams';

export const metadata: Metadata = {
  title: 'Projets sur mesure',
  description:
    'Intégrations, espace client avancé, reprise de données : Nemasus étudie votre besoin ' +
    'et vous adresse une proposition détaillée avant toute commande.',
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
    body: 'Plusieurs milliers de références, conditions par volume ou par client, disponibilités complexes : nous concevons la structure de données adaptée.',
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
    body: 'Mentions obligatoires de votre activité, accessibilité renforcée, conservation de données spécifiques, engagements de service.',
  },
];

const PROCESS = [
  {
    title: 'Vous décrivez votre besoin',
    description:
      'Un formulaire structuré nous permet de comprendre votre activité, vos objectifs, vos contraintes et votre budget indicatif.',
    detail: 'Sans engagement',
  },
  {
    title: 'Nous vous rappelons',
    description:
      'Un échange pour préciser ce qui compte vraiment, écarter ce qui n’est pas nécessaire et identifier les points techniques à vérifier.',
  },
  {
    title: 'Nous vous adressons une proposition détaillée',
    description:
      'Ce que nous réaliserons, comment, dans quel délai, et pour quel montant : vous savez exactement à quoi vous engager, et vous pouvez retirer ce qui n’est pas indispensable.',
  },
  {
    title: 'Vous réglez par virement, le projet démarre',
    description:
      'Une fois la proposition acceptée, vous recevez les modalités de paiement par virement. À réception, votre code d’accès personnel ouvre votre espace : vous suivez l’avancement comme pour toute commande Nemasus.',
  },
];

export default function CustomPage() {
  return (
    <>
      <Section className="relative overflow-hidden">
        <Container size="wide">
          <SectionHeading
            as="h1"
            align="center"
            eyebrow="Sur mesure"
            title="Quand le cadre standard ne suffit pas"
            description="La plupart des sites se commandent en quelques minutes. Quand votre projet demande une étude — intégrations, données, contraintes particulières —, nous l’examinons avec vous avant toute commande."
            className="mx-auto"
          />
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/devis" size="pill-lg">
              Décrire mon projet
            </ButtonLink>
            <ButtonLink href="/commander" variant="glass" size="pill-lg">
              Commander directement
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
                title="Comment se passe l’étude"
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
            <h2 className="font-serif text-[2.4rem] leading-tight font-normal">
              Parlons de votre projet
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
              Plus vos réponses sont précises, plus notre proposition sera juste — et plus vite nous
              pourrons vous répondre.
            </p>
            <ButtonLink href="/devis" size="pill-lg" className="mt-8">
              Décrire mon projet
            </ButtonLink>
          </Panel>
        </Container>
      </Section>
    </>
  );
}
