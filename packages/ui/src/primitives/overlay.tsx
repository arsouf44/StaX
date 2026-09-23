'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib';
import { Button } from './button';

/**
 * Couches superposees : dialogue, panneau lateral, menu.
 *
 * Implementation native plutot qu une bibliotheque : moins de JavaScript
 * expedie, et surtout un controle exact du piege de focus, du retour de focus
 * et de la touche Echap — trois points ou les implementations maison echouent
 * habituellement.
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Piege le focus dans un conteneur et le restitue a la fermeture. */
function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    const first = focusables()[0] ?? container;
    first.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0] as HTMLElement;
      const lastItem = items[items.length - 1] as HTMLElement;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [active, containerRef]);
}

/** Empeche le defilement de l arriere-plan sans provoquer de saut de mise en page. */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [active]);
}

/**
 * Couches ouvertes, de la plus ancienne a la plus recente.
 *
 * Echap ferme la couche du DESSUS, et elle seule : une comparaison ouverte
 * depuis l historique se ferme, l historique reste ouvert. Sans cette pile,
 * chaque couche ecoutait la touche pour son compte et Echap fermait celle du
 * dessous en laissant l autre a l ecran.
 */
const escapeStack: object[] = [];

function useEscapeToClose(open: boolean, dismissible: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    if (!open) return;
    const entry = {};
    escapeStack.push(entry);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (escapeStack[escapeStack.length - 1] !== entry) return;
      // Une couche qui ne se ferme pas (publication en cours) retient quand
      // meme la touche : celle du dessous ne doit pas se fermer a sa place.
      if (dismissibleRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const index = escapeStack.indexOf(entry);
      if (index >= 0) escapeStack.splice(index, 1);
    };
  }, [open]);
}

/**
 * Rend une couche superposee directement sous `<body>`.
 *
 * `position: fixed` et `z-index` ne suffisent pas : un ancetre qui cree un
 * contexte d empilement — `transform`, `filter`, `backdrop-filter`, ce que
 * font precisement nos surfaces en verre — enferme le `z-50` a l interieur de
 * cet ancetre. La couche se retrouve alors peinte SOUS un frere qui vient
 * apres elle dans le DOM.
 *
 * C est ce qui arrivait au choix des sections dans l editeur : la boite de
 * dialogue vivait dans la colonne de gauche, et le panneau d edition, frere
 * suivant, passait par-dessus. Le voile ne couvrait qu une partie de l ecran
 * et la moitie du dialogue etait illisible.
 *
 * Le portail supprime la question : la couche n a plus d ancetre qu elle
 * n a choisi.
 */
const NEVER_CHANGES = () => () => {};

function OverlayPortal({ children }: { children: ReactNode }) {
  // Au rendu serveur il n y a pas de `document` : on n emet rien, et le
  // navigateur prend le relais. `useSyncExternalStore` donne exactement cette
  // reponse — false sur le serveur, true sur le client — sans effet et sans
  // desaccord d hydratation.
  const onClient = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
  if (!onClient) return null;
  return createPortal(children, document.body);
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Empeche la fermeture par Echap ou clic exterieur (operation en cours). */
  dismissible?: boolean;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap(open, panelRef);
  useScrollLock(open);

  useEscapeToClose(open, dismissible, onClose);

  if (!open) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
        <div
          aria-hidden="true"
          onClick={dismissible ? onClose : undefined}
          className="absolute inset-0 bg-[rgb(0_0_0/0.6)] backdrop-blur-sm"
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            'glass-edge relative w-full overflow-hidden glass-3',
            'rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)]',
            'max-h-[90dvh] animate-[reveal_0.28s_cubic-bezier(0.16,1,0.3,1)]',
            widths[size],
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-medium tracking-[-0.015em]">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-[var(--foreground-muted)]">
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label="Fermer"
                className="-mt-1 -mr-2 shrink-0"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </Button>
            ) : null}
          </header>
          {children ? (
            <div className="max-h-[60dvh] overflow-y-auto px-6 py-5 text-sm">{children}</div>
          ) : null}
          {footer ? (
            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] px-6 py-4 sm:flex-row sm:justify-end">
              {footer}
            </footer>
          ) : null}
        </div>
      </div>
    </OverlayPortal>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  /** Exige la saisie exacte d un texte : reserve aux suppressions definitives. */
  confirmationText?: string;
  loading?: boolean;
}

/**
 * Confirmation d une action destructrice.
 * Pour une suppression irreversible, `confirmationText` impose de recopier un
 * mot exact : un clic distrait ne doit jamais suffire.
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  // Monte seulement lorsqu'il est ouvert : la saisie de confirmation repart
  // donc toujours de zero, sans reinitialisation manuelle.
  if (!props.open) return null;
  return <ConfirmDialogBody {...props} />;
}

function ConfirmDialogBody({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'default',
  confirmationText,
  loading = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const canConfirm = !confirmationText || typed.trim() === confirmationText;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      dismissible={!loading}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => void onConfirm()}
            disabled={!canConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="leading-relaxed text-[var(--foreground-muted)]">{description}</p>
      {confirmationText ? (
        <div className="mt-5">
          <label htmlFor="confirm-text" className="block text-sm font-medium">
            Saisissez <span className="font-mono text-[var(--foreground)]">{confirmationText}</span>{' '}
            pour confirmer
          </label>
          <input
            id="confirm-text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            className="mt-2 h-11 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background-inset)] px-3.5 text-sm focus:border-[var(--accent)] focus:outline-none"
          />
        </div>
      ) : null}
    </Dialog>
  );
}

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  side?: 'left' | 'right';
  footer?: ReactNode;
}

/** Panneau lateral : navigation mobile, filtres, edition contextuelle. */
export function Sheet({ open, onClose, title, children, side = 'right', footer }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(open, panelRef);
  useScrollLock(open);

  useEscapeToClose(open, true, onClose);

  if (!open) return null;

  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-50">
        <div
          aria-hidden="true"
          onClick={onClose}
          className="absolute inset-0 bg-[rgb(0_0_0/0.6)] backdrop-blur-sm"
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            'absolute inset-y-0 flex w-full max-w-sm flex-col glass-3',
            side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
            'border-[var(--glass-border-strong)]',
          )}
        >
          <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <h2 id={titleId} className="text-base font-medium">
              {title}
            </h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
              </svg>
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer ? (
            <footer className="border-t border-[var(--border)] px-5 py-4">{footer}</footer>
          ) : null}
        </div>
      </div>
    </OverlayPortal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Menu deroulant                                                            */
/* -------------------------------------------------------------------------- */

interface MenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerId: string;
  menuId: string;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <MenuContext.Provider value={{ open, setOpen, triggerId, menuId }}>
      <div ref={rootRef} className="relative">
        {children}
      </div>
    </MenuContext.Provider>
  );
}

export function DropdownTrigger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const context = useContext(MenuContext);
  if (!context) throw new Error('DropdownTrigger doit être utilise dans un DropdownMenu.');
  return (
    <button
      type="button"
      id={context.triggerId}
      aria-haspopup="menu"
      aria-expanded={context.open}
      aria-controls={context.open ? context.menuId : undefined}
      onClick={() => context.setOpen(!context.open)}
      className={className}
    >
      {children}
    </button>
  );
}

export function DropdownContent({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const context = useContext(MenuContext);
  if (!context || !context.open) return null;
  return (
    <div
      id={context.menuId}
      role="menu"
      aria-labelledby={context.triggerId}
      className={cn(
        'absolute glass-edge top-[calc(100%+6px)] z-40 min-w-52 overflow-hidden glass-3',
        'animate-[reveal_0.16s_ease-out] rounded-[var(--radius-md)] p-1',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DropdownItem({
  children,
  onSelect,
  href,
  tone = 'default',
  icon,
  disabled,
}: {
  children: ReactNode;
  onSelect?: () => void;
  href?: string;
  tone?: 'default' | 'danger';
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const context = useContext(MenuContext);
  const classes = cn(
    'flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm',
    'transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]',
    tone === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--foreground)]',
    disabled && 'pointer-events-none opacity-45',
    '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--muted)]',
  );

  const handle = useCallback(() => {
    onSelect?.();
    context?.setOpen(false);
  }, [onSelect, context]);

  if (href) {
    return (
      <a role="menuitem" href={href} className={classes} onClick={() => context?.setOpen(false)}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" className={classes} onClick={handle} disabled={disabled}>
      {icon}
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div role="separator" className="my-1 h-px bg-[var(--border)]" />;
}
