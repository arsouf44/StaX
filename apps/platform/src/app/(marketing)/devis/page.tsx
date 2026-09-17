import type { Metadata } from 'next';
import { readEnv } from '@stax/config';
import { SECTORS } from '@stax/business';
import { Container, Panel, Section, SectionHeading } from '@stax/ui';
import { QuoteForm } from './quote-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Demander un devis',
  description:
    'Projet sur mesure, fonctionnalité spécifique, intégration métier : décrivez votre besoin, ' +
    'nous établissons un devis chiffré.',
  alternates: { canonical: '/devis' },
};

export default function QuotePage() {
  return (
    <Section>
      <Container size="wide">
        <div className="grid gap-12 lg:grid-cols-[1fr_20rem] lg:gap-16">
          <div className="max-w-2xl min-w-0">
            <SectionHeading
              as="h1"
              eyebrow="Sur mesure"
              title="Décrivez votre projet"
              description="Ce formulaire est un peu long, et c’est volontaire : mieux nous comprenons votre besoin, plus notre devis est juste. Comptez cinq minutes."
            />

            <div className="mt-10">
              <QuoteForm
                sectors={SECTORS.map((sector) => ({ id: sector.id, label: sector.label }))}
                turnstileSiteKey={readEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ?? null}
              />
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Panel level={1} padding="md">
              <h2 className="text-sm font-medium">Comment ça se passe</h2>
              <ol className="mt-3 space-y-2.5 text-sm text-[var(--foreground-muted)]">
                <li>
                  <strong className="text-[var(--foreground)]">1.</strong> Vous décrivez votre
                  besoin ici.
                </li>
                <li>
                  <strong className="text-[var(--foreground)]">2.</strong> Nous revenons vers vous
                  sous deux jours ouvrés avec des questions précises.
                </li>
                <li>
                  <strong className="text-[var(--foreground)]">3.</strong> Vous recevez un devis
                  détaillé, ligne par ligne, valable trente jours.
                </li>
                <li>
                  <strong className="text-[var(--foreground)]">4.</strong> Vous l’acceptez, ou non.
                  Aucun engagement avant votre signature.
                </li>
              </ol>
            </Panel>

            <Panel level={1} padding="md">
              <h2 className="text-sm font-medium">Être honnête d’emblée</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
                Si votre besoin sort de notre domaine, nous vous le dirons plutôt que d’accepter un
                projet que nous ferions mal. Cela nous est déjà arrivé, cela arrivera encore.
              </p>
            </Panel>
          </aside>
        </div>
      </Container>
    </Section>
  );
}
