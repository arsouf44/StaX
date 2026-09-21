'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { IDLE_STATE } from '~/lib/form-state';
import { endImpersonationAction } from '~/app/admin/assistance/actions';

/**
 * Banniere d'assistance.
 *
 * Elle est volontairement impossible a manquer : fond d'alerte, position fixe,
 * compte a rebours. Un membre de l'equipe ne doit jamais oublier qu'il regarde
 * les donnees d'un client.
 *
 * Elle est rendue AVANT le contenu dans l'ordre du document et annoncee comme
 * region de statut : une personne qui navigue au lecteur d'ecran l'entend en
 * premier, pas apres avoir parcouru le tableau de bord.
 */

function EndButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-[var(--radius-sm)] border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
    >
      {pending ? 'Fermeture…' : 'Quitter l’assistance'}
    </button>
  );
}

export function SupportBanner({
  organizationName,
  reason,
  expiresAtLabel,
}: {
  organizationName: string;
  reason: string;
  expiresAtLabel: string;
}) {
  const [state, setState] = useState(IDLE_STATE);

  const close = (formData: FormData) => endImpersonationAction(IDLE_STATE, formData).then(setState);

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 border-b border-[var(--warning)]/40 bg-[var(--warning)]/90 text-[#1a1200]"
    >
      <div className="mx-auto flex w-full max-w-[110rem] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        <p className="min-w-0 flex-1 text-xs leading-relaxed sm:text-sm">
          <span className="font-semibold">Assistance en cours</span> — vous consultez l’espace de{' '}
          <span className="font-semibold">{organizationName}</span>. Motif : « {reason} ». Session
          close automatiquement à {expiresAtLabel}. Les opérations financières et les changements
          d’accès sont désactivés, et {organizationName} voit cette intervention dans son journal.
          {state.status === 'error' && state.message ? ` ${state.message}` : ''}
        </p>
        <form action={close}>
          <EndButton />
        </form>
      </div>
    </div>
  );
}
