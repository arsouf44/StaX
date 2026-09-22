import { cache } from 'react';
import { createUserClient, type Db } from '@stax/database';
import type { PlatformRole } from '@stax/types';
import { hasPlatformRole } from '@stax/auth';
import { notFound, redirect } from 'next/navigation';
import { requireSession, type AuthenticatedSession } from './session';

/**
 * Contexte du back-office.
 *
 * Trois conditions cumulatives, verifiees COTE SERVEUR a chaque page :
 *
 *  1. une session valide ;
 *  2. un role inscrit dans `profiles.platform_role` — jamais deduit de
 *     l adresse e-mail ;
 *  3. si le compte porte `mfa_enforced`, un second facteur REELLEMENT VALIDE
 *     pour la session en cours (`aal2`), pas seulement enrole.
 *
 * Le back-office donne acces aux donnees de tous les clients. Retirer
 * `mfa_enforced` d un compte interne revient donc a les ouvrir avec un mot de
 * passe seul : c est une decision d exploitation, prise compte par compte.
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

  // Pas le role : page introuvable. On ne confirme pas l existence du
  // back-office a qui n y a pas droit.
  if (!hasPlatformRole(session.profile, 'support') || !role) {
    notFound();
  }

  // Second facteur : exige quand le compte le porte, et pas de facon absolue.
  //
  // Ce garde suivait sa propre regle, independante de `profiles.mfa_enforced`,
  // et contredisait donc `requirePlatformStaff()`, qui s appuie dessus depuis
  // toujours. Deux verrous pour la meme porte, qui ne s ouvraient pas avec la
  // meme clef : le compte proprietaire se retrouvait devant un 404 apres avoir
  // leve son obligation de second facteur.
  //
  // La colonne `mfa_enforced` fait desormais foi partout. C est le
  // proprietaire de la plateforme qui decide, compte par compte, et
  // `pnpm admin:bootstrap` la pose a `true` sur tout nouveau platform_owner.
  //
  // CE QUE CELA COUTE, ECRIT NOIR SUR BLANC : sur un compte ou cette colonne
  // vaut `false`, le mot de passe seul ouvre le back-office — donc les donnees
  // de TOUS les clients. C est un choix d exploitation, assume et revocable
  // depuis /app/securite, pas un defaut.
  if (session.profile.mfa_enforced && session.user.assuranceLevel !== 'aal2') {
    // Conduire a l enrolement plutot que renvoyer 404 : dire a un membre de
    // l equipe que SON back-office n existe pas etait une impasse sans indice.
    redirect('/mfa/configuration?raison=obligatoire');
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
