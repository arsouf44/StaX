'use client';

import { useState, useTransition } from 'react';
import { Alert, Button, ConfirmDialog } from '@stax/ui';
import type { ActionState } from '~/lib/form-state';
import { disableMfaAction, revokeOtherSessionsAction } from './actions';

/**
 * Actions sensibles sur la session.
 *
 * Chacune demande une confirmation explicite : fermer toutes ses sessions ou
 * desactiver son second facteur n est pas une action qu on declenche par un
 * clic distrait.
 */
export function SessionControls({
  factorId,
  canDisable,
}: {
  factorId: string;
  canDisable: boolean;
}) {
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();
  const [confirmDisable, setConfirmDisable] = useState(false);

  return (
    <div className="space-y-4">
      {state.status !== 'idle' && state.message ? (
        <Alert tone={state.status === 'error' ? 'danger' : 'success'} live="status">
          {state.message}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          loading={pending}
          onClick={() =>
            startTransition(() => {
              void revokeOtherSessionsAction().then(setState);
            })
          }
        >
          Fermer mes autres sessions
        </Button>

        {canDisable ? (
          <Button variant="ghost" onClick={() => setConfirmDisable(true)}>
            Désactiver la double authentification
          </Button>
        ) : null}
      </div>

      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Fermer vos autres sessions déconnecte tous les appareils sauf celui-ci. Utile si vous avez
        utilisé un ordinateur partagé, ou si vous avez un doute.
      </p>

      <ConfirmDialog
        open={confirmDisable}
        onClose={() => setConfirmDisable(false)}
        title="Désactiver la double authentification ?"
        description="Votre compte ne sera plus protégé que par votre mot de passe. Si celui-ci est volé, la personne pourra entrer."
        confirmLabel="Désactiver"
        tone="danger"
        loading={pending}
        onConfirm={() => {
          const data = new FormData();
          data.set('factorId', factorId);
          startTransition(() => {
            void disableMfaAction(data).then((result) => {
              setState(result);
              setConfirmDisable(false);
            });
          });
        }}
      />
    </div>
  );
}
