import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib';

/**
 * Surfaces.
 *
 * Trois niveaux de verre plutot qu un composant unique : une carte posee dans
 * une page, une carte imbriquee dans une autre carte et un panneau flottant
 * n ont ni la meme densite, ni le meme flou, ni la meme bordure. C est cette
 * gradation qui cree la profondeur.
 */
const panelVariants = cva('relative rounded-[var(--radius-lg)]', {
  variants: {
    level: {
      /** Pose a plat dans la page : le plus discret. */
      1: 'glass-1',
      /** Carte autonome : le cas courant. */
      2: 'glass-edge glass-2',
      /** Flottant au-dessus du contenu : menu, dialogue, panneau. */
      3: 'glass-edge glass-3',
      /** Surface pleine, sans flou : tableaux denses et longues listes. */
      solid: 'border border-[var(--border)] bg-[var(--surface)]',
      /** Creux : champ de saisie, zone de code, encart. */
      inset: 'border border-[var(--border)] bg-[var(--background-inset)]',
    },
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-5 sm:p-6',
      lg: 'p-6 sm:p-8',
      xl: 'p-8 sm:p-12',
    },
    interactive: {
      true: 'cursor-glow transition-colors duration-300 hover:border-[var(--border-strong)]',
      false: '',
    },
  },
  defaultVariants: { level: 2, padding: 'md', interactive: false },
});

export interface PanelProps
  extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof panelVariants> {}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { className, level, padding, interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(panelVariants({ level, padding, interactive }), className)}
      {...props}
    />
  );
});

export interface CardProps extends Omit<PanelProps, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
}

export function Card({
  title,
  description,
  action,
  footer,
  children,
  className,
  padding = 'none',
  ...props
}: CardProps) {
  return (
    <Panel className={cn('overflow-hidden', className)} padding={padding} {...props}>
      {title || action ? (
        <header className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-base font-medium tracking-[-0.015em] text-[var(--foreground)]">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn(title || action ? 'px-5 pt-4 pb-5 sm:px-6 sm:pb-6' : 'p-5 sm:p-6')}>
        {children}
      </div>
      {footer ? (
        <footer className="border-t border-[var(--border)] bg-[var(--background-subtle)]/40 px-5 py-4 sm:px-6">
          {footer}
        </footer>
      ) : null}
    </Panel>
  );
}

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}) {
  return (
    <div
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'shrink-0 bg-[var(--border)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

/** Ligne lumineuse horizontale : marque une transition entre deux sections. */
export function Beam({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('beam h-px w-full opacity-60', className)} />;
}

/** Conteneur de largeur maitrisee, avec gouttiere de 16 px sur mobile. */
export function Container({
  className,
  size = 'default',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { size?: 'narrow' | 'default' | 'wide' | 'full' }) {
  const widths = {
    narrow: 'max-w-3xl',
    default: 'max-w-6xl',
    wide: 'max-w-[88rem]',
    full: 'max-w-none',
  } as const;
  return (
    <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', widths[size], className)} {...props}>
      {children}
    </div>
  );
}

/** Section de page : gere le rythme vertical de maniere homogene. */
export function Section({
  className,
  spacing = 'default',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { spacing?: 'compact' | 'default' | 'roomy' }) {
  const spacings = {
    compact: 'py-14 sm:py-16',
    default: 'py-20 sm:py-28',
    roomy: 'py-24 sm:py-36',
  } as const;
  return (
    <section className={cn('relative', spacings[spacing], className)} {...props}>
      {children}
    </section>
  );
}

export interface SectionHeadingProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  className,
  as: Tag = 'h2',
}: SectionHeadingProps) {
  return (
    <div className={cn(align === 'center' && 'mx-auto text-center', 'max-w-3xl', className)}>
      {eyebrow ? (
        <p className="mb-4 inline-flex items-center gap-2 text-2xs font-medium tracking-[0.14em] text-[var(--muted)] uppercase">
          <span aria-hidden="true" className="h-px w-6 bg-[var(--border-strong)]" />
          {eyebrow}
        </p>
      ) : null}
      <Tag
        className={cn(
          'font-medium tracking-[-0.03em] text-balance',
          Tag === 'h1' ? 'text-4xl sm:text-5xl lg:text-6xl' : 'text-3xl sm:text-4xl',
        )}
      >
        {title}
      </Tag>
      {description ? (
        <p
          className={cn(
            'mt-5 text-lg leading-relaxed text-pretty text-[var(--foreground-muted)]',
            align === 'center' && 'mx-auto',
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
