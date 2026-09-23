'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Panel, StatusPill } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import {
  connectExistingStripeAction,
  openStripeDashboardAction,
  startConnectOnboardingAction,
} from './actions';

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
  active: boolean;
  /** « J'ai deja un compte Stripe » : disponible si la liaison OAuth est configuree. */
  oauthAvailable: boolean;
  /** Retour de Stripe : relie, annule, deja-relie, lien-invalide, echec. */
  outcome: string | null;
}

const OUTCOMES: Record<string, { tone: 'success' | 'warning' | 'danger'; text: string }> = {
  relie: {
    tone: 'success',
    text: 'Votre compte Stripe est relié. Les paiements de votre site arriveront directement sur ce compte.',
  },
  retour: {
    tone: 'success',
    text: 'Merci. Stripe vérifie vos informations : le statut se met à jour automatiquement.',
  },
  annule: { tone: 'warning', text: 'Liaison annulée : rien n’a été modifié.' },
  'deja-relie': {
    tone: 'warning',
    text: 'Un autre compte Stripe actif est déjà relié à votre site. Déconnectez-le depuis Stripe avant d’en relier un nouveau.',
  },
  'lien-invalide': {
    tone: 'danger',
    text: 'Ce lien de retour n’est plus valable. Relancez la liaison depuis cette page.',
  },
  echec: {
    tone: 'danger',
    text: 'Stripe n’a pas pu finaliser la liaison. Réessayez dans quelques minutes.',
  },
};

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
  const [linkState, linkAction] = useActionState<ActionState, FormData>(
    connectExistingStripeAction,
    IDLE_STATE,
  );

  const error =
    (startState.status === 'error' ? startState.message : null) ??
    (dashboardState.status === 'error' ? dashboardState.message : null) ??
    (linkState.status === 'error' ? linkState.message : null);
  const outcome = view.outcome ? OUTCOMES[view.outcome] : null;

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

      {outcome ? (
        <Alert tone={outcome.tone} className="mt-4" live="status">
          {outcome.text}
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger" className="mt-4" live="alert">
          {error}
        </Alert>
      ) : null}

      <ul className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        {OWNERSHIP_POINTS.map((point) => (
          <li
            key={point.title}
            className="rounded-[var(--radius-md)] border border-[var(--border)] p-3"
          >
            <p className="font-medium">{point.title}</p>
            <p className="mt-1 text-[var(--foreground-muted)]">{point.text}</p>
          </li>
        ))}
      </ul>

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
          {!view.active ? (
            <form action={startAction}>
              <SubmitButton
                label={view.configured ? 'Compléter mes informations' : 'Créer mon compte Stripe'}
                pendingLabel="Ouverture de Stripe"
              />
            </form>
          ) : null}
          {!view.active && view.oauthAvailable ? (
            <form action={linkAction}>
              <SubmitButton
                label="J’ai déjà un compte Stripe"
                pendingLabel="Ouverture de Stripe"
                variant="secondary"
              />
            </form>
          ) : null}
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

/** Ce que le client doit comprendre en une lecture, sans jargon. */
const OWNERSHIP_POINTS = [
  {
    title: 'Votre argent',
    text: 'Les paiements de vos clients arrivent sur votre compte bancaire. StaX ne touche jamais cet argent et ne prend aucune commission.',
  },
  {
    title: 'Votre compte',
    text: 'Le compte Stripe est à votre nom. Vous vous y connectez avec vos propres identifiants, sur stripe.com.',
  },
  {
    title: 'Votre liberté',
    text: 'Remboursements, factures, relevés : tout se gère chez Stripe. Vous pouvez déconnecter StaX à tout moment.',
  },
];
