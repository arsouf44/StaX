'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Panel, Textarea } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { startImpersonationAction } from '~/app/admin/assistance/actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Ouverture">
      Ouvrir l’éditeur de ce site
    </Button>
  );
}

/**
 * Intervenir sur le site d'un client (creation, correction, publication,
 * restauration). Ouvre une session d'assistance : motif obligatoire, duree
 * limitee, et chaque action apparait dans l'historique du client comme
 * faite par l'equipe StaX.
 */
export function InterveneForm({
  organizationId,
  siteId,
}: {
  organizationId: string;
  siteId: string;
}) {
  const [state, setState] = useState<ActionState>(IDLE_STATE);
  return (
    <Panel level={1} padding="lg">
      <h2 className="text-sm font-medium">Intervenir sur ce site</h2>
      <p className="mt-1 text-sm text-[var(--foreground-muted)]">
        Ouvre l’éditeur du client pour 60 minutes au plus. Le client voit votre intervention dans
        son historique, avec votre motif.
      </p>
      <form
        action={(formData) => startImpersonationAction(IDLE_STATE, formData).then(setState)}
        className="mt-4 space-y-4"
      >
        <input type="hidden" name="organizationId" value={organizationId} />
        <input type="hidden" name="siteId" value={siteId} />
        <input type="hidden" name="durationMinutes" value="60" />
        {state.status === 'error' && state.message ? (
          <Alert tone="danger" live="alert">
            {state.message}
          </Alert>
        ) : null}
        <Field label="Motif" required hint="Dix caractères minimum, conservé dans le journal.">
          <Textarea name="reason" rows={2} required minLength={10} maxLength={500} />
        </Field>
        <Submit />
      </form>
    </Panel>
  );
}
