'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Checkbox, Field, Select, Textarea } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { replyToTicketAsTeamAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Envoi">
      Enregistrer
    </Button>
  );
}

export function TicketReplyForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    replyToTicketAsTeamAction,
    IDLE_STATE,
  );
  return (
    <form action={action} className="space-y-4">
      {state.status !== 'idle' && state.message ? (
        <Alert tone={state.status === 'error' ? 'danger' : 'success'} live="status">
          {state.message}
        </Alert>
      ) : null}
      <input type="hidden" name="ticketId" value={ticketId} />
      <Textarea name="body" rows={5} required minLength={2} maxLength={5000} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Après cette réponse, le ticket est">
          <Select name="status" defaultValue="waiting_customer">
            <option value="waiting_customer">En attente du client</option>
            <option value="resolved">Résolu</option>
            <option value="closed">Clos</option>
            <option value="waiting_support">Toujours chez nous</option>
          </Select>
        </Field>
        <div className="self-end">
          <Checkbox name="internal" label="Note interne (le client ne la voit pas)" />
        </div>
      </div>
      <SubmitButton />
    </form>
  );
}
