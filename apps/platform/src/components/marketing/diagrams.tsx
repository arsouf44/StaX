import { cn } from '@stax/ui';

/**
 * Schemas d architecture.
 *
 * Ils montrent le mecanisme reel du produit — ou aboutit un nom de domaine, et
 * ou va l argent d un paiement. Tout est en SVG et en HTML, donc net, leger et
 * lisible par un lecteur d ecran via les libelles.
 */

/* -------------------------------------------------------------------------- */
/*  Un site, un projet : domaine -> Cloudflare <- GitHub                       */
/* -------------------------------------------------------------------------- */

const SITES = [
  { host: 'restaurant-dupont.fr', project: 'restaurant-dupont', color: '#147CFF' },
  { host: 'atelier-camille.fr', project: 'atelier-camille', color: '#2FD29B' },
  { host: 'martin-plomberie.fr', project: 'martin-plomberie', color: '#F5A524' },
];

/**
 * Chaque site est un projet independant : son depot, son projet Cloudflare,
 * son domaine. Le domaine du client pointe vers SON deploiement — jamais vers
 * un rendu generique de StaX.
 */
export function DomainRoutingDiagram({ className }: { className?: string }) {
  return (
    <figure className={cn('not-prose', className)}>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <div
            aria-hidden="true"
            className="hidden grid-cols-[1fr_1.25rem_1fr_1.25rem_1fr] gap-2 px-1 pb-2 text-2xs tracking-[0.12em] text-[var(--muted)] uppercase sm:grid"
          >
            <span>Votre domaine</span>
            <span />
            <span>Son projet Cloudflare</span>
            <span />
            <span>Son dépôt GitHub</span>
          </div>
          <ul className="space-y-2">
            {SITES.map((site) => (
              <li
                key={site.host}
                className="grid gap-2 sm:grid-cols-[1fr_1.25rem_1fr_1.25rem_1fr] sm:items-center"
              >
                <span className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: site.color }}
                  />
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--foreground-muted)]">
                    {site.host}
                  </code>
                </span>
                <FlowArrow />
                <code className="min-w-0 truncate rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 font-mono text-xs text-[var(--foreground-muted)]">
                  {site.project}.pages.dev
                </code>
                <FlowArrow reverse />
                <code className="min-w-0 truncate rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 font-mono text-xs text-[var(--foreground-muted)]">
                  {site.project}-site
                </code>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass-edge rounded-[var(--radius-lg)] p-4 glass-2">
          <p className="text-2xs font-medium tracking-[0.12em] text-[var(--muted)] uppercase">
            Un site, un projet
          </p>
          <ol className="mt-3 space-y-2 text-xs">
            {[
              'Votre domaine pointe vers le projet Cloudflare de votre site',
              'Le certificat HTTPS est émis et renouvelé automatiquement',
              'Chaque publication devient un commit dans le dépôt de votre site',
              'Cloudflare déploie ce commit ; StaX attend sa confirmation',
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
            StaX n’est pas sur le chemin de vos visiteurs : votre site s’affiche même si l’espace
            StaX est momentanément indisponible.
          </p>
        </div>
      </div>
      <figcaption className="sr-only">
        Chaque nom de domaine pointe vers le projet Cloudflare de son propre site, lui-même déployé
        depuis le dépôt GitHub de ce site. Les sites ne partagent ni code ni déploiement.
      </figcaption>
    </figure>
  );
}

function FlowArrow({ reverse = false }: { reverse?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 12"
      className={cn(
        'mx-auto hidden h-3 w-5 text-[var(--border-strong)] sm:block',
        reverse ? 'rotate-180' : null,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <path d="M1 6h16m0 0-4-4m4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
          création du site, puis la maintenance mensuelle à partir de sa livraison.
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
          <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-1.5 py-0.5 text-[9px] text-[var(--accent-text)]">
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
            {String(index + 1).padStart(2, '0')}
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
    { label: 'Versions', value: 'Chaque publication restaurable', tone: 'success' as const },
    { label: 'Déploiement', value: 'Confirmé avant « Publié »', tone: 'success' as const },
    { label: 'Surveillance', value: 'Disponibilité vérifiée', tone: 'success' as const },
  ];
  return (
    <div className={cn('grid gap-2 sm:grid-cols-2', className)}>
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
