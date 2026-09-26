import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { Panel, StatusPill, cn } from '@stax/ui';
import { uuidSchema } from '@stax/validation';
import { requireAdminRole } from '~/lib/admin';
import { TICKET_STATUSES } from '~/lib/admin-views';
import { TicketReplyForm } from '../ticket-reply-form';

export const metadata: Metadata = { title: 'Ticket' };
export const dynamic = 'force-dynamic';

const DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { db } = await requireAdminRole('support');

  const ticket = unwrapMaybe<{
    id: string;
    reference: string;
    subject: string;
    category: string;
    status: string;
    priority: string;
    created_at: string;
    organizations: { name: string } | null;
    profiles: { email: string; first_name: string | null } | null;
  }>(
    (await db
      .from('support_tickets')
      .select(
        'id, reference, subject, category, status, priority, created_at, organizations ( name ), profiles!support_tickets_opened_by_fkey ( email, first_name )',
      )
      .eq('id', id)
      .maybeSingle()) as never,
  );
  if (!ticket) notFound();

  const messages = unwrapList<{
    id: string;
    author_side: string;
    body: string;
    is_internal: boolean;
    created_at: string;
  }>(
    (await db
      .from('support_messages')
      .select('id, author_side, body, is_internal, created_at')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })) as never,
  );

  const state = TICKET_STATUSES[ticket.status];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/support" className="text-sm underline underline-offset-4">
          ← Tous les tickets
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-medium tracking-[-0.02em]">{ticket.subject}</h1>
          <StatusPill tone={state?.tone ?? 'neutral'}>{state?.label ?? ticket.status}</StatusPill>
        </div>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          {ticket.reference} · {ticket.organizations?.name ?? 'Sans entreprise'} ·{' '}
          {ticket.profiles?.email ?? '—'} · ouvert le {DATE.format(new Date(ticket.created_at))} ·
          priorité {ticket.priority}
        </p>
      </div>

      <Panel level={2} padding="lg">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">Aucun message.</p>
        ) : (
          <ul className="space-y-4">
            {messages.map((message) => (
              <li
                key={message.id}
                className={cn(
                  'max-w-3xl rounded-[var(--radius-md)] border p-3.5',
                  message.is_internal
                    ? 'border-dashed border-[var(--warning)]/50'
                    : message.author_side === 'client'
                      ? 'border-[var(--border)] bg-[var(--surface)]'
                      : 'ml-auto border-[var(--accent)]/25 bg-[var(--accent)]/[0.06]',
                )}
              >
                <p className="text-2xs font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
                  {message.is_internal
                    ? 'Note interne'
                    : message.author_side === 'client'
                      ? 'Client'
                      : 'Équipe StaX'}
                  <span className="ml-2 font-normal tracking-normal normal-case">
                    {DATE.format(new Date(message.created_at))}
                  </span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel level={2} padding="lg">
        <h2 className="mb-3 text-sm font-medium">Répondre</h2>
        <TicketReplyForm ticketId={ticket.id} />
      </Panel>
    </div>
  );
}
