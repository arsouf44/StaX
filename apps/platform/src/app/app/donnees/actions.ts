'use server';

import { createUserClient, toCsvExport } from '@stax/database';
import { requireSession } from '~/lib/session';

/**
 * Export des donnees du client.
 *
 * Trois points :
 *  - l export passe par le jeton de la personne : la RLS garantit qu il ne
 *    contient QUE ses donnees, sans qu aucun filtre applicatif n ait a y
 *    veiller ;
 *  - la capacite `data.export` est verifiee ;
 *  - chaque cellule est neutralisee contre l injection de formule : une valeur
 *    commencant par un signe interpretable par un tableur serait executee a
 *    l ouverture du fichier.
 */
export async function exportCollectionAction(
  collection: 'messages' | 'contacts' | 'reservations' | 'commandes' | 'comptes',
): Promise<{ ok: true; filename: string; csv: string } | { ok: false; message: string }> {
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  try {
    return await toCsvExport(db, collection);
  } catch {
    return {
      ok: false,
      message: 'L’export n’a pas pu être préparé. Réessayez dans quelques instants.',
    };
  }
}
