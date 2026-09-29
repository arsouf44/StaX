'use client';

import { useActionState, useState } from 'react';
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
} from '@nemasus/ui';
import { TurnstileField } from '~/components/auth/turnstile-field';
import { sendContentReportAction, type ReportState } from './actions';

const CATEGORIES = [
  { value: 'illegal', label: 'Contenu illicite (autre infraction)' },
  { value: 'intellectual_property', label: 'Atteinte à un droit d’auteur ou à une marque' },
  { value: 'privacy', label: 'Atteinte à la vie privée ou à des données personnelles' },
  { value: 'defamation', label: 'Diffamation ou injure' },
  { value: 'fraud', label: 'Arnaque, hameçonnage, contrefaçon' },
  { value: 'hate', label: 'Incitation à la haine ou à la violence' },
  { value: 'child_abuse', label: 'Abus sexuel sur mineur' },
  { value: 'other', label: 'Autre motif' },
];

const IDLE: ReportState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} loadingLabel="Envoi en cours">
      Envoyer le signalement
    </Button>
  );
}

export function ContentReportForm({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, action] = useActionState<ReportState, FormData>(sendContentReportAction, IDLE);
  // Règlement (UE) 2022/2065, art. 16 § 2 c : nom et e-mail obligatoires, sauf
  // pour un contenu d'abus sexuel sur mineur, qui peut être signalé anonymement.
  const [category, setCategory] = useState('illegal');
  const anonymousAllowed = category === 'child_abuse';

  if (state.status === 'success') {
    return (
      <Alert tone="success" live="status" title="Signalement enregistré">
        <span data-testid="report-reference">{state.message}</span>
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

      <div aria-hidden="true" className="sr-only">
        <label htmlFor="r-website">Ne remplissez pas ce champ</label>
        <input id="r-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Field
        label="Adresse exacte du contenu"
        error={state.errors?.url}
        hint="Copiez l’adresse complète de la page, par exemple https://…"
        required
      >
        <Input name="url" type="url" inputMode="url" required placeholder="https://" />
      </Field>

      <Field label="Motif" error={state.errors?.category} required>
        <Select
          name="category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          required
        >
          {CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Pourquoi ce contenu est-il illicite ?"
        error={state.errors?.explanation}
        hint="Soyez aussi précis que possible : le passage en cause, le droit ou la loi concernés."
        required
      >
        <Textarea name="explanation" rows={6} required minLength={20} />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Votre nom"
          error={state.errors?.name}
          hint={
            anonymousAllowed
              ? 'Facultatif pour un abus sur mineur : vous pouvez rester anonyme.'
              : 'Obligatoire (règlement européen sur les services numériques, art. 16).'
          }
          required={!anonymousAllowed}
        >
          <Input name="name" autoComplete="name" required={!anonymousAllowed} />
        </Field>
        <Field
          label="Votre adresse e-mail"
          error={state.errors?.email}
          hint={
            anonymousAllowed
              ? 'Facultative : sans elle, vous ne recevrez ni accusé de réception ni décision.'
              : 'Obligatoire : vous y recevez l’accusé de réception et la décision.'
          }
          required={!anonymousAllowed}
        >
          <Input name="email" type="email" autoComplete="email" required={!anonymousAllowed} />
        </Field>
      </div>

      <Checkbox
        name="goodFaith"
        required
        error={state.errors?.goodFaith}
        label="Je déclare de bonne foi que les informations de ce signalement sont exactes et complètes."
      />

      <TurnstileField siteKey={turnstileSiteKey} />

      <SubmitButton />

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Vos coordonnées servent uniquement à traiter ce signalement et à vous répondre. Elles ne
        sont pas communiquées à l’éditeur du site signalé, sauf obligation légale.
      </p>
    </form>
  );
}
