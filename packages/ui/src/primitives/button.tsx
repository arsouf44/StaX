'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib';

/**
 * Bouton.
 *
 * L action principale est un aplat a contraste maximal — blanc sur noir en
 * sombre, noir sur blanc en clair. Aucun degrade : la hierarchie vient du
 * contraste et de l espace, pas de la couleur.
 *
 * Accessibilite : hauteur minimale de 40 px (44 px sur mobile), focus toujours
 * visible, etat de chargement annonce aux lecteurs d ecran, et `aria-disabled`
 * plutot que `disabled` quand le bouton doit rester atteignable au clavier.
 */
const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium tracking-[-0.01em] select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-200',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
    'disabled:pointer-events-none disabled:opacity-45',
    'active:scale-[0.985]',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_1px_0_0_rgb(255_255_255/0.2)_inset] hover:opacity-90',
        secondary:
          'border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]',
        glass:
          'glass-edge text-[var(--foreground)] glass-2 hover:bg-[color-mix(in_oklab,var(--glass-2),var(--foreground)_6%)]',
        ghost:
          'text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]',
        outline:
          'border border-[var(--border)] text-[var(--foreground)] hover:border-[var(--border-strong)] hover:bg-[var(--surface)]',
        danger:
          'bg-[var(--danger)] text-white hover:opacity-90 focus-visible:outline-[var(--danger)]',
        link: 'h-auto p-0 text-[var(--foreground)] underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--foreground)]',
      },
      size: {
        sm: 'h-9 rounded-[var(--radius-sm)] px-3 text-sm',
        md: 'h-10 rounded-[var(--radius-md)] px-4 text-sm',
        lg: 'h-12 rounded-[var(--radius-md)] px-6 text-base',
        xl: 'h-14 rounded-[var(--radius-lg)] px-8 text-lg',
        icon: 'size-10 rounded-[var(--radius-md)]',
        'icon-sm': 'size-8 rounded-[var(--radius-sm)]',
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
