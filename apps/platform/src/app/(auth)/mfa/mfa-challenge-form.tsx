'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input } from '@stax/ui';
import { IDLE_STATE } from '~/lib/form-state';
import type { AuthFormState } from '../actions';
import { verifyMfaChallengeAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending} loadingLabel="Vérification">
      Valider
    </Button>
  );
}

export function MfaChallengeForm({
  factorId,
  challengeId,
  redirectTo,
}: {
  factorId: string;
  challengeId: string;
  redirectTo: string;
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    verifyMfaChallengeAction,
    IDLE_STATE,
  );

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}

      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="challengeId" value={challengeId} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <Field label="Code à six chiffres" error={state.errors?.code} required>
        <Input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="text-center font-mono text-lg tracking-[0.4em]"
        />
      </Field>

      <SubmitButton />

      <p className="text-center text-xs text-[var(--muted)]">
        Le code change toutes les 30 secondes. Si la validation échoue systématiquement, vérifiez
        que l’heure de votre téléphone est réglée automatiquement.
      </p>
    </form>
  );
}
