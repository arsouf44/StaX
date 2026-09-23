'use client';

import Link from 'next/link';
import { Button, Icon, Select, Switch, Field, cn } from '@stax/ui';
import { FieldEditor, type FieldContext } from './field-editors';
import type { BlockMeta, EditorBlock } from './types';

/**
 * Panneau de droite : ce que l on peut faire avec la section choisie.
 *
 * Deux onglets seulement, avec des mots simples : « Contenu » (textes,
 * photos, boutons) et « Apparence » (disposition, fond, largeur). Les actions
 * sur la section elle-meme — deplacer, dupliquer, masquer, supprimer — sont
 * toujours visibles en haut, jamais cachees dans un menu.
 */

const BACKGROUNDS = [
  { value: 'default', label: 'Normal' },
  { value: 'surface', label: 'Léger' },
  { value: 'contrast', label: 'Contrasté' },
  { value: 'accent', label: 'Couleur principale' },
];

const WIDTHS = [
  { value: 'narrow', label: 'Étroit' },
  { value: 'default', label: 'Normal' },
  { value: 'wide', label: 'Large' },
  { value: 'full', label: 'Toute la largeur' },
];

const SPACINGS = [
  { value: 'compact', label: 'Serré' },
  { value: 'default', label: 'Normal' },
  { value: 'roomy', label: 'Aéré' },
];

function Choice({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={legend}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm transition-colors',
              value === option.value
                ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--foreground)]'
                : 'border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function PropertiesPanel({
  block,
  meta,
  index,
  total,
  tab,
  onTab,
  context,
  onProps,
  onSettings,
  onMove,
  onDuplicate,
  onToggle,
  onDelete,
}: {
  block: EditorBlock;
  meta: BlockMeta;
  index: number;
  total: number;
  tab: 'content' | 'style';
  onTab: (tab: 'content' | 'style') => void;
  context: FieldContext;
  onProps: (name: string, value: unknown, label: string) => void;
  onSettings: (patch: Record<string, unknown>) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const settings = block.settings as Record<string, unknown>;
  const str = (key: string, fallback: string) =>
    typeof settings[key] === 'string' ? (settings[key] as string) : fallback;

  return (
    <div className="flex h-full flex-col" data-testid="properties-panel">
      <div className="border-b border-[var(--border)] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-2 text-[var(--muted)]">
            <Icon name={meta.icon} size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-medium" data-testid="selected-section-label">
              {meta.label}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">{meta.description}</p>
          </div>
        </div>
        {!block.visible ? (
          <p className="mt-3 rounded-[var(--radius-sm)] bg-[var(--warning)]/10 px-3 py-2 text-xs">
            Section masquée : vos visiteurs ne la voient pas.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Monter la section"
          >
            <Icon name="arrow-up" size={14} aria-hidden="true" />
            Monter
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Descendre la section"
          >
            <Icon name="arrow-down" size={14} aria-hidden="true" />
            Descendre
          </Button>
          {!meta.singleton ? (
            <Button variant="ghost" size="sm" onClick={onDuplicate}>
              <Icon name="copy" size={14} aria-hidden="true" />
              Dupliquer
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onToggle}>
            <Icon name={block.visible ? 'eye-off' : 'eye'} size={14} aria-hidden="true" />
            {block.visible ? 'Masquer' : 'Afficher'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--danger)] hover:text-[var(--danger)]"
            onClick={onDelete}
          >
            <Icon name="trash-2" size={14} aria-hidden="true" />
            Supprimer
          </Button>
        </div>
      </div>

      <div
        className="flex border-b border-[var(--border)] px-4"
        role="tablist"
        aria-label="Réglages"
      >
        {(
          [
            ['content', 'Contenu'],
            ['style', 'Apparence'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => onTab(value)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2.5 text-sm',
              tab === value
                ? 'border-[var(--accent)] font-medium text-[var(--foreground)]'
                : 'border-transparent text-[var(--foreground-muted)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {tab === 'content' ? (
          <>
            {meta.dataLink ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
                <p className="text-[var(--foreground-muted)]">
                  Le contenu de cette section vient de vos informations. Modifiez-les une fois :
                  elles se mettent à jour partout.
                </p>
                <Link
                  href={meta.dataLink.href}
                  className="mt-2 inline-flex items-center gap-1 font-medium underline underline-offset-4"
                >
                  {meta.dataLink.label}
                  <Icon name="external-link" size={12} aria-hidden="true" />
                </Link>
              </div>
            ) : null}
            {meta.fields.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                Cette section n’a pas de texte à modifier ici.
              </p>
            ) : (
              meta.fields.map((field) => (
                <FieldEditor
                  key={`${block.id}-${field.name}`}
                  field={field}
                  value={block.props[field.name]}
                  context={context}
                  onChange={(value) => onProps(field.name, value, field.label)}
                />
              ))
            )}
          </>
        ) : (
          <>
            {meta.styleFields.map((field) =>
              field.kind === 'select' ? (
                <Choice
                  key={field.name}
                  legend={field.label}
                  options={field.options ?? []}
                  value={String(block.props[field.name] ?? field.options?.[0]?.value ?? '')}
                  onChange={(raw) => {
                    const numeric = Number(raw);
                    onProps(
                      field.name,
                      Number.isFinite(numeric) && String(numeric) === raw ? numeric : raw,
                      field.label,
                    );
                  }}
                />
              ) : (
                <FieldEditor
                  key={field.name}
                  field={field}
                  value={block.props[field.name]}
                  context={context}
                  onChange={(value) => onProps(field.name, value, field.label)}
                />
              ),
            )}
            <Choice
              legend="Fond"
              options={BACKGROUNDS}
              value={str('background', 'default')}
              onChange={(value) => onSettings({ background: value })}
            />
            <Choice
              legend="Largeur"
              options={WIDTHS}
              value={str('width', 'default')}
              onChange={(value) => onSettings({ width: value })}
            />
            <Choice
              legend="Espacement"
              options={SPACINGS}
              value={str('spacing', 'default')}
              onChange={(value) => onSettings({ spacing: value })}
            />
            <Field label="Alignement du texte">
              <Select
                value={str('align', 'left')}
                onChange={(event) => onSettings({ align: event.target.value })}
              >
                <option value="left">À gauche</option>
                <option value="center">Centré</option>
              </Select>
            </Field>
            <Switch
              label="Apparition en douceur au défilement"
              checked={settings['reveal'] !== false}
              onChange={(event) => onSettings({ reveal: event.target.checked })}
            />
          </>
        )}
      </div>
    </div>
  );
}
