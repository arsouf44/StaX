'use client';

import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { cn } from '../lib';

/**
 * Onglets accessibles.
 *
 * Suit le modele ARIA : navigation aux fleches, `aria-selected`, panneaux
 * relies par `aria-controls`. Un simple bouton stylise ne suffirait pas a
 * rendre l ensemble utilisable au clavier.
 */

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  defaultValue,
  value: controlled,
  onValueChange,
  children,
  className,
}: {
  defaultValue: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue);
  const baseId = useId();
  const value = controlled ?? internal;

  const setValue = (next: string) => {
    if (controlled === undefined) setInternal(next);
    onValueChange?.(next);
  };

  return (
    <TabsContext.Provider value={{ value, setValue, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'no-scrollbar flex gap-1 overflow-x-auto border-b border-[var(--border)]',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        const tabs = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
        );
        const index = tabs.findIndex((tab) => tab === document.activeElement);
        if (index === -1) return;
        event.preventDefault();
        const next =
          event.key === 'ArrowRight'
            ? tabs[(index + 1) % tabs.length]
            : tabs[(index - 1 + tabs.length) % tabs.length];
        next?.focus();
        next?.click();
      }}
    >
      {children}
    </div>
  );
}

export function Tab({
  value,
  children,
  count,
}: {
  value: string;
  children: ReactNode;
  count?: number;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab doit être utilise dans Tabs.');
  const selected = context.value === value;

  return (
    <button
      type="button"
      role="tab"
      id={`${context.baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${context.baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => context.setValue(value)}
      className={cn(
        'relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm transition-colors',
        selected
          ? 'border-[var(--foreground)] font-medium text-[var(--foreground)]'
          : 'border-transparent text-[var(--muted)] hover:text-[var(--foreground-muted)]',
      )}
    >
      {children}
      {typeof count === 'number' ? (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-2xs tabular-nums',
            selected
              ? 'bg-[var(--surface-hover)] text-[var(--foreground)]'
              : 'bg-[var(--surface)] text-[var(--muted)]',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabPanel doit être utilise dans Tabs.');
  if (context.value !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`${context.baseId}-panel-${value}`}
      aria-labelledby={`${context.baseId}-tab-${value}`}
      tabIndex={0}
      className="pt-6 focus-visible:outline-none"
    >
      {children}
    </div>
  );
}
