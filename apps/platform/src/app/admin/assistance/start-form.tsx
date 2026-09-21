'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input, Panel, Select, Textarea } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { startImpersonationAction } from './actions';

export interface OrganizationChoice {
  id: string;
  label: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Ouverture">
      Ouvrir la session d’assistance
    </Button>
  );
}

export function StartSupportForm({
  organizations,
  maxMinutes,
}: {
  organizations: OrganizationChoice[];
  maxMinutes: number;
}) {
  const [state, setState] = useState<ActionState>(IDLE_STATE);

  const submit = (formData: FormData) =>
    startImpersonationAction(IDLE_STATE, formData).then(setState);

  return (
    <Panel level={2} padding="lg">
      <form action={submit} className="space-y-5" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger" live="alert">
            {state.message}
          </Alert>
        ) : null}

        <Field label="Client à assister" required>
          <Select name="organizationId" required defaultValue="">
            <option value="" disabled>
              Choisissez un client…
            </option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Motif"
          required
          hint="Dix caractères minimum. Conservé dans le journal et visible par le client. Exemple : « Ticket T-2601-AB3F : la carte ne s’affiche pas »."
        >
          <Textarea name="reason" rows={3} required minLength={10} maxLength={500} />
        </Field>

        <Field
          label="Durée (minutes)"
          hint={`${maxMinutes} minutes au maximum. La session se ferme toute seule à l’échéance.`}
        >
          <Input name="durationMinutes" type="number" min={5} max={maxMinutes} defaultValue={30} />
        </Field>

        <div className="border-t border-[var(--border)] pt-5">
          <SubmitButton />
        </div>
      </form>
    </Panel>
  );
}
