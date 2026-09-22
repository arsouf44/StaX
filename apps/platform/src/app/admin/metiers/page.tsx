import type { Metadata } from 'next';
import { AdminTable } from '~/components/admin/admin-table';
import { requireAdminRole } from '~/lib/admin';

export const metadata: Metadata = { title: 'Métiers' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Le role est exige AVANT toute lecture. La RLS refuserait de toute facon
  // les lignes, mais une page introuvable vaut mieux qu'un tableau vide.
  await requireAdminRole('support');
  return <AdminTable view="metiers" searchParams={await searchParams} />;
}
