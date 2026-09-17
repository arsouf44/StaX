'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Alert,
  Button,
  Checkbox,
  Field,
  FormErrorSummary,
  Input,
  Select,
  Textarea,
} from '@stax/ui';
import { TurnstileField } from '~/components/auth/turnstile-field';
import { LEAD_IDLE, sendContactAction, type LeadState } from './actions';

const SUBJECTS = [
  { value: 'sales', label: 'Une question sur vos offres' },
  { value: 'support', label: 'J’ai besoin d’aide sur mon site' },
  { value: 'partnership', label: 'Un partenariat' },
  { value: 'press', label: 'Presse' },
  { value: 'other', label: 'Autre chose' },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} loadingLabel="Envoi en cours">
      Envoyer mon message
    </Button>
  );
}

export function ContactForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, action] = useActionState<LeadState, FormData>(sendContactAction, LEAD_IDLE);
  // Mesure du temps de remplissage : un envoi en moins de deux secondes n est
  // pas le fait d un humain. Le signal sert a CLASSER, jamais a rejeter.
  //
  // L horodatage est pose APRES le rendu : lire l heure pendant le rendu
  // rendrait le composant non deterministe, et le rendu serveur divergerait du
  // rendu navigateur. Une reference suffit — cette valeur n affiche rien et
  // n a donc pas a declencher de nouveau rendu.
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  if (state.status === 'success') {
    return (
      <Alert tone="success" live="status" title="Message envoyé">
        {state.message}
      </Alert>
    );
  }

  return (
    <form
      action={action}
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        // Le delai est calcule au moment de l envoi, pas pendant le rendu.
        const field = event.currentTarget.elements.namedItem('elapsedMs');
        if (field instanceof HTMLInputElement && openedAt.current > 0) {
          field.value = String(Math.min(Date.now() - openedAt.current, 86_400_000));
        }
      }}
    >
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.errors ? <FormErrorSummary errors={state.errors} /> : null}

      <div aria-hidden="true" className="sr-only">
        <label htmlFor="c-website">Ne remplissez pas ce champ</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="elapsedMs" defaultValue="0" />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Votre nom" error={state.errors?.name} required>
          <Input name="name" autoComplete="name" required />
        </Field>
        <Field label="Votre entreprise" error={state.errors?.company}>
          <Input name="company" autoComplete="organization" />
        </Field>
        <Field label="Adresse e-mail" error={state.errors?.email} required>
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Téléphone" error={state.errors?.phone}>
          <Input name="phone" type="tel" autoComplete="tel" />
        </Field>
      </div>

      <Field label="Votre demande concerne" error={state.errors?.subject} required>
        <Select name="subject" defaultValue="sales" required>
          {SUBJECTS.map((subject) => (
            <option key={subject.value} value={subject.value}>
              {subject.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Votre message"
        error={state.errors?.message}
        hint="Le plus utile : votre métier, votre ville, et ce que vous attendez de votre site."
        required
      >
        <Textarea name="message" rows={6} required minLength={20} />
      </Field>

      <Checkbox
        name="acceptPrivacy"
        required
        error={state.errors?.acceptPrivacy}
        label={
          <>
            J’accepte que mes informations soient utilisées pour traiter ma demande, conformément à
            la{' '}
            <Link href="/confidentialite" target="_blank" className="underline underline-offset-4">
              politique de confidentialité
            </Link>
            .
          </>
        }
      />

      <TurnstileField siteKey={turnstileSiteKey} />

      <SubmitButton />

      <p className="text-xs text-[var(--muted)]">
        Vos coordonnées servent uniquement à vous répondre. Elles ne sont ni revendues, ni utilisées
        pour du démarchage.
      </p>
    </form>
  );
}
