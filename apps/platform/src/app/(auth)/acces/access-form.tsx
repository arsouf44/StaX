'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input } from '@nemasus/ui';
import { TurnstileField } from '~/components/auth/turnstile-field';
import { accessWithCodeAction, type AccessState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending} loadingLabel="Vérification du code">
      Accéder à mon site
    </Button>
  );
}

/**
 * Saisie du code d'accès. Le code peut arriver prérempli par le lien de
 * l'e-mail, mais rien n'est vérifié ni consommé avant le clic : un antivirus
 * de messagerie qui « visite » le lien ne brûle pas le code.
 */
export function AccessForm({
  defaultCode,
  turnstileSiteKey,
}: {
  defaultCode: string;
  turnstileSiteKey: string | null;
}) {
  const [state, action] = useActionState<AccessState, FormData>(accessWithCodeAction, {
    status: 'idle',
  });
  const code = state.code ?? defaultCode;

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert" title="Accès impossible">
          {state.message}
        </Alert>
      ) : null}

      {/* Champ piège : invisible pour une personne, rempli par les robots. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="a-website">Ne remplissez pas ce champ</label>
        <input id="a-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Field
        label="Code d’accès"
        required
        hint="12 caractères, tirets et espaces facultatifs. Il figure dans l’e-mail reçu après votre paiement."
      >
        <Input
          key={code}
          name="code"
          required
          defaultValue={code}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={40}
          autoFocus
          placeholder="XXXX-XXXX-XXXX"
          aria-invalid={state.status === 'error' ? true : undefined}
          className="h-14 text-center font-mono text-xl tracking-[0.2em] uppercase"
        />
      </Field>

      <TurnstileField siteKey={turnstileSiteKey} />

      <SubmitButton />

      <p className="text-center text-sm text-[var(--foreground-muted)]">
        Vous avez déjà utilisé votre code ?{' '}
        <Link href="/connexion" className="text-[var(--foreground)] underline underline-offset-4">
          Connectez-vous
        </Link>
      </p>
    </form>
  );
}
