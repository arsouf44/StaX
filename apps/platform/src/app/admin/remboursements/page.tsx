import type { Metadata } from 'next';
import { AdminTable } from '~/components/admin/admin-table';
import { requireAdminRole } from '~/lib/admin';

export const metadata: Metadata = { title: 'Remboursements' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Le role est exige AVANT toute lecture. La RLS refuserait de toute facon
  // les lignes, mais une page introuvable vaut mieux qu'un tableau vide.
  await requireAdminRole('billing_admin');
  return <AdminTable view="remboursements" searchParams={await searchParams} />;
}
