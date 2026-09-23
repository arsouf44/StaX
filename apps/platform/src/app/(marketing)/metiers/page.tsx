import type { Metadata } from 'next';
import Link from 'next/link';
import { Container, Reveal, Section, SectionHeading, ButtonLink } from '@stax/ui';
import { BusinessSwitcher } from '~/components/marketing/business-switcher';
import { listSectors, listBusinessesBySector } from '@stax/business';

// Les comptes viennent du REGISTRE : ajouter un metier ne doit pas laisser une
// page vitrine annoncer l'ancien chiffre.
const SECTOR_COUNT = listSectors().length;
const BUSINESS_COUNT = listSectors().reduce(
  (sum, sector) => sum + listBusinessesBySector(sector.id).length,
  0,
);

export const metadata: Metadata = {
  title: 'Métiers',
  description:
    `StaX couvre ${BUSINESS_COUNT} métiers répartis en ${SECTOR_COUNT} secteurs : restauration, ` +
    'beauté, artisanat, commerce, immobilier, santé, hébergement, sport, éducation et plus encore.',
  alternates: { canonical: '/metiers' },
};

export default function SectorsPage() {
  const sectors = listSectors();
  const total = sectors.reduce((sum, sector) => sum + listBusinessesBySector(sector.id).length, 0);

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
            eyebrow="Métiers"
            title="Votre métier a ses propres besoins"
            description={`Un restaurant a besoin d’une carte et de réservations. Un plombier a besoin de zones d’intervention et de devis. Une agence immobilière a besoin d’annonces. ${total} métiers sont configurés, et nous en ajoutons sur demande.`}
          />
        </Container>
      </Section>

      {/* Le meme produit, trois metiers : le site et l espace changent au clic. */}
      <Section spacing="compact" className="pt-0 sm:pt-0">
        <BusinessSwitcher />
      </Section>

      <Section className="bg-[var(--background-subtle)]">
        <Container size="wide">
          <SectionHeading
            eyebrow={`${SECTOR_COUNT} secteurs`}
            title="Trouvez le vôtre"
            description="Chaque secteur regroupe des métiers configurés avec leurs pages, leurs fonctionnalités et leur vocabulaire."
          />
          <ul className="mt-14 border-t border-[var(--border)]">
            {sectors.map((sector, index) => {
              const businesses = listBusinessesBySector(sector.id);
              return (
                <Reveal key={sector.id} as="li" delay={Math.min(index * 30, 210)}>
                  <Link
                    href={`/metiers/${sector.id}`}
                    className="group grid gap-3 border-b border-[var(--border)] py-7 transition-colors duration-300 hover:bg-[var(--glass-1)] md:grid-cols-[1.1fr_1.4fr_auto] md:items-center md:gap-10 md:px-4"
                  >
                    <h2 className="flex items-baseline gap-3 text-2xl font-semibold tracking-[-0.03em] transition-colors group-hover:text-[var(--accent-text)] sm:text-3xl">
                      {sector.label}
                      <span className="text-sm font-normal text-[var(--muted)] tabular-nums">
                        {businesses.length}
                      </span>
                    </h2>
                    <div>
                      <p className="text-[0.9375rem] leading-relaxed text-[var(--foreground-muted)]">
                        {sector.description}
                      </p>
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {businesses.slice(0, 4).map((business) => (
                          <li
                            key={business.id}
                            className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--muted)]"
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
                    </div>
                    <span className="text-sm font-medium text-[var(--accent-text)] md:justify-self-end">
                      Voir les métiers →
                    </span>
                  </Link>
                </Reveal>
              );
            })}
          </ul>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="narrow" className="text-center">
          <h2 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            Votre métier n’apparaît pas ?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[var(--foreground-muted)]">
            Nous ajoutons régulièrement de nouveaux métiers. Dites-nous lequel, et nous étudions la
            configuration adaptée — sans supplément si elle reste dans le cadre d’une offre
            existante.
          </p>
          <ButtonLink href="/contact" variant="accent" size="pill-lg" className="mt-8">
            Nous en parler
          </ButtonLink>
        </Container>
      </Section>
    </>
  );
}
