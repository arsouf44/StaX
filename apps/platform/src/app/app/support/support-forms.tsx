'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, EmptyState, Field, Icon, Panel, Select, StatusPill, Textarea, Input } from '@stax/ui';
import type { StatusTone } from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import { openTicketAction, replyToTicketAction } from './actions';

export interface TicketView {
  id: string;
  reference: string;
  subject: string;
  status: string;
  statusLabel: string;
  statusTone: StatusTone;
  createdAt: string;
}

const CATEGORIES = [
  { value: 'technical', label: 'Un problème technique' },
  { value: 'content', label: 'Une modification de contenu' },
  { value: 'billing', label: 'Une question de facturation' },
  { value: 'domain', label: 'Mon nom de domaine' },
  { value: 'other', label: 'Autre chose' },
];

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel={pendingLabel}>
      {label}
    </Button>
  );
}

export function SupportForms({ tickets }: { tickets: TicketView[] }) {
  const [openState, openAction] = useActionState<ActionState, FormData>(
    openTicketAction,
    IDLE_STATE,
  );
  const [replyState, replyAction] = useActionState<ActionState, FormData>(
    replyToTicketAction,
    IDLE_STATE,
  );
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Panel level={2} padding="lg">
        <h2 className="text-sm font-medium">Nouvelle demande</h2>

        <form action={openAction} className="mt-5 space-y-5" noValidate>
          {openState.status === 'error' && openState.message ? (
            <Alert tone="danger" live="alert">
              {openState.message}
            </Alert>
          ) : null}
          {openState.status === 'success' && openState.message ? (
            <Alert tone="success" live="status">
              {openState.message}
            </Alert>
          ) : null}

          <Field label="Votre demande concerne" required>
            <Select name="category" defaultValue="other" required>
              {CATEGORIES.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Objet" required>
            <Input name="subject" required minLength={5} maxLength={200} />
          </Field>

          <Field
            label="Votre message"
            hint="Le plus utile : ce que vous vouliez faire, ce qui s’est passé, et sur quelle page."
            required
          >
            <Textarea name="body" rows={5} required minLength={10} />
          </Field>

          <SubmitButton label="Envoyer ma demande" pendingLabel="Envoi" />
        </form>
      </Panel>

      <section aria-labelledby="demandes">
        <h2 id="demandes" className="mb-3 text-sm font-medium">
          Vos demandes
        </h2>

        {tickets.length === 0 ? (
          <EmptyState
            icon={<Icon name="life-buoy" size={24} />}
            title="Aucune demande pour le moment"
            description="Vos échanges avec notre équipe apparaîtront ici."
          />
        ) : (
          <ul className="space-y-3">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Panel level={1} padding="md">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ticket.subject}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        <span className="font-mono">{ticket.reference}</span> ·{' '}
                        <time dateTime={ticket.createdAt}>
                          {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
                            new Date(ticket.createdAt),
                          )}
                        </time>
                      </p>
                    </div>
                    <StatusPill tone={ticket.statusTone}>{ticket.statusLabel}</StatusPill>
                  </div>

                  {ticket.status !== 'closed' ? (
                    replyingTo === ticket.id ? (
                      <form action={replyAction} className="mt-4 space-y-3">
                        {replyState.status === 'error' && replyState.message ? (
                          <Alert tone="danger" live="alert">
                            {replyState.message}
                          </Alert>
                        ) : null}
                        <input type="hidden" name="ticketId" value={ticket.id} />
                        <label htmlFor={`reply-${ticket.id}`} className="sr-only">
                          Votre réponse
                        </label>
                        <Textarea id={`reply-${ticket.id}`} name="body" rows={3} required />
                        <div className="flex gap-2">
                          <SubmitButton label="Envoyer" pendingLabel="Envoi" />
                          <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)}>
                            Annuler
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3"
                        onClick={() => setReplyingTo(ticket.id)}
                      >
                        Ajouter un message
                      </Button>
                    )
                  ) : null}
                </Panel>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
