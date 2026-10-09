import type { Metadata } from 'next';
import { ButtonLink, Container, Panel, Reveal, Section, SectionHeading } from '@nemasus/ui';
import { CreationTimeline } from '~/components/marketing/diagrams';
import { BrowserFrame, EditorMock, ProjectMock } from '~/components/marketing/product-visuals';
import Link from 'next/link';
import { ORDER_JOURNEY, PROCESS_STEPS } from '~/content/process';
import {
  breadcrumbJsonLd,
  howToJsonLd,
  JsonLd,
  organizationJsonLd,
  serviceJsonLd,
  webPageJsonLd,
} from '~/lib/structured-data';

const DESCRIPTION =
  'Commander un site Nemasus : commande en ligne, modalités de virement par e-mail, code ' +
  'd’accès à réception, puis conception, mise en ligne et livraison.';

export const metadata: Metadata = {
  title: 'Comment ça marche : commande, virement, code d’accès',
  description: DESCRIPTION,
  alternates: { canonical: '/comment-ca-marche' },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Nemasus',
    title: 'Comment ça marche — Nemasus',
    description: DESCRIPTION,
    url: '/comment-ca-marche',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Nemasus' }],
  },
};

const BEFORE_DELIVERY = [
  'Suivre l’avancement réel de votre projet, étape par étape',
  'Envoyer vos informations, vos textes, vos photos et vos fichiers',
  'Répondre à nos demandes de validation',
  'Échanger avec l’équipe par messages',
  'Retrouver votre commande et son règlement',
];

const AFTER_DELIVERY = [
  'Modifier les contenus que votre site prévoit : textes, images, informations, horaires',
  'Voir l’aperçu de votre vrai site avant de publier',
  'Publier : vos modifications sont enregistrées dans le code de votre site puis déployées',
  'Retrouver chaque version publiée, et la restaurer si besoin',
  'Recevoir messages, réservations et commandes, selon les fonctionnalités de votre site',
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
    body: 'Vous écrivez à l’équipe depuis votre espace, avant comme après la livraison : nous répondons, et vous êtes prévenu par e-mail.',
  },
];

const PAYMENT_FACTS = [
  {
    title: 'Pas de grille tarifaire',
    body: 'Chaque site est conçu sur mesure. Après votre commande, nous étudions votre projet et vous indiquons par e-mail le montant convenu et ce qu’il comprend.',
  },
  {
    title: 'Paiement par virement bancaire',
    body: 'Les modalités précisent le montant, nos coordonnées bancaires et la référence à rappeler dans le libellé. Aucune carte bancaire n’est demandée sur Nemasus.',
  },
  {
    title: 'Un code d’accès personnel',
    body: 'Dès réception du virement, vous recevez un code de 12 caractères. Il ne sert qu’une fois, expire, ne fonctionne qu’avec votre adresse e-mail et est vérifié par nos serveurs.',
  },
  {
    title: 'Votre espace, et lui seul',
    body: 'Le code ouvre votre espace : vous choisissez votre mot de passe, puis vous n’accédez qu’aux données de votre entreprise. L’isolation est imposée par la base de données.',
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <JsonLd
        graph={[
          organizationJsonLd(),
          serviceJsonLd(),
          webPageJsonLd({
            path: '/comment-ca-marche',
            name: 'Comment ça marche',
            description: DESCRIPTION,
          }),
          howToJsonLd(
            'Commander un site web professionnel avec Nemasus',
            ORDER_JOURNEY,
            '/comment-ca-marche',
          ),
          breadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: 'Comment ça marche', path: '/comment-ca-marche' },
          ]),
        ]}
      />
      <Section className="relative overflow-hidden">
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

      <Section spacing="compact" className="pt-0" aria-labelledby="commander-titre">
        <Container size="wide">
          <h2
            id="commander-titre"
            className="font-serif text-[clamp(1.85rem,3vw,2.4rem)] leading-tight font-normal"
          >
            Commander, régler, accéder
          </h2>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ORDER_JOURNEY.map((step, index) => (
              <li key={step.title} id={`etape-${index + 1}`}>
                <Panel level={1} padding="lg" className="h-full">
                  <p className="kicker">Étape {index + 1}</p>
                  <h3 className="mt-2 text-base font-medium">{step.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                    {step.description}
                  </p>
                </Panel>
              </li>
            ))}
          </ol>

          <div className="mt-12 grid gap-x-12 gap-y-8 md:grid-cols-2">
            {PAYMENT_FACTS.map((fact) => (
              <div key={fact.title} className="border-t border-[var(--border)] pt-5">
                <h3 className="text-base font-medium">{fact.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {fact.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-[var(--foreground-muted)]">
            Vous avez reçu votre code ?{' '}
            <Link href="/acces" className="underline underline-offset-4">
              Accédez à votre espace
            </Link>
            . Une question avant de commander ?{' '}
            <Link href="/faq#commande" className="underline underline-offset-4">
              Lisez les réponses
            </Link>
            .
          </p>
        </Container>
      </Section>

      <Section spacing="compact" aria-labelledby="projet-titre">
        <Container size="wide">
          <h2
            id="projet-titre"
            className="mb-10 font-serif text-[clamp(1.85rem,3vw,2.4rem)] leading-tight font-normal"
          >
            Ensuite, la création de votre site
          </h2>
          <div className="grid gap-16 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            <Reveal>
              <CreationTimeline steps={PROCESS_STEPS} />
            </Reveal>
            <div className="lg:sticky lg:top-28">
              <BrowserFrame
                url="nemasus.com/app"
                label="Illustration : le suivi du projet dans l’espace client, étape par étape"
              >
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
            eyebrow="Votre espace Nemasus"
            title="Avant la livraison, vous suivez. Après, vous gérez."
            description="L’éditeur n’existe pas encore tant que votre site est en construction : il s’ouvre le jour de la livraison, sur un site déjà en ligne."
          />
          <div className="mt-10 grid gap-3 lg:grid-cols-2">
            <Panel level={1} padding="lg" className="h-full">
              <p className="kicker">Pendant la construction</p>
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
              <p className="text-[12.5px] tracking-[0.04em] text-[var(--accent-text)]">
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
              <h2 className="font-serif text-[1.85rem] leading-tight font-normal">
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
                nous en chargeons, après en avoir convenu avec vous.
              </p>
            </div>
            <Reveal delay={80}>
              <div className="stage">
                <BrowserFrame
                  url="nemasus.com/app/editeur"
                  label="Illustration : l’éditeur Nemasus, ouvert à la livraison du site"
                >
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
          <h2 className="font-serif text-[2.4rem] leading-tight font-normal">Commençons</h2>
          <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
            Commander ne vous engage à aucun paiement immédiat : vous recevez d’abord les modalités,
            et votre espace s’ouvre avec votre code dès réception du virement.
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
