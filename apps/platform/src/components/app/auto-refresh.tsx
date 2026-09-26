'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Relit la page à intervalle régulier, un nombre limité de fois : le temps
 * que le webhook de paiement arrive, sans laisser le client appuyer sur
 * « Actualiser » en se demandant si quelque chose a échoué.
 */
export function AutoRefresh({ everyMs = 4000, times = 20 }: { everyMs?: number; times?: number }) {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= times) clearInterval(timer);
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs, times]);
  return null;
}
