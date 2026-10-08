import type { Metadata } from 'next';
import { ButtonLink, Container, Section, SectionHeading } from '@nemasus/ui';
import { FAQ_CATEGORIES, FAQ_ITEMS, type FaqItem } from '~/content/faq';
import { breadcrumbJsonLd, faqJsonLd, JsonLd, organizationJsonLd } from '~/lib/structured-data';

export const metadata: Metadata = {
  title: 'Questions fréquentes',
  description:
    'Commande, paiement par virement, code d’accès, modifications, hébergement, référencement : ' +
    'les réponses aux questions que l’on nous pose le plus souvent sur Nemasus.',
  alternates: { canonical: '/faq' },
};

export default function FaqPage() {
  const categories = Object.keys(FAQ_CATEGORIES) as Array<FaqItem['category']>;

  return (
    <>
      <JsonLd
        graph={[
          organizationJsonLd(),
          faqJsonLd(FAQ_ITEMS, '/faq'),
          breadcrumbJsonLd([
            { name: 'Accueil', path: '/' },
            { name: 'Questions fréquentes', path: '/faq' },
          ]),
        ]}
      />

      <Section className="relative overflow-hidden">
        <Container size="wide">
          <SectionHeading
            as="h1"
            eyebrow="Questions fréquentes"
            title="Les réponses, sans détour"
            description="Si votre question n’est pas là, écrivez-nous : nous répondons, et nous ajoutons la réponse ici."
          />
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="wide">
          <div className="grid gap-12 lg:grid-cols-[14rem_1fr] lg:items-start">
            <nav aria-label="Catégories de questions" className="lg:sticky lg:top-28">
              <ul className="space-y-1">
                {categories.map((category) => (
                  <li key={category}>
                    <a
                      href={`#${category}`}
                      className="block rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--foreground-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                    >
                      {FAQ_CATEGORIES[category]}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="space-y-14">
              {categories.map((category) => {
                const items = FAQ_ITEMS.filter((item) => item.category === category);
                if (items.length === 0) return null;
                return (
                  <section key={category} id={category} aria-labelledby={`${category}-title`}>
                    <h2
                      id={`${category}-title`}
                      className="text-[12.5px] font-medium tracking-[0.05em] text-[var(--muted)]"
                    >
                      {FAQ_CATEGORIES[category]}
                    </h2>
                    <dl className="mt-6 divide-y divide-[var(--border)]">
                      {items.map((item) => (
                        <div key={item.question} className="py-6 first:pt-0">
                          <dt className="text-base font-medium">{item.question}</dt>
                          <dd className="measure mt-2.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
                            {item.answer}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                );
              })}
            </div>
          </div>
        </Container>
      </Section>

      <Section spacing="compact" className="border-t border-[var(--border)]">
        <Container size="narrow" className="text-center">
          <h2 className="font-serif text-[2.4rem] leading-tight font-normal">
            Votre question n’y est pas ?
          </h2>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/contact" size="pill-lg">
              Nous écrire
            </ButtonLink>
            <ButtonLink href="/aide" variant="secondary" size="pill-lg">
              Centre d’aide
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
