import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import { AdminTable } from '~/components/admin/admin-table';
import { requireAdminRole } from '~/lib/admin';
import { FlagSwitches, type FlagView } from './flag-switches';

export const metadata: Metadata = { title: 'Activations progressives' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await requireAdminRole('platform_admin');

  const rows = unwrapList<{
    key: string;
    label: string;
    description: string | null;
    enabled_globally: boolean;
  }>(
    (await db
      .from('feature_flags')
      .select('key, label, description, enabled_globally')
      .order('key')) as never,
  );

  const flags: FlagView[] = rows.map((row) => ({
    key: row.key,
    label: row.label,
    description: row.description,
    enabled: row.enabled_globally,
  }));

  return (
    <div className="space-y-8">
      <FlagSwitches flags={flags} />
      <AdminTable view="feature-flags" searchParams={await searchParams} />
    </div>
  );
}
