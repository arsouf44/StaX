import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import { formatMoney } from '@stax/payments';
import { AdminTable } from '~/components/admin/admin-table';
import { requireAdminRole } from '~/lib/admin';
import { CouponActions, type ActiveCoupon } from './coupon-form';

export const metadata: Metadata = { title: 'Codes promotionnels' };

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

const SCOPES: Record<string, string> = {
  setup: 'création du site',
  maintenance: 'maintenance mensuelle',
  both: 'création et maintenance',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await requireAdminRole('platform_admin');

  const rows = unwrapList<{
    id: string;
    code: string;
    label: string;
    kind: string;
    value: number;
    applies_to: string;
    max_redemptions: number | null;
    redeemed_count: number;
    valid_until: string | null;
  }>(
    (await db
      .from('coupons')
      .select(
        'id, code, label, kind, value, applies_to, max_redemptions, redeemed_count, valid_until',
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(50)) as never,
  );

  const active: ActiveCoupon[] = rows.map((row) => {
    const amount =
      row.kind === 'percent'
        ? `${row.value} %`
        : formatMoney(row.value, 'EUR', { hideDecimalsWhenRound: true });
    const usage =
      row.max_redemptions === null
        ? `${row.redeemed_count} utilisation${row.redeemed_count > 1 ? 's' : ''}`
        : `${row.redeemed_count}/${row.max_redemptions}`;
    const until = row.valid_until ? ` · jusqu’au ${DATE.format(new Date(row.valid_until))}` : '';
    return {
      id: row.id,
      code: row.code,
      label: row.label,
      summary: `${amount} sur la ${SCOPES[row.applies_to] ?? row.applies_to} · ${usage}${until}`,
    };
  });

  return (
    <div className="space-y-8">
      <CouponActions active={active} />
      <AdminTable view="coupons" searchParams={await searchParams} />
    </div>
  );
}
