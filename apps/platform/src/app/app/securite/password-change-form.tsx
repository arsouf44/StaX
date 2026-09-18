'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, FormErrorSummary, Input } from '@stax/ui';
import { PasswordField } from '~/components/auth/password-field';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { changePasswordAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Enregistrement">
      Changer mon mot de passe
    </Button>
  );
}

export function PasswordChangeForm() {
  const [state, action] = useActionState<ActionState, FormData>(changePasswordAction, IDLE_STATE);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.status === 'success' && state.message ? (
        <Alert tone="success" live="status">
          {state.message}
        </Alert>
      ) : null}
      {state.errors ? <FormErrorSummary errors={state.errors} /> : null}

      <Field label="Mot de passe actuel" error={state.errors?.currentPassword} required>
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>

      <PasswordField label="Nouveau mot de passe" error={state.errors?.password} />

      <Field
        label="Confirmer le nouveau mot de passe"
        error={state.errors?.confirmPassword}
        required
      >
        <Input name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>

      <SubmitButton />
    </form>
  );
}
