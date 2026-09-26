'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Textarea } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { replyAsTeamAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Envoi">
      Répondre
    </Button>
  );
}

export function TeamReplyForm({ projectId }: { projectId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(replyAsTeamAction, IDLE_STATE);
  return (
    <form action={action} className="space-y-3">
      {state.status !== 'idle' && state.message ? (
        <Alert tone={state.status === 'error' ? 'danger' : 'success'} live="status">
          {state.message}
        </Alert>
      ) : null}
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor="team-reply" className="sr-only">
        Votre réponse
      </label>
      <Textarea
        id="team-reply"
        name="body"
        rows={5}
        required
        minLength={2}
        maxLength={5000}
        placeholder="Votre réponse au client. Simple et concrète : il n’est pas technicien."
      />
      <SubmitButton />
    </form>
  );
}
