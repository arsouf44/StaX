import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Breadcrumb,
  ButtonLink,
  Container,
  Panel,
  Reveal,
  Section,
  SectionHeading,
} from '@stax/ui';
import { getSector, listSectors, listBusinessesBySector, MODULES } from '@stax/business';

export function generateStaticParams() {
  return listSectors().map((sector) => ({ secteur: sector.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ secteur: string }>;
}): Promise<Metadata> {
  const { secteur } = await params;
  const sector = getSector(secteur);
  if (!sector) return { title: 'Secteur introuvable' };
  return {
    title: `Sites internet pour ${sector.label.toLowerCase()}`,
    description: sector.description,
    alternates: { canonical: `/metiers/${sector.id}` },
  };
}

export default async function SectorPage({ params }: { params: Promise<{ secteur: string }> }) {
  const { secteur } = await params;
  const sector = getSector(secteur);
  if (!sector) notFound();

  const businesses = listBusinessesBySector(sector.id);
  const modules = sector.defaultModules
    .map((id) => MODULES[id])
    .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod));

  return (
    <>
      <Section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10"
        />
        <Container size="wide">
          <Breadcrumb
            className="mb-8"
            items={[
              { label: 'Accueil', href: '/' },
              { label: 'Métiers', href: '/metiers' },
              { label: sector.label },
            ]}
          />
          <SectionHeading
            as="h1"
            eyebrow={sector.label}
            title={`Des sites pensés pour ${sector.label.toLowerCase()}`}
            description={sector.description}
          />
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <h2 className="text-sm font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
            Les métiers de ce secteur
          </h2>
          <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {businesses.map((business, index) => (
              <Reveal key={business.id} delay={index * 25}>
                <Link href={`/metiers/${sector.id}/${business.id}`} className="block h-full">
                  <Panel level={1} padding="md" interactive className="h-full">
                    <h3 className="text-sm font-medium">{business.name}</h3>
                    <p className="mt-1.5 text-xs text-[var(--muted)]">
                      {business.modules.length} modules activés automatiquement
                    </p>
                  </Panel>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </Section>

      <Section spacing="compact" className="border-t border-[var(--border)]">
        <Container size="wide">
          <SectionHeading
            eyebrow="Inclus par défaut"
            title="Ce que votre site contient dès le départ"
            description="Ces modules sont activés automatiquement pour tous les métiers du secteur. Vous pouvez en ajouter ou en retirer à tout moment."
          />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((mod) => (
              <Panel key={mod.id} level={1} padding="md">
                <h3 className="text-sm font-medium">{mod.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {mod.description}
                </p>
              </Panel>
            ))}
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-medium tracking-[-0.03em]">Prêt à commencer ?</h2>
          <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
            Choisissez votre métier précis lors de la commande : votre site et votre espace se
            configurent en conséquence.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/commander" size="lg">
              Commander mon site
            </ButtonLink>
            <ButtonLink href="/tarifs" variant="secondary" size="lg">
              Voir les tarifs
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
