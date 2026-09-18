import { cache } from 'react';
import { createUserClient, type Db } from '@stax/database';
import type { PlatformRole } from '@stax/types';
import { hasPlatformRole } from '@stax/auth';
import { notFound } from 'next/navigation';
import { requireSession, type AuthenticatedSession } from './session';

/**
 * Contexte du back-office.
 *
 * Trois conditions cumulatives, verifiees COTE SERVEUR a chaque page :
 *
 *  1. une session valide ;
 *  2. un role inscrit dans `profiles.platform_role` — jamais deduit de
 *     l adresse e-mail ;
 *  3. un second facteur REELLEMENT VALIDE pour la session en cours (`aal2`),
 *     pas seulement enrole. Le back-office donne acces aux donnees de tous les
 *     clients : un mot de passe seul ne suffit pas.
 *
 * Un compte non habilite recoit une page introuvable. On ne confirme pas
 * l existence du back-office a qui n y a pas droit.
 *
 * Meme habilite, le personnel lit avec SON PROPRE JETON : les policies
 * `app.is_platform_staff()` decident de ce qui est visible. La cle de service,
 * qui contourne tout, n est pas utilisee ici.
 */

export interface AdminContext {
  session: AuthenticatedSession;
  db: Db;
  role: PlatformRole;
}

export const getAdminContext = cache(async (): Promise<AdminContext> => {
  const session = await requireSession();
  const role = session.profile.platform_role;

  if (!hasPlatformRole(session.profile, 'support') || !role) {
    notFound();
  }

  if (session.user.assuranceLevel !== 'aal2') {
    notFound();
  }

  return {
    session,
    db: createUserClient(session.user.accessToken),
    role,
  };
});

/** Exige un niveau minimal dans la hierarchie interne. */
export async function requireAdminRole(minimum: PlatformRole): Promise<AdminContext> {
  const context = await getAdminContext();
  if (!hasPlatformRole(context.session.profile, minimum)) {
    notFound();
  }
  return context;
}
