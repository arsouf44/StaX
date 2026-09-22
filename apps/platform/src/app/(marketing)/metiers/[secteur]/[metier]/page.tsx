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
import { serializeJsonLd } from '@stax/security';
import {
  getBusiness,
  getSector,
  listBusinesses,
  listBusinessesBySector,
  MODULES,
} from '@stax/business';
import { BrowserFrame, SitePreview } from '~/components/marketing/product-visuals';
import { entryPriceLabel } from '~/lib/catalog';

/**
 * Cette page affiche un TARIF. Prerendue, elle figerait le prix du jour de la
 * compilation : un changement de catalogue resterait invisible jusqu'au
 * deploiement suivant. Une heure de cache suffit a garder la page rapide tout
 * en la laissant se corriger seule.
 */
export const revalidate = 3600;

/** Les 82 pages métier sont pré-rendues : ce sont des pages d’entrée SEO. */
export function generateStaticParams() {
  return listBusinesses().map((business) => ({
    secteur: business.sector,
    metier: business.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ secteur: string; metier: string }>;
}): Promise<Metadata> {
  const { secteur, metier } = await params;
  const business = getBusiness(metier);
  if (!business || business.sector !== secteur) return { title: 'Métier introuvable' };
  return {
    title: `Site internet pour ${business.name.toLowerCase()}`,
    description: `Un site professionnel conçu pour votre métier de ${business.name.toLowerCase()} : ${business.modules
      .slice(0, 4)
      .map((id) => MODULES[id]?.label.toLowerCase())
      .filter(Boolean)
      .join(', ')}. Création, hébergement et maintenance par StaX.`,
    alternates: { canonical: `/metiers/${secteur}/${metier}` },
  };
}

/** Choisit l’aperçu le plus proche du métier parmi les trois disponibles. */
function previewFor(sector: string): 'restaurant' | 'coiffeur' | 'artisan' {
  if (sector === 'restauration' || sector === 'hebergement-tourisme') return 'restaurant';
  if (sector === 'beaute-bien-etre' || sector === 'sante') return 'coiffeur';
  return 'artisan';
}

export default async function BusinessPage({
  params,
}: {
  params: Promise<{ secteur: string; metier: string }>;
}) {
  const { secteur, metier } = await params;
  const business = getBusiness(metier);
  const sector = getSector(secteur);
  if (!business || !sector || business.sector !== secteur) notFound();

  const modules = business.modules
    .map((id) => MODULES[id])
    .filter((mod): mod is NonNullable<typeof mod> => Boolean(mod));
  const siblings = listBusinessesBySector(secteur).filter((item) => item.id !== business.id);
  const entry = await entryPriceLabel();

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `Que contient un site StaX pour un ${business.name.toLowerCase()} ?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Les pages recommandées pour ce métier (${business.recommendedPages
            .map((page) => page.title)
            .join(', ')}) et les modules adaptés : ${modules
            .map((mod) => mod.label.toLowerCase())
            .join(', ')}.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Combien coûte un site pour ce métier ?',
        acceptedAnswer: {
          '@type': 'Answer',
          // Le tarif vient du catalogue : cette reponse est publiee en
          // donnees structurees, donc reprise telle quelle par les moteurs de
          // recherche. Un prix perime y reste visible longtemps.
          text:
            (entry ? `${entry} à la commande, puis la maintenance. ` : '') +
            'L’offre Premium ajoute les réservations et les actualités ; l’offre Ultra Premium ' +
            'ajoute la boutique, l’encaissement en ligne et un design entièrement sur mesure.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Sérialisation qui neutralise toute fermeture de balise script.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }}
      />

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
              { label: sector.label, href: `/metiers/${sector.id}` },
              { label: business.name },
            ]}
          />
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <SectionHeading
                as="h1"
                eyebrow={sector.label}
                title={`Un site pour votre activité de ${business.name.toLowerCase()}`}
                description={`Les pages, les fonctionnalités et le vocabulaire de votre espace sont adaptés à ce métier. Vous gérez vos ${business.vocabulary.offeringPlural}, vos ${business.vocabulary.customerPlural} et vos contenus sans intermédiaire.`}
              />
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <ButtonLink href={`/commander?metier=${business.id}`} size="lg">
                  Commander mon site
                </ButtonLink>
                <ButtonLink href="/tarifs" variant="glass" size="lg">
                  Voir les tarifs
                </ButtonLink>
              </div>
            </div>
            <Reveal delay={100}>
              <BrowserFrame
                url={`${business.id}-exemple.fr`}
                tone={previewFor(sector.id) === 'coiffeur' ? 'light' : 'dark'}
              >
                <SitePreview variant={previewFor(sector.id)} />
              </BrowserFrame>
              <p className="mt-3 text-center text-xs text-[var(--muted)]">
                Exemple de mise en page — démonstration, pas un client réel.
              </p>
            </Reveal>
          </div>
        </Container>
      </Section>

      <Section spacing="compact" className="border-y border-[var(--border)]">
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="text-xl font-medium tracking-[-0.02em]">Les pages de votre site</h2>
              <ol className="mt-5 space-y-2">
                {business.recommendedPages.map((page, index) => (
                  <li
                    key={page.path}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <span className="font-mono text-xs text-[var(--muted)] tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 text-sm font-medium">{page.title}</span>
                    <code className="font-mono text-xs text-[var(--muted)]">{page.path}</code>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-[var(--muted)]">
                Cette structure est un point de départ : vous pouvez ajouter, renommer ou supprimer
                des pages depuis votre espace.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-medium tracking-[-0.02em]">
                Les fonctionnalités activées
              </h2>
              <ul className="mt-5 grid gap-2">
                {modules.map((mod) => (
                  <li
                    key={mod.id}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium">{mod.label}</span>
                      {mod.requiredFeature ? (
                        <span className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2 py-0.5 text-2xs text-[var(--accent)]">
                          Premium
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                      {mod.description}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </Section>

      <Section spacing="compact">
        <Container size="wide">
          <h2 className="text-xl font-medium tracking-[-0.02em]">Ce que nous vous demanderons</h2>
          <p className="measure mt-3 text-sm text-[var(--foreground-muted)]">
            Le questionnaire de commande est adapté à votre métier. Voici les questions spécifiques
            à votre activité, en plus des informations générales sur votre entreprise.
          </p>
          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {business.onboarding
              .filter(
                (question) => !['business_name', 'city', 'phone', 'email'].includes(question.id),
              )
              .slice(0, 8)
              .map((question) => (
                <li
                  key={question.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground-muted)]"
                >
                  {question.label}
                </li>
              ))}
          </ul>
        </Container>
      </Section>

      {siblings.length > 0 ? (
        <Section spacing="compact" className="border-t border-[var(--border)]">
          <Container size="wide">
            <h2 className="text-sm font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Autres métiers du secteur
            </h2>
            <ul className="mt-5 flex flex-wrap gap-2">
              {siblings.map((sibling) => (
                <li key={sibling.id}>
                  <Link
                    href={`/metiers/${sector.id}/${sibling.id}`}
                    className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2 text-sm text-[var(--foreground-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
                  >
                    {sibling.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </Section>
      ) : null}

      <Section spacing="compact">
        <Container size="narrow">
          <Panel level={2} padding="xl" className="text-center">
            <h2 className="text-3xl font-medium tracking-[-0.03em]">
              Votre site de {business.name.toLowerCase()}, en quelques jours
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[var(--foreground-muted)]">
              Vous répondez au questionnaire, nous construisons, vous validez. La maintenance et
              l’hébergement sont inclus.
            </p>
            <ButtonLink href={`/commander?metier=${business.id}`} size="lg" className="mt-8">
              Commander mon site
            </ButtonLink>
          </Panel>
        </Container>
      </Section>
    </>
  );
}
