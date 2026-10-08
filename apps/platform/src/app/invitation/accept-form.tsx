'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Alert, Button, Checkbox, Field, FormErrorSummary, Input } from '@nemasus/ui';
import { PasswordField } from '~/components/auth/password-field';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { acceptInvitationAction, acceptInvitationWithNewAccountAction } from './actions';

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

/** Personne invitée sans compte : le compte est créé pour l'adresse invitée. */
export function InvitationSignupForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState<ActionState, FormData>(
    acceptInvitationWithNewAccountAction,
    IDLE_STATE,
  );
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.errors ? <FormErrorSummary errors={state.errors} /> : null}
      <input type="hidden" name="token" value={token} />

      <Field label="Adresse e-mail" hint="L’adresse qui a reçu l’invitation.">
        <Input value={email} readOnly disabled />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Prénom" error={state.errors?.firstName} required>
          <Input name="firstName" autoComplete="given-name" required />
        </Field>
        <Field label="Nom" error={state.errors?.lastName} required>
          <Input name="lastName" autoComplete="family-name" required />
        </Field>
      </div>
      <PasswordField error={state.errors?.password} />
      <PasswordField
        name="confirmPassword"
        label="Confirmez le mot de passe"
        error={state.errors?.confirmPassword}
        showStrength={false}
      />
      <Checkbox
        name="acceptTerms"
        required
        label={
          <>
            J’accepte les{' '}
            <Link href="/cgu" target="_blank" className="underline underline-offset-4">
              conditions générales d’utilisation
            </Link>
            .
          </>
        }
      />
      <SubmitButton label="Créer mon compte et rejoindre l’espace" />
    </form>
  );
}
