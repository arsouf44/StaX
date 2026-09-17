'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Badge, Button, Icon, Panel, Textarea } from '@stax/ui';
import type { SubmissionView } from './page';
import {
  saveInternalNoteAction,
  updateSubmissionStatusAction,
  type InboxActionState,
} from './actions';

/**
 * Liste des messages.
 *
 * Deux principes d interface :
 *  - on montre d abord ce que la personne a ecrit, pas les metadonnees ;
 *  - les libelles de champ viennent du formulaire tel qu il a ete rempli :
 *    aucun nom technique (`field_3`, `data.email`) n apparait jamais.
 */

const IDLE: InboxActionState = { status: 'idle' };

const FIELD_LABELS: Record<string, string> = {
  email: 'E-mail',
  nom: 'Nom',
  name: 'Nom',
  prenom: 'Prénom',
  first_name: 'Prénom',
  last_name: 'Nom',
  telephone: 'Téléphone',
  phone: 'Téléphone',
  message: 'Message',
  sujet: 'Sujet',
  subject: 'Sujet',
  societe: 'Société',
  company: 'Société',
  budget: 'Budget',
  ville: 'Ville',
  city: 'Ville',
  consent: 'Consentement',
  date: 'Date souhaitée',
};

function humanize(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
}

function primaryContact(data: Record<string, unknown>): string {
  for (const key of ['email', 'telephone', 'phone']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function displayName(data: Record<string, unknown>): string {
  const parts = ['prenom', 'first_name', 'nom', 'name', 'last_name']
    .map((key) => (typeof data[key] === 'string' ? (data[key] as string).trim() : ''))
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(' ') : 'Visiteur';
}

function StatusButton({ label, status, id }: { label: string; status: string; id: string }) {
  const { pending } = useFormStatus();
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        {label}
      </Button>
    </>
  );
}

function NoteForm({ id, note }: { id: string; note: string | null }) {
  const [state, action] = useActionState<InboxActionState, FormData>(saveInternalNoteAction, IDLE);
  const { pending } = useFormStatus();

  return (
    <form action={action} className="mt-4 space-y-2">
      <input type="hidden" name="id" value={id} />
      <label
        htmlFor={`note-${id}`}
        className="text-2xs font-medium tracking-[0.1em] text-[var(--muted)] uppercase"
      >
        Note interne
      </label>
      <Textarea
        id={`note-${id}`}
        name="note"
        rows={2}
        defaultValue={note ?? ''}
        placeholder="Visible par votre équipe uniquement. Le visiteur ne la voit jamais."
      />
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          Enregistrer la note
        </Button>
        {state.status === 'success' && state.message ? (
          <span className="text-xs text-[var(--success)]">{state.message}</span>
        ) : null}
        {state.status === 'error' && state.message ? (
          <span className="text-xs text-[var(--danger)]">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}

function MessageCard({
  submission,
  canManage,
}: {
  submission: SubmissionView;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(submission.status === 'unread');
  const [state, action] = useActionState<InboxActionState, FormData>(
    updateSubmissionStatusAction,
    IDLE,
  );

  const entries = Object.entries(submission.data).filter(
    ([, value]) => typeof value === 'string' && value.trim().length > 0,
  );
  const contact = primaryContact(submission.data);
  const name = displayName(submission.data);
  const message = typeof submission.data.message === 'string' ? submission.data.message : '';

  return (
    <Panel level={submission.status === 'unread' ? 2 : 1} padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium">{name}</h2>
            {submission.status === 'unread' ? <Badge tone="accent">Nouveau</Badge> : null}
            <Badge tone="neutral">{submission.formName}</Badge>
            {submission.spamScore >= 0.8 ? <Badge tone="warning">Classé indésirable</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            <time dateTime={submission.createdAt}>{formatDate(submission.createdAt)}</time>
            {contact ? ` · ${contact}` : ''}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
        >
          {open ? 'Replier' : 'Voir le détail'}
          <Icon name={open ? 'circle-ellipsis' : 'circle-ellipsis'} size={14} />
        </button>
      </div>

      {!open && message ? (
        <p className="mt-3 line-clamp-2 text-sm text-[var(--foreground-muted)]">{message}</p>
      ) : null}

      {open ? (
        <>
          <dl className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
            {entries.map(([key, value]) => (
              <div key={key} className="grid gap-1 p-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
                <dt className="text-xs font-medium text-[var(--muted)]">{humanize(key)}</dt>
                <dd className="text-sm whitespace-pre-wrap">{String(value)}</dd>
              </div>
            ))}
          </dl>

          {contact.includes('@') ? (
            <p className="mt-3">
              <a
                href={`mailto:${contact}`}
                className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] underline underline-offset-4"
              >
                <Icon name="mail" size={14} />
                Répondre par e-mail
              </a>
            </p>
          ) : null}

          {canManage ? <NoteForm id={submission.id} note={submission.internalNote} /> : null}
        </>
      ) : null}

      {canManage ? (
        <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-[var(--border)] pt-3">
          {submission.status !== 'read' ? (
            <form action={action}>
              <StatusButton label="Marquer comme traité" status="read" id={submission.id} />
            </form>
          ) : null}
          {submission.status !== 'unread' ? (
            <form action={action}>
              <StatusButton label="Remettre à traiter" status="unread" id={submission.id} />
            </form>
          ) : null}
          {submission.status !== 'archived' ? (
            <form action={action}>
              <StatusButton label="Archiver" status="archived" id={submission.id} />
            </form>
          ) : null}
          {submission.status !== 'spam' ? (
            <form action={action}>
              <StatusButton label="Indésirable" status="spam" id={submission.id} />
            </form>
          ) : null}

          {state.status === 'error' && state.message ? (
            <span className="ml-2 text-xs text-[var(--danger)]">{state.message}</span>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

export function MessageList({
  submissions,
  canManage,
}: {
  submissions: SubmissionView[];
  canManage: boolean;
}) {
  const [error] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error ? (
        <Alert tone="danger" live="alert">
          {error}
        </Alert>
      ) : null}
      {submissions.map((submission) => (
        <MessageCard key={submission.id} submission={submission} canManage={canManage} />
      ))}
    </div>
  );
}
