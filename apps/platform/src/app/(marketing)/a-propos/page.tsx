import type { Metadata } from 'next';
import { legalValue } from '@stax/config';
import { ButtonLink, Container, Panel, Section, SectionHeading } from '@stax/ui';

export const metadata: Metadata = {
  title: 'À propos',
  description:
    'Pourquoi StaX existe : rendre accessible aux petites entreprises un site professionnel ' +
    'bien construit, bien hébergé et réellement maintenu.',
  alternates: { canonical: '/a-propos' },
};

const PRINCIPLES = [
  {
    title: 'Dire ce que le produit fait, et ce qu’il ne fait pas',
    body: 'Chaque page de fonctionnalité indique ses limites. Un client qui découvre une limite après avoir payé est un client déçu, et une relation abîmée.',
  },
  {
    title: 'Ne jamais inventer de chiffre',
    body: 'Pas de « 10 000 clients », pas de « +82 % de ventes », pas de « 99,99 % de disponibilité » tant que ce n’est pas mesuré et vérifiable. Une page vide vaut mieux qu’un chiffre faux.',
  },
  {
    title: 'L’argent du client reste au client',
    body: 'Les encaissements réalisés sur les sites de nos clients passent par leur propre compte. Nous ne prenons aucune commission dessus, et nous ne sommes pas dans ce circuit financier.',
  },
  {
    title: 'La sécurité n’est pas une option',
    body: 'L’isolation entre clients est imposée par la base de données, pas par un filtre dans l’interface. Elle est testée automatiquement à chaque modification du code.',
  },
  {
    title: 'Le client garde la main',
    body: 'Vous modifiez vos contenus sans nous. Vous exportez vos données quand vous voulez. Vous résiliez sans négociation. Un service qu’on ne peut pas quitter n’est pas un service.',
  },
  {
    title: 'Pas de jargon inutile',
    body: 'Votre espace parle de pages, de contenu et de publication. Les mots « déploiement », « schéma » ou « composant » restent de notre côté.',
  },
];

export default function AboutPage() {
  const company = legalValue('LEGAL_COMPANY_NAME');

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
            eyebrow="À propos"
            title="Pourquoi StaX existe"
            description="Beaucoup de petites entreprises n’ont pas de site, ou en ont un qui ne leur sert plus : mal référencé, impossible à modifier, abandonné par son prestataire. Souvent parce qu’un site correct coûte cher, et qu’un site bon marché finit par coûter du temps."
          />
          <div className="measure mt-10 space-y-5 text-base leading-relaxed text-[var(--foreground-muted)]">
            <p>
              StaX prend le problème à l’envers : plutôt que de vendre un outil et de laisser le
              professionnel se débrouiller, nous construisons le site, nous l’hébergeons, nous le
              maintenons — et nous lui donnons les clés de son contenu.
            </p>
            <p>
              L’infrastructure est mutualisée, donc le coût de l’hébergement et de la maintenance
              est partagé. Le travail de conception, lui, reste individuel : un restaurant n’a pas
              les mêmes besoins qu’un plombier, et les traiter pareil donne de mauvais sites.
            </p>
            <p>
              Concrètement, un site StaX est construit sur un moteur multi-tenant : une seule
              infrastructure sert tous les sites, chacun strictement isolé des autres. C’est ce qui
              permet un prix accessible sans sacrifier la qualité technique.
            </p>
          </div>
        </Container>
      </Section>

      <Section spacing="compact" className="border-y border-[var(--border)]">
        <Container size="wide">
          <SectionHeading
            eyebrow="Nos principes"
            title="Ce à quoi nous nous tenons"
            description="Ces principes ne sont pas décoratifs : ils se traduisent par des choix techniques et commerciaux concrets, visibles dans le produit."
          />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map((principle) => (
              <Panel key={principle.title} level={1} padding="lg" className="h-full">
                <h2 className="text-base font-medium">{principle.title}</h2>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {principle.body}
                </p>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow">
          <Panel level={1} padding="lg">
            <h2 className="text-base font-medium">L’éditeur</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
              StaX est édité par {company}. Les informations légales complètes — forme juridique,
              siège, immatriculation, directeur de la publication et hébergeur — figurent dans les{' '}
              <a href="/mentions-legales" className="underline underline-offset-4">
                mentions légales
              </a>
              .
            </p>
          </Panel>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-medium tracking-[-0.03em]">Une question ?</h2>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/contact" size="pill-lg">
              Nous écrire
            </ButtonLink>
            <ButtonLink href="/commander" variant="secondary" size="pill-lg">
              Commander mon site
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
