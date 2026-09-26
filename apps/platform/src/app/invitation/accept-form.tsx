'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { acceptInvitationAction } from './actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending} loadingLabel="Un instant">
      {label}
    </Button>
  );
}

export function AcceptInvitationForm({ token, label }: { token: string; label: string }) {
  const [state, action] = useActionState<ActionState, FormData>(acceptInvitationAction, IDLE_STATE);
  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton label={label} />
    </form>
  );
}
