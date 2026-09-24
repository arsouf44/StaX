import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import { formatMaintenance, formatMoney } from '@stax/payments';
import { AdminTable } from '~/components/admin/admin-table';
import { requireAdminRole } from '~/lib/admin';
import { IssueInvoiceForm, type PlanChoice } from './issue-form';

export const metadata: Metadata = { title: 'Factures de vente' };

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await requireAdminRole('billing_admin');

  const plans = unwrapList<{
    id: string;
    name: string;
    setup_price_cents: number;
    maintenance_price_cents: number;
    billing_interval: string;
  }>(
    (await db
      .from('plans')
      .select('id, name, setup_price_cents, maintenance_price_cents, billing_interval')
      .eq('is_active', true)
      .eq('is_quote_only', false)
      .order('sort_order', { ascending: true })) as never,
  );

  const choices: PlanChoice[] = plans.map((plan) => ({
    id: plan.id,
    label: `${plan.name} — ${formatMoney(plan.setup_price_cents, 'EUR', {
      hideDecimalsWhenRound: true,
    })} HT puis ${formatMaintenance(
      plan.maintenance_price_cents,
      'EUR',
      plan.billing_interval === 'year' ? 'year' : 'month',
    )} HT`,
  }));

  return (
    <AdminTable view="factures" searchParams={await searchParams}>
      <IssueInvoiceForm plans={choices} />
    </AdminTable>
  );
}
