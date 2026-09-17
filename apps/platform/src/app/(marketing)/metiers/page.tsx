import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Panel, Reveal, Section, SectionHeading, ButtonLink } from '@stax/ui';
import { listSectors, listBusinessesBySector } from '@stax/business';

export const metadata: Metadata = {
  title: 'Métiers',
  description:
    'StaX couvre 82 métiers répartis en 14 secteurs : restauration, beauté, artisanat, ' +
    'commerce, immobilier, santé, hébergement, sport, éducation et plus encore.',
  alternates: { canonical: '/metiers' },
};

export default function SectorsPage() {
  const sectors = listSectors();
  const total = sectors.reduce((sum, sector) => sum + listBusinessesBySector(sector.id).length, 0);

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
            eyebrow="Métiers"
            title="Votre métier a ses propres besoins"
            description={`Un restaurant a besoin d’une carte et de réservations. Un plombier a besoin de zones d’intervention et de devis. Une agence immobilière a besoin d’annonces. ${total} métiers sont configurés, et nous en ajoutons sur demande.`}
          />
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sectors.map((sector, index) => {
              const businesses = listBusinessesBySector(sector.id);
              return (
                <Reveal key={sector.id} delay={index * 35}>
                  <Link href={`/metiers/${sector.id}`} className="block h-full">
                    <Panel level={1} padding="lg" interactive className="flex h-full flex-col">
                      <div className="flex items-baseline justify-between gap-3">
                        <h2 className="text-base font-medium">{sector.label}</h2>
                        <span className="text-xs text-[var(--muted)] tabular-nums">
                          {businesses.length}
                        </span>
                      </div>
                      <p className="mt-2.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                        {sector.description}
                      </p>
                      <ul className="mt-4 flex flex-wrap gap-1.5">
                        {businesses.slice(0, 4).map((business) => (
                          <li
                            key={business.id}
                            className="rounded-md border border-[var(--border)] bg-[var(--background-inset)] px-2 py-0.5 text-xs text-[var(--muted)]"
                          >
                            {business.name}
                          </li>
                        ))}
                        {businesses.length > 4 ? (
                          <li className="px-1 py-0.5 text-xs text-[var(--muted)]">
                            +{businesses.length - 4}
                          </li>
                        ) : null}
                      </ul>
                      <p className="mt-auto pt-5 text-xs font-medium text-[var(--accent)]">
                        Voir les métiers →
                      </p>
                    </Panel>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow" className="text-center">
          <h2 className="text-3xl font-medium tracking-[-0.03em]">Votre métier n’apparaît pas ?</h2>
          <p className="mx-auto mt-4 max-w-xl text-[var(--foreground-muted)]">
            Nous ajoutons régulièrement de nouveaux métiers. Dites-nous lequel, et nous étudions la
            configuration adaptée — sans supplément si elle reste dans le cadre d’une offre
            existante.
          </p>
          <ButtonLink href="/contact" size="lg" className="mt-8">
            Nous en parler
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
