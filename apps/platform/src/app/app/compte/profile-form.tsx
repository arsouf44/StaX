'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Checkbox, Field, Input } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { updateProfileAction } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Enregistrement">
      Enregistrer
    </Button>
  );
}

export function ProfileForm({
  firstName,
  lastName,
  phone,
  email,
  marketingOptIn,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  marketingOptIn: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(updateProfileAction, IDLE_STATE);

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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Prénom" error={state.errors?.firstName} required>
          <Input name="firstName" defaultValue={firstName} autoComplete="given-name" required />
        </Field>
        <Field label="Nom" error={state.errors?.lastName} required>
          <Input name="lastName" defaultValue={lastName} autoComplete="family-name" required />
        </Field>
      </div>

      <Field label="Téléphone" error={state.errors?.phone}>
        <Input name="phone" type="tel" defaultValue={phone} autoComplete="tel" />
      </Field>

      <Field label="Adresse e-mail" hint="Elle sert à vous connecter. Sa modification se demande à l’assistance.">
        <Input value={email} readOnly disabled />
      </Field>

      <Checkbox
        name="marketingOptIn"
        defaultChecked={marketingOptIn}
        label="Je souhaite recevoir les actualités de StaX par e-mail."
        description="Désinscription en un clic, depuis n’importe quel message."
      />

      <SubmitButton />
    </form>
  );
}
