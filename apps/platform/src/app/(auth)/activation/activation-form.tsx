'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Checkbox, Field, FormErrorSummary, Input } from '@stax/ui';
import { PasswordField } from '~/components/auth/password-field';
import { TurnstileField } from '~/components/auth/turnstile-field';
import {
  completeActivationAction,
  verifyActivationCodeAction,
  type ActivationState,
} from '../actions';

/**
 * Activation en deux temps.
 *
 * Le code est d abord VERIFIE sans etre consomme : le compte n est cree que
 * lorsqu il est reconnu valide. Un code saisi de travers ne laisse donc aucun
 * compte orphelin derriere lui.
 */

const INITIAL: ActivationState = { status: 'idle', step: 'verify' };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending} loadingLabel={pendingLabel}>
      {label}
    </Button>
  );
}

export function ActivationForm({
  initialCode,
  initialEmail,
  turnstileSiteKey,
}: {
  initialCode: string;
  initialEmail: string;
  turnstileSiteKey: string | null;
}) {
  const [verifyState, verifyAction] = useActionState<ActivationState, FormData>(
    verifyActivationCodeAction,
    INITIAL,
  );
  const [completeState, completeAction] = useActionState<ActivationState, FormData>(
    completeActivationAction,
    INITIAL,
  );

  // Une erreur survenue a la seconde etape peut renvoyer a la premiere : c est
  // l etat le plus recent des deux qui decide de ce qui est affiche.
  const verified = verifyState.step === 'complete' && completeState.step !== 'verify';

  if (verified && verifyState.code && verifyState.email) {
    return (
      <form action={completeAction} className="space-y-5" noValidate>
        <Alert tone="success" live="status" title="Code validé">
          {verifyState.organizationName
            ? `Vous rejoignez « ${verifyState.organizationName} ». Créez votre mot de passe pour terminer.`
            : 'Créez votre mot de passe pour terminer.'}
        </Alert>

        {completeState.status === 'error' && completeState.message ? (
          <Alert tone="danger" live="alert">
            {completeState.message}
          </Alert>
        ) : null}
        {completeState.errors ? <FormErrorSummary errors={completeState.errors} /> : null}

        <input type="hidden" name="code" value={verifyState.code} />
        <input type="hidden" name="email" value={verifyState.email} />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Prénom" error={completeState.errors?.firstName} required>
            <Input name="firstName" autoComplete="given-name" required autoFocus />
          </Field>
          <Field label="Nom" error={completeState.errors?.lastName} required>
            <Input name="lastName" autoComplete="family-name" required />
          </Field>
        </div>

        <PasswordField error={completeState.errors?.password} />

        <Checkbox
          name="acceptTerms"
          required
          error={completeState.errors?.acceptTerms}
          label={
            <>
              J’accepte les{' '}
              <Link href="/cgv" className="underline underline-offset-4" target="_blank">
                conditions générales
              </Link>{' '}
              et la{' '}
              <Link
                href="/confidentialite"
                className="underline underline-offset-4"
                target="_blank"
              >
                politique de confidentialité
              </Link>
              .
            </>
          }
        />

        <SubmitButton label="Activer mon accès" pendingLabel="Activation en cours" />
      </form>
    );
  }

  const message = completeState.step === 'verify' ? completeState.message : verifyState.message;
  const isError =
    (completeState.step === 'verify' && completeState.status === 'error') ||
    verifyState.status === 'error';

  return (
    <form action={verifyAction} className="space-y-5" noValidate>
      {isError && message ? (
        <Alert tone="danger" live="alert" title="Code non valide">
          {message}
        </Alert>
      ) : null}

      <Field
        label="Code d’activation"
        error={verifyState.errors?.code}
        hint="12 caractères, tirets et espaces acceptés."
        required
      >
        <Input
          name="code"
          defaultValue={initialCode}
          autoComplete="one-time-code"
          spellCheck={false}
          required
          autoFocus
          className="font-mono tracking-[0.18em] uppercase"
        />
      </Field>

      <Field
        label="Adresse e-mail"
        error={verifyState.errors?.email}
        hint="Celle à laquelle le code a été envoyé."
        required
      >
        <Input name="email" type="email" defaultValue={initialEmail} autoComplete="email" required />
      </Field>

      <TurnstileField siteKey={turnstileSiteKey} />

      <SubmitButton label="Vérifier mon code" pendingLabel="Vérification" />
    </form>
  );
}
