import type { Metadata } from 'next';
import { legalValue, readEnv } from '@stax/config';
import { Container, Panel, Section, SectionHeading } from '@stax/ui';
import { ContactForm } from './contact-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Nous contacter',
  description:
    'Une question sur nos offres, un projet à discuter, un besoin d’assistance : écrivez-nous, ' +
    'nous répondons sous un jour ouvré.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  const support = legalValue('SUPPORT_EMAIL');
  const phone = legalValue('SUPPORT_PHONE');

  return (
    <Section>
      <Container size="wide">
        <div className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16">
          <div className="max-w-2xl min-w-0">
            <SectionHeading
              as="h1"
              eyebrow="Contact"
              title="Parlons de votre projet"
              description="Dites-nous ce que vous cherchez à faire. Nous répondons à chaque message, et nous vous dirons franchement si nous ne sommes pas les mieux placés."
            />

            <div className="mt-10">
              <ContactForm turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null} />
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Panel level={1} padding="md">
              <h2 className="text-sm font-medium">Écrire directement</h2>
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                <a href={`mailto:${support}`} className="underline underline-offset-4">
                  {support}
                </a>
              </p>
              {phone && !phone.startsWith('[') ? (
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">{phone}</p>
              ) : null}
            </Panel>

            <Panel level={1} padding="md">
              <h2 className="text-sm font-medium">Vous êtes déjà client ?</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Écrivez-nous depuis votre espace : votre message arrive avec le contexte de votre
                site, ce qui nous fait gagner un aller-retour.
              </p>
            </Panel>

            <Panel level={1} padding="md">
              <h2 className="text-sm font-medium">Ce que nous ne faisons pas</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-[var(--foreground-muted)]">
                <li>Nous ne démarchons pas par téléphone.</li>
                <li>Nous ne revendons aucune coordonnée.</li>
                <li>Nous n’envoyons pas de relances automatiques répétées.</li>
              </ul>
            </Panel>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
