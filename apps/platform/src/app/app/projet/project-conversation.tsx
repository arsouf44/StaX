'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, Panel, Textarea, cn } from '@stax/ui';
import { sendProjectMessageAction } from './actions';

interface Message {
  id: string;
  author_side: string;
  body: string;
  created_at: string;
}

type State = { status: 'idle' | 'error' | 'success'; message?: string };
const IDLE: State = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel="Envoi">
      Envoyer
    </Button>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/**
 * Fil de discussion du projet.
 *
 * Le cote emetteur affiche vient de la base, pas du formulaire : un message
 * marque « StaX » l est parce que le serveur l a ecrit ainsi.
 */
export function ProjectConversation({
  projectId,
  messages,
  title = 'Échanges avec notre équipe',
  intro = 'Tout se passe ici : pas d’e-mail perdu, pas de fil de discussion éparpillé.',
  placeholder = 'Une question, une précision, une correction à demander…',
}: {
  projectId: string;
  messages: Message[];
  title?: string;
  intro?: string;
  placeholder?: string;
}) {
  const [state, action] = useActionState<State, FormData>(sendProjectMessageAction, IDLE);

  return (
    <Panel level={2} padding="lg" data-testid="team-conversation">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-1.5 text-xs text-[var(--muted)]">{intro}</p>

      {messages.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--foreground-muted)]">
          Aucun message pour l’instant. Écrivez-nous dès que vous avez une question.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {messages.map((message) => {
            const fromClient = message.author_side === 'client';
            return (
              <li
                key={message.id}
                className={cn(
                  'rounded-[var(--radius-md)] border p-3.5',
                  fromClient
                    ? 'border-[var(--border)] bg-[var(--surface)]'
                    : 'border-[var(--accent)]/25 bg-[var(--accent)]/[0.06]',
                )}
              >
                <p className="text-2xs font-medium tracking-[0.1em] text-[var(--muted)] uppercase">
                  {fromClient ? 'Vous' : 'Équipe StaX'}
                  <span className="ml-2 font-normal tracking-normal normal-case">
                    <time dateTime={message.created_at}>{formatDate(message.created_at)}</time>
                  </span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <form action={action} className="mt-6 space-y-3">
        {state.status === 'error' && state.message ? (
          <Alert tone="danger" live="alert">
            {state.message}
          </Alert>
        ) : null}
        {state.status === 'success' && state.message ? (
          <Alert tone="success" live="status">
            {state.message}
          </Alert>
        ) : null}

        <input type="hidden" name="projectId" value={projectId} />
        <label htmlFor="project-message" className="sr-only">
          Votre message
        </label>
        <Textarea
          id="project-message"
          name="body"
          rows={4}
          required
          minLength={2}
          placeholder={placeholder}
        />
        <SubmitButton />
      </form>
    </Panel>
  );
}
