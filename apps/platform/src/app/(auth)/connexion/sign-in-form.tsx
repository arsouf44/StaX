'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input } from '@stax/ui';
import { TurnstileField } from '~/components/auth/turnstile-field';
import { IDLE_STATE, signInAction, type AuthFormState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending} loadingLabel="Connexion en cours">
      Se connecter
    </Button>
  );
}

export function SignInForm({
  redirectTo,
  turnstileSiteKey,
  notice,
}: {
  redirectTo: string;
  turnstileSiteKey: string | null;
  notice?: string;
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(signInAction, IDLE_STATE);

  return (
    <form action={action} className="space-y-5" noValidate>
      {notice ? (
        <Alert tone="success" live="status">
          {notice}
        </Alert>
      ) : null}

      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert" title="Connexion impossible">
          {state.message}
        </Alert>
      ) : null}

      <input type="hidden" name="redirectTo" value={redirectTo} />

      <Field label="Adresse e-mail" required>
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>

      <Field label="Mot de passe" required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      <TurnstileField siteKey={turnstileSiteKey} />

      <SubmitButton />

      <p className="text-center text-sm">
        <Link
          href="/mot-de-passe-oublie"
          className="text-[var(--foreground-muted)] underline underline-offset-4 hover:text-[var(--foreground)]"
        >
          Mot de passe oublié ?
        </Link>
      </p>
    </form>
  );
}
