import type { Metadata } from 'next';
import { hasPlatformRole } from '@stax/auth';
import { unwrapList } from '@stax/database';
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
    const [types, plans] = await Promise.all([
      db
        .from('business_types')
        .select('slug, label')
        .eq('is_active', true)
        .order('label', { ascending: true }),
      db
        .from('plans')
        .select('id, name')
        .eq('is_active', true)
        .is('valid_until', null)
        .order('sort_order', { ascending: true }),
    ]);
    actions = (
      <CreateSiteButton
        businessTypes={unwrapList<{ slug: string; label: string }>(types as never).map((row) => ({
          value: row.slug,
          label: row.label,
        }))}
        plans={unwrapList<{ id: string; name: string }>(plans as never).map((row) => ({
          value: row.id,
          label: row.name,
        }))}
      />
    );
  }

  return <AdminTable view="sites" searchParams={await searchParams} actions={actions} />;
}
