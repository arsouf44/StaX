import type { Metadata } from 'next';
import { unwrapList } from '@stax/database';
import { requireAdminRole } from '~/lib/admin';
import { ContentReportPanel, type ContentReportView } from './report-panel';

export const metadata: Metadata = { title: 'Signalements' };

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

const CATEGORY_LABELS: Record<string, string> = {
  illegal: 'Contenu illicite',
  intellectual_property: 'Propriété intellectuelle',
  privacy: 'Vie privée',
  defamation: 'Diffamation',
  fraud: 'Arnaque',
  hate: 'Haine ou violence',
  child_abuse: 'Abus sur mineur',
  other: 'Autre',
};

export default async function Page() {
  const { db, role } = await requireAdminRole('support');

  const rows = unwrapList<{
    id: string;
    reference: string;
    content_url: string;
    category: string;
    explanation: string;
    reporter_name: string | null;
    reporter_email: string | null;
    status: string;
    decision: string | null;
    created_at: string;
    sites: { name: string } | { name: string }[] | null;
  }>(
    (await db
      .from('content_reports')
      .select(
        'id, reference, content_url, category, explanation, reporter_name, reporter_email, ' +
          'status, decision, created_at, sites ( name )',
      )
      .order('created_at', { ascending: false })
      .limit(100)) as never,
  );

  const reports: ContentReportView[] = rows.map((row) => {
    const site = Array.isArray(row.sites) ? row.sites[0] : row.sites;
    return {
      id: row.id,
      reference: row.reference,
      url: row.content_url,
      category: row.category,
      categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
      explanation: row.explanation,
      reporter: row.reporter_name
        ? `${row.reporter_name}${row.reporter_email ? ` · ${row.reporter_email}` : ''}`
        : 'Anonyme',
      status: row.status,
      decision: row.decision,
      siteName: site?.name ?? null,
      receivedLabel: DATE.format(new Date(row.created_at)),
    };
  });

  return (
    <ContentReportPanel
      reports={reports}
      canDecide={role === 'platform_owner' || role === 'platform_admin'}
    />
  );
}
