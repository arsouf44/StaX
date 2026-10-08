'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, FormErrorSummary } from '@nemasus/ui';
import { PasswordField } from '~/components/auth/password-field';
import { IDLE_STATE } from '~/lib/form-state';
import { updatePasswordAction, type AuthFormState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending} loadingLabel="Enregistrement">
      Enregistrer le mot de passe
    </Button>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(updatePasswordAction, IDLE_STATE);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.errors ? <FormErrorSummary errors={state.errors} /> : null}

      <input type="hidden" name="jeton" value={token} />

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
