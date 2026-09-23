'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Checkbox } from '@stax/ui';
import { IDLE_STATE as CHECKOUT_IDLE } from '~/lib/form-state';
import { createInternalOrderAction, startCheckoutAction, type CheckoutState } from './actions';

function SubmitButton({ internal }: { internal: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      block
      size="lg"
      loading={pending}
      loadingLabel={internal ? 'Création du site' : 'Ouverture du paiement'}
    >
      {internal ? 'Créer le site maintenant' : 'Régler et lancer mon projet'}
    </Button>
  );
}

/**
 * Compte interne StaX : aucun paiement. La confirmation reste explicite — on
 * ne cree pas un site d un clic involontaire — mais elle ne parle ni de CGV ni
 * de garantie, qui n ont pas d objet sans vente.
 */
export function InternalOrderForm() {
  const [state, action] = useActionState<CheckoutState, FormData>(
    createInternalOrderAction,
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
        label="Je confirme la création de ce site dans le cadre d’une commande interne StaX, sans paiement."
      />

      <SubmitButton internal />
    </form>
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
        name="professionalUse"
        required
        label="Je commande pour les besoins de mon activité professionnelle (entreprise, indépendant, profession libérale) ou de mon association."
      />

      <Checkbox
        name="acceptTerms"
        required
        label={
          <>
            J’accepte les{' '}
            <Link href="/cgv" target="_blank" className="underline underline-offset-4">
              conditions générales de vente
            </Link>{' '}
            (version {termsVersion}) et l’
            <Link
              href="/accord-de-traitement"
              target="_blank"
              className="underline underline-offset-4"
            >
              accord de traitement des données
            </Link>
            , et je comprends que la garantie commerciale de {refundWindowDays} jours court à partir
            de la mise en ligne de mon site.
          </>
        }
      />

      <SubmitButton internal={false} />
    </form>
  );
}
