'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, Input, cn } from '@stax/ui';
import { IDLE_STATE as STEP_IDLE } from '~/lib/form-state';
import { saveDomainAction, type StepState } from '../actions';

type Handling = 'customer_owned' | 'stax_purchase' | 'subdomain_only';

const CHOICES: Array<{ value: Handling; title: string; description: string }> = [
  {
    value: 'customer_owned',
    title: 'J’ai déjà un nom de domaine',
    description:
      'Nous le connectons à votre nouveau site sans le transférer. Il reste à votre nom, chez votre bureau d’enregistrement actuel.',
  },
  {
    value: 'stax_purchase',
    title: 'Achetez-le pour moi',
    description:
      'Nous vérifions sa disponibilité, l’achetons à votre nom et le connectons. Son coût est inclus dans votre offre la première année.',
  },
  {
    value: 'subdomain_only',
    title: 'Je choisirai plus tard',
    description:
      'Votre site démarre sur une adresse temporaire. Vous pourrez connecter votre propre domaine à tout moment, sans frais supplémentaires.',
  },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} loadingLabel="Enregistrement">
      Continuer
    </Button>
  );
}

export function DomainForm({
  sitesDomain,
  suggestion,
  draft,
}: {
  sitesDomain: string;
  suggestion: string;
  draft: { handling: string | null; hostname: string; subdomain: string };
}) {
  const [handling, setHandling] = useState<Handling>(
    (draft.handling as Handling) ?? 'customer_owned',
  );
  const [state, action] = useActionState<StepState, FormData>(saveDomainAction, STEP_IDLE);

  return (
    <form action={action} className="mt-8 space-y-6" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}

      <fieldset>
        <legend className="sr-only">Gestion du nom de domaine</legend>
        <div className="space-y-3">
          {CHOICES.map((choice) => (
            <label
              key={choice.value}
              className={cn(
                'flex cursor-pointer gap-3 rounded-[var(--radius-lg)] border p-4 transition-colors',
                handling === choice.value
                  ? 'border-[var(--accent)] bg-[var(--surface-elevated)]'
                  : 'border-[var(--border)] hover:border-[var(--border-strong)]',
              )}
            >
              <input
                type="radio"
                name="domainHandling"
                value={choice.value}
                checked={handling === choice.value}
                onChange={() => setHandling(choice.value)}
                className="mt-1 size-4 accent-[var(--accent)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{choice.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-[var(--foreground-muted)]">
                  {choice.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {handling === 'subdomain_only' ? (
        <Field
          label="Adresse temporaire"
          error={state.errors?.subdomain}
          hint={`Votre site sera accessible sur cette adresse en attendant votre domaine.`}
          required
        >
          <div className="flex items-center gap-2">
            <Input
              name="subdomain"
              defaultValue={draft.subdomain || suggestion}
              spellCheck={false}
              required
            />
            <span className="shrink-0 text-sm text-[var(--muted)]">.{sitesDomain}</span>
          </div>
        </Field>
      ) : (
        <Field
          label={
            handling === 'stax_purchase' ? 'Nom de domaine souhaité' : 'Votre nom de domaine actuel'
          }
          error={state.errors?.domainHostname}
          hint={
            handling === 'stax_purchase'
              ? 'Nous vérifierons sa disponibilité avant tout achat. Si la première proposition est prise, nous vous en proposerons d’autres.'
              : 'Sans « https:// » ni « www. ». Par exemple : mon-entreprise.fr'
          }
          required
        >
          <Input
            name="domainHostname"
            defaultValue={draft.hostname}
            placeholder="mon-entreprise.fr"
            spellCheck={false}
            required
          />
        </Field>
      )}

      <SubmitButton />
    </form>
  );
}
