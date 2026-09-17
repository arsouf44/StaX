import type { HTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib';

/**
 * Retours visuels : etiquettes, etats, alertes, chargement, vides.
 *
 * Regle appliquee partout : un etat n est JAMAIS signale par la seule couleur.
 * Chaque variante porte une forme, une icone ou un texte, pour rester lisible
 * en cas de daltonisme ou de contraste eleve.
 */

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-muted)]',
        accent: 'border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]',
        success: 'border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]',
        warning: 'border-[var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--warning)]',
        danger: 'border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]',
        info: 'border-[var(--info)]/30 bg-[var(--info-soft)] text-[var(--info)]',
        solid: 'border-transparent bg-[var(--primary)] text-[var(--primary-foreground)]',
      },
      size: { sm: 'px-2 py-0.5 text-2xs', md: 'px-2.5 py-0.5 text-xs' },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const DOT_COLORS: Record<StatusTone, string> = {
  neutral: 'bg-[var(--muted)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  danger: 'bg-[var(--danger)]',
  info: 'bg-[var(--info)]',
  accent: 'bg-[var(--accent)]',
};

/** Pastille d etat. Toujours accompagnee d un libelle textuel. */
export function StatusDot({
  tone = 'neutral',
  pulse = false,
  className,
}: {
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn('relative flex size-2 shrink-0', className)}>
      {pulse ? (
        <span
          className={cn(
            'absolute inline-flex size-full animate-ping rounded-full opacity-60',
            DOT_COLORS[tone],
          )}
        />
      ) : null}
      <span className={cn('relative inline-flex size-2 rounded-full', DOT_COLORS[tone])} />
    </span>
  );
}

export function StatusPill({
  tone = 'neutral',
  children,
  pulse,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-[var(--border)]',
        'bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--foreground-muted)]',
        className,
      )}
    >
      <StatusDot tone={tone} pulse={pulse} />
      {children}
    </span>
  );
}

const alertVariants = cva('rounded-[var(--radius-md)] border p-4', {
  variants: {
    tone: {
      info: 'border-[var(--info)]/30 bg-[var(--info-soft)]',
      success: 'border-[var(--success)]/30 bg-[var(--success-soft)]',
      warning: 'border-[var(--warning)]/30 bg-[var(--warning-soft)]',
      danger: 'border-[var(--danger)]/30 bg-[var(--danger-soft)]',
      neutral: 'border-[var(--border)] bg-[var(--surface)]',
    },
  },
  defaultVariants: { tone: 'info' },
});

const ALERT_ICONS: Record<string, ReactNode> = {
  info: (
    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 6.5h1.5v5h-1.5v-5Zm0-2.75h1.5v1.5h-1.5v-1.5Z" />
  ),
  success: (
    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.2 4.55-4 4.25-2.4-2.3 1.04-1.08 1.33 1.28 2.96-3.15 1.07 1Z" />
  ),
  warning: (
    <path d="M8 1.2c.42 0 .8.22 1 .58l6.1 10.6c.2.36.2.8 0 1.15-.2.36-.58.57-1 .57H1.9c-.42 0-.8-.21-1-.57a1.16 1.16 0 0 1 0-1.15L7 1.78c.2-.36.58-.58 1-.58Zm-.75 4.3v3.75h1.5V5.5h-1.5Zm0 5v1.5h1.5v-1.5h-1.5Z" />
  ),
  danger: (
    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.5h1.5v5h-1.5v-5Zm0 6.25h1.5v1.5h-1.5v-1.5Z" />
  ),
  neutral: <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z" />,
};

const ALERT_TEXT: Record<string, string> = {
  info: 'text-[var(--info)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-[var(--danger)]',
  neutral: 'text-[var(--foreground-muted)]',
};

export interface AlertProps extends VariantProps<typeof alertVariants> {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** `alert` pour une erreur immediate, `status` pour une information. */
  live?: 'alert' | 'status' | 'none';
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
  live = 'none',
}: AlertProps) {
  const key = tone ?? 'info';
  return (
    <div
      role={live === 'none' ? undefined : live}
      className={cn(alertVariants({ tone }), className)}
    >
      <div className="flex gap-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={cn('mt-0.5 size-4 shrink-0', ALERT_TEXT[key])}
        >
          {ALERT_ICONS[key]}
        </svg>
        <div className="min-w-0 flex-1">
          {title ? <p className={cn('text-sm font-medium', ALERT_TEXT[key])}>{title}</p> : null}
          {children ? (
            <div
              className={cn(
                'text-sm leading-relaxed text-[var(--foreground-muted)]',
                title && 'mt-1',
              )}
            >
              {children}
            </div>
          ) : null}
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Etat vide : explique ce qui manque ET propose l action suivante. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-lg)]',
        'border border-dashed border-[var(--border-strong)] px-6 py-16 text-center',
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-5 flex size-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] [&_svg]:size-5"
        >
          {icon}
        </div>
      ) : null}
      <p className="text-base font-medium text-[var(--foreground)]">{title}</p>
      {description ? (
        <p className="measure-tight mt-2 text-sm leading-relaxed text-[var(--foreground-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** Etat d erreur avec possibilite de reessayer. */
export function ErrorState({
  title = 'Une erreur est survenue',
  description,
  action,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-lg)]',
        'border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-6 py-12 text-center',
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="currentColor"
        className="mb-4 size-6 text-[var(--danger)]"
      >
        <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.5h1.5v5h-1.5v-5Zm0 6.25h1.5v1.5h-1.5v-1.5Z" />
      </svg>
      <p className="text-base font-medium text-[var(--foreground)]">{title}</p>
      {description ? (
        <p className="measure-tight mt-2 text-sm text-[var(--foreground-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/** Refus d acces : formulation neutre, sans reveler ce qui existe. */
export function PermissionDenied({
  message = "Vous n'avez pas accès a cette page avec votre role actuel.",
  action,
}: {
  message?: string;
  action?: ReactNode;
}) {
  return (
    <EmptyState
      icon={
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
        </svg>
      }
      title="Accès restreint"
      description={message}
      action={action}
    />
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton rounded-[var(--radius-sm)]', className)}
      {...props}
    />
  );
}

/** Squelette de page : preserve la mise en page pendant le chargement. */
export function SkeletonList({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Chargement en cours">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-[var(--radius-md)] border border-[var(--border)] p-4"
        >
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 rounded-[var(--radius-sm)]" />
        </div>
      ))}
      <span className="sr-only">Chargement en cours</span>
    </div>
  );
}

export function Spinner({
  className,
  label = 'Chargement',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--foreground)]"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Progress({
  value,
  max = 100,
  label,
  tone = 'accent',
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: StatusTone;
  className?: string;
}) {
  const percent = Math.min(Math.max((value / max) * 100, 0), 100);
  const fill: Record<StatusTone, string> = {
    neutral: 'bg-[var(--muted)]',
    accent: 'bg-[var(--accent)]',
    success: 'bg-[var(--success)]',
    warning: 'bg-[var(--warning)]',
    danger: 'bg-[var(--danger)]',
    info: 'bg-[var(--info)]',
  };
  return (
    <div className={className}>
      {label ? (
        <div className="mb-2 flex items-center justify-between text-xs text-[var(--foreground-muted)]">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(percent)} %</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--background-inset)]"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', fill[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Jauge d utilisation d un quota : previent avant de bloquer. */
export function QuotaMeter({
  used,
  limit,
  label,
  unit,
  className,
}: {
  used: number;
  limit: number | null;
  label: string;
  unit?: string;
  className?: string;
}) {
  if (limit === null) {
    return (
      <div className={cn('flex items-center justify-between text-sm', className)}>
        <span className="text-[var(--foreground-muted)]">{label}</span>
        <span className="font-medium text-[var(--foreground)] tabular-nums">
          {used.toLocaleString('fr-FR')} {unit} · illimite
        </span>
      </div>
    );
  }
  const ratio = limit > 0 ? used / limit : 1;
  const tone: StatusTone = ratio >= 1 ? 'danger' : ratio >= 0.85 ? 'warning' : 'accent';
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-4 text-sm">
        <span className="text-[var(--foreground-muted)]">{label}</span>
        <span className="font-medium text-[var(--foreground)] tabular-nums">
          {used.toLocaleString('fr-FR')} / {limit.toLocaleString('fr-FR')} {unit}
        </span>
      </div>
      <Progress value={used} max={limit} tone={tone} />
    </div>
  );
}
