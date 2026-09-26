import type { Metadata } from 'next';
import Link from 'next/link';
import { Panel, StatusPill } from '@stax/ui';
import { requireAdminRole } from '~/lib/admin';

export const metadata: Metadata = { title: 'Messages clients' };
export const dynamic = 'force-dynamic';

/**
 * Boîte de réception de l'équipe : un fil par client, le plus récent en haut.
 * Un fil dont le dernier message vient du client attend une réponse.
 */

interface Conversation {
  project_id: string;
  organization_name: string | null;
  site_name: string | null;
  last_message_at: string;
  last_message: string;
  last_author_side: string;
  unread_count: number;
  message_count: number;
  proposal_status: string | null;
}

const DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

const PROPOSAL_LABELS: Record<string, string> = {
  sent: 'Prospect · proposition envoyée',
  claimed: 'Prospect · paiement attendu',
  paid: 'Prospect · payé',
  delivered: 'Client (proposition)',
  withdrawn: 'Proposition retirée',
};

export default async function AdminMessagesPage() {
  const { db } = await requireAdminRole('support');
  const { data, error } = await db.rpc('staff_conversations', { p_limit: 200 });
  const conversations = (error ? [] : (data ?? [])) as Conversation[];
  const waiting = conversations.filter((c) => c.last_author_side === 'client');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-[-0.02em]">Messages clients</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--foreground-muted)]">
          Les messages que les clients et les prospects vous envoient depuis leur espace. Chaque
          réponse part aussi par e-mail au client.{' '}
          {waiting.length > 0
            ? `${waiting.length} discussion(s) attendent une réponse.`
            : 'Tout le monde a sa réponse.'}
        </p>
      </div>

      {conversations.length === 0 ? (
        <Panel level={1} padding="lg">
          <p className="text-sm text-[var(--foreground-muted)]">Aucun message pour le moment.</p>
        </Panel>
      ) : (
        <ul className="space-y-2" data-testid="conversation-list">
          {conversations.map((conversation) => {
            const needsAnswer = conversation.last_author_side === 'client';
            return (
              <li key={conversation.project_id}>
                <Link
                  href={`/admin/messages/${conversation.project_id}`}
                  className="block rounded-[var(--radius-lg)] border border-[var(--border)] p-4 transition-colors hover:bg-[var(--surface)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {conversation.organization_name ?? 'Client'}
                    </span>
                    {conversation.site_name ? (
                      <span className="text-sm text-[var(--muted)]">
                        · {conversation.site_name}
                      </span>
                    ) : null}
                    {needsAnswer ? (
                      <StatusPill tone="warning">À répondre</StatusPill>
                    ) : (
                      <StatusPill tone="success">Répondu</StatusPill>
                    )}
                    {conversation.unread_count > 0 ? (
                      <StatusPill tone="accent">{conversation.unread_count} non lu(s)</StatusPill>
                    ) : null}
                    {conversation.proposal_status ? (
                      <span className="text-xs text-[var(--muted)]">
                        {PROPOSAL_LABELS[conversation.proposal_status] ?? ''}
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-[var(--muted)]">
                      {DATE.format(new Date(conversation.last_message_at))}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--foreground-muted)]">
                    {conversation.last_author_side === 'stax' ? 'Vous : ' : ''}
                    {conversation.last_message}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
