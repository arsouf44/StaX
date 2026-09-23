import { cache } from 'react';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createUserClient, tryCreateServiceClient } from '@stax/database';
import { loadStaffWorkspace, loadWorkspace, type Workspace } from '@stax/database';
import { IMPERSONATION_COOKIE, verifyImpersonation } from '@stax/auth';
import type { Db } from '@stax/database';
import type { OrgCapability } from '@stax/types';
import { hasPlatformRole } from '@stax/auth';
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

  // Equipe StaX en session d assistance : l espace du CLIENT, avec les seuls
  // droits de contenu que la base lui accorde pendant la session.
  const supportToken = store.get(IMPERSONATION_COOKIE)?.value ?? null;
  if (supportToken && session.profile.platform_role) {
    // Sans cle de service, la session ne peut pas etre verifiee : on la traite
    // comme absente (espace personnel) plutot que de faire tomber la page.
    const service = tryCreateServiceClient();
    const active = service
      ? await verifyImpersonation(service, supportToken, session.user.id)
      : null;
    if (active) {
      const staffWorkspace = await loadStaffWorkspace(
        db,
        session.user.id,
        active.organizationId,
        store.get(SITE_COOKIE)?.value ?? null,
      );
      if (staffWorkspace) {
        return {
          workspace: staffWorkspace,
          db,
          accessToken: session.user.accessToken,
          userId: session.user.id,
        };
      }
    }
  }

  const workspace = await loadWorkspace(db, session.user.id, {
    organizationId: store.get(ORG_COOKIE)?.value ?? null,
    siteId: store.get(SITE_COOKIE)?.value ?? null,
  });

  if (!workspace) {
    // L equipe StaX n a pas d organisation cliente : l envoyer vers le tunnel
    // de commande n aurait aucun sens, et la laissait sans issue. Sa place est
    // au back-office, dont l acces ne depend que du role inscrit en base.
    if (hasPlatformRole(session.profile, 'support')) redirect('/admin');

    // Un client sans organisation ne verrait qu un tableau de bord vide : on
    // lui explique la situation et on lui donne les suites possibles.
    redirect('/bienvenue');
  }

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

/**
 * Roles de l equipe StaX qui construisent les sites : meme liste que
 * `app.is_platform_site_editor()` en base.
 */
const SITE_BUILDER_ROLES: ReadonlySet<string> = new Set([
  'platform_owner',
  'platform_admin',
  'designer',
  'support',
]);

/**
 * Le site courant est-il encore en construction chez StaX, pour la personne
 * connectee ?
 *
 * StaX concoit et construit le site ; le client n y a acces qu une fois le
 * site confie (`sites.delivered_at`). La regle qui fait foi est en base
 * (`app.site_can`) : ceci ne fait qu accorder l interface a ce que la base
 * permet, pour que le client ne tombe pas sur des ecrans qu il ne peut pas
 * utiliser.
 */
export function isSiteUnderConstruction(workspace: Workspace): boolean {
  const site = workspace.currentSite;
  if (!site || site.deliveredAt) return false;
  const role = workspace.profile.platform_role;
  return !(role && SITE_BUILDER_ROLES.has(role));
}

/** Ecrans de l espace client qui ne portent pas sur le site lui-meme. */
const ACCOUNT_PATHS = [
  '/app/projet',
  '/app/entreprise',
  '/app/equipe-stax',
  '/app/facturation',
  '/app/abonnement',
  '/app/securite',
  '/app/donnees',
  '/app/activite',
  '/app/support',
  '/app/compte',
  // Detail d une commande StaX (`/app/commande/[id]`), a ne pas confondre avec
  // `/app/commandes`, les commandes de la boutique du site.
  '/app/commande',
] as const;

/** Chemin accessible pendant que StaX construit le site. */
export function isAccountPath(pathname: string): boolean {
  if (pathname === '/app' || pathname === '/app/') return true;
  return ACCOUNT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Site courant, ou page introuvable si l organisation n en a aucun. */
export async function requireCurrentSite() {
  const context = await getWorkspace();
  const site = context.workspace.currentSite;
  if (!site) notFound();
  return { ...context, site };
}
