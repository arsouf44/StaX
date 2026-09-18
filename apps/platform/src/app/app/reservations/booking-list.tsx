'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, EmptyState, Icon, Panel, StatusPill } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { updateBookingStatusAction } from './actions';

export interface BookingView {
  id: string;
  reference: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  partySize: number;
  serviceName: string | null;
  startsAtIso: string;
  startsAtLabel: string;
  status: string;
  statusLabel: string;
  statusTone: StatusTone;
  /** Transitions reellement autorisees, calculees cote serveur. */
  actions: Array<{ status: string; label: string; tone: 'primary' | 'secondary' | 'ghost' }>;
}

function TransitionButton({
  label,
  tone,
}: {
  label: string;
  tone: 'primary' | 'secondary' | 'ghost';
}) {
  const { pending } = useFormStatus();
  const classes = {
    primary:
      'bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-strong)] border-transparent',
    secondary:
      'border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--surface-3)]',
    ghost: 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]',
  } as const;

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-8 items-center rounded-[var(--radius-sm)] border px-3 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-50 ${classes[tone]}`}
    >
      {pending ? 'Enregistrement…' : label}
    </button>
  );
}

export function BookingList({ bookings }: { bookings: BookingView[] }) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateBookingStatusAction,
    IDLE_STATE,
  );

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="calendar-check" size={24} />}
        title="Aucune demande de réservation"
        description="Les demandes envoyées depuis votre site apparaîtront ici, et vous serez prévenu par e-mail."
      />
    );
  }

  return (
    <div className="space-y-3">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.status === 'success' && state.message ? (
        <Alert tone="success" live="status">
          {state.message}
        </Alert>
      ) : null}

      <ul className="space-y-3">
        {bookings.map((booking) => (
          <li key={booking.id}>
            <Panel level={1} padding="md">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <time dateTime={booking.startsAtIso}>{booking.startsAtLabel}</time>
                    {booking.serviceName ? (
                      <span className="text-[var(--foreground-muted)]"> · {booking.serviceName}</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                    {booking.customerName} · {booking.partySize}{' '}
                    {booking.partySize > 1 ? 'personnes' : 'personne'}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    <span className="font-mono">{booking.reference}</span>
                    {booking.customerPhone ? (
                      <>
                        {' · '}
                        <a
                          href={`tel:${booking.customerPhone}`}
                          className="underline underline-offset-4"
                        >
                          {booking.customerPhone}
                        </a>
                      </>
                    ) : null}
                    {booking.customerEmail ? (
                      <>
                        {' · '}
                        <a
                          href={`mailto:${booking.customerEmail}`}
                          className="underline underline-offset-4"
                        >
                          {booking.customerEmail}
                        </a>
                      </>
                    ) : null}
                  </p>
                  {booking.customerNote ? (
                    <p className="mt-2 max-w-prose rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
                      {booking.customerNote}
                    </p>
                  ) : null}
                </div>
                <StatusPill tone={booking.statusTone}>{booking.statusLabel}</StatusPill>
              </div>

              {booking.actions.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                  {booking.actions.map((transition) => (
                    <form key={transition.status} action={action}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <input type="hidden" name="status" value={transition.status} />
                      <TransitionButton label={transition.label} tone={transition.tone} />
                    </form>
                  ))}
                </div>
              ) : null}
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
