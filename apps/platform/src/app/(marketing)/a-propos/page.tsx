import type { Metadata } from 'next';
import { legalValue } from '@nemasus/config';
import { ButtonLink, Container, Panel, Section, SectionHeading } from '@nemasus/ui';

export const metadata: Metadata = {
  title: 'À propos',
  description:
    'Qui est Nemasus et pourquoi le studio existe : offrir aux entreprises un site professionnel ' +
    'conçu pour elles, mis en ligne pour de bon, et qu’elles gèrent ensuite elles-mêmes.',
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
    body: 'Vous modifiez vos contenus sans nous. Vous exportez vos données quand vous voulez. Un service qu’on ne peut pas quitter n’est pas un service.',
  },
  {
    title: 'Un parcours simple et transparent',
    body: 'Pas de grille tarifaire à décrypter : vous commandez, nous convenons du montant avec vous, vous réglez par virement et un code personnel ouvre votre espace. Votre espace parle de pages et de publication, pas de jargon.',
  },
];

export default function AboutPage() {
  const company = legalValue('LEGAL_COMPANY_NAME');

  return (
    <>
      <Section className="relative overflow-hidden">
        <Container size="wide">
          <SectionHeading
            as="h1"
            eyebrow="À propos"
            title="Pourquoi Nemasus existe"
            description="Beaucoup d’entreprises n’ont pas de site, ou en ont un qui ne leur sert plus : mal référencé, impossible à modifier, abandonné par son prestataire. Nemasus est né pour que chacune ait un site à sa hauteur — et puisse le faire vivre elle-même."
          />
          <div className="measure mt-10 space-y-5 text-base leading-relaxed text-[var(--foreground-muted)]">
            <p>
              Nemasus est un studio français de conception et de développement de sites web. Plutôt
              que de vendre un outil et de laisser le professionnel se débrouiller, nous
              construisons le site, nous le mettons en ligne — et nous lui donnons les clés de son
              contenu.
            </p>
            <p>
              Le travail de conception est individuel : un restaurant n’a pas les mêmes besoins
              qu’un plombier, et les traiter pareil donne de mauvais sites. C’est pourquoi il n’y a
              pas de grille tarifaire : chaque projet est étudié, puis le montant est convenu avec
              le client, qui le règle par virement.
            </p>
            <p>
              Concrètement, chaque site Nemasus est un projet indépendant : son propre code, son
              propre dépôt GitHub, son propre déploiement sur le réseau de Cloudflare. L’espace
              client, lui, est commun, et chaque entreprise y est strictement isolée des autres.
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
              Nemasus est édité par {company}. Les informations légales complètes — forme juridique,
              siège, immatriculation, direction de la publication et hébergeur — figurent dans les{' '}
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
          <h2 className="font-serif text-[2.4rem] leading-tight font-normal">Une question ?</h2>
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
