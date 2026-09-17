import { cn } from '@stax/ui';

/**
 * Schemas d architecture.
 *
 * Ils montrent le mecanisme reel du produit — comment un nom de domaine
 * aboutit au bon site, et ou va l argent d un paiement. Tout est en SVG et en
 * HTML, donc net, leger et lisible par un lecteur d ecran via les libelles.
 */

/* -------------------------------------------------------------------------- */
/*  Routage multi-tenant                                                       */
/* -------------------------------------------------------------------------- */

const HOSTNAMES = [
  { host: 'restaurant-dupont.fr', tenant: 'Restaurant Dupont' },
  { host: 'atelier-camille.fr', tenant: 'Atelier Camille' },
  { host: 'martin-plomberie.fr', tenant: 'Martin Plomberie' },
  { host: 'dupont.sites.stax.fr', tenant: 'Restaurant Dupont' },
];

export function DomainRoutingDiagram({ className }: { className?: string }) {
  return (
    <figure className={cn('not-prose', className)}>
      <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
        {/* Entree : des domaines differents */}
        <ul className="space-y-2">
          {HOSTNAMES.map((entry, index) => (
            <li
              key={entry.host}
              className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{
                  background: ['#6E6BFF', '#00C896', '#F5A524', '#4DA6FF'][index],
                }}
              />
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--foreground-muted)]">
                {entry.host}
              </code>
            </li>
          ))}
        </ul>

        {/* Traitement : une seule infrastructure */}
        <div className="relative mx-auto w-full max-w-xs lg:w-64">
          <svg
            aria-hidden="true"
            viewBox="0 0 40 160"
            preserveAspectRatio="none"
            className="absolute top-1/2 -left-4 hidden h-40 w-4 -translate-y-1/2 lg:block"
          >
            {[20, 60, 100, 140].map((y) => (
              <path
                key={y}
                d={`M0 ${y} C 24 ${y}, 16 80, 40 80`}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth="1"
              />
            ))}
          </svg>

          <div className="glass-edge rounded-[var(--radius-lg)] p-4 glass-2">
            <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
              Infrastructure StaX
            </p>
            <ol className="mt-3 space-y-2 text-xs">
              {[
                'Réception à la périphérie du réseau',
                'Identification du site par son nom d’hôte',
                'Chargement de ce tenant, et de lui seul',
                'Rendu de la version publiée',
              ].map((step, index) => (
                <li key={step} className="flex gap-2.5">
                  <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] font-mono text-[9px] text-[var(--muted)]">
                    {index + 1}
                  </span>
                  <span className="text-[var(--foreground-muted)]">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 flex items-start gap-1.5 border-t border-[var(--border)] pt-3 text-[10px] leading-relaxed text-[var(--muted)]">
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="mt-px size-3 shrink-0 text-[var(--success)]"
              >
                <path d="M8 1a3.2 3.2 0 0 0-3.2 3.2V6H4.5A1.5 1.5 0 0 0 3 7.5v5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 6h-.3V4.2A3.2 3.2 0 0 0 8 1Zm1.8 5H6.2V4.2a1.8 1.8 0 1 1 3.6 0V6Z" />
              </svg>
              Le navigateur ne choisit jamais le site à servir : seul le nom d’hôte le détermine.
            </p>
          </div>

          <svg
            aria-hidden="true"
            viewBox="0 0 40 160"
            preserveAspectRatio="none"
            className="absolute top-1/2 -right-4 hidden h-40 w-4 -translate-y-1/2 lg:block"
          >
            {[30, 80, 130].map((y) => (
              <path
                key={y}
                d={`M0 80 C 24 80, 16 ${y}, 40 ${y}`}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth="1"
              />
            ))}
          </svg>
        </div>

        {/* Sortie : des sites isoles */}
        <ul className="space-y-2">
          {['Restaurant Dupont', 'Atelier Camille', 'Martin Plomberie'].map((tenant, index) => (
            <li
              key={tenant}
              className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium">{tenant}</span>
                <span className="shrink-0 rounded-full border border-[var(--success)]/30 bg-[var(--success-soft)] px-1.5 py-0.5 text-[9px] text-[var(--success)]">
                  isolé
                </span>
              </div>
              <div className="mt-2 flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((bar) => (
                  <span
                    key={bar}
                    className="h-1 flex-1 rounded-full"
                    style={{
                      background:
                        bar === 0
                          ? ['#6E6BFF', '#00C896', '#F5A524'][index]
                          : 'var(--border-strong)',
                      opacity: bar === 0 ? 0.9 : 0.4,
                    }}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="sr-only">
        Plusieurs noms de domaine arrivent sur la même infrastructure. Le nom d’hôte détermine le
        site à servir, et chaque site ne peut accéder qu’à ses propres données.
      </figcaption>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/*  Circuit des paiements                                                      */
/* -------------------------------------------------------------------------- */

export function PaymentRoutingDiagram({ className }: { className?: string }) {
  return (
    <figure className={cn('not-prose', className)}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
        <Node title="Votre client" subtitle="Paie sur votre site" amount="48,00 €" tone="neutral" />
        <Arrow />
        <Node
          title="Votre compte Stripe"
          subtitle="Ouvert à votre nom"
          badge="Vous"
          tone="accent"
        />
        <Arrow />
        <Node
          title="Votre banque"
          subtitle="Virement automatique"
          amount="48,00 €"
          tone="success"
        />
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--muted)]">
            StaX
          </span>
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="size-4 text-[var(--muted)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          >
            <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
          <span className="text-[var(--foreground-muted)]">
            n’est jamais dans le circuit de cet argent.
          </span>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-[var(--muted)]">
          Les encaissements de votre activité passent par votre propre compte Stripe connecté. StaX
          ne les détient jamais et ne prélève aucune commission dessus. Vous ne payez à StaX que la
          création du site et la maintenance mensuelle.
        </p>
      </div>
      <figcaption className="sr-only">
        L’argent payé par vos clients va directement de leur moyen de paiement à votre compte
        Stripe, puis à votre banque. StaX n’intervient pas dans ce flux.
      </figcaption>
    </figure>
  );
}

function Node({
  title,
  subtitle,
  amount,
  badge,
  tone,
}: {
  title: string;
  subtitle: string;
  amount?: string;
  badge?: string;
  tone: 'neutral' | 'accent' | 'success';
}) {
  const borders = {
    neutral: 'border-[var(--border)]',
    accent: 'border-[var(--accent)]/40',
    success: 'border-[var(--success)]/35',
  } as const;

  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border bg-[var(--surface)] p-4 text-center sm:text-left',
        borders[tone],
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {badge ? (
          <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] text-[var(--accent)]">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">{subtitle}</p>
      {amount ? (
        <p className="mt-2.5 font-mono text-lg tabular-nums">{amount}</p>
      ) : (
        <div aria-hidden="true" className="mt-2.5 h-[1.75rem]" />
      )}
    </div>
  );
}

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 16"
      className="mx-auto h-4 w-8 rotate-90 text-[var(--border-strong)] sm:rotate-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <path d="M2 8h26m0 0-5-5m5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chronologie de creation                                                    */
/* -------------------------------------------------------------------------- */

export interface TimelineStep {
  title: string;
  description: string;
  detail?: string;
}

export function CreationTimeline({
  steps,
  className,
}: {
  steps: readonly TimelineStep[];
  className?: string;
}) {
  return (
    <ol className={cn('relative space-y-0', className)}>
      {steps.map((step, index) => (
        <li key={step.title} className="relative flex gap-5 pb-10 last:pb-0">
          {index < steps.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute top-8 left-[15px] h-full w-px bg-gradient-to-b from-[var(--border-strong)] to-transparent"
            />
          ) : null}
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--background)] font-mono text-xs text-[var(--foreground-muted)]">
            {index + 1}
          </span>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-base font-medium tracking-[-0.015em]">{step.title}</h3>
            <p className="measure mt-1.5 text-sm leading-relaxed text-[var(--foreground-muted)]">
              {step.description}
            </p>
            {step.detail ? (
              <p className="mt-2 inline-flex rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--muted)]">
                {step.detail}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  Indicateurs d exploitation                                                 */
/* -------------------------------------------------------------------------- */

export function OperationalIndicators({ className }: { className?: string }) {
  const items = [
    { label: 'HTTPS', value: 'Certificat automatique', tone: 'success' as const },
    { label: 'Sauvegardes', value: 'Quotidiennes', tone: 'success' as const },
    { label: 'Mises à jour', value: 'Continues', tone: 'success' as const },
    { label: 'Surveillance', value: 'Permanente', tone: 'success' as const },
  ];
  return (
    <div className={cn('grid gap-2 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3"
        >
          <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--success)]" />
          <div className="min-w-0">
            <p className="text-2xs tracking-wide text-[var(--muted)] uppercase">{item.label}</p>
            <p className="truncate text-xs font-medium text-[var(--foreground)]">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
