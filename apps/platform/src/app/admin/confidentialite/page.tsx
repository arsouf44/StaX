import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import { AdminTable } from '~/components/admin/admin-table';
import { requireAdminRole } from '~/lib/admin';
import { PrivacyRequestPanel, type PrivacyRequestView } from './request-panel';

export const metadata: Metadata = { title: 'Demandes RGPD' };

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

const KIND_LABELS: Record<string, string> = {
  export: 'Accès / portabilité',
  deletion: 'Effacement',
  rectification: 'Rectification',
  objection: 'Opposition',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await requireAdminRole('platform_admin');

  const rows = unwrapList<{
    id: string;
    reference: string;
    kind: string;
    status: string;
    requester_email: string;
    details: string | null;
    due_at: string;
    identity_verified_at: string | null;
    created_at: string;
    organizations: { name: string } | { name: string }[] | null;
  }>(
    (await db
      .from('privacy_requests')
      .select(
        'id, reference, kind, status, requester_email, details, due_at, ' +
          'identity_verified_at, created_at, organizations ( name )',
      )
      .in('status', ['received', 'verifying', 'in_progress'])
      .order('due_at', { ascending: true })
      .limit(50)) as never,
  );

  // Le compte a rebours est calcule COTE SERVEUR : l'horloge d'un poste peut
  // etre fausse, et le delai d'un mois n'est pas un delai indicatif.
  const now = new Date().getTime();

  const requests: PrivacyRequestView[] = rows.map((row) => {
    const organization = Array.isArray(row.organizations)
      ? row.organizations[0]
      : row.organizations;
    return {
      id: row.id,
      reference: row.reference,
      kind: row.kind,
      kindLabel: KIND_LABELS[row.kind] ?? row.kind,
      status: row.status,
      requesterEmail: row.requester_email,
      organizationName: organization?.name ?? null,
      details: row.details,
      receivedLabel: DATE.format(new Date(row.created_at)),
      dueLabel: DATE.format(new Date(row.due_at)),
      daysLeft: Math.floor((new Date(row.due_at).getTime() - now) / 86_400_000),
      identityVerified: row.identity_verified_at !== null,
    };
  });

  return (
    <div className="space-y-8">
      <PrivacyRequestPanel requests={requests} />
      <AdminTable view="confidentialite" searchParams={await searchParams} />
    </div>
  );
}
