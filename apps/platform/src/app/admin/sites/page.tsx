import type { Metadata } from 'next';
import { hasPlatformRole } from '@nemasus/auth';
import { unwrapList } from '@nemasus/database';
import { AdminTable } from '~/components/admin/admin-table';
import { requireAdminRole } from '~/lib/admin';
import { CreateSiteButton } from './create-site-button';

export const metadata: Metadata = { title: 'Sites' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Le role est exige AVANT toute lecture. La RLS refuserait de toute facon
  // les lignes, mais une page introuvable vaut mieux qu'un tableau vide.
  const { db, session } = await requireAdminRole('support');

  // Creer un site est reserve a l'administration ; la base le reverifie.
  let actions: React.ReactNode = null;
  if (hasPlatformRole(session.profile, 'platform_admin')) {
    const types = await db
      .from('business_types')
      .select('slug, label')
      .eq('is_active', true)
      .order('label', { ascending: true });
    actions = (
      <CreateSiteButton
        businessTypes={unwrapList<{ slug: string; label: string }>(types as never).map((row) => ({
          value: row.slug,
          label: row.label,
        }))}
      />
    );
  }

  return <AdminTable view="sites" searchParams={await searchParams} actions={actions} />;
}
