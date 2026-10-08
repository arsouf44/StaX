import { cache } from 'react';
import { createAnonClient, listSubprocessors } from '@nemasus/database';
import type { SubprocessorView } from '@nemasus/database';

/**
 * Lectures publiques de référence.
 *
 * Il n'y a plus de catalogue d'offres ni de prix publics : chaque site est
 * conçu sur mesure, le montant est convenu avec le client et réglé par
 * virement. Reste la liste publique des sous-traitants, tolérante à la panne :
 * si la base est indisponible, la page s'affiche avec un message plutôt que
 * de renvoyer une erreur 500 à un visiteur.
 */

export const getSubprocessors = cache(async (): Promise<SubprocessorView[] | null> => {
  try {
    return await listSubprocessors(createAnonClient());
  } catch {
    return null;
  }
});
