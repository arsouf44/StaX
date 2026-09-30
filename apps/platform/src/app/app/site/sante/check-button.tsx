'use client';

import { useActionState } from 'react';
import { Button } from '@nemasus/ui';
import { IDLE_STATE } from '~/lib/form-state';
import { runQualityCheckAction } from './actions';

export function QualityCheckButton() {
  const [state, action, pending] = useActionState(runQualityCheckAction, IDLE_STATE);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? 'Vérification en cours…' : 'Vérifier maintenant'}
      </Button>
      {state.message ? (
        <p
          role={state.status === 'error' ? 'alert' : 'status'}
          className={
            state.status === 'error'
              ? 'text-xs text-[var(--danger)]'
              : 'text-xs text-[var(--foreground-muted)]'
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
