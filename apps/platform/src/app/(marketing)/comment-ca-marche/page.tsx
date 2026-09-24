import type { Metadata } from 'next';
import { ButtonLink, Container, Panel, Reveal, Section, SectionHeading } from '@stax/ui';
import { CreationTimeline } from '~/components/marketing/diagrams';
import { BrowserFrame, EditorMock, ProjectMock } from '~/components/marketing/product-visuals';
import { PROCESS_STEPS } from '~/content/process';

export const metadata: Metadata = {
  title: 'Comment ça marche',
  description:
    'Nous créons votre site, vous le gérez ensuite. Les six étapes d’un projet StaX : votre ' +
    'projet, la conception, le développement, la mise en ligne, la livraison, puis votre autonomie.',
  alternates: { canonical: '/comment-ca-marche' },
};

const BEFORE_DELIVERY = [
  'Suivre l’avancement réel de votre projet, étape par étape',
  'Envoyer vos informations, vos textes, vos photos et vos fichiers',
  'Répondre à nos demandes de validation',
  'Échanger avec l’équipe par messages',
  'Retrouver vos factures',
];

const AFTER_DELIVERY = [
  'Modifier les contenus que votre site prévoit : textes, images, informations, horaires',
  'Voir l’aperçu de votre vrai site avant de publier',
  'Publier : vos modifications sont enregistrées dans le code de votre site puis déployées',
  'Retrouver chaque version publiée, et la restaurer si besoin',
  'Recevoir messages, réservations et commandes, selon votre offre',
];

const OUR_SIDE = [
  'La structure et la mise en page de votre site',
  'Le design et ses règles : typographies, couleurs, affichage mobile',
  'Le code, la sécurité et les intégrations',
];

const COMMITMENTS = [
  {
    title: 'Vous validez les étapes clés',
    body: 'Nous vous soumettons les choix importants pendant le projet ; vous validez ou demandez des corrections depuis votre espace.',
  },
  {
    title: 'Vous gardez la main ensuite',
    body: 'Après la livraison, vous modifiez les contenus prévus par votre site sans dépendre de personne pour changer un horaire.',
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
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="spotlight absolute inset-0" />
          <div className="grid-bg grid-bg-fade absolute inset-0" />
        </div>
        <Container size="wide">
          <SectionHeading
            as="h1"
            align="center"
            eyebrow="Comment ça marche"
            title="Nous créons votre site. Vous le gérez ensuite."
            description="Vous n’avez rien à construire, rien à installer et rien à configurer. Chaque site est un projet individuel, conçu et développé par notre équipe. Voici exactement comment cela se passe."
            className="mx-auto"
          />
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="wide">
          <div className="grid gap-16 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <Reveal>
              <CreationTimeline steps={PROCESS_STEPS} />
            </Reveal>
            <div className="lg:sticky lg:top-28">
              <BrowserFrame url="stax.fr/app">
                <ProjectMock />
              </BrowserFrame>
              <p className="mt-4 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Pendant la construction, votre espace vous montre où en est votre projet, ce que
                nous attendons de vous et ce que nous faisons. Chaque étape correspond à un état
                réel du dossier, pas à une barre de progression décorative.
              </p>
            </div>
          </div>
        </Container>
      </Section>

      <Section spacing="compact" className="border-y border-[var(--border)]">
        <Container size="wide">
          <SectionHeading
            eyebrow="Votre espace StaX"
            title="Avant la livraison, vous suivez. Après, vous gérez."
            description="L’éditeur n’existe pas encore tant que votre site est en construction : il s’ouvre le jour de la livraison, sur un site déjà en ligne."
          />
          <div className="mt-10 grid gap-3 lg:grid-cols-2">
            <Panel level={1} padding="lg" className="h-full">
              <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
                Pendant la construction
              </p>
              <ul className="mt-4 space-y-2.5">
                {BEFORE_DELIVERY.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-[var(--muted-strong)]"
                    />
                    <span className="leading-relaxed text-[var(--foreground-muted)]">{item}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel level={1} padding="lg" className="h-full">
              <p className="text-2xs font-medium tracking-[0.12em] text-[var(--accent-text)] uppercase">
                Après la livraison
              </p>
              <ul className="mt-4 space-y-2.5">
                {AFTER_DELIVERY.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-[var(--accent-text)]"
                    />
                    <span className="leading-relaxed text-[var(--foreground-muted)]">{item}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="mt-12 grid gap-12 lg:grid-cols-[0.9fr_1.4fr] lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                Ce qui reste entre nos mains
              </h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                Votre site est développé professionnellement. Vous modifiez son contenu et les
                éléments prévus pour l’être ; vous ne pouvez pas, par inadvertance, casser :
              </p>
              <ul className="mt-5 space-y-2.5">
                {OUR_SIDE.map((item) => (
                  <li key={item} className="flex gap-2.5 text-sm">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1 shrink-0 rounded-full bg-[var(--accent-text)]"
                    />
                    <span className="leading-relaxed text-[var(--foreground-muted)]">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Une nouvelle page, une nouvelle fonctionnalité ou une refonte ? Écrivez-nous : nous
                nous en chargeons, sur devis lorsque le changement dépasse la maintenance.
              </p>
            </div>
            <Reveal delay={80}>
              <div className="stage">
                <BrowserFrame url="stax.fr/app/editeur">
                  <EditorMock />
                </BrowserFrame>
              </div>
            </Reveal>
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
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

      <Section spacing="compact" className="border-t border-[var(--border)]">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-medium tracking-[-0.03em]">Commençons</h2>
          <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
            Choisissez votre offre : vous pouvez vous arrêter à tout moment avant le paiement. La
            maintenance, elle, ne commencera qu’à la livraison de votre site.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink variant="accent" href="/commander" size="pill-lg">
              Commander mon site
            </ButtonLink>
            <ButtonLink href="/contact" variant="secondary" size="pill-lg">
              Poser une question
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
