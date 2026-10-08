import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList } from '@nemasus/database';
import {
  ButtonLink,
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
} from '@nemasus/ui';
import type { StatusTone } from '@nemasus/ui';
import { FilterTabs } from '~/components/app/filter-tabs';
import { PageHeader } from '~/components/app/page-header';
import { getAdminContext } from '~/lib/admin';
import {
  formatOrderAmount,
  SITE_ORDER_STATUS_LABELS,
  type SiteOrderStatus,
} from '~/lib/site-orders';

export const metadata: Metadata = { title: 'Commandes' };
export const dynamic = 'force-dynamic';

const FILTERS = {
  a_traiter: ['received'],
  virement_attendu: ['payment_requested'],
  payees: ['paid'],
  annulees: ['cancelled'],
  toutes: [] as string[],
} as const;

type FilterKey = keyof typeof FILTERS;

const STATUS_TONES: Record<SiteOrderStatus, StatusTone> = {
  received: 'warning',
  payment_requested: 'info',
  paid: 'success',
  cancelled: 'neutral',
};

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

/**
 * Commandes réglées par virement : la file de travail commerciale.
 *
 * Reçue → modalités envoyées (virement attendu) → payée (espace créé, code
 * d'accès envoyé). Lecture avec le jeton de la personne : la policy réserve
 * la table à l'équipe.
 */
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
    .from('site_orders')
    .select(
      'id, reference, status, company_name, contact_email, contact_first_name, contact_last_name, amount_cents, paid_amount_cents, currency, created_at, payment_requested_at, paid_at, source',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  const statuses = FILTERS[filter];
  if (statuses.length > 0) query = query.in('status', statuses as unknown as string[]);

  const rows = unwrapList<{
    id: string;
    reference: string;
    status: SiteOrderStatus;
    company_name: string;
    contact_email: string;
    contact_first_name: string | null;
    contact_last_name: string | null;
    amount_cents: number | null;
    paid_amount_cents: number | null;
    currency: string;
    created_at: string;
    payment_requested_at: string | null;
    paid_at: string | null;
    source: string;
  }>((await query) as never);

  const counts = unwrapList<{ status: SiteOrderStatus }>(
    (await db
      .from('site_orders')
      .select('status')
      .in('status', ['received', 'payment_requested'])) as never,
  );
  const received = counts.filter((row) => row.status === 'received').length;
  const awaiting = counts.filter((row) => row.status === 'payment_requested').length;

  return (
    <>
      <PageHeader
        title="Commandes"
        description="Une commande reçue attend ses modalités de paiement. Une fois le virement arrivé, confirmez-le : l’espace du client est créé et son code d’accès lui est envoyé."
        actions={
          <ButtonLink href="/admin/commandes/nouvelle" size="sm">
            Saisir une commande
          </ButtonLink>
        }
      />

      <FilterTabs
        ariaLabel="Filtrer les commandes"
        active={filter}
        tabs={[
          { value: 'a_traiter', label: 'À traiter', count: received },
          { value: 'virement_attendu', label: 'Virement attendu', count: awaiting },
          { value: 'payees', label: 'Payées' },
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
            description="Les commandes envoyées depuis le site apparaissent ici, avec une alerte par e-mail à l’équipe."
          />
        ) : (
          <TableWrapper label="Commandes">
            <Table>
              <THead>
                <TR>
                  <TH scope="col">Référence</TH>
                  <TH scope="col">Entreprise</TH>
                  <TH scope="col">Contact</TH>
                  <TH scope="col">Montant</TH>
                  <TH scope="col">État</TH>
                  <TH scope="col">Date</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => {
                  const amount = row.paid_amount_cents ?? row.amount_cents;
                  return (
                    <TR key={row.id}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/admin/commandes/${row.id}`}
                          className="underline underline-offset-4"
                        >
                          {row.reference}
                        </Link>
                      </TD>
                      <TD>
                        {row.company_name}
                        {row.source === 'team' ? (
                          <span className="block text-2xs text-[var(--muted)]">saisie équipe</span>
                        ) : null}
                      </TD>
                      <TD className="text-[var(--foreground-muted)]">
                        {[row.contact_first_name, row.contact_last_name].filter(Boolean).join(' ')}
                        <span className="block text-2xs break-all">{row.contact_email}</span>
                      </TD>
                      <TD className="tabular-nums">
                        {amount ? formatOrderAmount(amount, row.currency) : '—'}
                      </TD>
                      <TD>
                        <StatusPill tone={STATUS_TONES[row.status]}>
                          {SITE_ORDER_STATUS_LABELS[row.status]}
                        </StatusPill>
                      </TD>
                      <TD className="text-[var(--foreground-muted)]">
                        <time dateTime={row.paid_at ?? row.created_at}>
                          {DATE.format(new Date(row.paid_at ?? row.created_at))}
                        </time>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
      </div>
    </>
  );
}
