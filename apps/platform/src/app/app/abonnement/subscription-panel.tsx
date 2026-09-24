'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Alert,
  Button,
  Dialog,
  Field,
  Panel,
  Select,
  StatusPill,
  Switch,
  Textarea,
} from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import {
  openBillingPortalAction,
  requestCancellationAction,
  resumeSubscriptionAction,
} from './actions';

export interface SubscriptionView {
  id: string;
  statusLabel: string;
  statusTone: StatusTone;
  priceLabel: string;
  periodEndLabel: string | null;
  cancelAtPeriodEnd: boolean;
  isPastDue: boolean;
  canManage: boolean;
}

const REASONS = [
  { value: 'no_longer_needed', label: 'Je n’en ai plus besoin' },
  { value: 'too_expensive', label: 'C’est trop cher pour moi' },
  { value: 'missing_features', label: 'Il manque des fonctionnalités' },
  { value: 'switching_provider', label: 'Je change de prestataire' },
  { value: 'business_closing', label: 'Mon activité s’arrête' },
  { value: 'other', label: 'Autre raison' },
];

function SubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary' | 'ghost';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} loadingLabel={pendingLabel}>
      {label}
    </Button>
  );
}

export function SubscriptionPanel({ subscription }: { subscription: SubscriptionView }) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelState, setCancelState] = useState<ActionState>(IDLE_STATE);
  const [rowState, setRowState] = useState<ActionState>(IDLE_STATE);

  const cancel = (formData: FormData) =>
    requestCancellationAction(IDLE_STATE, formData).then((result) => {
      setCancelState(result);
      if (result.status === 'success') setCancelling(false);
    });

  const resume = (formData: FormData) =>
    resumeSubscriptionAction(IDLE_STATE, formData).then(setRowState);

  const portal = (formData: FormData) =>
    openBillingPortalAction(IDLE_STATE, formData).then(setRowState);

  return (
    <div className="space-y-6">
      {rowState.status === 'error' && rowState.message ? (
        <Alert tone="danger" live="alert">
          {rowState.message}
        </Alert>
      ) : null}
      {rowState.status === 'success' && rowState.message ? (
        <Alert tone="success" live="status">
          {rowState.message}
        </Alert>
      ) : null}
      {cancelState.status === 'success' && cancelState.message ? (
        <Alert tone="info" live="status">
          {cancelState.message}
        </Alert>
      ) : null}

      <Panel level={2} padding="lg">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Votre maintenance</h2>
            <p className="mt-2 text-2xl font-medium tracking-[-0.02em]">
              {subscription.priceLabel}
            </p>
            {subscription.periodEndLabel ? (
              <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                {subscription.cancelAtPeriodEnd
                  ? `Votre maintenance prend fin le ${subscription.periodEndLabel}.`
                  : `Prochaine échéance le ${subscription.periodEndLabel}.`}
              </p>
            ) : null}
          </div>
          <StatusPill tone={subscription.statusTone}>{subscription.statusLabel}</StatusPill>
        </div>

        {subscription.isPastDue ? (
          <Alert tone="warning" className="mt-5" live="status" title="Paiement en attente">
            Votre dernier prélèvement n’a pas abouti. Mettez à jour votre moyen de paiement : votre
            site reste en ligne pendant ce temps, nous ne coupons rien sans vous prévenir.
          </Alert>
        ) : null}

        {subscription.canManage ? (
          <div className="mt-6 flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
            <form action={portal}>
              <SubmitButton
                label="Moyen de paiement et factures"
                pendingLabel="Ouverture"
                variant="secondary"
              />
            </form>

            {subscription.cancelAtPeriodEnd ? (
              <form action={resume}>
                <input type="hidden" name="subscriptionId" value={subscription.id} />
                <SubmitButton label="Reprendre ma maintenance" pendingLabel="Reprise" />
              </form>
            ) : (
              <Button variant="ghost" onClick={() => setCancelling(true)}>
                Résilier votre contrat
              </Button>
            )}
          </div>
        ) : (
          <p className="mt-6 border-t border-[var(--border)] pt-5 text-sm text-[var(--foreground-muted)]">
            Seul un propriétaire de votre organisation peut modifier l’abonnement.
          </p>
        )}
      </Panel>

      <Dialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        size="md"
        title="Résilier votre contrat"
        description="Résiliation de votre maintenance mensuelle, en ligne et sans justification."
      >
        <form action={cancel} className="space-y-5" noValidate>
          <input type="hidden" name="subscriptionId" value={subscription.id} />

          {cancelState.status === 'error' && cancelState.message ? (
            <Alert tone="danger" live="alert">
              {cancelState.message}
            </Alert>
          ) : null}

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm leading-relaxed text-[var(--foreground-muted)]">
            <p className="font-medium text-[var(--foreground)]">Ce qui se passe ensuite</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Votre site reste en ligne jusqu’à la fin de la période déjà réglée
                {subscription.periodEndLabel ? ` (${subscription.periodEndLabel})` : ''}.
              </li>
              <li>Vous pouvez revenir en arrière à tout moment jusqu’à cette date.</li>
              <li>
                Ensuite, après une période de continuité, votre site peut être suspendu : vos
                données restent conservées et exportables, et vous pouvez demander une copie du code
                source de votre site.
              </li>
              <li>Votre nom de domaine vous appartient : vous le gardez.</li>
            </ul>
          </div>

          <Field
            label="Pourquoi nous quittez-vous ?"
            hint="Facultatif : vous n’avez pas à vous justifier."
          >
            <Select name="reason" defaultValue="">
              <option value="">Je préfère ne pas le préciser</option>
              {REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Voulez-vous nous en dire plus ?" hint="Facultatif.">
            <Textarea name="comment" rows={3} maxLength={2000} />
          </Field>

          <Switch
            name="confirm"
            label="Je confirme vouloir résilier ma maintenance"
            description="Rien n’est définitif avant la fin de la période en cours. Vous recevrez une confirmation par e-mail."
          />

          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
            <SubmitButton
              label="Confirmer la résiliation"
              pendingLabel="Envoi"
              variant="secondary"
            />
            <Button variant="ghost" onClick={() => setCancelling(false)}>
              Garder ma maintenance
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
