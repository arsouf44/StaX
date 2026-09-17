'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib';

/**
 * Notifications ephemeres.
 *
 * Elles annoncent un RESULTAT, jamais une information indispensable : un
 * message qui doit etre lu reste dans la page. La region est `aria-live`
 * polie, sauf pour les erreurs, annoncees en `assertive`.
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Duree d affichage. Une erreur reste jusqu a fermeture manuelle. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast doit etre utilise dans un ToastProvider.');
  return context;
}

const DEFAULT_DURATIONS: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  warning: 7000,
  // Une erreur ne disparait pas toute seule : l utilisateur doit la voir.
  error: 0,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current.slice(-4), { ...toast, id }]);
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, description) => push({ tone: 'error', title, description }),
      warning: (title, description) => push({ tone: 'warning', title, description }),
      info: (title, description) => push({ tone: 'info', title, description }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, { border: string; icon: ReactNode; text: string }> = {
  success: {
    border: 'border-[var(--success)]/35',
    text: 'text-[var(--success)]',
    icon: <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm3.2 4.55-4 4.25-2.4-2.3 1.04-1.08 1.33 1.28 2.96-3.15 1.07 1Z" />,
  },
  error: {
    border: 'border-[var(--danger)]/35',
    text: 'text-[var(--danger)]',
    icon: <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 4.5h1.5v5h-1.5v-5Zm0 6.25h1.5v1.5h-1.5v-1.5Z" />,
  },
  warning: {
    border: 'border-[var(--warning)]/35',
    text: 'text-[var(--warning)]',
    icon: <path d="M8 1.2c.42 0 .8.22 1 .58l6.1 10.6c.4.7-.1 1.72-1 1.72H1.9c-.9 0-1.4-1.02-1-1.72L7 1.78c.2-.36.58-.58 1-.58Zm-.75 4.3v3.75h1.5V5.5h-1.5Zm0 5v1.5h1.5v-1.5h-1.5Z" />,
  },
  info: {
    border: 'border-[var(--info)]/35',
    text: 'text-[var(--info)]',
    icon: <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 6.5h1.5v5h-1.5v-5Zm0-2.75h1.5v1.5h-1.5v-1.5Z" />,
  },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:bottom-0 sm:items-end"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const duration = toast.duration ?? DEFAULT_DURATIONS[toast.tone];

  useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [duration, toast.id, onDismiss]);

  const style = TONE_STYLES[toast.tone];

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'glass-3 glass-edge pointer-events-auto w-full max-w-sm rounded-[var(--radius-md)] p-4',
        'animate-[reveal_0.28s_cubic-bezier(0.16,1,0.3,1)]',
        style.border,
      )}
    >
      <div className="flex gap-3">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={cn('mt-0.5 size-4 shrink-0', style.text)}
        >
          {style.icon}
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--foreground)]">{toast.title}</p>
          {toast.description ? (
            <p className="mt-1 text-xs leading-relaxed text-[var(--foreground-muted)]">
              {toast.description}
            </p>
          ) : null}
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="mt-2 text-xs font-medium text-[var(--accent)] underline underline-offset-4"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Fermer la notification"
          className="-mt-1 -mr-1 shrink-0 rounded-[var(--radius-xs)] p-1 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-3.5">
            <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
