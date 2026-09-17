'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { signOut } from '@stax/auth';
import { createUserClient, listMemberships, listSites } from '@stax/database';
import { requireSession } from '~/lib/session';
import { ORG_COOKIE, SITE_COOKIE } from '~/lib/workspace';

/**
 * Actions transverses de l espace client.
 *
 * Le choix de l organisation et du site courants est un CONFORT d interface :
 * il est stocke dans un cookie. Il n accorde aucun droit. A chaque requete, la
 * liste des organisations est relue avec le jeton de la personne, donc filtree
 * par la RLS : poser un identifiant arbitraire dans le cookie ne donne acces a
 * rien.
 */

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: true,
  path: '/',
  maxAge: 60 * 60 * 24 * 180,
};

export async function switchOrganizationAction(organizationId: string): Promise<void> {
  const session = await requireSession();
  const db = createUserClient(session.user.accessToken);

  // Verification explicite : le cookie ne doit designer qu une organisation
  // dont la personne est reellement membre.
  const memberships = await listMemberships(db, session.user.id);
  if (!memberships.some((membership) => membership.organizationId === organizationId)) {
    redirect('/app');
  }

  const store = await cookies();
  store.set(ORG_COOKIE, organizationId, COOKIE_OPTIONS);
  // Le site courant appartenait a l organisation precedente : on le remet a zero.
  store.delete(SITE_COOKIE);

  revalidatePath('/app', 'layout');
  redirect('/app');
}

export async function switchSiteAction(siteId: string): Promise<void> {
  const session = await requireSession();
  const store = await cookies();
  const db = createUserClient(session.user.accessToken);

  const organizationId = store.get(ORG_COOKIE)?.value;
  const memberships = await listMemberships(db, session.user.id);
  const selected =
    memberships.find((membership) => membership.organizationId === organizationId) ??
    memberships[0];
  if (!selected) redirect('/app');

  const sites = await listSites(db, selected.organizationId);
  if (!sites.some((site) => site.id === siteId)) {
    redirect('/app');
  }

  store.set(SITE_COOKIE, siteId, COOKIE_OPTIONS);
  revalidatePath('/app', 'layout');
  redirect('/app');
}

export async function signOutAction(): Promise<void> {
  const store = await cookies();
  await signOut(
    {
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (list) => {
        for (const cookie of list) store.set(cookie.name, cookie.value, cookie.options ?? {});
      },
    },
    'local',
  );
  store.delete(ORG_COOKIE);
  store.delete(SITE_COOKIE);
  redirect('/connexion?deconnecte=1');
}
