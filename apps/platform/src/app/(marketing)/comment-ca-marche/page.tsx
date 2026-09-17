import type { Metadata } from 'next';
import { ButtonLink, Container, Panel, Reveal, Section, SectionHeading } from '@stax/ui';
import { CreationTimeline } from '~/components/marketing/diagrams';
import { BrowserFrame, DashboardMock } from '~/components/marketing/product-visuals';

export const metadata: Metadata = {
  title: 'Comment ça marche',
  description:
    'De la commande à la mise en ligne : chaque étape du parcours StaX, ce que nous faisons, ' +
    'ce que nous vous demandons et ce que vous validez.',
  alternates: { canonical: '/comment-ca-marche' },
};

const STEPS = [
  {
    title: 'Vous choisissez votre offre et votre métier',
    description:
      'Deux questions : votre secteur d’activité, puis votre métier précis. La sélection détermine les pages proposées et les fonctionnalités activées. Vous pouvez comparer les offres avant de décider.',
    detail: 'Environ 2 minutes',
  },
  {
    title: 'Vous payez et votre projet s’ouvre',
    description:
      'Le paiement se fait sur une page Stripe sécurisée. Aucun numéro de carte ne transite par nos serveurs. Dès la confirmation, votre espace client s’ouvre avec le suivi de votre projet.',
    detail: 'Paiement initial + maintenance mensuelle',
  },
  {
    title: 'Vous complétez le questionnaire',
    description:
      'Vos coordonnées, votre activité, ce qui vous distingue, vos horaires, vos prestations. Les questions sont adaptées à votre métier. Vous pouvez enregistrer et revenir plus tard : rien n’est perdu.',
    detail: 'Sauvegardé automatiquement',
  },
  {
    title: 'Vous envoyez vos éléments',
    description:
      'Logo, photos, menu, documents : vous les déposez dans votre espace. Si vous n’en avez pas, nous vous guidons sur ce qui est réellement utile et comment l’obtenir simplement.',
    detail: 'Stockage privé',
  },
  {
    title: 'Notre équipe conçoit votre site',
    description:
      'Structure, design, rédaction, configuration des modules métier, référencement technique. Vous suivez l’avancement dans votre espace, étape par étape — chaque étape correspond à un état réel, pas à une barre de progression décorative.',
  },
  {
    title: 'Vous relisez en aperçu privé',
    description:
      'Le site vous est présenté sur une adresse privée, non indexée. Vous relisez tout : textes, photos, horaires, coordonnées. Vous indiquez vos corrections directement depuis votre espace.',
    detail: 'Autant d’allers-retours que nécessaire',
  },
  {
    title: 'Mise en ligne',
    description:
      'Après votre validation, nous publions le site, connectons votre nom de domaine et activons le certificat HTTPS. La garantie commerciale démarre à cet instant précis.',
  },
  {
    title: 'Vous prenez la main',
    description:
      'Vous modifiez vos contenus quand vous voulez, recevez vos messages et vos réservations, consultez vos statistiques. Nous assurons l’hébergement, la sécurité, les sauvegardes et le support.',
  },
];

const COMMITMENTS = [
  {
    title: 'Vous validez avant la mise en ligne',
    body: 'Rien n’est publié sans votre accord explicite. Vous voyez le site complet avant vos clients.',
  },
  {
    title: 'Vous gardez la main ensuite',
    body: 'Chaque modification de contenu est à votre portée. Vous ne dépendez de personne pour changer un horaire.',
  },
  {
    title: 'Vos données vous appartiennent',
    body: 'Contenus, messages, contacts, commandes : exportables à tout moment, dans un format ouvert.',
  },
  {
    title: 'Nous restons joignables',
    body: 'Le support est inclus dans la maintenance. Vous écrivez depuis votre espace, nous répondons.',
  },
];

export default function HowItWorksPage() {
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
            eyebrow="Le parcours"
            title="De la commande à la mise en ligne"
            description="Vous n’avez rien à construire, rien à installer et rien à configurer techniquement. Voici exactement comment cela se passe."
            className="mx-auto"
          />
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="wide">
          <div className="grid gap-16 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <Reveal>
              <CreationTimeline steps={STEPS} />
            </Reveal>
            <div className="lg:sticky lg:top-28">
              <BrowserFrame url="stax.fr/app/projet">
                <DashboardMock />
              </BrowserFrame>
              <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Votre espace vous montre où en est votre projet, ce que nous attendons de vous et ce
                que nous faisons. Chaque étape est adossée à un état réel du dossier.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section spacing="compact" className="border-y border-[var(--border)]">
        <Container size="wide">
          <SectionHeading eyebrow="Nos engagements" title="Ce sur quoi vous pouvez compter" />
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {COMMITMENTS.map((item, index) => (
              <Reveal key={item.title} delay={index * 60}>
                <Panel level={1} padding="lg" className="h-full">
                  <h3 className="text-base font-medium">{item.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {item.body}
                  </p>
                </Panel>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-medium tracking-[-0.03em]">Commençons</h2>
          <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
            La première étape prend deux minutes, et vous pouvez vous arrêter à tout moment avant le
            paiement.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/commander" size="lg">
              Commander mon site
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="lg">
              Poser une question
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
