'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Checkbox, Field, FormErrorSummary, Input } from '@stax/ui';
import { PasswordField } from '~/components/auth/password-field';
import { TurnstileField } from '~/components/auth/turnstile-field';
import { IDLE_STATE } from '~/lib/form-state';
import { signUpAction, type AuthFormState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending} loadingLabel="Création du compte">
      Créer mon compte
    </Button>
  );
}

export function SignUpForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signUpAction, IDLE_STATE);

  if (state.status === 'success') {
    return (
      <Alert tone="success" live="status" title="Vérifiez votre boîte de réception">
        {state.message}
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.errors ? <FormErrorSummary errors={state.errors} /> : null}

      {/* Champ piege : invisible pour un humain, rempli par les robots. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="website">Ne remplissez pas ce champ</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Prénom" error={state.errors?.firstName} required>
          <Input name="firstName" autoComplete="given-name" required autoFocus />
        </Field>
        <Field label="Nom" error={state.errors?.lastName} required>
          <Input name="lastName" autoComplete="family-name" required />
        </Field>
      </div>

      <Field label="Adresse e-mail" error={state.errors?.email} required>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>

      <Field
        label="Téléphone"
        error={state.errors?.phone}
        hint="Facultatif. Utile pour vous joindre rapidement pendant la création du site."
      >
        <Input name="phone" type="tel" autoComplete="tel" />
      </Field>

      <PasswordField error={state.errors?.password} />

      <Checkbox
        name="acceptTerms"
        required
        label={
          <>
            J’accepte les{' '}
            <Link href="/cgv" className="underline underline-offset-4" target="_blank">
              conditions générales de vente
            </Link>{' '}
            et la{' '}
            <Link href="/confidentialite" className="underline underline-offset-4" target="_blank">
              politique de confidentialité
            </Link>
            .
          </>
        }
        error={state.errors?.acceptTerms}
      />

      <Checkbox
        name="marketingOptIn"
        label="Je souhaite recevoir les actualités de StaX par e-mail. Désinscription en un clic."
      />

      <TurnstileField siteKey={turnstileSiteKey} />

      <SubmitButton />
    </form>
  );
}
