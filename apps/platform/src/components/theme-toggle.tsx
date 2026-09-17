'use client';

import { cn, useIsHydrated, useLocalStorageValue, writeLocalStorage } from '@stax/ui';
import { THEME_STORAGE_KEY } from './theme-script';

type Theme = 'dark' | 'light' | 'system';

const OPTIONS: Array<{ value: Theme; label: string; icon: React.ReactNode }> = [
  {
    value: 'dark',
    label: 'Sombre',
    icon: <path d="M13.5 9.6A6 6 0 0 1 6.4 2.5a6 6 0 1 0 7.1 7.1Z" />,
  },
  {
    value: 'light',
    label: 'Clair',
    icon: (
      <>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1m10.95-4.95-1.06 1.06M5.11 10.89l-1.06 1.06m0-7.96 1.06 1.06m5.78 5.78 1.06 1.06" />
      </>
    ),
  },
  {
    value: 'system',
    label: 'Système',
    icon: (
      <>
        <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
        <path d="M5.5 14h5" />
      </>
    ),
  },
];

/**
 * Selecteur de theme.
 *
 * Le mode clair est une declinaison a part entiere, pas une inversion des
 * couleurs : les surfaces, les ombres et le verre y sont redefinis.
 */
export function ThemeToggle({ className }: { className?: string }) {
  // La valeur est lue directement du stockage : aucune copie dans un etat
  // React, donc aucun risque de desynchronisation entre onglets.
  const stored = useLocalStorageValue(THEME_STORAGE_KEY);
  const hydrated = useIsHydrated();
  const theme: Theme =
    stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';

  const apply = (next: Theme) => {
    writeLocalStorage(THEME_STORAGE_KEY, next);
    const resolved =
      next === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : next;
    document.documentElement.setAttribute('data-theme', resolved);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Thème de l’interface"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-[var(--border)] p-0.5',
        className,
      )}
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={hydrated ? theme === option.value : undefined}
          aria-label={option.label}
          title={option.label}
          onClick={() => apply(option.value)}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-full transition-colors',
            hydrated && theme === option.value
              ? 'bg-[var(--surface-hover)] text-[var(--foreground)]'
              : 'text-[var(--muted)] hover:text-[var(--foreground-muted)]',
          )}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
          >
            {option.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
