'use client';

import { useState } from 'react';
import { Alert, Panel } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { FieldControl, SubmitButton, type ClientField } from './form-fields';

/**
 * Formulaire de reglages.
 *
 * Les champs sont decrits cote serveur, comme pour les collections : une page
 * de reglages ne reimplemente donc ni la mise en page, ni la gestion des
 * erreurs, ni l'etat d'envoi. Ce qui change d'un ecran a l'autre, c'est la
 * liste des champs et l'action appelee.
 */

export interface SettingsGroup {
  id: string;
  title: string;
  description?: string;
  fields: ClientField[];
}

export interface SettingsFormProps {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  groups: SettingsGroup[];
  values: Record<string, string | boolean | string[]>;
  submitLabel?: string;
  /** Rappel affiche sous le bouton, quand l'effet n'est pas immediat. */
  footnote?: string;
  readOnly?: boolean;
  readOnlyMessage?: string;
}

export function SettingsForm({
  action,
  groups,
  values,
  submitLabel = 'Enregistrer',
  footnote,
  readOnly = false,
  readOnlyMessage,
}: SettingsFormProps) {
  const [state, setState] = useState<ActionState>(IDLE_STATE);

  // L'action est appelee directement : le resultat est un etat local, pas une
  // navigation. Une erreur reste donc affichee a cote du champ concerne.
  const submit = (formData: FormData) => action(IDLE_STATE, formData).then(setState);

  if (readOnly) {
    return (
      <Panel level={1} padding="lg">
        <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
          {readOnlyMessage ??
            'Votre rôle vous permet de consulter ces réglages, mais pas de les modifier.'}
        </p>
      </Panel>
    );
  }

  return (
    <form action={submit} className="space-y-10" noValidate>
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
        </Alert>
      ) : null}
      {state.status === 'success' && state.message ? (
        <Alert tone="success" live="status">
          {state.message}
        </Alert>
      ) : null}

      {groups.map((group) => (
        <fieldset key={group.id} className="space-y-5">
          <legend className="text-base font-medium">{group.title}</legend>
          {group.description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-[var(--foreground-muted)]">
              {group.description}
            </p>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            {group.fields.map((field) => (
              <div key={field.name} className={field.wide ? 'sm:col-span-2' : undefined}>
                <FieldControl
                  field={field}
                  value={values[field.name]}
                  error={state.errors?.[field.name]}
                />
              </div>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="border-t border-[var(--border)] pt-6">
        <SubmitButton label={submitLabel} pendingLabel="Enregistrement" />
        {footnote ? <p className="mt-3 text-xs text-[var(--muted)]">{footnote}</p> : null}
      </div>
    </form>
  );
}
