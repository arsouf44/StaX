'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib';

/**
 * Bouton.
 *
 * Des aplats a angles vifs, jamais de degrade : l encre pour l action
 * principale, l eau profonde pour l appel a l action de marque, le verre pour
 * tout le reste. Sur les pages publiques (tailles `pill*`), le libelle passe en
 * petites capitales espacees, comme la navigation.
 *
 * Accessibilite : hauteur minimale de 40 px (44 px sur mobile), focus toujours
 * visible, etat de chargement annonce aux lecteurs d ecran, et `aria-disabled`
 * plutot que `disabled` quand le bouton doit rester atteignable au clavier.
 */
const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-semibold tracking-[0.005em] select-none',
    'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
    'disabled:pointer-events-none disabled:opacity-45',
    'active:translate-y-px',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_14px_32px_-18px_rgb(24_52_66/0.7)] hover:opacity-90',
        /** Appel a l action de marque : l eau profonde, reserve a UNE action par ecran. */
        accent:
          'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_16px_34px_-18px_rgb(49_90_112/0.8)] hover:bg-[var(--accent-hover)]',
        secondary:
          'border border-[var(--border-strong)] bg-[var(--background-inset)] text-[var(--foreground)] backdrop-blur-md hover:bg-[var(--surface-hover)]',
        glass: 'text-[var(--foreground)] glass-2 hover:bg-[var(--glass-3)]',
        ghost:
          'text-[var(--foreground-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]',
        outline:
          'border border-[var(--border-strong)] text-[var(--foreground)] hover:bg-[var(--background-inset)]',
        danger:
          'bg-[var(--danger)] text-white hover:opacity-90 focus-visible:outline-[var(--danger)]',
        link: 'h-auto p-0 text-[var(--foreground)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--foreground)]',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[0.9375rem]',
        xl: 'h-14 px-8 text-base',
        /** Pages publiques : petites capitales espacees. */
        pill: 'h-12 px-6 text-xs font-bold tracking-[0.07em] uppercase',
        'pill-lg': 'h-[3.375rem] px-8 text-xs font-bold tracking-[0.08em] uppercase',
        'pill-sm': 'h-10 px-4 text-[0.6875rem] font-bold tracking-[0.07em] uppercase',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Affiche un indicateur et neutralise le bouton, sans changer sa largeur. */
  loading?: boolean;
  loadingLabel?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    block,
    loading = false,
    loadingLabel = 'Chargement',
    iconLeft,
    iconRight,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          <span className="sr-only">{loadingLabel}</span>
          <span aria-hidden="true" className="opacity-70">
            {children}
          </span>
        </>
      ) : (
        <>
          {iconLeft ? (
            <span aria-hidden="true" className="shrink-0 [&_svg]:size-4">
              {iconLeft}
            </span>
          ) : null}
          {children}
          {iconRight ? (
            <span aria-hidden="true" className="shrink-0 [&_svg]:size-4">
              {iconRight}
            </span>
          ) : null}
        </>
      )}
    </button>
  );
});

export { buttonVariants };

/**
 * Lien stylise comme un bouton.
 * Separe du bouton a dessein : un lien navigue, un bouton agit. Les confondre
 * casse la navigation clavier, l ouverture dans un nouvel onglet et le
 * comportement attendu des lecteurs d ecran.
 */
export interface ButtonLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement>, VariantProps<typeof buttonVariants> {
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { className, variant, size, block, iconLeft, iconRight, children, ...props },
  ref,
) {
  return (
    <a ref={ref} className={cn(buttonVariants({ variant, size, block }), className)} {...props}>
      {iconLeft ? (
        <span aria-hidden="true" className="shrink-0 [&_svg]:size-4">
          {iconLeft}
        </span>
      ) : null}
      {children}
      {iconRight ? (
        <span aria-hidden="true" className="shrink-0 [&_svg]:size-4">
          {iconRight}
        </span>
      ) : null}
    </a>
  );
});
