'use client';

import { Button, Checkbox, Field, Input, Select, Switch, Textarea } from '@stax/ui';
import { useFormStatus } from 'react-dom';

/**
 * Champs de formulaire pilotes par des donnees.
 *
 * Le serveur decrit les champs, le navigateur les affiche. Aucun libelle
 * technique ne traverse cette frontiere : ce composant ne connait que des
 * intitules en francais.
 */

export interface ClientFieldOption {
  value: string;
  label: string;
}

export interface ClientField {
  name: string;
  label: string;
  kind: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  options?: ClientFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  rows?: number;
  inList?: boolean;
  wide?: boolean;
}

export function SubmitButton({
  label,
  pendingLabel,
  variant,
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} loading={pending} loadingLabel={pendingLabel}>
      {label}
    </Button>
  );
}

export function FieldControl({
  field,
  value,
  error,
}: {
  field: ClientField;
  value: string | boolean | string[] | undefined;
  error?: string[];
}) {
  const common = {
    name: field.name,
    required: field.required,
    'aria-invalid': error ? true : undefined,
  };

  if (field.kind === 'boolean') {
    return (
      <Switch
        name={field.name}
        defaultChecked={value === true}
        label={field.label}
        description={field.hint}
      />
    );
  }

  if (field.kind === 'multiselect') {
    const selected = new Set(Array.isArray(value) ? value : []);
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{field.label}</legend>
        {field.hint ? <p className="text-xs text-[var(--muted)]">{field.hint}</p> : null}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {(field.options ?? []).map((choice) => (
            <Checkbox
              key={choice.value}
              name={field.name}
              value={choice.value}
              defaultChecked={selected.has(choice.value)}
              label={choice.label}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  const text = typeof value === 'string' ? value : '';

  if (field.kind === 'select' || field.kind === 'reference') {
    return (
      <Field label={field.label} hint={field.hint} error={error} required={field.required}>
        <Select {...common} defaultValue={text}>
          {field.required && text === '' ? <option value="">Choisissez…</option> : null}
          {!field.required ? <option value="">—</option> : null}
          {(field.options ?? []).map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.kind === 'textarea') {
    return (
      <Field label={field.label} hint={field.hint} error={error} required={field.required}>
        <Textarea {...common} defaultValue={text} rows={field.rows ?? 3} maxLength={field.maxLength} />
      </Field>
    );
  }

  const type =
    field.kind === 'date'
      ? 'date'
      : field.kind === 'time'
        ? 'time'
        : field.kind === 'email'
          ? 'email'
          : field.kind === 'tel'
            ? 'tel'
            : field.kind === 'number'
              ? 'number'
              : 'text';

  return (
    <Field
      label={field.label}
      hint={field.kind === 'money' ? (field.hint ?? 'En euros. Exemple : 12,50') : field.hint}
      error={error}
      required={field.required}
    >
      <Input
        {...common}
        type={type}
        defaultValue={text}
        placeholder={field.placeholder}
        maxLength={field.kind === 'money' ? 16 : field.maxLength}
        min={field.min}
        max={field.max}
        step={field.step}
        inputMode={field.kind === 'money' ? 'decimal' : undefined}
      />
    </Field>
  );
}

