import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import { formatMaintenance, formatMoney, ORDER_STATUS_LABELS } from '@stax/payments';
import {
  EmptyState,
  Icon,
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
import { FilterTabs } from '~/components/app/filter-tabs';
import { PageHeader } from '~/components/app/page-header';
import { getAdminContext } from '~/lib/admin';

export const metadata: Metadata = { title: 'Commandes' };

const FILTERS = {
  a_traiter: ['paid'],
  en_cours: ['checkout_pending', 'draft'],
  remboursees: ['refunded', 'partially_refunded'],
  annulees: ['cancelled'],
  toutes: [] as string[],
} as const;

type FilterKey = keyof typeof FILTERS;

const STATUS_TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  checkout_pending: 'info',
  paid: 'success',
  cancelled: 'neutral',
  refunded: 'warning',
  partially_refunded: 'warning',
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { db } = await getAdminContext();

  const filter: FilterKey =
    typeof params.filtre === 'string' && params.filtre in FILTERS
      ? (params.filtre as FilterKey)
      : 'a_traiter';

  let query = db
    .from('orders')
    .select(
      'id, reference, status, plan_slug, total_cents, maintenance_price_cents, billing_interval, currency, created_at, paid_at, organizations ( name )',
    )
    .order('created_at', { ascending: false })
    .limit(150);

  const statuses = FILTERS[filter];
  if (statuses.length > 0) query = query.in('status', statuses as unknown as string[]);

  const rows = unwrapList<{
    id: string;
    reference: string;
    status: string;
    plan_slug: string | null;
    total_cents: number;
    maintenance_price_cents: number;
    billing_interval: string;
    currency: string;
    created_at: string;
    paid_at: string | null;
    organizations: { name: string } | { name: string }[] | null;
  }>((await query) as never);

  const clientName = (value: (typeof rows)[number]['organizations']): string => {
    const org = Array.isArray(value) ? value[0] : value;
    return org?.name ?? '—';
  };

  return (
    <>
      <PageHeader
        title="Commandes"
        description="Une commande devient « payée » uniquement lorsque le webhook signé de notre prestataire bancaire le confirme."
      />

      <FilterTabs
        ariaLabel="Filtrer les commandes"
        active={filter}
        tabs={[
          { value: 'a_traiter', label: 'À traiter' },
          { value: 'en_cours', label: 'En cours' },
          { value: 'remboursees', label: 'Remboursées' },
          { value: 'annulees', label: 'Annulées' },
          { value: 'toutes', label: 'Toutes' },
        ]}
        buildHref={(value) => `/admin/commandes?filtre=${value}`}
      />

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Icon name="receipt" size={24} />}
            title="Aucune commande dans ce filtre"
          />
        ) : (
          <TableWrapper label="Commandes">
            <Table>
              <THead>
                <TR>
                  <TH scope="col">Référence</TH>
                  <TH scope="col">Client</TH>
                  <TH scope="col">Offre</TH>
                  <TH scope="col">Montant</TH>
                  <TH scope="col">État</TH>
                  <TH scope="col">Date</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD className="font-mono text-xs">{row.reference}</TD>
                    <TD>{clientName(row.organizations)}</TD>
                    <TD className="text-[var(--foreground-muted)]">{row.plan_slug ?? '—'}</TD>
                    <TD className="tabular-nums">
                      {formatMoney(row.total_cents, row.currency as 'EUR')}
                      {row.maintenance_price_cents > 0 ? (
                        <span className="block text-2xs text-[var(--muted)]">
                          puis{' '}
                          {formatMaintenance(
                            row.maintenance_price_cents,
                            row.currency as 'EUR',
                            row.billing_interval === 'month' ? 'month' : 'year',
                          )}
                        </span>
                      ) : null}
                    </TD>
                    <TD>
                      <StatusPill tone={STATUS_TONES[row.status] ?? 'neutral'}>
                        {ORDER_STATUS_LABELS[row.status as keyof typeof ORDER_STATUS_LABELS] ??
                          row.status}
                      </StatusPill>
                    </TD>
                    <TD className="text-[var(--foreground-muted)]">
                      <time dateTime={row.paid_at ?? row.created_at}>
                        {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
                          new Date(row.paid_at ?? row.created_at),
                        )}
                      </time>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </div>
    </>
  );
}
