'use client';

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../lib';

/**
 * Champs de formulaire.
 *
 * Chaque champ est relie a son libelle, a son aide et a son message d erreur
 * par `aria-describedby` et `aria-errormessage`. Une erreur n est jamais
 * signalee par la seule couleur : elle porte un texte et une icone.
 */

interface FieldContextValue {
  id: string;
  descriptionId: string;
  errorId: string;
  hasError: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useField(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: ReactNode;
  /** Premier message d erreur du champ. */
  error?: string | string[] | null;
  hint?: ReactNode;
  required?: boolean;
  /** Masque le libelle visuellement en le gardant pour les lecteurs d ecran. */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  error,
  hint,
  required = false,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const base = useId();
  const message = Array.isArray(error) ? error[0] : error;
  const value: FieldContextValue = {
    id: `${base}-field`,
    descriptionId: `${base}-hint`,
    errorId: `${base}-error`,
    hasError: Boolean(message),
    required,
  };

  return (
    <FieldContext.Provider value={value}>
      <div className={cn('space-y-2', className)}>
        <label
          htmlFor={value.id}
          className={cn(
            'block text-sm font-medium text-[var(--foreground)]',
            hideLabel && 'sr-only',
          )}
        >
          {label}
          {required ? (
            <span className="ml-1 text-[var(--danger)]" aria-hidden="true">
              *
            </span>
          ) : (
            <span className="ml-2 text-xs font-normal text-[var(--muted)]">facultatif</span>
          )}
        </label>
        {children}
        {hint && !message ? (
          <p id={value.descriptionId} className="text-xs text-[var(--muted)]">
            {hint}
          </p>
        ) : null}
        {message ? (
          <p
            id={value.errorId}
            role="alert"
            className="flex items-start gap-1.5 text-xs font-medium text-[var(--danger)]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="mt-px size-3.5 shrink-0"
              fill="currentColor"
            >
              <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.5h1.5v5h-1.5v-5Zm0 6.25h1.5v1.5h-1.5v-1.5Z" />
            </svg>
            {message}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}

const controlClasses = [
  'w-full rounded-[var(--radius-md)] border bg-[var(--background-inset)]',
  'px-3.5 py-2.5 text-sm text-[var(--foreground)]',
  'transition-[border-color,box-shadow] duration-150',
  'placeholder:text-[var(--muted)]',
  'focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]',
  'disabled:cursor-not-allowed disabled:opacity-50',
].join(' ');

function ariaProps(field: FieldContextValue | null) {
  if (!field) return {};
  return {
    id: field.id,
    'aria-invalid': field.hasError || undefined,
    'aria-describedby': field.hasError ? undefined : field.descriptionId,
    'aria-errormessage': field.hasError ? field.errorId : undefined,
    required: field.required || undefined,
  };
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    const field = useField();
    return (
      <input
        ref={ref}
        className={cn(
          controlClasses,
          'h-11 border-[var(--border)]',
          field?.hasError && 'border-[var(--danger)] focus:border-[var(--danger)]',
          className,
        )}
        {...ariaProps(field)}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...props }, ref) {
  const field = useField();
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        controlClasses,
        'resize-y border-[var(--border)] leading-relaxed',
        field?.hasError && 'border-[var(--danger)] focus:border-[var(--danger)]',
        className,
      )}
      {...ariaProps(field)}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    const field = useField();
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            controlClasses,
            'h-11 appearance-none border-[var(--border)] pr-10',
            field?.hasError && 'border-[var(--danger)] focus:border-[var(--danger)]',
            className,
          )}
          {...ariaProps(field)}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-[var(--muted)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  },
);

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  /** Message d erreur du champ, relie par `aria-errormessage`. */
  error?: string | string[] | null;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, error, className, ...props },
  ref,
) {
  const id = useId();
  const message = Array.isArray(error) ? error[0] : error;
  return (
    <div className={cn('flex gap-3', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        aria-invalid={message ? true : undefined}
        aria-errormessage={message ? `${id}-error` : undefined}
        aria-describedby={description ? `${id}-hint` : undefined}
        className={cn(
          'mt-0.5 size-4.5 shrink-0 cursor-pointer rounded-[5px] border',
          message ? 'border-[var(--danger)]' : 'border-[var(--border-strong)]',
          'bg-[var(--background-inset)] accent-[var(--accent)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        )}
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm text-[var(--foreground)]">
          {label}
        </label>
        {description ? (
          <p id={`${id}-hint`} className="mt-0.5 text-xs text-[var(--muted)]">
            {description}
          </p>
        ) : null}
        {message ? (
          <p id={`${id}-error`} className="mt-1 text-xs text-[var(--danger)]">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
});

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, className, ...props },
  ref,
) {
  const id = useId();
  return (
    <div className={cn('flex items-start justify-between gap-6', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-[var(--foreground)]">
          {label}
        </label>
        {description ? (
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">{description}</p>
        ) : null}
      </div>
      {/* Case a cocher native masquee : conserve tout le comportement clavier
          et l annonce par les lecteurs d ecran, sans reimplementer de role. */}
      <label
        htmlFor={id}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
          'border border-[var(--border-strong)] bg-[var(--background-inset)] transition-colors duration-200',
          'has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent)]',
          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]',
          'has-[:disabled]:opacity-50',
        )}
      >
        <input ref={ref} id={id} type="checkbox" className="peer sr-only" {...props} />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none ml-0.5 size-4.5 rounded-full bg-[var(--foreground-muted)]',
            'transition-transform duration-200 peer-checked:translate-x-5 peer-checked:bg-white',
          )}
        />
      </label>
    </div>
  );
});

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps {
  name: string;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  columns?: 1 | 2 | 3;
  className?: string;
}

/** Choix visuel entre plusieurs options — utilise pour les offres et les metiers. */
export function RadioCards({
  name,
  options,
  value,
  defaultValue,
  onChange,
  columns = 2,
  className,
}: RadioCardsProps) {
  const cols = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' } as const;
  return (
    <div role="radiogroup" className={cn('grid gap-3', cols[columns], className)}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'group relative flex cursor-pointer gap-3 rounded-[var(--radius-md)] border p-4',
            'border-[var(--border)] bg-[var(--surface)] transition-all duration-200',
            'hover:border-[var(--border-strong)]',
            'has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]',
            'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]',
            option.disabled && 'pointer-events-none opacity-45',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            defaultChecked={defaultValue === option.value}
            checked={value !== undefined ? value === option.value : undefined}
            onChange={() => onChange?.(option.value)}
            disabled={option.disabled}
            className="peer sr-only"
          />
          {option.icon ? (
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--muted)] [&_svg]:size-5">
              {option.icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-[var(--foreground)]">
              {option.label}
            </span>
            {option.description ? (
              <span className="mt-1 block text-xs leading-relaxed text-[var(--foreground-muted)]">
                {option.description}
              </span>
            ) : null}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 size-4 shrink-0 rounded-full border border-[var(--border-strong)]',
              'peer-checked:border-[5px] peer-checked:border-[var(--accent)]',
            )}
          />
        </label>
      ))}
    </div>
  );
}

/** Rappel des erreurs en tete de formulaire, pour les longs parcours. */
export function FormErrorSummary({
  errors,
  className,
}: {
  errors: Record<string, string[]>;
  className?: string;
}) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;
  return (
    <div
      role="alert"
      tabIndex={-1}
      className={cn(
        'rounded-[var(--radius-md)] border border-[var(--danger)]/40 bg-[var(--danger-soft)] p-4',
        className,
      )}
    >
      <p className="text-sm font-medium text-[var(--danger)]">
        {entries.length === 1
          ? 'Un champ doit être corrigé :'
          : `${entries.length} champs doivent être corrigés :`}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-[var(--foreground-muted)]">
        {entries.map(([field, messages]) => (
          <li key={field}>{messages[0]}</li>
        ))}
      </ul>
    </div>
  );
}
