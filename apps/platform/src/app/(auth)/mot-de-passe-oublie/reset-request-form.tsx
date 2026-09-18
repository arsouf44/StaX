'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input } from '@stax/ui';
import { TurnstileField } from '~/components/auth/turnstile-field';
import { IDLE_STATE } from '~/lib/form-state';
import { requestPasswordResetAction, type AuthFormState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending} loadingLabel="Envoi en cours">
      Envoyer le lien
    </Button>
  );
}

export function ResetRequestForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    IDLE_STATE,
  );

  if (state.status === 'success') {
    return (
      <Alert tone="success" live="status" title="Demande enregistrée">
        {state.message}
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}

      <div aria-hidden="true" className="sr-only">
        <label htmlFor="website">Ne remplissez pas ce champ</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Field label="Adresse e-mail" required>
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      <TurnstileField siteKey={turnstileSiteKey} />

      <SubmitButton />
    </form>
  );
}
