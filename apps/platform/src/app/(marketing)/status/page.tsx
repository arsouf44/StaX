import type { Metadata } from 'next';
import { missingCapabilities } from '@stax/config';
import { Alert, Container, Panel, Section, SectionHeading, StatusDot } from '@stax/ui';
import { loadPublicHealth } from '~/lib/health';

export const metadata: Metadata = {
  title: 'État des services',
  description:
    'L’état réel des services StaX : application, base de données, paiements, e-mails, ' +
    'vérification des domaines. Mesuré, pas déclaré.',
  alternates: { canonical: '/status' },
  robots: { index: true, follow: true },
};

/** Cette page reflète un état mesuré : elle ne doit jamais être servie depuis un cache. */
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<
  string,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  healthy: { label: 'Opérationnel', tone: 'success' },
  degraded: { label: 'Dégradé', tone: 'warning' },
  failing: { label: 'En incident', tone: 'danger' },
  not_configured: { label: 'Non configuré', tone: 'neutral' },
  unknown: { label: 'Non mesuré', tone: 'neutral' },
};

export default async function StatusPage() {
  const health = await loadPublicHealth();
  const missing = missingCapabilities();

  const hasIncident = health.some(
    (item) => item.status === 'failing' || item.status === 'degraded',
  );

  return (
    <>
      <Section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10"
        />
        <Container size="narrow">
          <SectionHeading
            as="h1"
            eyebrow="État des services"
            title={hasIncident ? 'Un incident est en cours' : 'Tous les services fonctionnent'}
            description="Nous publions l’état réel de chaque composant. Un indicateur reste « non mesuré » tant qu’aucune sonde ne l’a vérifié : nous préférons l’admettre plutôt qu’afficher une disponibilité inventée."
          />
        </Container>
      </Section>

      <Section spacing="compact" className="pt-0">
        <Container size="narrow">
          <Panel level={2} padding="none">
            <ul className="divide-y divide-[var(--border)]">
              {health.map((item) => {
                const status = STATUS_LABELS[item.status] ?? STATUS_LABELS.unknown;
                return (
                  <li key={item.key} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                    <StatusDot tone={status?.tone ?? 'neutral'} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      {item.detail ? (
                        <p className="mt-0.5 text-xs text-[var(--muted)]">{item.detail}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-[var(--foreground-muted)]">
                      {status?.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {missing.length > 0 ? (
            <Alert
              tone="neutral"
              title="Services non configurés sur cet environnement"
              className="mt-6"
            >
              <p className="leading-relaxed">
                Certains services externes ne sont pas encore raccordés : {missing.join(', ')}. Les
                fonctionnalités correspondantes sont désactivées plutôt que présentées comme
                disponibles.
              </p>
            </Alert>
          ) : null}

          <p className="mt-8 text-xs leading-relaxed text-[var(--muted)]">
            Cette page est générée à chaque consultation, sans mise en cache. Si vous constatez un
            dysfonctionnement qui n’apparaît pas ici, signalez-le depuis votre espace client ou par
            e-mail : un incident non détecté reste un incident.
          </p>
        </Container>
      </Section>
    </>
  );
}
