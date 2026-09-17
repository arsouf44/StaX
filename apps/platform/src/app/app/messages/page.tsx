import type { Metadata } from 'next';
import Link from 'next/link';
import { unwrapList } from '@stax/database';
import { Badge, EmptyState, Icon, Panel, PermissionDenied } from '@stax/ui';
import { FilterTabs } from '~/components/app/filter-tabs';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { MessageList } from './message-list';

export const metadata: Metadata = { title: 'Messages' };

/**
 * Boite de reception.
 *
 * Les messages arrivent des formulaires publics du site. Le tri par onglet est
 * un filtre serveur, pas un masquage cote navigateur : une personne sans droit
 * de lecture ne recoit aucune ligne, la RLS s en charge.
 */

export interface SubmissionView {
  id: string;
  createdAt: string;
  status: 'unread' | 'read' | 'archived' | 'spam';
  data: Record<string, unknown>;
  internalNote: string | null;
  spamScore: number;
  formName: string;
  formKind: string;
}

const TAB_FILTERS = {
  a_traiter: ['unread'],
  traites: ['read'],
  archives: ['archived'],
  indesirables: ['spam'],
} as const;

type TabKey = keyof typeof TAB_FILTERS;

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { workspace, db } = await getWorkspace();

  if (!workspace.capabilities.includes('inbox.view')) {
    return (
      <PermissionDenied message="Votre rôle ne donne pas accès à la boîte de réception. Demandez à un administrateur de votre organisation de vous l’ouvrir." />
    );
  }

  const site = workspace.currentSite;
  if (!site) {
    return (
      <EmptyState
        icon={<Icon name="mail" size={24} />}
        title="Aucun site pour le moment"
        description="Les messages de vos visiteurs apparaîtront ici dès que votre site sera en ligne."
      />
    );
  }

  const tab: TabKey =
    typeof params.onglet === 'string' && params.onglet in TAB_FILTERS
      ? (params.onglet as TabKey)
      : 'a_traiter';

  const [rows, counts] = await Promise.all([
    db
      .from('form_submissions')
      .select('id, created_at, status, data, internal_note, spam_score, forms ( name, kind )')
      .eq('site_id', site.id)
      .in('status', TAB_FILTERS[tab] as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(100),
    db.from('form_submissions').select('status').eq('site_id', site.id).limit(1000),
  ]);

  const submissions: SubmissionView[] = unwrapList<{
    id: string;
    created_at: string;
    status: SubmissionView['status'];
    data: Record<string, unknown>;
    internal_note: string | null;
    spam_score: number;
    forms: { name: string; kind: string } | { name: string; kind: string }[] | null;
  }>(rows as never).map((row) => {
    const form = Array.isArray(row.forms) ? row.forms[0] : row.forms;
    return {
      id: row.id,
      createdAt: row.created_at,
      status: row.status,
      data: row.data ?? {},
      internalNote: row.internal_note,
      spamScore: Number(row.spam_score ?? 0),
      formName: form?.name ?? 'Formulaire',
      formKind: form?.kind ?? 'contact',
    };
  });

  const statusRows = unwrapList<{ status: SubmissionView['status'] }>(counts as never);
  const count = (key: SubmissionView['status']) =>
    statusRows.filter((row) => row.status === key).length;

  const canManage = workspace.capabilities.includes('inbox.manage');

  return (
    <>
      <PageHeader
        title="Messages"
        description="Tout ce que vos visiteurs vous écrivent depuis votre site arrive ici. Rien n’est supprimé automatiquement."
      />

      <FilterTabs
        ariaLabel="Filtrer les messages"
        active={tab}
        tabs={[
          { value: 'a_traiter', label: 'À traiter', count: count('unread') },
          { value: 'traites', label: 'Traités' },
          { value: 'archives', label: 'Archivés' },
          { value: 'indesirables', label: 'Indésirables', count: count('spam') },
        ]}
        buildHref={(value) => `/app/messages?onglet=${value}`}
      />

      <div className="mt-6">
        {submissions.length === 0 ? (
          <EmptyState
            icon={<Icon name="mail" size={24} />}
            title={
              tab === 'a_traiter'
                ? 'Aucun message en attente'
                : tab === 'indesirables'
                  ? 'Aucun message indésirable'
                  : 'Aucun message dans cet onglet'
            }
            description={
              tab === 'a_traiter'
                ? 'Les nouveaux messages apparaîtront ici. Vous recevez aussi une notification par e-mail.'
                : undefined
            }
          />
        ) : (
          <MessageList submissions={submissions} canManage={canManage} />
        )}
      </div>

      {tab === 'indesirables' && submissions.length > 0 ? (
        <Panel level={1} padding="md" className="mt-6">
          <p className="text-sm text-[var(--foreground-muted)]">
            <Icon name="shield-check" className="mr-1.5 inline align-[-2px]" />
            Ces messages ont été classés automatiquement comme indésirables, mais{' '}
            <strong>rien n’a été supprimé</strong>. Si l’un d’eux est légitime, remettez-le dans « À
            traiter ».
          </p>
        </Panel>
      ) : null}

      <p className="mt-8 text-xs text-[var(--muted)]">
        Vous pouvez exporter l’ensemble de vos messages et de vos contacts depuis{' '}
        <Link href="/app/donnees" className="underline underline-offset-4">
          Mes données
        </Link>
        .{' '}
        <Badge tone="neutral" size="sm">
          Format CSV
        </Badge>
      </p>
    </>
  );
}
