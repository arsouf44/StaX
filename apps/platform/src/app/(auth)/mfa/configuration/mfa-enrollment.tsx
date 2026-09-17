'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { Alert, Button, Field, Input, Spinner } from '@stax/ui';
import {
  confirmMfaEnrollmentAction,
  startMfaEnrollmentAction,
  type MfaEnrollState,
} from '../actions';

const INITIAL: MfaEnrollState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending} loadingLabel="Vérification">
      Activer la double authentification
    </Button>
  );
}

/**
 * Enrolement TOTP.
 *
 * Le secret est affiche en clair sous le QR code : c est necessaire pour les
 * personnes qui saisissent le code a la main, et il ne quitte de toute facon
 * jamais la session de la personne concernee.
 */
export function MfaEnrollment({ mandatory }: { mandatory: boolean }) {
  const [enrollment, setEnrollment] = useState<MfaEnrollState | null>(null);
  const [state, action] = useActionState<MfaEnrollState, FormData>(
    confirmMfaEnrollmentAction,
    INITIAL,
  );

  useEffect(() => {
    let active = true;
    void startMfaEnrollmentAction().then((result) => {
      if (active) setEnrollment(result);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!enrollment) {
    return (
      <div className="flex items-center gap-3 text-sm text-[var(--foreground-muted)]">
        <Spinner />
        Préparation de l’enrôlement…
      </div>
    );
  }

  if (enrollment.status === 'error' || !enrollment.factorId) {
    return (
      <Alert tone="danger" live="alert" title="Enrôlement impossible">
        {enrollment.message ?? 'Réessayez dans quelques instants.'}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-4 text-sm text-[var(--foreground-muted)]">
        <li>
          <strong className="text-[var(--foreground)]">1.</strong> Installez une application
          d’authentification si vous n’en avez pas : Google Authenticator, Microsoft Authenticator,
          Aegis, 1Password ou Bitwarden font très bien l’affaire.
        </li>
        <li>
          <strong className="text-[var(--foreground)]">2.</strong> Scannez ce code avec elle.
        </li>
      </ol>

      {enrollment.qrCode ? (
        <div className="flex justify-center rounded-[var(--radius-md)] bg-white p-4">
          {/* Le QR code est une image SVG en ligne (data URI) produite par
              Supabase pour cette session : il n y a rien a optimiser, et
              next/image ne sait pas traiter une data URI. */}
          <img
            src={enrollment.qrCode}
            alt="Code QR à scanner avec votre application d’authentification"
            width={200}
            height={200}
          />
        </div>
      ) : null}

      {enrollment.secret ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--foreground-muted)]">
            Impossible de scanner ? Saisir la clé manuellement
          </summary>
          <p className="mt-2 rounded-[var(--radius-sm)] bg-[var(--background-inset)] p-3 font-mono text-xs break-all">
            {enrollment.secret}
          </p>
        </details>
      ) : null}

      <form action={action} className="space-y-5" noValidate>
        {state.status === 'error' && state.message ? (
          <Alert tone="danger" live="alert">
            {state.message}
          </Alert>
        ) : null}

        <input type="hidden" name="factorId" value={enrollment.factorId} />

        <Field
          label="Code affiché par l’application"
          error={state.errors?.code}
          hint="Six chiffres, renouvelés toutes les 30 secondes."
          required
        >
          <Input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className="text-center font-mono text-lg tracking-[0.4em]"
          />
        </Field>

        <SubmitButton />
      </form>

      {!mandatory ? (
        <p className="text-center text-sm">
          <Link
            href="/app"
            className="text-[var(--foreground-muted)] underline underline-offset-4 hover:text-[var(--foreground)]"
          >
            Plus tard
          </Link>
        </p>
      ) : null}
    </div>
  );
}
