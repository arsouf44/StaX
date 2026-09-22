'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Button, Dialog, Field, Icon, Input, Select, Switch, Textarea, cn } from '@stax/ui';
import type { EditorField } from '@stax/site-engine';
import { listMediaAction, uploadImageAction } from './actions';
import type { EditorPageRef, MediaItem } from './types';

/**
 * Editeurs de champs.
 *
 * Chaque champ d une section est decrit par son schema ; l editeur choisit
 * le bon controle et parle la langue du client : « Changer la photo »,
 * « Texte du bouton », « Où mène ce bouton ? ». Jamais un nom technique,
 * jamais une adresse brute a taper quand un choix suffit.
 */

type Value = unknown;

export interface FieldContext {
  pages: EditorPageRef[];
  canManageMedia: boolean;
  /** Champ a mettre en evidence (clic dans l apercu). */
  focus: { name: string; index: number | null; nonce: number } | null;
}

function asString(value: Value): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

/* -------------------------------------------------------------------------- */
/*  Images                                                                     */
/* -------------------------------------------------------------------------- */

interface MediaValue {
  mediaId: string | null;
  url?: string | null;
  alt?: string;
}

export function MediaPicker({
  open,
  onClose,
  onPick,
  canUpload,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (item: MediaItem) => void;
  canUpload: boolean;
}) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listMediaAction().then((result) => {
      if (cancelled) return;
      if (result.status === 'success') setItems(result.items);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const upload = (file: File) => {
    const data = new FormData();
    data.set('file', file);
    data.set('alt', '');
    setError(null);
    startTransition(() => {
      void uploadImageAction(data).then((result) => {
        if (result.status === 'error') {
          setError(result.message);
          return;
        }
        onPick(result.item);
      });
    });
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Choisir une photo">
      <div className="space-y-5">
        {canUpload ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-4">
            <Icon name="upload" size={18} className="text-[var(--muted)]" />
            <p className="min-w-0 flex-1 text-sm text-[var(--foreground-muted)]">
              Envoyez une photo depuis votre ordinateur ou votre téléphone (JPEG, PNG, WebP — 12 Mo
              maximum).
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml"
              className="sr-only"
              aria-label="Envoyer une photo"
              data-testid="media-upload-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload(file);
                event.target.value = '';
              }}
            />
            <Button
              variant="secondary"
              loading={pending}
              loadingLabel="Envoi"
              onClick={() => fileRef.current?.click()}
            >
              Envoyer une photo
            </Button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        {items === null ? (
          <p className="text-sm text-[var(--muted)]">Chargement de vos photos…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">
            Vous n’avez pas encore de photo. Envoyez-en une : elle sera ensuite réutilisable partout
            sur votre site.
          </p>
        ) : (
          <ul className="grid max-h-[50vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onPick(item)}
                  className="group block w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] text-left hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                  aria-label={`Choisir ${item.alt || item.fileName}`}
                >
                  <img
                    src={item.url}
                    alt=""
                    loading="lazy"
                    className="aspect-[4/3] w-full bg-[var(--surface-2)] object-cover"
                  />
                  <span className="block truncate px-2 py-1 text-2xs text-[var(--muted)]">
                    {item.alt || item.fileName}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function MediaEditor({
  field,
  value,
  onChange,
  context,
}: {
  field: EditorField;
  value: Value;
  onChange: (next: Value) => void;
  context: FieldContext;
}) {
  const media = (value ?? null) as MediaValue | null;
  const [picking, setPicking] = useState(false);

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)]">
        {media?.url ? (
          <img
            src={media.url}
            alt={media.alt ?? ''}
            className="aspect-[16/9] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center text-sm text-[var(--muted)]">
            Aucune photo
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
          <Icon name="image" size={14} aria-hidden="true" />
          {media?.url ? 'Changer la photo' : 'Choisir une photo'}
        </Button>
        {media?.url ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Retirer la photo
          </Button>
        ) : null}
      </div>
      {media?.url ? (
        <Field
          label="Que montre cette photo ?"
          hint="Une phrase lue par les personnes malvoyantes et par Google."
        >
          <Input
            value={media.alt ?? ''}
            maxLength={200}
            onChange={(event) => onChange({ ...media, alt: event.target.value })}
          />
        </Field>
      ) : null}
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        canUpload={context.canManageMedia}
        onPick={(item) => {
          setPicking(false);
          onChange({ mediaId: item.id, url: item.url, alt: item.alt || media?.alt || '' });
        }}
      />
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Boutons et liens                                                           */
/* -------------------------------------------------------------------------- */

interface LinkValue {
  label?: string;
  href?: string;
  style?: string;
  external?: boolean;
}

type Destination = 'page' | 'web' | 'phone' | 'email';

function destinationOf(href: string): Destination {
  if (href.startsWith('tel:')) return 'phone';
  if (href.startsWith('mailto:')) return 'email';
  if (href.startsWith('https://')) return 'web';
  return 'page';
}

export function LinkEditor({
  value,
  onChange,
  pages,
  legend,
}: {
  value: Value;
  onChange: (next: Value) => void;
  pages: EditorPageRef[];
  legend: string;
}) {
  const link = (value ?? {}) as LinkValue;
  const href = link.href ?? '';
  const kind = destinationOf(href);
  const update = (patch: Partial<LinkValue>) =>
    onChange({ style: 'primary', external: false, label: '', href: '/', ...link, ...patch });

  return (
    <fieldset className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3">
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <Field label="Texte du bouton">
        <Input
          value={link.label ?? ''}
          maxLength={60}
          placeholder="Nous contacter"
          onChange={(event) => update({ label: event.target.value })}
        />
      </Field>
      <Field label="Où mène ce bouton ?">
        <Select
          value={kind}
          onChange={(event) => {
            const next = event.target.value as Destination;
            const defaults: Record<Destination, string> = {
              page: pages[0]?.path ?? '/',
              web: 'https://',
              phone: 'tel:',
              email: 'mailto:',
            };
            update({ href: defaults[next], external: next === 'web' });
          }}
        >
          <option value="page">Une page de mon site</option>
          <option value="web">Un autre site internet</option>
          <option value="phone">Appeler un numéro</option>
          <option value="email">Écrire un e-mail</option>
        </Select>
      </Field>
      {kind === 'page' ? (
        <Field label="Page">
          <Select value={href} onChange={(event) => update({ href: event.target.value })}>
            {pages.every((page) => page.path !== href) && href ? (
              <option value={href}>Page introuvable ({href}) — choisissez-en une autre</option>
            ) : null}
            {pages.map((page) => (
              <option key={page.id} value={page.path}>
                {page.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : kind === 'web' ? (
        <Field label="Adresse du site" hint="Elle doit commencer par https://">
          <Input
            value={href}
            inputMode="url"
            onChange={(event) => update({ href: event.target.value, external: true })}
          />
        </Field>
      ) : kind === 'phone' ? (
        <Field label="Numéro de téléphone">
          <Input
            value={href.slice(4)}
            inputMode="tel"
            placeholder="01 23 45 67 89"
            onChange={(event) =>
              update({ href: `tel:${event.target.value.replace(/[^+0-9]/g, '')}` })
            }
          />
        </Field>
      ) : (
        <Field label="Adresse e-mail">
          <Input
            value={href.slice(7)}
            inputMode="email"
            onChange={(event) => update({ href: `mailto:${event.target.value.trim()}` })}
          />
        </Field>
      )}
      <Field label="Apparence du bouton">
        <Select
          value={link.style ?? 'primary'}
          onChange={(event) => update({ style: event.target.value })}
        >
          <option value="primary">Bouton principal (le plus visible)</option>
          <option value="secondary">Bouton secondaire</option>
          <option value="ghost">Bouton discret</option>
          <option value="link">Lien simple</option>
        </Select>
      </Field>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Texte riche : paragraphes, titres, listes, citations                       */
/* -------------------------------------------------------------------------- */

interface RichNode {
  kind: 'paragraph' | 'heading' | 'list' | 'quote';
  text: string;
  items?: string[];
  level?: 2 | 3 | 4;
}

function RichEditor({
  field,
  value,
  onChange,
}: {
  field: EditorField;
  value: Value;
  onChange: (next: Value) => void;
}) {
  const nodes = (Array.isArray(value) ? value : []) as RichNode[];
  const set = (index: number, node: RichNode) => {
    const next = [...nodes];
    next[index] = node;
    onChange(next);
  };

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      {nodes.map((node, index) => (
        <div
          key={index}
          className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3"
        >
          <div className="flex items-center gap-2">
            <Select
              aria-label="Type de paragraphe"
              value={node.kind}
              onChange={(event) => {
                const kind = event.target.value as RichNode['kind'];
                set(index, {
                  kind,
                  text: node.text,
                  ...(kind === 'list' ? { items: node.items ?? [node.text].filter(Boolean) } : {}),
                  ...(kind === 'heading' ? { level: 2 } : {}),
                });
              }}
            >
              <option value="paragraph">Paragraphe</option>
              <option value="heading">Intertitre</option>
              <option value="list">Liste à puces</option>
              <option value="quote">Citation</option>
            </Select>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Monter ce paragraphe"
              disabled={index === 0}
              onClick={() => {
                const next = [...nodes];
                const [moved] = next.splice(index, 1);
                if (moved) next.splice(index - 1, 0, moved);
                onChange(next);
              }}
            >
              <Icon name="arrow-up" size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Retirer ce paragraphe"
              onClick={() => onChange(nodes.filter((_, position) => position !== index))}
            >
              <Icon name="x" size={14} />
            </Button>
          </div>
          {node.kind === 'list' ? (
            <Textarea
              rows={4}
              aria-label="Éléments de la liste, un par ligne"
              value={(node.items ?? []).join('\n')}
              onChange={(event) =>
                set(index, { ...node, items: event.target.value.split('\n').slice(0, 30) })
              }
            />
          ) : (
            <Textarea
              rows={node.kind === 'heading' ? 1 : 4}
              aria-label={node.kind === 'heading' ? 'Intertitre' : 'Texte'}
              value={node.text}
              maxLength={4000}
              onChange={(event) => set(index, { ...node, text: event.target.value })}
            />
          )}
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange([...nodes, { kind: 'paragraph', text: '' }])}
      >
        Ajouter un paragraphe
      </Button>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Listes                                                                     */
/* -------------------------------------------------------------------------- */

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
      return { mediaId: null, url: null, alt: '' };
    case 'link':
      return { label: 'En savoir plus', href: '/', style: 'primary', external: false };
    default:
      return '';
  }
}

const ADD_LABELS: Record<string, string> = {
  items: 'Ajouter un élément',
  actions: 'Ajouter un bouton',
  steps: 'Ajouter une étape',
  plans: 'Ajouter une formule',
  highlights: 'Ajouter un point fort',
  features: 'Ajouter une ligne',
};

function ListEditor({
  field,
  value,
  onChange,
  context,
}: {
  field: EditorField;
  value: Value;
  onChange: (next: Value) => void;
  context: FieldContext;
}) {
  const items = Array.isArray(value) ? value : [];
  const itemFields = field.itemFields ?? [];
  const isLinkList = field.name === 'actions';
  // Galerie, logos : une liste de photos se choisit dans la bibliotheque,
  // pas champ par champ.
  const isPhotoList = itemFields.some((child) => child.name === 'mediaId');

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  };

  const controls = (index: number) => (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Monter"
        disabled={index === 0}
        onClick={() => move(index, -1)}
      >
        <Icon name="arrow-up" size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Descendre"
        disabled={index === items.length - 1}
        onClick={() => move(index, 1)}
      >
        <Icon name="arrow-down" size={14} />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(items.filter((_, position) => position !== index))}
      >
        Retirer
      </Button>
    </div>
  );

  if (isPhotoList) {
    return <PhotoListEditor field={field} value={items} onChange={onChange} context={context} />;
  }

  if (itemFields.length === 0 && !isLinkList) {
    return (
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">{field.label}</legend>
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <Input
              value={asString(item)}
              aria-label={`${field.label} ${index + 1}`}
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
          {ADD_LABELS[field.name] ?? 'Ajouter'}
        </Button>
      </fieldset>
    );
  }

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      {items.map((item, index) => {
        if (isLinkList) {
          return (
            <div key={index} className="space-y-1" data-field-index={index}>
              <LinkEditor
                legend={`Bouton ${index + 1}`}
                value={item}
                pages={context.pages}
                onChange={(next) => {
                  const updated = [...items];
                  updated[index] = next;
                  onChange(updated);
                }}
              />
              {controls(index)}
            </div>
          );
        }
        const record = (item ?? {}) as Record<string, Value>;
        return (
          <div
            key={index}
            className="space-y-3 rounded-[var(--radius-md)] border border-[var(--border)] p-3"
          >
            {itemFields.map((child) => (
              <FieldEditor
                key={child.name}
                field={child}
                value={record[child.name]}
                context={context}
                onChange={(next) => {
                  const updated = [...items];
                  updated[index] = { ...record, [child.name]: next };
                  onChange(updated);
                }}
              />
            ))}
            {controls(index)}
          </div>
        );
      })}

      {field.maxItems === undefined || items.length < field.maxItems ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            onChange([
              ...items,
              isLinkList
                ? {
                    label: 'Nous contacter',
                    href: context.pages[0]?.path ?? '/',
                    style: 'primary',
                    external: false,
                  }
                : Object.fromEntries(itemFields.map((child) => [child.name, defaultFor(child)])),
            ])
          }
        >
          {ADD_LABELS[field.name] ?? 'Ajouter un élément'}
        </Button>
      ) : null}
    </fieldset>
  );
}

function PhotoListEditor({
  field,
  value,
  onChange,
  context,
}: {
  field: EditorField;
  value: unknown[];
  onChange: (next: Value) => void;
  context: FieldContext;
}) {
  const [picking, setPicking] = useState(false);
  const photos = value as MediaValue[];
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      {photos.length === 0 ? (
        <p className="text-sm text-[var(--foreground-muted)]">Aucune photo pour l’instant.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((photo, index) => (
            <li key={`${photo.mediaId ?? 'x'}-${index}`} className="relative">
              {photo.url ? (
                <img
                  src={photo.url}
                  alt={photo.alt ?? ''}
                  className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="aspect-square rounded-[var(--radius-sm)] bg-[var(--surface-2)]" />
              )}
              <button
                type="button"
                className="absolute top-1 right-1 rounded-full bg-black/70 p-1 text-white"
                aria-label="Retirer cette photo"
                onClick={() => onChange(photos.filter((_, position) => position !== index))}
              >
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
        <Icon name="image" size={14} aria-hidden="true" />
        Ajouter une photo
      </Button>
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        canUpload={context.canManageMedia}
        onPick={(item) => {
          setPicking(false);
          onChange([...photos, { mediaId: item.id, url: item.url, alt: item.alt }]);
        }}
      />
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Aiguillage                                                                 */
/* -------------------------------------------------------------------------- */

export function FieldEditor({
  field,
  value,
  onChange,
  context,
}: {
  field: EditorField;
  value: Value;
  onChange: (next: Value) => void;
  context: FieldContext;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const highlighted = context.focus?.name === field.name;

  // Un clic dans l apercu sur cet element amene ici, et met le curseur dans
  // le champ : le client ne cherche pas ou modifier ce qu il vient de voir.
  useEffect(() => {
    if (!highlighted || !ref.current) return;
    ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const target = ref.current.querySelector<HTMLElement>('input, textarea, select, button');
    target?.focus({ preventScroll: true });
  }, [highlighted, context.focus?.nonce]);

  const content = (() => {
    switch (field.kind) {
      case 'textarea':
        return (
          <Field label={field.label}>
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
          <Field label={field.label}>
            <Input
              type="number"
              value={typeof value === 'number' ? value : ''}
              onChange={(event) =>
                onChange(event.target.value === '' ? 0 : Number(event.target.value))
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
          <Field label={field.label}>
            <Select
              value={asString(value)}
              onChange={(event) => {
                const raw = event.target.value;
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
        return <ListEditor field={field} value={value} onChange={onChange} context={context} />;
      case 'media':
        return <MediaEditor field={field} value={value} onChange={onChange} context={context} />;
      case 'link':
        return value ? (
          <div className="space-y-2">
            <LinkEditor
              legend={field.label}
              value={value}
              onChange={onChange}
              pages={context.pages}
            />
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              Retirer ce bouton
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              onChange({
                label: 'En savoir plus',
                href: context.pages[0]?.path ?? '/',
                style: 'primary',
                external: false,
              })
            }
          >
            Ajouter un bouton
          </Button>
        );
      case 'rich':
        return <RichEditor field={field} value={value} onChange={onChange} />;
      default:
        return (
          <Field label={field.label}>
            <Input
              value={asString(value)}
              maxLength={field.maxLength}
              onChange={(event) => onChange(event.target.value)}
            />
          </Field>
        );
    }
  })();

  return (
    <div
      ref={ref}
      data-field={field.name}
      className={cn(
        'rounded-[var(--radius-md)] transition-shadow',
        highlighted && 'ring-2 ring-[var(--accent)] ring-offset-4 ring-offset-[var(--surface)]',
      )}
    >
      {content}
    </div>
  );
}
