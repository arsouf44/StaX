'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Field, FormErrorSummary, Input, Select, Textarea } from '@stax/ui';
import { saveInformationAction, STEP_IDLE, type StepState } from '../actions';

export interface OnboardingField {
  id: string;
  label: string;
  type: string;
  required: boolean;
  help: string | null;
  placeholder: string | null;
  options: Array<{ value: string; label: string }> | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" loading={pending} loadingLabel="Enregistrement">
      Continuer
    </Button>
  );
}

/**
 * Questionnaire metier.
 *
 * Les questions sont declarees dans le registre metier et rendues ici : aucune
 * condition `if (metier === 'restaurant')` n existe dans ce composant. Ajouter
 * un metier ne demande donc aucune modification d interface.
 */
export function InformationForm({
  questions,
  draft,
}: {
  questions: OnboardingField[];
  draft: {
    organizationName: string;
    contactEmail: string;
    contactPhone: string;
    city: string;
    customerNotes: string;
    answers: Record<string, string | number | boolean>;
  };
}) {
  const [state, action] = useActionState<StepState, FormData>(saveInformationAction, STEP_IDLE);

  const answerValue = (id: string): string => {
    const value = draft.answers[id];
    if (value === undefined || value === null) return '';
    return typeof value === 'boolean' ? (value ? 'oui' : 'non') : String(value);
  };

  return (
    <form action={action} className="mt-8 space-y-6" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.errors ? <FormErrorSummary errors={state.errors} /> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nom de votre entreprise" error={state.errors?.organizationName} required>
          <Input
            name="organizationName"
            defaultValue={draft.organizationName}
            autoComplete="organization"
            required
            autoFocus
          />
        </Field>
        <Field
          label="Ville"
          error={state.errors?.city}
          hint="Utile pour votre référencement local."
        >
          <Input name="city" defaultValue={draft.city} autoComplete="address-level2" />
        </Field>
        <Field label="Adresse e-mail" error={state.errors?.contactEmail} required>
          <Input
            name="contactEmail"
            type="email"
            defaultValue={draft.contactEmail}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Téléphone" error={state.errors?.contactPhone}>
          <Input
            name="contactPhone"
            type="tel"
            defaultValue={draft.contactPhone}
            autoComplete="tel"
          />
        </Field>
      </div>

      {questions.length > 0 ? (
        <fieldset className="space-y-5 rounded-[var(--radius-lg)] border border-[var(--border)] p-5">
          <legend className="px-2 text-sm font-medium">Votre activité</legend>
          {questions.map((question) => {
            const name = `q_${question.id}`;
            const hint = question.help ?? undefined;

            if (question.type === 'textarea') {
              return (
                <Field
                  key={question.id}
                  label={question.label}
                  hint={hint}
                  required={question.required}
                >
                  <Textarea
                    name={name}
                    rows={3}
                    defaultValue={answerValue(question.id)}
                    placeholder={question.placeholder ?? undefined}
                    required={question.required}
                  />
                </Field>
              );
            }

            if (question.type === 'select' && question.options) {
              return (
                <Field
                  key={question.id}
                  label={question.label}
                  hint={hint}
                  required={question.required}
                >
                  <Select
                    name={name}
                    defaultValue={answerValue(question.id)}
                    required={question.required}
                  >
                    <option value="">Choisissez…</option>
                    {question.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              );
            }

            if (question.type === 'boolean') {
              return (
                <Field
                  key={question.id}
                  label={question.label}
                  hint={hint}
                  required={question.required}
                >
                  <Select
                    name={name}
                    defaultValue={answerValue(question.id)}
                    required={question.required}
                  >
                    <option value="">Choisissez…</option>
                    <option value="oui">Oui</option>
                    <option value="non">Non</option>
                  </Select>
                </Field>
              );
            }

            return (
              <Field
                key={question.id}
                label={question.label}
                hint={hint}
                required={question.required}
              >
                <Input
                  name={name}
                  type={
                    question.type === 'number' ? 'number' : question.type === 'url' ? 'url' : 'text'
                  }
                  defaultValue={answerValue(question.id)}
                  placeholder={question.placeholder ?? undefined}
                  required={question.required}
                />
              </Field>
            );
          })}
        </fieldset>
      ) : null}

      <Field
        label="Autre chose à nous dire ?"
        hint="Facultatif. Une contrainte, une préférence, un exemple de site que vous aimez."
      >
        <Textarea name="customerNotes" rows={4} defaultValue={draft.customerNotes} />
      </Field>

      <SubmitButton />
    </form>
  );
}
