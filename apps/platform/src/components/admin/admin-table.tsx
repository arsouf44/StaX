import Link from 'next/link';
import { statusLabel } from '@stax/business';
import { unwrapList } from '@stax/database';
import { formatMoney } from '@stax/payments';
import {
  EmptyState,
  Icon,
  Panel,
  StatusPill,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getAdminContext } from '~/lib/admin';
import { getAdminView, type AdminColumn, type AdminViewId } from '~/lib/admin-views';

/**
 * Tableau du back-office.
 *
 * Une seule implementation sert tous les ecrans de liste. La lecture se fait
 * avec le JETON de la personne connectee : ce sont les policies
 * `app.is_platform_staff()` et `app.is_platform_admin()` qui decident de ce qui
 * remonte. Aucun de ces ecrans n'utilise la cle de service, et aucun n'ecrit.
 *
 * Les motifs saisis par l'operateur sont echappes avant d'entrer dans un
 * `ilike` : un `%` tape par erreur reste un caractere, pas un joker.
 */

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function escapeLike(term: string): string {
  return term.replace(/[%_\\]/g, (character) => `\\${character}`);
}

function renderCell(column: AdminColumn, row: Record<string, unknown>) {
  const raw = row[column.key];

  if (column.kind === 'relation') {
    if (typeof raw !== 'object' || raw === null) return '—';
    const value = (raw as Record<string, unknown>)[column.path ?? 'name'];
    return typeof value === 'string' ? value : '—';
  }

  if (column.kind === 'boolean') {
    return raw === true ? 'Oui' : raw === false ? 'Non' : '—';
  }

  if (raw === null || raw === undefined || raw === '') return '—';

  if (column.kind === 'status') {
    const label = statusLabel(column.statuses ?? {}, String(raw));
    return <StatusPill tone={label.tone as StatusTone}>{label.label}</StatusPill>;
  }

  if (column.kind === 'money') {
    const cents = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(cents)) return '—';
    return formatMoney(Math.trunc(cents), 'EUR', { hideDecimalsWhenRound: true });
  }

  if (column.kind === 'date') return DATE.format(new Date(String(raw)));
  if (column.kind === 'datetime') return DATE_TIME.format(new Date(String(raw)));

  return String(raw);
}

function chipClass(active: boolean): string {
  return `rounded-full border px-3 py-1.5 text-xs transition ${
    active
      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--foreground)]'
      : 'border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
  }`;
}

export async function AdminTable({
  view: viewId,
  searchParams,
  children,
}: {
  view: AdminViewId;
  searchParams: Record<string, string | string[] | undefined>;
  /** Actions propres a l'ecran, rendues sous le tableau. */
  children?: React.ReactNode;
}) {
  const view = getAdminView(viewId);
  const { db } = await getAdminContext();

  const term = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 120) : '';
  const activeFilter = typeof searchParams.filtre === 'string' ? searchParams.filtre : '';

  let query = db
    .from(view.table)
    .select(view.select)
    .order(view.orderColumn, { ascending: view.ascending })
    .limit(150);

  if (view.searchColumn && term.length >= 2) {
    query = query.ilike(view.searchColumn, `%${escapeLike(term)}%`);
  }

  const filter = view.filters?.find((entry) => entry.value === activeFilter);
  if (filter) {
    if (filter.operator === 'notNull') {
      query = query.not(filter.column, 'is', null);
    } else if (filter.operator === 'in' && Array.isArray(filter.match)) {
      query = query.in(filter.column, [...filter.match]);
    } else if (typeof filter.match === 'string') {
      query = query.eq(filter.column, filter.match);
    }
  }

  const rows = unwrapList<Record<string, unknown>>((await query) as never);

  const buildHref = (next: { filtre?: string; q?: string }) => {
    const search = new URLSearchParams();
    const nextFilter = next.filtre ?? activeFilter;
    const nextTerm = next.q ?? term;
    if (nextFilter) search.set('filtre', nextFilter);
    if (nextTerm) search.set('q', nextTerm);
    const suffix = search.toString();
    return suffix ? `${view.route}?${suffix}` : view.route;
  };

  return (
    <>
      <PageHeader title={view.title} description={view.description} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        {view.filters && view.filters.length > 0 ? (
          <nav aria-label="Filtres" className="flex flex-wrap gap-1.5">
            <Link
              href={buildHref({ filtre: '' })}
              aria-current={activeFilter === '' ? 'page' : undefined}
              className={chipClass(activeFilter === '')}
            >
              Tout
            </Link>
            {view.filters.map((entry) => (
              <Link
                key={entry.value}
                href={buildHref({ filtre: entry.value })}
                aria-current={activeFilter === entry.value ? 'page' : undefined}
                className={chipClass(activeFilter === entry.value)}
              >
                {entry.label}
              </Link>
            ))}
          </nav>
        ) : null}

        {view.searchColumn ? (
          <form method="get" className="ml-auto flex items-center gap-2">
            {activeFilter ? <input type="hidden" name="filtre" value={activeFilter} /> : null}
            <label htmlFor="q" className="sr-only">
              {view.searchLabel ?? 'Rechercher'}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={term}
              placeholder={view.searchLabel ?? 'Rechercher'}
              maxLength={120}
              className="h-9 w-56 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--background-inset)] px-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            />
            <button
              type="submit"
              className="h-9 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-sm transition hover:bg-[var(--surface-3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Chercher
            </button>
          </form>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon name={view.icon} size={24} />}
          title={term || activeFilter ? 'Aucun résultat' : view.emptyTitle}
          description={
            term || activeFilter
              ? 'Aucune ligne ne correspond à cette recherche. Essayez un autre filtre.'
              : view.emptyDescription
          }
        />
      ) : (
        <TableWrapper label={view.title}>
          <Table>
            <THead>
              <TR>
                {view.columns.map((column) => (
                  <TH
                    key={column.key}
                    scope="col"
                    className={column.secondary ? 'hidden sm:table-cell' : undefined}
                  >
                    {column.label}
                  </TH>
                ))}
              </TR>
            </THead>
            <TBody>
              {rows.map((row, index) => (
                <TR key={typeof row.id === 'string' ? row.id : String(index)}>
                  {view.columns.map((column, columnIndex) => {
                    // Le lien porte sur la PREMIERE colonne, pas sur la ligne
                    // entiere : une ligne cliquable rend impossible la
                    // selection d'un texte et surprend au clavier.
                    const detailHref =
                      columnIndex === 0 && view.detailRoute && typeof row.id === 'string'
                        ? `${view.detailRoute}/${row.id}`
                        : null;
                    const content = renderCell(column, row);

                    return (
                      <TD
                        key={column.key}
                        className={
                          [
                            column.kind === 'mono' ? 'font-mono text-xs' : '',
                            column.kind === 'money' ? 'tabular-nums' : '',
                            column.secondary
                              ? 'hidden text-[var(--foreground-muted)] sm:table-cell'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ') || undefined
                        }
                      >
                        {detailHref ? (
                          <Link
                            href={detailHref}
                            className="underline decoration-[var(--border-strong)] underline-offset-4 hover:decoration-[var(--foreground)]"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}

      <p className="mt-4 text-xs text-[var(--muted)]">
        {rows.length >= 150
          ? '150 lignes affichées au maximum. Affinez avec la recherche ou un filtre.'
          : `${rows.length} ligne${rows.length > 1 ? 's' : ''}.`}
      </p>

      {children}

      {view.note ? (
        <Panel level={1} padding="lg" className="mt-6">
          <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">{view.note}</p>
        </Panel>
      ) : null}
    </>
  );
}
