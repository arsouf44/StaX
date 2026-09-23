import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Alert,
  Badge,
  Breadcrumb,
  ButtonLink,
  Container,
  Panel,
  Reveal,
  Section,
  SectionHeading,
} from '@stax/ui';
import { FEATURE_PAGES, getFeaturePage } from '~/content/features';
import {
  BrowserFrame,
  DashboardMock,
  EditorMock,
  SitePreview,
} from '~/components/marketing/product-visuals';
import { DomainRoutingDiagram, PaymentRoutingDiagram } from '~/components/marketing/diagrams';

/** Les dix pages de fonctionnalités sont pré-rendues au build. */
export function generateStaticParams() {
  return FEATURE_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getFeaturePage(slug);
  if (!page) return { title: 'Page introuvable' };
  return {
    title: page.name,
    description: page.subtitle,
    alternates: { canonical: `/fonctionnalites/${page.slug}` },
  };
}

const PLAN_LABELS: Record<string, string> = {
  premium: 'Inclus à partir de Premium',
  'ultra-premium': 'Inclus avec Ultra Premium',
  essentiel: 'Inclus dès l’offre Essentiel',
};

export default async function FeatureDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getFeaturePage(slug);
  if (!page) notFound();

  return (
    <>
      <Section className="relative overflow-hidden pb-0">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="spotlight absolute inset-0" />
          <div className="grid-bg grid-bg-fade absolute inset-0" />
        </div>
        <Container size="wide">
          <Breadcrumb
            className="mb-8"
            items={[
              { label: 'Accueil', href: '/' },
              { label: 'Fonctionnalités', href: '/fonctionnalites' },
              { label: page.name },
            ]}
          />
          <div className="max-w-3xl">
            {page.requiredPlan ? (
              <Badge tone="accent" className="mb-5">
                {PLAN_LABELS[page.requiredPlan] ?? page.requiredPlan}
              </Badge>
            ) : (
              <Badge tone="success" className="mb-5">
                Inclus dans toutes les offres
              </Badge>
            )}
            <SectionHeading
              as="h1"
              eyebrow={page.eyebrow}
              title={page.title}
              description={page.subtitle}
            />
          </div>

          {page.visual !== 'none' ? (
            <Reveal delay={120} className="mt-14">
              <FeatureVisual visual={page.visual} />
            </Reveal>
          ) : null}
        </Container>
      </Section>

      <Section>
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[1fr_18rem] lg:items-start">
            <div className="space-y-12">
              {page.sections.map((section, index) => (
                <Reveal key={section.title} delay={index * 60}>
                  <article>
                    <h2 className="text-2xl font-medium tracking-[-0.025em]">{section.title}</h2>
                    <p className="measure mt-4 text-base leading-relaxed text-[var(--foreground-muted)]">
                      {section.body}
                    </p>
                    {section.points ? (
                      <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                        {section.points.map((point) => (
                          <li
                            key={point}
                            className="flex gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-sm"
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]"
                            >
                              <path
                                d="m3 8.5 3.5 3.5L13 5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="text-[var(--foreground-muted)]">{point}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                </Reveal>
              ))}

              {page.limits && page.limits.length > 0 ? (
                <Alert tone="neutral" title="Ce que cette fonctionnalité ne fait pas">
                  <ul className="mt-2 space-y-2">
                    {page.limits.map((limit) => (
                      <li key={limit} className="flex gap-2.5">
                        <span
                          aria-hidden="true"
                          className="mt-2 size-1 shrink-0 rounded-full bg-[var(--muted)]"
                        />
                        <span>{limit}</span>
                      </li>
                    ))}
                  </ul>
                </Alert>
              ) : null}
            </div>

            <aside className="lg:sticky lg:top-28">
              <Panel level={2} padding="lg">
                <h2 className="text-sm font-medium">Fonctionnalités liées</h2>
                <ul className="mt-4 space-y-2">
                  {page.related
                    .map((relatedSlug) => getFeaturePage(relatedSlug))
                    .filter((related): related is NonNullable<typeof related> => Boolean(related))
                    .map((related) => (
                      <li key={related.slug}>
                        <Link
                          href={`/fonctionnalites/${related.slug}`}
                          className="text-sm text-[var(--foreground-muted)] transition-colors hover:text-[var(--foreground)]"
                        >
                          {related.name} →
                        </Link>
                      </li>
                    ))}
                </ul>
                <div className="mt-6 border-t border-[var(--border)] pt-6">
                  <ButtonLink variant="accent" size="pill" href="/commander" block>
                    Commander mon site
                  </ButtonLink>
                  <ButtonLink size="pill" href="/tarifs" variant="ghost" block className="mt-2">
                    Voir les tarifs
                  </ButtonLink>
                </div>
              </Panel>
            </aside>
          </div>
        </Container>
      </Section>
    </>
  );
}

function FeatureVisual({ visual }: { visual: string }) {
  if (visual === 'editor') {
    return (
      <BrowserFrame url="stax.fr/app/editeur">
        <EditorMock />
      </BrowserFrame>
    );
  }
  if (visual === 'dashboard') {
    return (
      <BrowserFrame url="stax.fr/app">
        <DashboardMock />
      </BrowserFrame>
    );
  }
  if (visual === 'site') {
    return (
      <BrowserFrame url="restaurant-dupont.fr">
        <SitePreview variant="restaurant" />
      </BrowserFrame>
    );
  }
  if (visual === 'domains') {
    return (
      <Panel level={2} padding="lg">
        <DomainRoutingDiagram />
      </Panel>
    );
  }
  if (visual === 'payments') {
    return (
      <Panel level={2} padding="lg">
        <PaymentRoutingDiagram />
      </Panel>
    );
  }
  return null;
}
