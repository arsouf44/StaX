import Link from 'next/link';
import { cn } from '@stax/ui';
import { ORDER_STEPS } from '~/lib/order-draft';

/**
 * Fil du parcours d achat.
 *
 * Les etapes deja franchies redeviennent cliquables : revenir en arriere pour
 * corriger une reponse ne doit jamais obliger a tout recommencer.
 */
export function OrderSteps({ current }: { current: string }) {
  const index = ORDER_STEPS.findIndex((step) => step.path === current);

  return (
    <nav aria-label="Étapes de la commande" className="mb-10">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
        {ORDER_STEPS.map((step, position) => {
          const done = position < index;
          const active = position === index;
          const content = (
            <span
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1.5',
                active && 'bg-[var(--surface-elevated)] font-medium text-[var(--foreground)]',
                !active && 'text-[var(--muted)]',
                done && 'text-[var(--foreground-muted)]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-5 items-center justify-center rounded-full text-2xs tabular-nums',
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                    : done
                      ? 'bg-[var(--success-soft)] text-[var(--success)]'
                      : 'border border-[var(--border)]',
                )}
              >
                {done ? '✓' : position + 1}
              </span>
              {step.label}
            </span>
          );

          return (
            <li key={step.path} className="flex items-center gap-2">
              {done ? (
                <Link href={step.path} className="transition-colors hover:text-[var(--foreground)]">
                  {content}
                </Link>
              ) : (
                <span aria-current={active ? 'step' : undefined}>{content}</span>
              )}
              {position < ORDER_STEPS.length - 1 ? (
                <span aria-hidden="true" className="text-[var(--border-strong)]">
                  ›
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
