import type { Metadata } from 'next';
import {
  Alert,
  Badge,
  ButtonLink,
  Container,
  Panel,
  Reveal,
  Section,
  SectionHeading,
} from '@nemasus/ui';
import { BrowserFrame, SitePreview } from '~/components/marketing/product-visuals';

export const metadata: Metadata = {
  title: 'Réalisations',
  description:
    'Des exemples concrets de sites Nemasus : restaurant, salon, artisan. Ces démonstrations sont clairement ' +
    'identifiées comme telles : nous ne présentons jamais un exemple comme un vrai client.',
  alternates: { canonical: '/realisations' },
};

const SHOWCASES = [
  {
    variant: 'restaurant' as const,
    name: 'Restaurant Dupont',
    host: 'restaurant-dupont.example',
    features: ['Carte & menus', 'Réservations en ligne', 'Horaires', 'Galerie'],
    note: 'Carte gérée par le restaurateur, réservations validées depuis le téléphone, horaires modifiables en trente secondes.',
  },
  {
    variant: 'coiffeur' as const,
    name: 'Atelier Camille',
    host: 'atelier-camille.example',
    features: ['Prestations', 'Prise de rendez-vous', 'Équipe', 'Avis clients'],
    note: 'Prise de rendez-vous par prestation et par coiffeuse, avec la durée de chaque prestation.',
  },
  {
    variant: 'artisan' as const,
    name: 'Martin Plomberie',
    host: 'martin-plomberie.example',
    features: ['Prestations', 'Zones d’intervention', 'Galerie de chantiers', 'Demande de devis'],
    note: 'Formulaire de devis qualifiant la demande : nature de la panne, urgence, code postal.',
  },
];

export default function ShowcasePage() {
  return (
    <>
      <Section className="relative overflow-hidden">
        <Container size="wide">
          <SectionHeading
            as="h1"
            eyebrow="Réalisations"
            title="À quoi ressemble un site Nemasus"
            description="Chaque site est conçu et développé individuellement, pour une entreprise : sa structure, son design et ses fonctionnalités lui sont propres. Voici trois exemples de projets."
          />
          <Alert tone="warning" title="Ces exemples sont des démonstrations" className="mt-10">
            Les entreprises présentées ci-dessous sont fictives. Elles illustrent le type de projets
            que nous réalisons : ce ne sont pas des modèles à personnaliser. Nous n’afficherons de
            vrais clients qu’avec leur accord explicite, et ils seront identifiés comme tels.
          </Alert>
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="wide">
          <div className="space-y-16">
            {SHOWCASES.map((item, index) => (
              <Reveal key={item.variant} delay={index * 60}>
                <article className="grid gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-center">
                  <div className={index % 2 === 1 ? 'lg:order-2' : undefined}>
                    <BrowserFrame url={item.host}>
                      <SitePreview variant={item.variant} />
                    </BrowserFrame>
                  </div>
                  <div className={index % 2 === 1 ? 'lg:order-1' : undefined}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="warning" size="sm">
                        Démonstration
                      </Badge>
                    </div>
                    <h2 className="mt-4 font-serif text-[2rem] leading-tight">{item.name}</h2>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
                      {item.note}
                    </p>
                    <ul className="mt-5 flex flex-wrap gap-1.5">
                      {item.features.map((feature) => (
                        <li
                          key={feature}
                          className="rounded-md border border-[var(--border)] bg-[var(--background-inset)] px-2.5 py-1 text-xs text-[var(--foreground-muted)]"
                        >
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <Section spacing="compact" className="border-t border-[var(--border)]">
        <Container size="narrow">
          <Panel level={2} padding="xl" className="text-center">
            <h2 className="font-serif text-[2.4rem] leading-tight">
              Vous serez notre prochaine référence
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
              Nemasus est un produit jeune. Les premiers clients bénéficient d’une attention
              particulière — et, s’ils le souhaitent, d’une place sur cette page.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink variant="accent" href="/commander" size="pill-lg">
                Commander mon site
              </ButtonLink>
              <ButtonLink href="/contact" variant="secondary" size="pill-lg">
                Poser une question
              </ButtonLink>
            </div>
          </Panel>
        </Container>
      </Section>
    </>
  );
}
