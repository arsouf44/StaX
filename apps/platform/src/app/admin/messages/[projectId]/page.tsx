import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { Panel, cn } from '@stax/ui';
import { uuidSchema } from '@stax/validation';
import { requireAdminRole } from '~/lib/admin';
import { TeamReplyForm } from '../reply-form';

export const metadata: Metadata = { title: 'Discussion' };
export const dynamic = 'force-dynamic';

const DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

export default async function AdminConversationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  if (!uuidSchema.safeParse(projectId).success) notFound();
  const { db } = await requireAdminRole('support');

  const project = unwrapMaybe<{
    id: string;
    reference: string;
    site_id: string | null;
    organizations: { name: string; billing_email: string | null; phone: string | null } | null;
    sites: { name: string } | null;
  }>(
    (await db
      .from('projects')
      .select(
        'id, reference, site_id, organizations ( name, billing_email, phone ), sites ( name )',
      )
      .eq('id', projectId)
      .maybeSingle()) as never,
  );
  if (!project) notFound();

  const messages = unwrapList<{
    id: string;
    author_side: string;
    body: string;
    created_at: string;
    profiles: { first_name: string | null; email: string } | null;
  }>(
    (await db
      .from('project_messages')
      .select(
        'id, author_side, body, created_at, profiles!project_messages_author_id_fkey ( first_name, email )',
      )
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })
      .limit(500)) as never,
  );
  await db.rpc('mark_conversation_read', { p_project: project.id });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/messages" className="text-sm underline underline-offset-4">
          ← Tous les messages
        </Link>
        <h1 className="mt-3 text-2xl font-medium tracking-[-0.02em]">
          {project.organizations?.name ?? 'Client'}
        </h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          {project.sites?.name ? `${project.sites.name} · ` : ''}
          {project.organizations?.billing_email ?? ''}
          {project.organizations?.phone ? ` · ${project.organizations.phone}` : ''}
          {project.site_id ? (
            <>
              {' · '}
              <Link
                href={`/admin/sites/${project.site_id}`}
                className="underline underline-offset-4"
              >
                Fiche du site
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <Panel level={2} padding="lg">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">Aucun message.</p>
        ) : (
          <ul className="space-y-4">
            {messages.map((message) => {
              const fromClient = message.author_side === 'client';
              return (
                <li
                  key={message.id}
                  className={cn(
                    'max-w-3xl rounded-[var(--radius-md)] border p-3.5',
                    fromClient
                      ? 'border-[var(--border)] bg-[var(--surface)]'
                      : 'ml-auto border-[var(--accent)]/25 bg-[var(--accent)]/[0.06]',
                  )}
                >
                  <p className="text-2xs font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
                    {fromClient
                      ? (message.profiles?.first_name ?? message.profiles?.email ?? 'Client')
                      : `Équipe StaX${message.profiles?.first_name ? ` (${message.profiles.first_name})` : ''}`}
                    <span className="ml-2 font-normal tracking-normal normal-case">
                      {DATE.format(new Date(message.created_at))}
                    </span>
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
                    {message.body}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel level={2} padding="lg">
        <h2 className="mb-3 text-sm font-medium">Répondre</h2>
        <TeamReplyForm projectId={project.id} />
      </Panel>
    </div>
  );
}
