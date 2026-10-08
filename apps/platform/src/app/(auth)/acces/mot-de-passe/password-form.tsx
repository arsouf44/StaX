'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, FormErrorSummary } from '@nemasus/ui';
import { PasswordField } from '~/components/auth/password-field';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { setFirstPasswordAction } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending} loadingLabel="Enregistrement">
      Enregistrer et ouvrir mon espace
    </Button>
  );
}

export function FirstPasswordForm() {
  const [state, action] = useActionState<ActionState, FormData>(setFirstPasswordAction, IDLE_STATE);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.errors ? <FormErrorSummary errors={state.errors} /> : null}

      <PasswordField label="Nouveau mot de passe" error={state.errors?.password} />
      <PasswordField
        name="confirmPassword"
        label="Confirmez le mot de passe"
        error={state.errors?.confirmPassword}
        showStrength={false}
      />

      <SubmitButton />
    </form>
  );
}
