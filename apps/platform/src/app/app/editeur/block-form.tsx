'use client';

import { useCallback, useEffect, useState, useTransition, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Panel, Select, Switch, Textarea } from '@stax/ui';
import type { EditorField } from '@stax/site-engine';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import type { EditorBlock } from './page';
import { updateBlockAction } from './actions';

/**
 * Formulaire d une section.
 *
 * Les champs sont DERIVES du schema du bloc : aucune liste de champs n est
 * maintenue a la main, et l editeur ne peut pas proposer une saisie que
 * l enregistrement refuserait.
 *
 * L etat est tenu ici, puis serialise en une seule charge utile JSON : le
 * serveur revalide l ensemble contre le meme schema avant d ecrire.
 */

type Value = unknown;

/**
 * Delai avant enregistrement automatique.
 *
 * Assez court pour qu on ne perde jamais une phrase en fermant l onglet, assez
 * long pour ne pas envoyer une requete a chaque lettre tapee.
 */
const AUTOSAVE_DELAY_MS = 1200;

function asString(value: Value): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function ListEditor({
  field,
  value,
  onChange,
}: {
  field: EditorField;
  value: Value;
  onChange: (next: Value) => void;
}) {
  const items = Array.isArray(value) ? value : [];
  const itemFields = field.itemFields ?? [];

  // Liste de chaines simples (points forts, caracteristiques d une formule).
  if (itemFields.length === 0) {
    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={asString(item)}
              onChange={(event) => {
                const next = [...items];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(items.filter((_, position) => position !== index))}
            >
              Retirer
            </Button>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => onChange([...items, ''])}>
          Ajouter
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const record = (item ?? {}) as Record<string, Value>;
        return (
          <Panel key={index} level="inset" padding="sm">
            <div className="space-y-3">
              {itemFields.map((child) => (
                <FieldEditor
                  key={child.name}
                  field={child}
                  value={record[child.name]}
                  onChange={(next) => {
                    const updated = [...items];
                    updated[index] = { ...record, [child.name]: next };
                    onChange(updated);
                  }}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange(items.filter((_, position) => position !== index))}
              >
                Retirer cet élément
              </Button>
            </div>
          </Panel>
        );
      })}

      {field.maxItems === undefined || items.length < field.maxItems ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            onChange([
              ...items,
              Object.fromEntries(itemFields.map((child) => [child.name, defaultFor(child)])),
            ])
          }
        >
          Ajouter un élément
        </Button>
      ) : null}
    </div>
  );
}

function defaultFor(field: EditorField): Value {
  switch (field.kind) {
    case 'boolean':
      return false;
    case 'number':
      return 0;
    case 'list':
      return [];
    case 'select':
      return field.options?.[0]?.value ?? '';
    case 'media':
    case 'link':
      return null;
    default:
      return '';
  }
}

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: EditorField;
  value: Value;
  onChange: (next: Value) => void;
}) {
  switch (field.kind) {
    case 'textarea':
      return (
        <Field label={field.label} required={!field.optional}>
          <Textarea
            rows={4}
            value={asString(value)}
            maxLength={field.maxLength}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );

    case 'number':
      return (
        <Field label={field.label} required={!field.optional}>
          <Input
            type="number"
            value={typeof value === 'number' ? value : ''}
            onChange={(event) =>
              onChange(event.target.value === '' ? null : Number(event.target.value))
            }
          />
        </Field>
      );

    case 'boolean':
      return (
        <Switch
          label={field.label}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      );

    case 'select':
      return (
        <Field label={field.label} required={!field.optional}>
          <Select
            value={asString(value)}
            onChange={(event) => {
              const raw = event.target.value;
              // Les choix numeriques (nombre de colonnes) doivent repartir en
              // nombre : le schema les refuserait en chaine.
              const numeric = Number(raw);
              onChange(Number.isFinite(numeric) && String(numeric) === raw ? numeric : raw);
            }}
          >
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      );

    case 'list':
      return (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{field.label}</legend>
          <ListEditor field={field} value={value} onChange={onChange} />
        </fieldset>
      );

    case 'media': {
      const media = (value ?? null) as { url?: string | null; alt?: string } | null;
      return (
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">{field.label}</legend>
          <p className="text-xs text-[var(--muted)]">
            Choisissez une image depuis « Photos &amp; fichiers ». Le texte de remplacement décrit
            l’image pour les personnes qui ne la voient pas.
          </p>
          <Field label="Description de l’image">
            <Input
              value={media?.alt ?? ''}
              onChange={(event) =>
                onChange({ mediaId: null, url: media?.url ?? null, alt: event.target.value })
              }
            />
          </Field>
        </fieldset>
      );
    }

    case 'link': {
      const link = (value ?? null) as { label?: string; href?: string } | null;
      return (
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">{field.label}</legend>
          <Field label="Texte du bouton">
            <Input
              value={link?.label ?? ''}
              onChange={(event) =>
                onChange({ ...(link ?? {}), label: event.target.value, style: 'primary' })
              }
            />
          </Field>
          <Field
            label="Destination"
            hint="Une page de votre site (/contact) ou une adresse complète."
          >
            <Input
              value={link?.href ?? ''}
              onChange={(event) =>
                onChange({ ...(link ?? {}), href: event.target.value, style: 'primary' })
              }
            />
          </Field>
        </fieldset>
      );
    }

    case 'rich':
      return (
        <Field label={field.label} hint="Un paragraphe par ligne.">
          <Textarea
            rows={5}
            value={
              Array.isArray(value)
                ? value
                    .map((node) => (node as { text?: string })?.text ?? '')
                    .filter(Boolean)
                    .join('\n')
                : asString(value)
            }
            onChange={(event) =>
              onChange(
                event.target.value
                  .split('\n')
                  .filter((line) => line.trim().length > 0)
                  .map((line) => ({ kind: 'paragraph', text: line })),
              )
            }
          />
        </Field>
      );

    default:
      return (
        <Field label={field.label} required={!field.optional}>
          <Input
            value={asString(value)}
            maxLength={field.maxLength}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
  }
}

export function BlockForm({ block, onSaved }: { block: EditorBlock; onSaved?: () => void }) {
  const [props, setProps] = useState<Record<string, Value>>(block.props);
  const [state, setState] = useState<ActionState>(IDLE_STATE);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();

  const save = useCallback(
    (values: Record<string, Value>) => {
      const formData = new FormData();
      formData.set('payload', JSON.stringify({ blockId: block.id, props: values }));
      startTransition(() => {
        void updateBlockAction(IDLE_STATE, formData).then((result) => {
          setState(result);
          if (result.status !== 'success') return;
          // Seul un succes efface le marqueur : si le serveur refuse, la
          // personne doit continuer a voir que son texte n est pas enregistre.
          setDirty(false);
          setSavedAt(new Date());
          onSaved?.();
        });
      });
    },
    [block.id, onSaved],
  );

  /**
   * Enregistrement automatique.
   *
   * Le bouton « Enregistrer » reste la : l enregistrement automatique est un
   * filet, pas un remplacement. Beaucoup de gens ont besoin de voir qu ils ont
   * valide quelque chose, et une sauvegarde invisible ne rassure personne.
   */
  useEffect(() => {
    if (!dirty || pending) return;
    const timer = setTimeout(() => save(props), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, pending, props, save]);

  const change = (name: string, next: Value) => {
    setProps((current) => ({ ...current, [name]: next }));
    setDirty(true);
    setState(IDLE_STATE);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save(props);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {state.status === 'error' && state.message ? (
        <Alert tone="danger" live="alert">
          {state.message}
          {state.errors?._form ? (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {state.errors._form.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      {block.fields.map((field) => (
        <FieldEditor
          key={field.name}
          field={field}
          value={props[field.name]}
          onChange={(next) => change(field.name, next)}
        />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} loadingLabel="Enregistrement">
          Enregistrer
        </Button>
        <p aria-live="polite" className="text-xs text-[var(--foreground-muted)]">
          {pending
            ? 'Enregistrement…'
            : dirty
              ? 'Modifications non enregistrées — enregistrement automatique dans un instant.'
              : savedAt
                ? `Enregistré à ${new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(savedAt)}. Visible du public après publication.`
                : 'Vos modifications restent dans votre brouillon jusqu’à la publication.'}
        </p>
      </div>
    </form>
  );
}
