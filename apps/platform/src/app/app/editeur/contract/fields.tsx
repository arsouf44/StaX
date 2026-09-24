'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, Field, Icon, Input, Select, Switch, Textarea, cn } from '@stax/ui';
import {
  WEEK_DAYS,
  WEEK_DAY_LABELS,
  newItemId,
  richTextSchema,
  richTextToHtml,
  type FieldDefinition,
  type RichBlock,
  type RichInline,
  type RichText,
  type SimpleFieldDefinition,
  type SiteManifest,
} from '@stax/site-contract';
import { MediaPicker } from '../field-editors';

/**
 * Editeurs des champs du contrat d'edition.
 *
 * Le client ne voit jamais de HTML, de CSS, de JSON ni de fichier : un titre
 * se tape, une photo se remplace, un horaire se coche. Chaque controle
 * produit exactement la forme de valeur attendue par le contrat, que le
 * serveur revalide de toute facon.
 */

export interface FieldEnv {
  manifest: SiteManifest;
  mediaUrls: Record<string, string>;
  /** Origine du site (pour afficher les images deja presentes dans le site). */
  siteOrigin: string | null;
  canManageMedia: boolean;
  onMediaPicked: (id: string, url: string) => void;
  /** Erreur a afficher sous un champ, par chemin. */
  issueFor: (path: string) => string | undefined;
}

type Props<F> = {
  field: F;
  value: unknown;
  onChange: (next: unknown) => void;
  env: FieldEnv;
  path: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function text(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span
      className={cn(
        'text-2xs tabular-nums',
        length > max ? 'text-[var(--danger)]' : 'text-[var(--muted)]',
      )}
    >
      {length} / {max}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Images                                                                      */
/* -------------------------------------------------------------------------- */

export function imageUrl(value: unknown, env: FieldEnv): string | null {
  if (!isRecord(value)) return null;
  if (typeof value['mediaId'] === 'string')
    return env.mediaUrls[value['mediaId'].toLowerCase()] ?? null;
  if (typeof value['src'] === 'string') {
    const src = value['src'];
    if (src.startsWith('https://')) return src;
    if (src.startsWith('/') && env.siteOrigin) return `${env.siteOrigin}${src}`;
  }
  return null;
}

function ImageControl({
  label,
  value,
  onChange,
  env,
  help,
  aspectRatio,
  error,
}: {
  label: string;
  value: unknown;
  onChange: (next: unknown) => void;
  env: FieldEnv;
  help?: string;
  aspectRatio?: string;
  error?: string;
}) {
  const [picking, setPicking] = useState(false);
  const url = imageUrl(value, env);
  const image = isRecord(value) ? value : null;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {help ? <p className="text-xs text-[var(--muted)]">{help}</p> : null}
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)]">
        {url ? (
          <img src={url} alt={text(image?.['alt'])} className="aspect-[16/9] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center text-sm text-[var(--muted)]">
            Aucune photo
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
          <Icon name="image" size={14} aria-hidden="true" />
          {url ? 'Remplacer' : 'Choisir une photo'}
        </Button>
        {image ? (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
            Retirer
          </Button>
        ) : null}
        {aspectRatio ? (
          <span className="self-center text-2xs text-[var(--muted)]">
            Format conseillé : {aspectRatio}
          </span>
        ) : null}
      </div>
      {image ? (
        <Field
          label="Que montre cette photo ?"
          hint="Lu par les personnes malvoyantes et par Google."
        >
          <Input
            value={text(image['alt'])}
            maxLength={300}
            onChange={(event) => onChange({ ...image, alt: event.target.value })}
          />
        </Field>
      ) : null}
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        canUpload={env.canManageMedia}
        onPick={(item) => {
          setPicking(false);
          env.onMediaPicked(item.id, item.url);
          onChange({ mediaId: item.id, alt: item.alt || text(image?.['alt']) });
        }}
      />
    </fieldset>
  );
}

function GalleryControl({
  field,
  value,
  onChange,
  env,
  path,
}: Props<Extract<FieldDefinition, { type: 'gallery' }>>) {
  const [picking, setPicking] = useState(false);
  const images = Array.isArray(value) ? value.filter(isRecord) : [];
  const max = field.max ?? 24;
  const move = (index: number, delta: number) => {
    const next = [...images];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      <ul className="grid grid-cols-2 gap-2">
        {images.map((image, index) => {
          const url = imageUrl(image, env);
          return (
            <li
              key={`${text(image['mediaId'])}${text(image['src'])}-${index}`}
              className="space-y-1 rounded-[var(--radius-md)] border border-[var(--border)] p-1.5"
            >
              {url ? (
                <img src={url} alt="" className="aspect-[4/3] w-full rounded object-cover" />
              ) : null}
              <Input
                aria-label={`Description de la photo ${index + 1}`}
                placeholder="Que montre cette photo ?"
                value={text(image['alt'])}
                onChange={(event) =>
                  onChange(
                    images.map((entry, i) =>
                      i === index ? { ...entry, alt: event.target.value } : entry,
                    ),
                  )
                }
              />
              <div className="flex justify-between">
                <span className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label="Avancer"
                  >
                    ←
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === images.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Reculer"
                  >
                    →
                  </Button>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(images.filter((_, i) => i !== index))}
                >
                  Retirer
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {images.length < max ? (
        <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
          Ajouter une photo
        </Button>
      ) : (
        <p className="text-xs text-[var(--muted)]">{max} photos au maximum.</p>
      )}
      {env.issueFor(path) ? (
        <p className="text-xs text-[var(--danger)]">{env.issueFor(path)}</p>
      ) : null}
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        canUpload={env.canManageMedia}
        onPick={(item) => {
          setPicking(false);
          env.onMediaPicked(item.id, item.url);
          onChange([...images, { mediaId: item.id, alt: item.alt }]);
        }}
      />
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Liens                                                                       */
/* -------------------------------------------------------------------------- */

type Destination = 'page' | 'web' | 'phone' | 'email' | 'anchor';

function destinationOf(href: string): Destination {
  if (href.startsWith('tel:')) return 'phone';
  if (href.startsWith('mailto:')) return 'email';
  if (href.startsWith('#')) return 'anchor';
  if (/^https?:\/\//.test(href)) return 'web';
  return 'page';
}

export function HrefControl({
  value,
  onChange,
  manifest,
  allowExternal = true,
  label = 'Où mène ce lien ?',
}: {
  value: string;
  onChange: (href: string) => void;
  manifest: SiteManifest;
  allowExternal?: boolean;
  label?: string;
}) {
  // Le type de destination se deduit de la valeur ; le choix de la liste ne
  // compte que tant qu'aucune destination n'est saisie.
  const [chosen, setChosen] = useState<Destination>('page');
  const kind: Destination = value ? destinationOf(value) : chosen;
  const setKind = (next: Destination) => setChosen(next);
  const raw =
    kind === 'phone'
      ? value.replace(/^tel:/, '')
      : kind === 'email'
        ? value.replace(/^mailto:/, '')
        : value;
  return (
    <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
      <Field label={label}>
        <Select
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as Destination);
            onChange('');
          }}
        >
          <option value="page">Une page du site</option>
          {allowExternal ? <option value="web">Un autre site</option> : null}
          <option value="phone">Un appel</option>
          <option value="email">Un e-mail</option>
        </Select>
      </Field>
      {kind === 'page' ? (
        <Field label="Page">
          <Select value={value} onChange={(event) => onChange(event.target.value)}>
            <option value="">Choisir…</option>
            {manifest.pages.map((page) => (
              <option key={page.id} value={page.path}>
                {page.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field
          label={
            kind === 'web'
              ? 'Adresse (https://…)'
              : kind === 'phone'
                ? 'Numéro'
                : kind === 'email'
                  ? 'Adresse e-mail'
                  : 'Ancre'
          }
        >
          <Input
            value={raw}
            inputMode={kind === 'phone' ? 'tel' : kind === 'email' ? 'email' : 'url'}
            onChange={(event) => {
              const next = event.target.value.trim();
              onChange(
                !next
                  ? ''
                  : kind === 'phone'
                    ? `tel:${next.replace(/[^0-9+]/g, '')}`
                    : kind === 'email'
                      ? `mailto:${next}`
                      : next,
              );
            }}
          />
        </Field>
      )}
    </div>
  );
}

function LinkControl({
  field,
  value,
  onChange,
  env,
  path,
}: Props<Extract<SimpleFieldDefinition, { type: 'link' }>>) {
  const link = isRecord(value) ? value : { label: '', href: '' };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      <Field label="Texte du bouton">
        <Input
          value={text(link['label'])}
          maxLength={field.labelMaxLength ?? 60}
          onChange={(event) => onChange({ ...link, label: event.target.value })}
        />
      </Field>
      <HrefControl
        manifest={env.manifest}
        allowExternal={field.allowExternal !== false}
        value={text(link['href'])}
        onChange={(href) => onChange({ ...link, href })}
      />
      {(env.issueFor(path) ?? env.issueFor(`${path}.href`)) ? (
        <p className="text-xs text-[var(--danger)]">
          {env.issueFor(path) ?? env.issueFor(`${path}.href`)}
        </p>
      ) : null}
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Texte riche : mise en forme simple, sans HTML visible                      */
/* -------------------------------------------------------------------------- */

function readInlines(
  node: Node,
  marks: { bold?: boolean; italic?: boolean; href?: string } = {},
): RichInline[] {
  const out: RichInline[] = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      const value = child.textContent ?? '';
      if (value)
        out.push({
          text: value,
          ...(marks.bold ? { bold: true } : {}),
          ...(marks.italic ? { italic: true } : {}),
          ...(marks.href ? { href: marks.href } : {}),
        });
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const element = child as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === 'br') {
      out.push({ text: '\n', ...(marks.bold ? { bold: true } : {}) });
      return;
    }
    const next = { ...marks };
    if (tag === 'b' || tag === 'strong') next.bold = true;
    if (tag === 'i' || tag === 'em') next.italic = true;
    if (tag === 'a') next.href = element.getAttribute('href') ?? undefined;
    out.push(...readInlines(element, next));
  });
  // Fusionne les fragments voisins de meme mise en forme.
  return out.reduce<RichInline[]>((merged, inline) => {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.bold === inline.bold &&
      last.italic === inline.italic &&
      last.href === inline.href
    ) {
      last.text += inline.text;
    } else {
      merged.push({ ...inline });
    }
    return merged;
  }, []);
}

/** Relit le contenu editable en blocs du contrat : tout balisage inconnu est ignore. */
function readBlocks(root: HTMLElement): RichText {
  const blocks: RichBlock[] = [];
  const pushParagraph = (node: Node) => {
    const children = readInlines(node);
    if (children.some((inline) => inline.text.trim())) blocks.push({ type: 'paragraph', children });
  };
  root.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent?.trim())
        blocks.push({ type: 'paragraph', children: [{ text: child.textContent }] });
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const element = child as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === 'h2' || tag === 'h3') {
      blocks.push({ type: 'heading', level: tag === 'h2' ? 2 : 3, children: readInlines(element) });
    } else if (tag === 'ul' || tag === 'ol') {
      const items = [...element.querySelectorAll(':scope > li')].map((li) => readInlines(li));
      if (items.length) blocks.push({ type: 'list', ordered: tag === 'ol', items });
    } else if (tag === 'blockquote') {
      blocks.push({ type: 'quote', children: readInlines(element) });
    } else {
      pushParagraph(element);
    }
  });
  return blocks;
}

function RichTextControl({
  field,
  value,
  onChange,
  env,
  path,
}: Props<Extract<SimpleFieldDefinition, { type: 'richtext' }>>) {
  const ref = useRef<HTMLDivElement>(null);
  const parsed = richTextSchema.safeParse(value);
  const initial = parsed.success ? richTextToHtml(parsed.data) : '';
  const lastEmitted = useRef<string>('');
  const blocks = new Set(field.blocks ?? ['paragraph', 'heading', 'list', 'quote']);
  const marks = new Set(field.marks ?? ['bold', 'italic', 'link']);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Le HTML injecte ici est produit par `richTextToHtml` : tout texte y est
    // echappe, et seules les balises du contrat existent.
    if (lastEmitted.current !== initial) element.innerHTML = initial;
  }, [initial]);

  const emit = () => {
    const element = ref.current;
    if (!element) return;
    const next = readBlocks(element);
    lastEmitted.current = richTextToHtml(next);
    onChange(next);
  };

  const command = (name: string, argument?: string) => {
    ref.current?.focus();
    // `execCommand` reste le moyen le plus fiable de mettre en forme une
    // selection dans un contentEditable ; le resultat est relu et nettoye.
    document.execCommand(name, false, argument);
    emit();
  };

  const length = parsed.success
    ? parsed.data.reduce((total, block) => total + JSON.stringify(block).length, 0)
    : 0;

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{field.label}</p>
      <div className="flex flex-wrap gap-1 rounded-t-[var(--radius-md)] border border-b-0 border-[var(--border)] bg-[var(--surface-2)] p-1">
        {blocks.has('paragraph') ? (
          <Button variant="ghost" size="sm" onClick={() => command('formatBlock', 'P')}>
            Paragraphe
          </Button>
        ) : null}
        {blocks.has('heading') ? (
          <Button variant="ghost" size="sm" onClick={() => command('formatBlock', 'H2')}>
            Titre
          </Button>
        ) : null}
        {marks.has('bold') ? (
          <Button variant="ghost" size="sm" onClick={() => command('bold')} aria-label="Gras">
            <strong>G</strong>
          </Button>
        ) : null}
        {marks.has('italic') ? (
          <Button variant="ghost" size="sm" onClick={() => command('italic')} aria-label="Italique">
            <em>I</em>
          </Button>
        ) : null}
        {blocks.has('list') ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => command('insertUnorderedList')}>
              • Liste
            </Button>
            <Button variant="ghost" size="sm" onClick={() => command('insertOrderedList')}>
              1. Liste
            </Button>
          </>
        ) : null}
        {blocks.has('quote') ? (
          <Button variant="ghost" size="sm" onClick={() => command('formatBlock', 'BLOCKQUOTE')}>
            Citation
          </Button>
        ) : null}
        {marks.has('link') ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const href = window.prompt(
                'Adresse du lien (une page du site comme /contact, ou https://…)',
              );
              if (
                href &&
                (/^https?:\/\//.test(href) ||
                  href.startsWith('/') ||
                  href.startsWith('mailto:') ||
                  href.startsWith('tel:'))
              ) {
                command('createLink', href);
              }
            }}
          >
            Lien
          </Button>
        ) : null}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={field.label}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={(event) => {
          // Coller du texte seul : jamais le balisage d'une autre page.
          event.preventDefault();
          const plain = event.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, plain);
          emit();
        }}
        className="prose-sm min-h-32 rounded-b-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm focus:outline-2 focus:outline-[var(--accent)] [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
      <div className="flex justify-between">
        {env.issueFor(path) ? (
          <p className="text-xs text-[var(--danger)]">{env.issueFor(path)}</p>
        ) : (
          <span />
        )}
        {field.maxLength ? <Counter length={length} max={field.maxLength} /> : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Horaires                                                                    */
/* -------------------------------------------------------------------------- */

interface Slot {
  open: string;
  close: string;
}

function OpeningHoursControl({
  field,
  value,
  onChange,
}: Props<Extract<SimpleFieldDefinition, { type: 'opening_hours' }>>) {
  const hours = isRecord(value) ? value : {};
  const week = (isRecord(hours['week']) ? hours['week'] : {}) as Record<string, Slot[] | undefined>;
  const exceptions = Array.isArray(hours['exceptions'])
    ? (hours['exceptions'] as Array<Record<string, unknown>>)
    : [];
  const update = (next: Record<string, unknown>) => onChange({ week, ...hours, ...next });
  const setDay = (day: string, slots: Slot[]) => update({ week: { ...week, [day]: slots } });

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      <ul className="space-y-2">
        {WEEK_DAYS.map((day) => {
          const slots = week[day] ?? [];
          const closed = slots.length === 0;
          return (
            <li key={day} className="rounded-[var(--radius-md)] border border-[var(--border)] p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{WEEK_DAY_LABELS[day]}</span>
                <Switch
                  label={closed ? 'Fermé' : 'Ouvert'}
                  checked={!closed}
                  onChange={(event) =>
                    setDay(day, event.target.checked ? [{ open: '09:00', close: '18:00' }] : [])
                  }
                />
              </div>
              {!closed ? (
                <div className="mt-2 space-y-1.5">
                  {slots.map((slot, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        type="time"
                        aria-label={`${WEEK_DAY_LABELS[day]} ouverture`}
                        value={slot.open}
                        onChange={(event) =>
                          setDay(
                            day,
                            slots.map((entry, i) =>
                              i === index ? { ...entry, open: event.target.value } : entry,
                            ),
                          )
                        }
                      />
                      <span className="text-xs text-[var(--muted)]">à</span>
                      <Input
                        type="time"
                        aria-label={`${WEEK_DAY_LABELS[day]} fermeture`}
                        value={slot.close}
                        onChange={(event) =>
                          setDay(
                            day,
                            slots.map((entry, i) =>
                              i === index ? { ...entry, close: event.target.value } : entry,
                            ),
                          )
                        }
                      />
                      {slots.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setDay(
                              day,
                              slots.filter((_, i) => i !== index),
                            )
                          }
                          aria-label="Retirer ce créneau"
                        >
                          ×
                        </Button>
                      ) : null}
                    </div>
                  ))}
                  {slots.length < 4 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDay(day, [...slots, { open: '14:00', close: '18:00' }])}
                    >
                      + Ajouter un créneau
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {field.exceptions !== false ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Fermetures et horaires exceptionnels</p>
          {exceptions.map((exception, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2 sm:grid-cols-[9rem_1fr_auto]"
            >
              <Input
                type="date"
                aria-label="Date"
                value={text(exception['date'])}
                onChange={(event) =>
                  update({
                    exceptions: exceptions.map((entry, i) =>
                      i === index ? { ...entry, date: event.target.value } : entry,
                    ),
                  })
                }
              />
              <Input
                placeholder="Précision (ex. : jour férié)"
                value={text(exception['note'])}
                onChange={(event) =>
                  update({
                    exceptions: exceptions.map((entry, i) =>
                      i === index ? { ...entry, note: event.target.value } : entry,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update({ exceptions: exceptions.filter((_, i) => i !== index) })}
              >
                Retirer
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              update({
                exceptions: [
                  ...exceptions,
                  { date: new Date().toISOString().slice(0, 10), closed: true },
                ],
              })
            }
          >
            Ajouter une fermeture
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Menu de navigation                                                          */
/* -------------------------------------------------------------------------- */

function NavigationControl({
  field,
  value,
  onChange,
  env,
}: Props<Extract<FieldDefinition, { type: 'navigation' }>>) {
  const items = Array.isArray(value) ? value.filter(isRecord) : [];
  const max = field.maxItems ?? 12;
  const set = (index: number, patch: Record<string, unknown>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      {items.map((item, index) => (
        <div
          key={text(item['id']) || index}
          className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2"
        >
          <Field label={`Lien ${index + 1}`}>
            <Input
              value={text(item['label'])}
              maxLength={40}
              onChange={(event) => set(index, { label: event.target.value })}
            />
          </Field>
          <HrefControl
            manifest={env.manifest}
            value={text(item['href'])}
            onChange={(href) => set(index, { href })}
          />
          <div className="flex justify-between">
            <span className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                Monter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                Descendre
              </Button>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Retirer
            </Button>
          </div>
        </div>
      ))}
      {items.length < max ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange([...items, { id: newItemId(), label: '', href: '' }])}
        >
          Ajouter un lien
        </Button>
      ) : null}
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  SEO et adresse                                                              */
/* -------------------------------------------------------------------------- */

function SeoControl({
  field,
  value,
  onChange,
  env,
  path,
}: Props<Extract<SimpleFieldDefinition, { type: 'seo' }>>) {
  const seo = isRecord(value) ? value : {};
  const titleMax = field.titleMax ?? 70;
  const descriptionMax = field.descriptionMax ?? 160;
  const title = text(seo['title']);
  const description = text(seo['description']);
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      <Field label="Titre dans Google" hint={<Counter length={title.length} max={titleMax} />}>
        <Input
          value={title}
          onChange={(event) => onChange({ ...seo, title: event.target.value })}
        />
      </Field>
      <Field
        label="Description dans Google"
        hint={<Counter length={description.length} max={descriptionMax} />}
      >
        <Textarea
          rows={3}
          value={description}
          onChange={(event) => onChange({ ...seo, description: event.target.value })}
        />
      </Field>
      {title || description ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-2xs text-[var(--muted)]">Aperçu du résultat Google</p>
          <p className="mt-1 truncate text-sm text-[#1a0dab] dark:text-[#8ab4f8]">
            {title || 'Titre de la page'}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-[var(--foreground-muted)]">
            {description}
          </p>
        </div>
      ) : null}
      {field.image ? (
        <ImageControl
          label="Image de partage (réseaux sociaux)"
          value={seo['image']}
          onChange={(image) => onChange({ ...seo, image })}
          env={env}
        />
      ) : null}
      {(env.issueFor(`${path}.title`) ?? env.issueFor(`${path}.description`)) ? (
        <p className="text-xs text-[var(--danger)]">
          {env.issueFor(`${path}.title`) ?? env.issueFor(`${path}.description`)}
        </p>
      ) : null}
    </fieldset>
  );
}

function AddressControl({
  field,
  value,
  onChange,
}: Props<Extract<SimpleFieldDefinition, { type: 'address' }>>) {
  const address = isRecord(value) ? value : { country: 'FR' };
  const set = (key: string, next: string) => onChange({ ...address, [key]: next });
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      <Field label="Adresse">
        <Input
          value={text(address['line1'])}
          onChange={(event) => set('line1', event.target.value)}
        />
      </Field>
      <Field label="Complément">
        <Input
          value={text(address['line2'])}
          onChange={(event) => set('line2', event.target.value)}
        />
      </Field>
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_6rem]">
        <Field label="Code postal">
          <Input
            value={text(address['postalCode'])}
            onChange={(event) => set('postalCode', event.target.value)}
          />
        </Field>
        <Field label="Ville">
          <Input
            value={text(address['city'])}
            onChange={(event) => set('city', event.target.value)}
          />
        </Field>
        <Field label="Pays">
          <Select
            value={text(address['country']) || 'FR'}
            onChange={(event) => set('country', event.target.value)}
          >
            {['FR', 'BE', 'CH', 'LU', 'MC', 'CA', 'DE', 'ES', 'IT', 'GB', 'US'].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Listes repetables                                                           */
/* -------------------------------------------------------------------------- */

function RepeaterControl({
  field,
  value,
  onChange,
  env,
  path,
}: Props<Extract<FieldDefinition, { type: 'repeater' }>>) {
  const items = Array.isArray(value) ? value.filter(isRecord) : [];
  const [open, setOpen] = useState<string | null>(null);
  const max = field.max ?? 20;
  const move = (index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  const titleOf = (item: Record<string, unknown>, index: number) => {
    const first = field.fields.find((sub) => sub.type === 'text');
    const label = first ? text(item[first.id]) : '';
    return label || `${field.itemLabel ?? 'Élément'} ${index + 1}`;
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">{field.label}</legend>
      {items.map((item, index) => {
        const id = text(item['_id']) || String(index);
        const expanded = open === id;
        return (
          <div key={id} className="rounded-[var(--radius-md)] border border-[var(--border)]">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
              aria-expanded={expanded}
              onClick={() => setOpen(expanded ? null : id)}
            >
              <span className="truncate">{titleOf(item, index)}</span>
              <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} aria-hidden="true" />
            </button>
            {expanded ? (
              <div className="space-y-3 border-t border-[var(--border)] p-3">
                {field.fields.map((sub) => (
                  <FieldControl
                    key={sub.id}
                    field={sub}
                    value={item[sub.id]}
                    env={env}
                    path={`${path}[${index}].${sub.id}`}
                    onChange={(next) =>
                      onChange(
                        items.map((entry, i) =>
                          i === index ? { ...entry, [sub.id]: next } : entry,
                        ),
                      )
                    }
                  />
                ))}
                <div className="flex justify-between border-t border-[var(--border)] pt-2">
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      Monter
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      Descendre
                    </Button>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(items.filter((_, i) => i !== index))}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {items.length < max ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            const created = { _id: newItemId() };
            onChange([...items, created]);
            setOpen(created._id);
          }}
        >
          Ajouter {field.itemLabel ? `un élément « ${field.itemLabel} »` : 'un élément'}
        </Button>
      ) : (
        <p className="text-xs text-[var(--muted)]">{max} éléments au maximum.</p>
      )}
      {env.issueFor(path) ? (
        <p className="text-xs text-[var(--danger)]">{env.issueFor(path)}</p>
      ) : null}
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Aiguillage                                                                  */
/* -------------------------------------------------------------------------- */

export function FieldControl({
  field,
  value,
  onChange,
  env,
  path,
}: {
  field: FieldDefinition;
  value: unknown;
  onChange: (next: unknown) => void;
  env: FieldEnv;
  path: string;
}) {
  const error = env.issueFor(path);
  switch (field.type) {
    case 'text': {
      const max = field.maxLength ?? (field.multiline ? 2000 : 300);
      const current = text(value);
      return (
        <Field
          label={field.label}
          hint={field.help ?? <Counter length={current.length} max={max} />}
          error={error}
        >
          {field.multiline ? (
            <Textarea
              rows={4}
              value={current}
              placeholder={field.placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : (
            <Input
              value={current}
              placeholder={field.placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </Field>
      );
    }
    case 'richtext':
      return (
        <RichTextControl field={field} value={value} onChange={onChange} env={env} path={path} />
      );
    case 'image':
      return (
        <ImageControl
          label={field.label}
          help={field.help}
          aspectRatio={field.aspectRatio}
          value={value}
          onChange={onChange}
          env={env}
          error={error ?? env.issueFor(`${path}.alt`)}
        />
      );
    case 'gallery':
      return (
        <GalleryControl field={field} value={value} onChange={onChange} env={env} path={path} />
      );
    case 'link':
      return <LinkControl field={field} value={value} onChange={onChange} env={env} path={path} />;
    case 'url':
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Input
            type="url"
            value={text(value)}
            placeholder="https://…"
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
    case 'phone':
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Input
            type="tel"
            inputMode="tel"
            value={text(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
    case 'email':
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Input
            type="email"
            value={text(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
    case 'number':
      return (
        <Field
          label={`${field.label}${field.unit ? ` (${field.unit})` : ''}`}
          hint={field.help}
          error={error}
        >
          <Input
            type="number"
            inputMode="decimal"
            value={text(value)}
            min={field.min}
            max={field.max}
            step={field.step ?? (field.integer ? 1 : 'any')}
            onChange={(event) =>
              onChange(event.target.value === '' ? null : Number(event.target.value))
            }
          />
        </Field>
      );
    case 'boolean':
      return (
        <Checkbox
          label={field.label}
          description={field.help}
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
    case 'select':
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Select value={text(value)} onChange={(event) => onChange(event.target.value || null)}>
            <option value="">Choisir…</option>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    case 'date':
      return (
        <Field label={field.label} hint={field.help} error={error}>
          <Input
            type="date"
            value={text(value)}
            min={field.min}
            max={field.max}
            onChange={(event) => onChange(event.target.value || null)}
          />
        </Field>
      );
    case 'opening_hours':
      return (
        <OpeningHoursControl
          field={field}
          value={value}
          onChange={onChange}
          env={env}
          path={path}
        />
      );
    case 'seo':
      return <SeoControl field={field} value={value} onChange={onChange} env={env} path={path} />;
    case 'address':
      return (
        <AddressControl field={field} value={value} onChange={onChange} env={env} path={path} />
      );
    case 'navigation':
      return (
        <NavigationControl field={field} value={value} onChange={onChange} env={env} path={path} />
      );
    case 'repeater':
      return (
        <RepeaterControl field={field} value={value} onChange={onChange} env={env} path={path} />
      );
    default:
      return null;
  }
}
