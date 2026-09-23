'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  endImpersonation,
  IMPERSONATION_COOKIE,
  IMPERSONATION_MAX_MINUTES,
  startImpersonation,
  verifyImpersonation,
} from '@stax/auth';
import { tryCreateServiceClient } from '@stax/database';
import { boundedText, uuidSchema } from '@stax/validation';
import { z } from 'zod';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getAdminContext, requireAdminRole } from '~/lib/admin';
import { requireSession } from '~/lib/session';
import { SITE_COOKIE } from '~/lib/workspace';

/**
 * Assistance client : ouvrir et fermer une session « voir comme ce client ».
 *
 * Point de conception essentiel : StaX n'emet JAMAIS de jeton de session au nom
 * du client. Le membre de l'equipe reste authentifie sous sa propre identite ;
 * l'interface lui presente les donnees du client, auxquelles son role
 * plateforme lui donne deja acces en lecture.
 *
 * Consequence directe : chaque action reste attribuee a son auteur reel dans le
 * journal d'audit, et fermer la session est immediat — il n'y a aucun jeton
 * client a revoquer, parce qu'il n'en a jamais ete fabrique.
 *
 * Le client concerne peut lire ces sessions dans son propre journal
 * d'activite : nous n'entrons pas chez lui sans qu'il puisse le voir.
 */

const startSchema = z.object({
  organizationId: uuidSchema,
  reason: boundedText(10, 500, 'Le motif'),
  durationMinutes: z.coerce.number().int().min(5).max(IMPERSONATION_MAX_MINUTES).default(30),
});

export async function startImpersonationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session } = await requireAdminRole('support');

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const parsed = startSchema.safeParse({
    organizationId: formData.get('organizationId'),
    reason: formData.get('reason'),
    durationMinutes: formData.get('durationMinutes') ?? 30,
  });
  // Intervention directe sur un site : on ouvre l'editeur de CE site.
  const rawSite = formData.get('siteId');
  const siteId =
    typeof rawSite === 'string' && uuidSchema.safeParse(rawSite).success ? rawSite : null;

  if (!parsed.success) {
    return {
      status: 'error',
      message:
        'Indiquez un motif d’au moins dix caractères. Il est conservé dans le journal et visible par le client.',
    };
  }

  // Cle de service : `impersonation_sessions` est en ecriture reservee a la
  // plateforme, et le role vient d'etre verifie ci-dessus.
  const service = tryCreateServiceClient();
  if (!service) {
    return {
      status: 'error',
      message:
        'L’assistance est indisponible : la clé de service Supabase n’est pas configurée sur ' +
        'ce déploiement (voir « État des services »).',
    };
  }
  const result = await startImpersonation(service, {
    staffId: session.user.id,
    organizationId: parsed.data.organizationId,
    reason: parsed.data.reason,
    durationMinutes: parsed.data.durationMinutes,
  });

  if (!result.ok) {
    return { status: 'error', message: result.error.message };
  }

  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, result.data.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(result.data.expiresAt),
  });

  if (siteId) {
    store.set(SITE_COOKIE, siteId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: new Date(result.data.expiresAt),
    });
    redirect('/app/editeur');
  }

  redirect('/app?assistance=ouverte');
}

export async function endImpersonationAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const store = await cookies();
  const token = store.get(IMPERSONATION_COOKIE)?.value ?? null;

  if (token) {
    const service = tryCreateServiceClient();
    const active = service ? await verifyImpersonation(service, token, session.user.id) : null;
    if (service && active) await endImpersonation(service, active.id, 'manual');
  }

  // Le cookie part dans tous les cas : une session close en base ne doit pas
  // laisser trainer un jeton, meme inutilisable.
  store.delete(IMPERSONATION_COOKIE);

  redirect('/admin/organisations');
}

/** Session d'assistance en cours, ou `null`. Lue a chaque rendu de `/app`. */
export async function activeSupportSession(): Promise<{
  organizationId: string;
  reason: string;
  expiresAt: string;
} | null> {
  const store = await cookies();
  const token = store.get(IMPERSONATION_COOKIE)?.value ?? null;
  if (!token) return null;

  const session = await requireSession();

  // Un compte sans role plateforme ne peut pas porter de session d'assistance,
  // meme avec un cookie valide : le controle ne tient pas au cookie.
  if (!session.profile.platform_role) return null;

  const service = tryCreateServiceClient();
  if (!service) return null;
  const active = await verifyImpersonation(service, token, session.user.id);
  if (!active) return null;

  return {
    organizationId: active.organizationId,
    reason: active.reason,
    expiresAt: active.expiresAt,
  };
}

/** Contexte admin, exporte pour que la page d'assistance reste asynchrone. */
export async function assistanceContext() {
  const { role } = await getAdminContext();
  return { role };
}
