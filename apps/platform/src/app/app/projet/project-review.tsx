'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Panel, Textarea, useToast } from '@stax/ui';
import { respondToReviewAction } from './actions';

/**
 * Validation demandee par l'equipe StaX : le client valide, ou decrit ses
 * corrections. La reponse est enregistree par la base et fait avancer le
 * projet — elle ne se perd pas dans un fil de messages.
 */
export function ProjectReview({
  projectId,
  request,
}: {
  projectId: string;
  request: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'choose' | 'changes'>('choose');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = (approved: boolean) => {
    setError(null);
    startTransition(() => {
      void respondToReviewAction({
        projectId,
        approved,
        ...(message.trim() ? { message: message.trim() } : {}),
      }).then((result) => {
        if (result.status === 'error') setError(result.message);
        else {
          toast.success(result.message);
          router.refresh();
        }
      });
    });
  };

  return (
    <Panel level={2} padding="lg" className="mb-6" data-testid="project-review">
      <h2 className="text-sm font-medium">Votre validation est attendue</h2>
      <p className="mt-1 text-sm text-[var(--foreground-muted)]">
        {request ??
          'Nous avons besoin de votre accord pour passer à l’étape suivante. Relisez ce que nous vous avons présenté, puis validez ou décrivez vos corrections.'}
      </p>
      {error ? (
        <Alert tone="danger" live="alert" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {mode === 'choose' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="accent" loading={pending} onClick={() => send(true)}>
            Je valide
          </Button>
          <Button variant="secondary" onClick={() => setMode('changes')}>
            Je demande des corrections
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <Field
            label="Vos corrections"
            hint="Soyez précis : page, élément, ce que vous souhaitez à la place."
          >
            <Textarea
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              loading={pending}
              disabled={message.trim().length < 3}
              onClick={() => send(false)}
            >
              Envoyer mes corrections
            </Button>
            <Button variant="ghost" onClick={() => setMode('choose')}>
              Retour
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
