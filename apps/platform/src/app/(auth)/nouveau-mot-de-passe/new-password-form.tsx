'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input } from '@stax/ui';
import { PasswordField } from '~/components/auth/password-field';
import { IDLE_STATE, updatePasswordAction, type AuthFormState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending} loadingLabel="Enregistrement">
      Enregistrer le mot de passe
    </Button>
  );
}

export function NewPasswordForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(updatePasswordAction, IDLE_STATE);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}

      <PasswordField error={state.errors?.password} />

      <Field label="Confirmer le mot de passe" error={state.errors?.confirmPassword} required>
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>

      <SubmitButton />
    </form>
  );
}
