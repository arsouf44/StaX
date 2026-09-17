'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Checkbox } from '@stax/ui';
import { CHECKOUT_IDLE, startCheckoutAction, type CheckoutState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block size="lg" loading={pending} loadingLabel="Ouverture du paiement">
      Régler et lancer mon projet
    </Button>
  );
}

export function CheckoutForm({
  termsVersion,
  refundWindowDays,
}: {
  termsVersion: string;
  refundWindowDays: number;
}) {
  const [state, action] = useActionState<CheckoutState, FormData>(
    startCheckoutAction,
    CHECKOUT_IDLE,
  );

  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}

      <Checkbox
        name="acceptTerms"
        required
        label={
          <>
            J’accepte les{' '}
            <Link href="/cgv" target="_blank" className="underline underline-offset-4">
              conditions générales de vente
            </Link>{' '}
            (version {termsVersion}) et je comprends que la garantie commerciale de{' '}
            {refundWindowDays} jours court à partir de la mise en ligne de mon site.
          </>
        }
      />

      <SubmitButton />
    </form>
  );
}
