'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Checkbox } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { startProposalCheckoutAction } from './actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="accent"
      size="lg"
      block
      loading={pending}
      loadingLabel="Ouverture du paiement sécurisé"
    >
      {label}
    </Button>
  );
}

/** Deux cases, un bouton : rien d'autre à comprendre pour payer. */
export function ProposalPayForm({ proposalId, label }: { proposalId: string; label: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    startProposalCheckoutAction,
    IDLE_STATE,
  );

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="proposalId" value={proposalId} />
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}

      <Checkbox
        name="professionalUse"
        required
        label="J’achète ce site pour mon activité professionnelle."
      />
      <Checkbox
        name="acceptTerms"
        required
        label={
          <>
            J’accepte les{' '}
            <Link href="/cgv" className="underline underline-offset-4" target="_blank">
              conditions générales de vente
            </Link>{' '}
            et l’
            <Link
              href="/accord-de-traitement"
              className="underline underline-offset-4"
              target="_blank"
            >
              accord de traitement des données
            </Link>
            .
          </>
        }
      />

      <SubmitButton label={label} />
      <p className="text-center text-xs text-[var(--muted)]">
        Paiement sécurisé par Stripe. StaX ne voit jamais votre numéro de carte.
      </p>
    </form>
  );
}
