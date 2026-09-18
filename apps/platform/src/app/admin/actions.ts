'use server';

import { createUserClient, adminSearch, type AdminSearchResult } from '@stax/database';
import { hasPlatformRole } from '@stax/auth';
import { requireSession } from '~/lib/session';

/**
 * Recherche globale du back-office.
 *
 * Elle lit avec le JETON DE LA PERSONNE : les policies `is_platform_staff()`
 * decident de ce qui remonte. Un compte non habilite recoit une liste vide,
 * jamais une erreur qui confirmerait l existence de la recherche.
 */
export async function adminSearchAction(query: string): Promise<AdminSearchResult[]> {
  const session = await requireSession();

  if (!hasPlatformRole(session.profile, 'support')) return [];
  // Le second facteur doit etre valide pour la session en cours, pas seulement
  // enrole : la recherche expose des donnees de tous les clients.
  if (session.user.assuranceLevel !== 'aal2') return [];

  try {
    return await adminSearch(createUserClient(session.user.accessToken), query.slice(0, 120));
  } catch {
    return [];
  }
}
