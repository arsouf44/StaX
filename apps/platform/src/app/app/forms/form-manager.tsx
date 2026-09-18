'use client';

import { useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  Panel,
  Select,
  StatusPill,
  Switch,
  Textarea,
} from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { deleteFormFieldAction, saveFormAction, saveFormFieldAction } from './actions';

export interface FormFieldView {
  id: string;
  label: string;
  name: string;
  type: string;
  typeLabel: string;
  required: boolean;
  placeholder: string;
  helpText: string;
  options: string[];
}

export interface FormView {
  id: string;
  name: string;
  slug: string;
  kind: string;
  kindLabel: string;
  description: string;
  successMessage: string;
  notifyEmails: string[];
  requireCaptcha: boolean;
  isActive: boolean;
  rateLimitPerHour: number;
  submissionCount: number;
  fields: FormFieldView[];
}

const FIELD_TYPES: Array<{ value: string; label: string }> = [
  { value: 'text', label: 'Texte court' },
  { value: 'textarea', label: 'Texte long' },
  { value: 'email', label: 'Adresse e-mail' },
  { value: 'tel', label: 'Téléphone' },
  { value: 'number', label: 'Nombre' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Heure' },
  { value: 'select', label: 'Liste déroulante' },
  { value: 'radio', label: 'Choix unique' },
  { value: 'checkbox', label: 'Case à cocher' },
  { value: 'consent', label: 'Case de consentement' },
];

const FORM_KINDS: Array<{ value: string; label: string }> = [
  { value: 'contact', label: 'Contact' },
  { value: 'quote', label: 'Demande de devis' },
  { value: 'reservation', label: 'Réservation' },
  { value: 'newsletter', label: 'Lettre d’information' },
  { value: 'callback', label: 'Demande de rappel' },
  { value: 'application', label: 'Candidature' },
  { value: 'custom', label: 'Autre' },
];

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel={pendingLabel}>
      {label}
    </Button>
  );
}

const CHOICE_TYPES = new Set(['select', 'radio']);

export function FormManager({ forms, canWrite }: { forms: FormView[]; canWrite: boolean }) {
  const [editingForm, setEditingForm] = useState<FormView | 'new' | null>(null);
  const [editingField, setEditingField] = useState<{
    formId: string;
    field: FormFieldView | null;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    formId: string;
    field: FormFieldView;
  } | null>(null);
  const [fieldType, setFieldType] = useState('text');
  const [formState, setFormState] = useState<ActionState>(IDLE_STATE);
  const [fieldState, setFieldState] = useState<ActionState>(IDLE_STATE);
  const [deleteState, setDeleteState] = useState<ActionState>(IDLE_STATE);
  const [, startTransition] = useTransition();

  // Fermer un dialogue est la consequence d'un enregistrement reussi, pas d'un
  // changement d'etat a observer : la decision appartient donc au gestionnaire
  // d'evenement, jamais a un effet.
  const formAction = (payload: FormData) =>
    saveFormAction(IDLE_STATE, payload).then((result) => {
      setFormState(result);
      if (result.status === 'success') setEditingForm(null);
    });

  const fieldAction = (payload: FormData) =>
    saveFormFieldAction(IDLE_STATE, payload).then((result) => {
      setFieldState(result);
      if (result.status === 'success') setEditingField(null);
    });

  const deleteAction = (payload: FormData) =>
    deleteFormFieldAction(IDLE_STATE, payload).then((result) => {
      setDeleteState(result);
      if (result.status === 'success') setPendingDelete(null);
    });

  const current = editingForm === 'new' || editingForm === null ? null : editingForm;
  const currentField = editingField?.field ?? null;

  return (
    <div className="space-y-6">
      {deleteState.status === 'error' && deleteState.message ? (
        <Alert tone="danger" live="alert">
          {deleteState.message}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--foreground-muted)]">
          {forms.length === 0
            ? 'Aucun formulaire pour l’instant.'
            : `${forms.length} formulaire${forms.length > 1 ? 's' : ''}.`}
        </p>
        {canWrite ? (
          <Button variant="secondary" size="sm" onClick={() => setEditingForm('new')}>
            <Icon name="plus" size={16} aria-hidden="true" />
            Créer un formulaire
          </Button>
        ) : null}
      </div>

      {forms.length === 0 ? (
        <EmptyState
          icon={<Icon name="clipboard-list" size={24} />}
          title="Aucun formulaire"
          description="Un formulaire de contact simple — nom, e-mail, message — convertit mieux qu’un questionnaire de vingt questions."
          action={
            canWrite ? (
              <Button onClick={() => setEditingForm('new')}>Créer un formulaire</Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-4">
          {forms.map((form) => (
            <li key={form.id}>
              <Panel level={1} padding="lg">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{form.name}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {form.kindLabel} · <span className="font-mono">{form.slug}</span> ·{' '}
                      {form.submissionCount} réponse{form.submissionCount > 1 ? 's' : ''} reçue
                      {form.submissionCount > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill tone={form.isActive ? 'success' : 'neutral'}>
                      {form.isActive ? 'Actif' : 'Désactivé'}
                    </StatusPill>
                    {canWrite ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditingForm(form)}>
                        Réglages
                      </Button>
                    ) : null}
                  </div>
                </div>

                <ul className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
                  {form.fields.length === 0 ? (
                    <li className="py-3 text-sm text-[var(--foreground-muted)]">
                      Ce formulaire n’a aucun champ : il ne peut pas encore être affiché.
                    </li>
                  ) : (
                    form.fields.map((field) => (
                      <li
                        key={field.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <span className="min-w-0 text-sm">
                          {field.label}
                          {field.required ? (
                            <span className="ml-1 text-[var(--danger)]" aria-label="obligatoire">
                              *
                            </span>
                          ) : null}
                          <span className="ml-2 text-xs text-[var(--muted)]">
                            {field.typeLabel}
                          </span>
                        </span>
                        {canWrite ? (
                          <span className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setFieldType(field.type);
                                setEditingField({ formId: form.id, field });
                              }}
                            >
                              Modifier
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingDelete({ formId: form.id, field })}
                            >
                              Retirer
                            </Button>
                          </span>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>

                {canWrite ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setFieldType('text');
                      setEditingField({ formId: form.id, field: null });
                    }}
                  >
                    <Icon name="plus" size={16} aria-hidden="true" />
                    Ajouter un champ
                  </Button>
                ) : null}

                <p className="mt-4 border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--muted)]">
                  Protection anti-robot toujours active : champ piège invisible et{' '}
                  {form.rateLimitPerHour} envois maximum par heure et par visiteur.
                  {form.requireCaptcha ? ' Vérification anti-robot supplémentaire activée.' : ''}
                </p>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editingForm !== null}
        onClose={() => setEditingForm(null)}
        size="lg"
        title={editingForm === 'new' ? 'Créer un formulaire' : 'Réglages du formulaire'}
      >
        <form action={formAction} className="space-y-5" noValidate>
          {current ? <input type="hidden" name="formId" value={current.id} /> : null}

          {formState.status === 'error' && formState.message ? (
            <Alert tone="danger" live="alert">
              {formState.message}
            </Alert>
          ) : null}

          <Field
            label="Nom du formulaire"
            required
            hint="Sert à le retrouver. Non affiché sur votre site."
          >
            <Input name="name" defaultValue={current?.name ?? ''} required maxLength={80} />
          </Field>

          <Field label="À quoi sert-il ?">
            <Select name="kind" defaultValue={current?.kind ?? 'contact'}>
              {FORM_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Message affiché après l’envoi"
            required
            hint="La phrase que votre visiteur lit une fois son message parti."
          >
            <Textarea
              name="successMessage"
              rows={2}
              required
              minLength={5}
              maxLength={300}
              defaultValue={
                current?.successMessage ?? 'Merci, votre message nous est bien parvenu.'
              }
            />
          </Field>

          <Field
            label="Prévenir par e-mail"
            hint="Une adresse par ligne, cinq au maximum. Laissez vide pour ne recevoir aucune notification."
          >
            <Textarea
              name="notifyEmails"
              rows={2}
              defaultValue={(current?.notifyEmails ?? []).join('\n')}
            />
          </Field>

          <Switch
            name="requireCaptcha"
            label="Vérification anti-robot supplémentaire"
            description="À activer si vous recevez du spam malgré les protections automatiques. Ajoute une étape pour vos visiteurs."
            defaultChecked={current?.requireCaptcha ?? false}
          />

          <Switch
            name="isActive"
            label="Formulaire actif"
            description="Désactivé, le formulaire n’accepte plus aucun envoi."
            defaultChecked={current?.isActive ?? true}
          />

          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
            <SubmitButton label="Enregistrer" pendingLabel="Enregistrement" />
            <Button variant="ghost" onClick={() => setEditingForm(null)}>
              Annuler
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={editingField !== null}
        onClose={() => setEditingField(null)}
        size="md"
        title={currentField ? 'Modifier le champ' : 'Ajouter un champ'}
      >
        <form action={fieldAction} className="space-y-5" noValidate>
          <input type="hidden" name="formId" value={editingField?.formId ?? ''} />
          {currentField ? <input type="hidden" name="fieldId" value={currentField.id} /> : null}

          {fieldState.status === 'error' && fieldState.message ? (
            <Alert tone="danger" live="alert">
              {fieldState.message}
            </Alert>
          ) : null}

          <Field label="Libellé" required hint="Ce que votre visiteur lit à côté du champ.">
            <Input
              key={`label-${currentField?.id ?? 'new'}`}
              name="label"
              defaultValue={currentField?.label ?? ''}
              required
              maxLength={80}
            />
          </Field>

          <Field label="Type de champ">
            <Select
              name="type"
              value={fieldType}
              onChange={(event) => setFieldType(event.target.value)}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>

          {CHOICE_TYPES.has(fieldType) ? (
            <Field label="Réponses possibles" hint="Une par ligne, deux au minimum." required>
              <Textarea
                key={`options-${currentField?.id ?? 'new'}`}
                name="options"
                rows={4}
                defaultValue={(currentField?.options ?? []).join('\n')}
              />
            </Field>
          ) : null}

          <Field label="Texte d’aide" hint="Une précision courte sous le champ, si nécessaire.">
            <Input
              key={`help-${currentField?.id ?? 'new'}`}
              name="helpText"
              defaultValue={currentField?.helpText ?? ''}
              maxLength={200}
            />
          </Field>

          <Switch
            key={`required-${currentField?.id ?? 'new'}`}
            name="isRequired"
            label="Champ obligatoire"
            description="Le visiteur ne pourra pas envoyer sans le remplir."
            defaultChecked={currentField?.required ?? false}
          />

          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
            <SubmitButton label="Enregistrer" pendingLabel="Enregistrement" />
            <Button variant="ghost" onClick={() => setEditingField(null)}>
              Annuler
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          const payload = new FormData();
          payload.set('formId', pendingDelete.formId);
          payload.set('fieldId', pendingDelete.field.id);
          startTransition(() => {
            void deleteAction(payload);
          });
        }}
        tone="danger"
        confirmLabel="Retirer le champ"
        title="Retirer ce champ du formulaire ?"
        description="Vos visiteurs ne le verront plus. Les réponses déjà reçues restent intactes et consultables dans vos messages."
      />
    </div>
  );
}
