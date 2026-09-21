import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import { formatMoney } from '@stax/payments';
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
  }>(
    (await db
      .from('plans')
      .select('id, name, setup_price_cents, maintenance_price_cents')
      .eq('is_active', true)
      .eq('is_quote_only', false)
      .order('sort_order', { ascending: true })) as never,
  );

  const choices: PlanChoice[] = plans.map((plan) => ({
    id: plan.id,
    label: `${plan.name} — ${formatMoney(plan.setup_price_cents, 'EUR', {
      hideDecimalsWhenRound: true,
    })} HT puis ${formatMoney(plan.maintenance_price_cents, 'EUR', {
      hideDecimalsWhenRound: true,
    })} HT / an`,
  }));

  return (
    <AdminTable view="factures" searchParams={await searchParams}>
      <IssueInvoiceForm plans={choices} />
    </AdminTable>
  );
}
