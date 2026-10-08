'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Checkbox } from '@nemasus/ui';
import { TurnstileField } from '~/components/auth/turnstile-field';
import { IDLE_STATE } from '~/lib/form-state';
import { createInternalOrderAction, submitOrderAction, type OrderSubmitState } from './actions';

function SubmitButton({ internal }: { internal: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      block
      size="lg"
      loading={pending}
      loadingLabel={internal ? 'Enregistrement de la commande' : 'Envoi de la commande'}
    >
      {internal ? 'Enregistrer la commande interne' : 'Envoyer ma commande'}
    </Button>
  );
}

/**
 * Compte interne Nemasus : aucun paiement. La confirmation reste explicite — on
 * n'enregistre pas une commande d'un clic involontaire.
 */
export function InternalOrderForm() {
  const [state, action] = useActionState<OrderSubmitState, FormData>(
    createInternalOrderAction,
    IDLE_STATE,
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
        label="Je confirme cette commande interne Nemasus, sans paiement."
      />

      <SubmitButton internal />
    </form>
  );
}

export function OrderForm({
  termsVersion,
  turnstileSiteKey,
}: {
  termsVersion: string;
  turnstileSiteKey: string | null;
}) {
  const [state, action] = useActionState<OrderSubmitState, FormData>(submitOrderAction, IDLE_STATE);

  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}

      {/* Champ piège : invisible pour une personne, rempli par les robots. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="o-website">Ne remplissez pas ce champ</label>
        <input id="o-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

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
            .
          </>
        }
      />

      <TurnstileField siteKey={turnstileSiteKey} />

      <SubmitButton internal={false} />
    </form>
  );
}
