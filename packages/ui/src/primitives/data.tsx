import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from '../lib';

/**
 * Presentation de donnees : tableaux, indicateurs, pagination, fil d Ariane.
 *
 * Les tableaux restent de vrais elements `table` : la structure porte le sens
 * pour les lecteurs d ecran. Sur mobile, ils defilent horizontalement dans un
 * conteneur annonce comme region, plutot que d etre transformes en cartes qui
 * perdent la relation entete/cellule.
 */

export function TableWrapper({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        // `relative` : un element positionne (texte reserve aux lecteurs d'ecran)
        // reste contenu dans la zone defilante au lieu d'elargir la page.
        'relative overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />;
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('border-b border-[var(--border)] bg-[var(--background-subtle)]', className)}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-[var(--border)]', className)} {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-[var(--surface)]', className)} {...props} />;
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 text-left text-xs font-medium tracking-wide whitespace-nowrap text-[var(--muted)] uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-3.5 align-middle', className)} {...props} />;
}

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Variation par rapport a la periode precedente, en points de base. */
  deltaBps?: number | null;
  /** `true` quand une hausse est une mauvaise nouvelle (paiements echoues…). */
  invertDelta?: boolean;
  icon?: ReactNode;
  className?: string;
}

/**
 * Indicateur chiffre.
 * La variation n est affichee QUE si une periode de comparaison existe
 * reellement : aucun pourcentage n est invente pour remplir la carte.
 */
export function Stat({ label, value, hint, deltaBps, invertDelta, icon, className }: StatProps) {
  const hasDelta = typeof deltaBps === 'number' && Number.isFinite(deltaBps);
  const positive = hasDelta && deltaBps > 0;
  const good = hasDelta ? (invertDelta ? !positive : positive) : null;

  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-[var(--foreground-muted)]">{label}</p>
        {icon ? (
          <span aria-hidden="true" className="text-[var(--muted)] [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 text-3xl font-medium tracking-[-0.03em] tabular-nums">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {hasDelta && deltaBps !== 0 ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 font-medium tabular-nums',
              good ? 'text-[var(--success)]' : 'text-[var(--danger)]',
            )}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              fill="currentColor"
              className={cn('size-3', !positive && 'rotate-180')}
            >
              <path d="M6 2 10 8H2L6 2Z" />
            </svg>
            {Math.abs(deltaBps / 100)
              .toFixed(1)
              .replace('.', ',')}{' '}
            %
          </span>
        ) : null}
        {hint ? <span className="text-[var(--muted)]">{hint}</span> : null}
      </div>
    </div>
  );
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Fil d Ariane" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <a href={item.href} className="transition-colors hover:text-[var(--foreground)]">
                  {item.label}
                </a>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="text-[var(--foreground)]"
                >
                  {item.label}
                </span>
              )}
              {!isLast ? (
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="size-3.5 text-[var(--border-strong)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="m6 3 4 5-4 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  /** Construit l URL d une page : garde la pagination navigable et partageable. */
  buildHref: (page: number) => string;
  className?: string;
}

export function Pagination({ page, perPage, total, buildHref, className }: PaginationProps) {
  const pages = Math.max(Math.ceil(total / perPage), 1);
  if (pages <= 1) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const windowed: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let index = start; index <= end; index += 1) windowed.push(index);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-4', className)}
    >
      <p className="text-sm text-[var(--muted)] tabular-nums">
        {from.toLocaleString('fr-FR')} – {to.toLocaleString('fr-FR')} sur{' '}
        {total.toLocaleString('fr-FR')}
      </p>
      <ul className="flex items-center gap-1">
        <li>
          <a
            href={page > 1 ? buildHref(page - 1) : undefined}
            aria-disabled={page === 1}
            className={cn(
              'inline-flex h-9 items-center rounded-[var(--radius-sm)] px-3 text-sm',
              page === 1
                ? 'pointer-events-none text-[var(--muted)] opacity-50'
                : 'text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)]',
            )}
          >
            Precedent
          </a>
        </li>
        {windowed.map((item) => (
          <li key={item}>
            <a
              href={buildHref(item)}
              aria-current={item === page ? 'page' : undefined}
              className={cn(
                'inline-flex size-9 items-center justify-center rounded-[var(--radius-sm)] text-sm tabular-nums',
                item === page
                  ? 'bg-[var(--primary)] font-medium text-[var(--primary-foreground)]'
                  : 'text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)]',
              )}
            >
              {item}
            </a>
          </li>
        ))}
        <li>
          <a
            href={page < pages ? buildHref(page + 1) : undefined}
            aria-disabled={page === pages}
            className={cn(
              'inline-flex h-9 items-center rounded-[var(--radius-sm)] px-3 text-sm',
              page === pages
                ? 'pointer-events-none text-[var(--muted)] opacity-50'
                : 'text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)]',
            )}
          >
            Suivant
          </a>
        </li>
      </ul>
    </nav>
  );
}

/** Liste de definitions : recapitulatifs de commande, fiches client. */
export function DescriptionList({
  items,
  className,
  columns = 1,
}: {
  items: ReadonlyArray<{ term: ReactNode; description: ReactNode }>;
  className?: string;
  columns?: 1 | 2;
}) {
  return (
    <dl
      className={cn(
        'divide-y divide-[var(--border)]',
        columns === 2 && 'sm:grid sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0',
        className,
      )}
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            'flex flex-wrap items-baseline justify-between gap-2 py-3',
            columns === 2 && 'sm:border-b sm:border-[var(--border)]',
          )}
        >
          <dt className="text-sm text-[var(--foreground-muted)]">{item.term}</dt>
          <dd className="text-sm font-medium text-[var(--foreground)]">{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Avatar : initiales deterministes, jamais de couleur aleatoire a chaque rendu. */
export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'border border-[var(--border)] bg-[var(--surface-elevated)]',
        'text-xs font-medium text-[var(--foreground-muted)]',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {src ? (
        /* Composant de bibliotheque, independant du framework : pas de
           composant Image de Next ici. L'attribut alt est vide car l'avatar
           est purement decoratif — le nom figure toujours a cote. */
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        initials || '?'
      )}
    </span>
  );
}
