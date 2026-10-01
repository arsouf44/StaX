'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { releaseStatusAction } from '~/app/app/editeur/contract/actions';

const IN_FLIGHT = new Set(['queued', 'committing', 'deploying']);

/**
 * Suit une publication en cours là où le client se trouve (accueil, par
 * exemple après avoir quitté l'éditeur juste après « Publier ») : chaque
 * interrogation fait aussi avancer la publication côté serveur, et la page se
 * relit dès que la version est en ligne ou a échoué. Vingt minutes au plus.
 */
export function ReleaseWatcher({
  releaseId,
  everyMs = 4000,
}: {
  releaseId: string;
  everyMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    let count = 0;
    let timer: number | undefined;
    // Premiere interrogation presque tout de suite (le client vient souvent
    // de quitter l'editeur), puis toutes les `everyMs`.
    const check = () => {
      count += 1;
      void releaseStatusAction({ releaseId })
        .then((result) => result.status === 'success' && !IN_FLIGHT.has(result.release.status))
        .catch(() => false)
        .then((finished) => {
          if (stopped) return;
          if (finished) router.refresh();
          else if (count < 300) timer = window.setTimeout(check, everyMs);
        });
    };
    timer = window.setTimeout(check, 1000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [releaseId, everyMs, router]);
  return null;
}
