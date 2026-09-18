'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Panel, StatusPill } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { openStripeDashboardAction, startConnectOnboardingAction } from './actions';

export interface ConnectView {
  configured: boolean;
  statusLabel: string;
  statusTone: StatusTone;
  help: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: string[];
  disabledReason: string | null;
  lastSyncedLabel: string | null;
  canManage: boolean;
}

function SubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} loadingLabel={pendingLabel}>
      {label}
    </Button>
  );
}

export function ConnectPanel({ view }: { view: ConnectView }) {
  const [startState, startAction] = useActionState<ActionState, FormData>(
    startConnectOnboardingAction,
    IDLE_STATE,
  );
  const [dashboardState, dashboardAction] = useActionState<ActionState, FormData>(
    openStripeDashboardAction,
    IDLE_STATE,
  );

  const error =
    (startState.status === 'error' ? startState.message : null) ??
    (dashboardState.status === 'error' ? dashboardState.message : null);

  return (
    <Panel level={2} padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Encaissement en ligne</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-[var(--foreground-muted)]">
            {view.help}
          </p>
        </div>
        <StatusPill tone={view.statusTone}>{view.statusLabel}</StatusPill>
      </div>

      {error ? (
        <Alert tone="danger" className="mt-4" live="alert">
          {error}
        </Alert>
      ) : null}

      {view.disabledReason ? (
        <Alert tone="warning" className="mt-4" live="status" title="Compte limité par Stripe">
          Stripe a suspendu une partie de votre compte. Ouvrez votre tableau de bord Stripe pour
          voir ce qui est demandé.
        </Alert>
      ) : null}

      {view.requirements.length > 0 ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-sm font-medium">Stripe attend encore des informations</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--foreground-muted)]">
            {view.requirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--muted)]">Encaissements</dt>
          <dd className="mt-1 text-sm">
            {view.chargesEnabled ? 'Vous pouvez encaisser' : 'Pas encore possible'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Virements vers votre banque</dt>
          <dd className="mt-1 text-sm">{view.payoutsEnabled ? 'Actifs' : 'Pas encore actifs'}</dd>
        </div>
      </dl>

      {view.canManage ? (
        <div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
          <form action={startAction}>
            <SubmitButton
              label={view.configured ? 'Compléter mes informations' : 'Activer les paiements'}
              pendingLabel="Ouverture de Stripe"
            />
          </form>
          {view.configured ? (
            <form action={dashboardAction}>
              <SubmitButton
                label="Ouvrir mon tableau de bord Stripe"
                pendingLabel="Ouverture"
                variant="secondary"
              />
            </form>
          ) : null}
        </div>
      ) : (
        <p className="mt-6 border-t border-[var(--border)] pt-5 text-sm text-[var(--foreground-muted)]">
          Seul un propriétaire de votre organisation peut configurer l’encaissement en ligne.
        </p>
      )}

      {view.lastSyncedLabel ? (
        <p className="mt-4 text-xs text-[var(--muted)]">
          Dernière synchronisation avec Stripe : {view.lastSyncedLabel}.
        </p>
      ) : null}
    </Panel>
  );
}
