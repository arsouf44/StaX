'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { claimProposalAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending} loadingLabel="Vérification">
      Récupérer mon site
    </Button>
  );
}

export function ClaimForm({ defaultCode }: { defaultCode: string }) {
  const [state, action] = useActionState<ActionState, FormData>(claimProposalAction, IDLE_STATE);

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}

      <Field
        label="Votre code"
        required
        hint="Il figure dans l’e-mail reçu. Tirets et espaces acceptés."
      >
        <Input
          name="code"
          required
          defaultValue={defaultCode}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="7K2M-9QXP-4HTA"
          className="font-mono text-lg tracking-[0.18em] uppercase"
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
