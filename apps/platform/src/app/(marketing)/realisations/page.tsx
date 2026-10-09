import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, ButtonLink, Container, Panel, Reveal, Section, SectionHeading } from '@nemasus/ui';
import { SITE_EXAMPLE, SiteExampleFrame } from '~/components/marketing/site-example';
import { supportContact } from '~/lib/contact';

export const metadata: Metadata = {
  title: 'Réalisations',
  description:
    'Un exemple de site conçu par Nemasus : la page d’accueil d’Atelier Voltaire, architecture ' +
    'intérieure à Paris, à faire défiler. Maquette de présentation, identifiée comme telle.',
  alternates: { canonical: '/realisations' },
};

/**
 * Ce que la page d'accueil fait pour son entreprise : les choix de conception
 * qui transforment un visiteur en demande de contact. C'est aussi ce que nous
 * faisons pour chaque client.
 */
const DESIGN_CHOICES = [
  {
    title: 'Une promesse lisible en trois secondes',
    body: 'Le métier, la ville et ce qui distingue l’atelier apparaissent avant tout défilement, sur une photo qui montre le résultat plutôt qu’un discours.',
  },
  {
    title: 'La preuve avant les mots',
    body: 'Les projets récents arrivent aussitôt : le visiteur juge sur pièce, guidé par des légendes courtes (le lieu, le type de projet).',
  },
  {
    title: 'Des engagements qui rassurent',
    body: 'Écoute, créativité, excellence : trois engagements formulés du point de vue du client, jamais du point de vue de la technique.',
  },
  {
    title: 'Un seul geste demandé',
    body: '« Parlons de votre projet », « Rencontrer l’atelier », « Prendre contact » : chaque section mène à la même invitation, sans disperser l’attention.',
  },
  {
    title: 'Pensée d’abord pour le téléphone',
    body: 'Menu compact, images recadrées, textes aérés : la page se lit aussi bien d’une main, dans le métro, que sur un grand écran.',
  },
] as const;

/** Ce que comprend chaque site livré : uniquement ce que la plateforme fait réellement. */
const INCLUDED = [
  'Design conçu pour votre activité',
  'Mise en ligne sur votre domaine, en HTTPS',
  'Lecture soignée sur mobile',
  'Référencement technique et données structurées',
  'Éditeur pour modifier textes et photos',
  'Chaque version publiée reste restaurable',
  'Disponibilité de votre site surveillée',
  'Vos contenus exportables à tout moment',
];

export default function ShowcasePage() {
  const contact = supportContact();
  return (
    <>
      <Section className="relative overflow-hidden">
        <Container size="wide">
          <SectionHeading
            as="h1"
            eyebrow="Réalisations"
            title="À quoi ressemble un site Nemasus"
            description={`Un exemple vaut mieux qu’une longue description. Voici la page d’accueil d’${SITE_EXAMPLE.name}, architecture intérieure à Paris : faites-la défiler, ouvrez son menu, regardez-la sur votre téléphone.`}
          />
          <p className="mt-6 flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
            <Badge tone="warning" size="sm">
              Maquette de présentation
            </Badge>
            <span>
              {SITE_EXAMPLE.name} est une maquette réalisée par notre studio pour montrer notre
              niveau de finition. Nous ne présentons de vrais clients qu’avec leur accord.
            </span>
          </p>
          <SiteExampleFrame className="mt-10" size="tall" eager />
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="wide">
          <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            <div>
              <p className="eyebrow-index mb-6">Sous le capot</p>
              <h2 className="display-section max-w-[16ch]">
                Ce qui rend cette page <em>efficace.</em>
              </h2>
              <p className="lead-text mt-6 max-w-[44ch]">
                Un beau site ne suffit pas : il doit donner envie d’agir. Chaque choix de cette page
                sert un objectif, faire d’un visiteur une demande de contact. Nous faisons le même
                travail pour votre activité.
              </p>
            </div>
            <ol className="flex flex-col">
              {DESIGN_CHOICES.map((choice, index) => (
                <Reveal key={choice.title} as="li" delay={index * 60}>
                  <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-4 border-t border-[var(--border)] py-6">
                    <span className="pt-1 text-[13px] text-[var(--ink-3)] tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h3 className="font-serif text-[clamp(1.3rem,1.9vw,1.6rem)] leading-snug text-[var(--ink)]">
                        {choice.title}
                      </h3>
                      <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-[var(--ink-2)]">
                        {choice.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <p className="eyebrow-index mb-6">Inclus</p>
          <h2 className="display-section max-w-[24ch]">
            Ce que vous recevez <em>avec votre site.</em>
          </h2>
          <ul className="mt-10 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            {INCLUDED.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 border-t border-[var(--border)] pt-4 text-[15px] leading-snug text-[var(--ink)]"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="mt-0.5 size-4 shrink-0 text-[var(--success)]"
                >
                  <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.2 4.55-4 4.25-2.4-2.3 1.04-1.08 1.33 1.28 2.96-3.15 1.07 1Z" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section spacing="compact" className="border-t border-[var(--border)]">
        <Container size="narrow">
          <Panel level={2} padding="xl" className="text-center">
            <h2 className="font-serif text-[2.4rem] leading-tight">
              Votre site, avec le même niveau d’exigence
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
              Il ne ressemblera pas à celui-ci : il sera pensé pour votre activité et pour vos
              clients. Décrivez votre projet en quelques minutes, nous vous répondons par écrit avec
              le montant et le délai.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink variant="accent" href="/commander" size="pill-lg">
                Commander mon site
              </ButtonLink>
              {contact.phone && contact.phoneHref ? (
                <ButtonLink href={contact.phoneHref} variant="secondary" size="pill-lg">
                  Appeler le {contact.phone}
                </ButtonLink>
              ) : (
                <ButtonLink href="/contact" variant="secondary" size="pill-lg">
                  Poser une question
                </ButtonLink>
              )}
            </div>
            <p className="mt-5 text-[13px] text-[var(--muted)]">
              Sans engagement · aucun paiement à la commande ·{' '}
              <Link href="/cgv#remboursement" className="underline underline-offset-4">
                remboursé tant que rien n’a commencé
              </Link>
            </p>
          </Panel>
        </Container>
      </Section>
    </>
  );
}
