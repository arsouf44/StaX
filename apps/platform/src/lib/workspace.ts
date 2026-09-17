import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createUserClient } from '@stax/database';
import { loadWorkspace, type Workspace } from '@stax/database';
import type { Db } from '@stax/database';
import type { OrgCapability } from '@stax/types';
import { requireSession } from './session';

/**
 * Contexte de travail de l espace client.
 *
 * Point capital : toutes les lectures et ecritures de l espace client passent
 * par `createUserClient(accessToken)`, donc par un client Supabase portant le
 * JWT de la personne. La RLS s applique integralement. Meme un defaut
 * applicatif — un filtre oublie, un identifiant mal verifie — ne peut pas
 * franchir la frontiere entre deux organisations : la base refuserait la ligne.
 *
 * La cle de service n est JAMAIS utilisee ici.
 */

export const ORG_COOKIE = 'stax_org';
export const SITE_COOKIE = 'stax_site';

export interface WorkspaceContext {
  workspace: Workspace;
  db: Db;
  accessToken: string;
  userId: string;
}

export const getWorkspace = cache(async (): Promise<WorkspaceContext> => {
  const session = await requireSession();
  const store = await cookies();

  const db = createUserClient(session.user.accessToken);
  const workspace = await loadWorkspace(db, session.user.id, {
    organizationId: store.get(ORG_COOKIE)?.value ?? null,
    siteId: store.get(SITE_COOKIE)?.value ?? null,
  });

  // Un compte sans organisation n a rien a faire dans l espace client : on
  // l oriente vers la commande plutot que d afficher un tableau de bord vide.
  if (!workspace) redirect('/bienvenue');

  return {
    workspace,
    db,
    accessToken: session.user.accessToken,
    userId: session.user.id,
  };
});

/**
 * Exige une capacite precise.
 *
 * Ce controle est une COMMODITE d interface : il evite d afficher une page que
 * la personne ne peut pas utiliser. La regle qui fait foi reste la RLS et les
 * declencheurs en base, qui refuseraient l ecriture de toute facon.
 */
export async function requireCapability(capability: OrgCapability): Promise<WorkspaceContext> {
  const context = await getWorkspace();
  if (!context.workspace.capabilities.includes(capability)) {
    notFound();
  }
  return context;
}

/** Site courant, ou page introuvable si l organisation n en a aucun. */
export async function requireCurrentSite() {
  const context = await getWorkspace();
  const site = context.workspace.currentSite;
  if (!site) notFound();
  return { ...context, site };
}
