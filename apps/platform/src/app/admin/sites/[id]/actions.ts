'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  CONSTRUCTION_SESSION_MAX_MINUTES,
  IMPERSONATION_COOKIE,
  startImpersonation,
} from '@stax/auth';
import { createUserClient, tryCreateServiceClient, unwrapMaybe } from '@stax/database';
import { activationCodeHint, generateActivationCode, hashActivationCode } from '@stax/security';
import { emailSchema, optionalText, uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import { startMaintenanceAtDelivery } from '~/lib/maintenance';
import { sendDeliveryEmails } from '~/lib/delivery-email';
import type { ActionState } from '~/lib/form-state';
import { ORG_COOKIE, SITE_COOKIE } from '~/lib/workspace';

/**
 * Operations du back-office sur un site client.
 *
 * Toutes passent par le JETON de la personne, jamais par la cle de service :
 * la RLS et les declencheurs decident, et une erreur de code ne peut pas
 * contourner la frontiere entre clients. Le role est verifie en plus, pour
 * refuser tot plutot que d'echouer tard.
 *
 * Chaque operation laisse une trace nominative. Agir sur le site de quelqu'un
 * d'autre n'est jamais anodin : il faut pouvoir dire qui, quand et pourquoi.
 */

const statusSchema = z
  .object({
    siteId: uuidSchema,
    // Les transitions permises sont decidees par le declencheur SQL
    // `app.guard_site_status`. Cette liste n'est qu'un premier filtre.
    status: z.enum(['draft', 'building', 'review', 'ready', 'live', 'suspended', 'archived']),
    reason: optionalText(500),
  })
  .strict();

/** Raisons lisibles d'un refus venu de la base, pour ne pas afficher du SQL. */
function explain(code: string | undefined, message: string): string {
  if (code === '23514' && message.includes('sans version publiee')) {
    return 'Ce site n’a aucune version publiée : il ne peut pas passer en ligne. Publiez-le d’abord depuis l’éditeur.';
  }
  if (code === '23514' && message.includes('Transition de statut')) {
    return 'Cette transition n’est pas permise depuis l’état actuel.';
  }
  if (code === '42501') {
    return 'Votre rôle ne permet pas cette opération.';
  }
  return 'L’opération a été refusée. Rien n’a été modifié.';
}

export async function changeSiteStatusAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = statusSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);

  const site = unwrapMaybe<{ id: string; status: string; organization_id: string; name: string }>(
    (await db
      .from('sites')
      .select('id, status, organization_id, name')
      .eq('id', parsed.data.siteId)
      .maybeSingle()) as never,
  );

  if (!site) return { status: 'error', message: 'Ce site est introuvable.' };
  if (site.status === parsed.data.status) {
    return { status: 'error', message: 'Le site est déjà dans cet état.' };
  }

  const patch: Record<string, unknown> = { status: parsed.data.status };
  // Suspendre et reactiver ne sont pas symetriques : la date de suspension
  // sert au calcul des delais commerciaux, elle doit donc etre exacte.
  if (parsed.data.status === 'suspended') patch['suspended_at'] = new Date().toISOString();
  if (site.status === 'suspended') patch['suspended_at'] = null;
  if (parsed.data.status === 'archived') patch['archived_at'] = new Date().toISOString();

  const { error } = await db.from('sites').update(patch).eq('id', site.id);
  if (error) {
    return { status: 'error', message: explain(error.code, error.message) };
  }

  await db.rpc('write_audit', {
    p_action: 'site.status_changed',
    p_org: site.organization_id,
    p_site: site.id,
    p_target_type: 'site',
    p_target_id: site.id,
    p_metadata: {
      from: site.status,
      to: parsed.data.status,
      reason: parsed.data.reason ?? null,
    },
  });

  revalidatePath(`/admin/sites/${site.id}`);
  revalidatePath('/admin/sites');
  return {
    status: 'success',
    message: `« ${site.name} » est désormais en état « ${parsed.data.status} ».`,
  };
}

const rollbackSchema = z.object({ siteId: uuidSchema, versionId: uuidSchema }).strict();

export async function restoreSiteVersionAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = rollbackSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);
  const { error } = await db.rpc('rollback_site', {
    p_site: parsed.data.siteId,
    p_version_id: parsed.data.versionId,
  });

  if (error) return { status: 'error', message: explain(error.code, error.message) };

  revalidatePath(`/admin/sites/${parsed.data.siteId}`);
  return {
    status: 'success',
    message: 'Cette version est de nouveau en ligne. Le brouillon du client n’a pas changé.',
  };
}

const activationSchema = z
  .object({
    siteId: uuidSchema,
    email: emailSchema,
    role: z.enum(['owner', 'admin', 'editor']).default('owner'),
    validForDays: z.coerce.number().int().min(1).max(60).default(14),
  })
  .strict();

/**
 * Emission d'un code d'activation.
 *
 * Le code en clair n'existe QUE dans la reponse de cette action : seule son
 * empreinte est enregistree. Il n'est donc pas relisible ensuite, pas meme par
 * nous — ce qui est le but. Un code perdu se remplace, il ne se retrouve pas.
 *
 * Le code est de plus lie a une adresse : meme intercepte, il ne sert a
 * personne d'autre.
 */
export async function issueActivationCodeAction(
  payload: unknown,
): Promise<ActionState & { code?: string }> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = activationSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'error', message: 'Vérifiez l’adresse e-mail et la durée de validité.' };
  }

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);

  const site = unwrapMaybe<{ id: string; organization_id: string }>(
    (await db
      .from('sites')
      .select('id, organization_id')
      .eq('id', parsed.data.siteId)
      .maybeSingle()) as never,
  );
  if (!site) return { status: 'error', message: 'Ce site est introuvable.' };

  const code = generateActivationCode();
  const expiresAt = new Date(Date.now() + parsed.data.validForDays * 86_400_000).toISOString();

  const { error } = await db.from('activation_codes').insert({
    site_id: site.id,
    organization_id: site.organization_id,
    code_hash: await hashActivationCode(code),
    code_hint: activationCodeHint(code),
    granted_role: parsed.data.role,
    email_constraint: parsed.data.email.trim().toLowerCase(),
    expires_at: expiresAt,
    created_by: session.user.id,
  });

  if (error) {
    console.error('[stax:activation] emission refusee', error.code, error.message);
    return { status: 'error', message: explain(error.code, error.message) };
  }

  // Le code en clair n'entre JAMAIS dans le journal.
  await db.rpc('write_audit', {
    p_action: 'activation_code.issued',
    p_org: site.organization_id,
    p_site: site.id,
    p_target_type: 'activation_code',
    p_target_id: activationCodeHint(code),
    p_metadata: { email: parsed.data.email.trim().toLowerCase(), role: parsed.data.role },
  });

  revalidatePath(`/admin/sites/${site.id}`);
  return {
    status: 'success',
    message: 'Code créé. Il ne sera plus affiché après fermeture de cette fenêtre.',
    code,
  };
}

const revokeSchema = z.object({ codeId: uuidSchema, siteId: uuidSchema }).strict();

export async function revokeActivationCodeAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');

  const parsed = revokeSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };

  const db = createUserClient(session.user.accessToken);

  const { error } = await db
    .from('activation_codes')
    .update({ revoked_at: new Date().toISOString(), revoked_by: session.user.id })
    .eq('id', parsed.data.codeId)
    .is('used_at', null);

  if (error) return { status: 'error', message: explain(error.code, error.message) };

  revalidatePath(`/admin/sites/${parsed.data.siteId}`);
  return { status: 'success', message: 'Code révoqué. Il ne peut plus être utilisé.' };
}

/* -------------------------------------------------------------------------- */
/*  Construction, puis attribution au client                                   */
/* -------------------------------------------------------------------------- */

const openEditorSchema = z.object({ siteId: uuidSchema }).strict();

/**
 * Ouvre l'editeur de ce site pour la personne de l'equipe.
 *
 * Deux cas :
 *  - elle est membre de l'organisation du site (elle l'a cree depuis
 *    l'administration) : son propre espace s'ouvre sur ce site ;
 *  - sinon, une session d'assistance est ouverte. Pour un site encore en
 *    construction (non confie), c'est une session de construction : motif
 *    pre-rempli, duree d'une journee de travail. Un site deja confie passe par
 *    le formulaire « Intervenir », motif saisi et duree courte.
 */
export async function openSiteEditorAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('designer');
  const parsed = openEditorSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };

  const db = createUserClient(session.user.accessToken);
  const site = unwrapMaybe<{
    id: string;
    name: string;
    organization_id: string;
    delivered_at: string | null;
  }>(
    (await db
      .from('sites')
      .select('id, name, organization_id, delivered_at')
      .eq('id', parsed.data.siteId)
      .maybeSingle()) as never,
  );
  if (!site) return { status: 'error', message: 'Ce site est introuvable.' };

  const membership = unwrapMaybe<{ role: string }>(
    (await db
      .from('organization_members')
      .select('role')
      .eq('organization_id', site.organization_id)
      .eq('user_id', session.user.id)
      .maybeSingle()) as never,
  );

  const store = await cookies();
  const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };

  if (membership) {
    store.delete(IMPERSONATION_COOKIE);
    store.set(ORG_COOKIE, site.organization_id, { ...cookieOptions, maxAge: 60 * 60 * 24 * 180 });
    store.set(SITE_COOKIE, site.id, { ...cookieOptions, maxAge: 60 * 60 * 24 * 180 });
    redirect('/app/editeur');
  }

  if (site.delivered_at) {
    return {
      status: 'error',
      message:
        'Ce site est déjà confié à son client : ouvrez l’éditeur avec « Intervenir sur ce site », motif à l’appui.',
    };
  }

  const service = tryCreateServiceClient();
  if (!service) {
    return {
      status: 'error',
      message:
        'L’éditeur ne peut pas être ouvert : la clé de service Supabase n’est pas configurée sur ce déploiement (voir « État des services »).',
    };
  }

  const result = await startImpersonation(service, {
    staffId: session.user.id,
    organizationId: site.organization_id,
    reason: `Construction du site « ${site.name} »`,
    durationMinutes: CONSTRUCTION_SESSION_MAX_MINUTES,
    construction: true,
  });
  if (!result.ok) return { status: 'error', message: result.error.message };

  const expires = new Date(result.data.expiresAt);
  store.set(IMPERSONATION_COOKIE, result.data.token, { ...cookieOptions, expires });
  store.set(SITE_COOKIE, site.id, { ...cookieOptions, expires });
  redirect('/app/editeur');
}

const deliverSchema = z
  .object({
    siteId: uuidSchema,
    email: z.union([emailSchema, z.literal('')]).optional(),
    role: z.enum(['owner', 'admin', 'editor']).default('owner'),
  })
  .strict();

const DELIVERY_ERRORS: Record<string, string> = {
  no_account:
    'Aucun compte StaX n’utilise cette adresse. Demandez au client de créer son compte, ou créez-lui un code d’activation ci-dessous : il en deviendra membre en l’utilisant.',
  no_client:
    'Ce site n’a encore aucun client rattaché. Indiquez l’adresse e-mail du compte client à qui le confier.',
  not_found: 'Ce site est introuvable.',
};

/** Confie le site a son client : c'est a ce moment qu'il y a acces. */
export async function deliverSiteAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');
  const parsed = deliverSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: 'error', message: 'Vérifiez l’adresse e-mail du client.' };
  }

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);
  const { data, error } = await db.rpc('deliver_site', {
    p_site: parsed.data.siteId,
    p_email: parsed.data.email ? parsed.data.email.trim().toLowerCase() : null,
    p_role: parsed.data.role,
  });
  if (error) {
    console.error('[stax:delivery] refus', error.code, error.message);
    return { status: 'error', message: explain(error.code, error.message) };
  }

  const result = (data ?? {}) as { ok?: boolean; code?: string };
  if (!result.ok) {
    return {
      status: 'error',
      message: DELIVERY_ERRORS[result.code ?? ''] ?? 'Le site n’a pas pu être confié.',
    };
  }

  // La maintenance mensuelle commence a la livraison, jamais avant.
  const service = tryCreateServiceClient();
  const maintenance = service
    ? await startMaintenanceAtDelivery(service, parsed.data.siteId)
    : ({ status: 'failed', message: 'clé de service absente' } as const);
  if (service) {
    await sendDeliveryEmails(service, parsed.data.siteId).catch((mailError: unknown) => {
      console.error('[stax:delivery] e-mail de livraison', mailError);
    });
  }

  revalidatePath(`/admin/sites/${parsed.data.siteId}`);
  revalidatePath('/admin/sites');
  return {
    status: maintenance.status === 'failed' ? 'error' : 'success',
    message:
      'Site confié. Le client y a désormais accès depuis son espace, et il a été prévenu.' +
      (maintenance.status === 'started'
        ? ' La maintenance mensuelle démarre aujourd’hui.'
        : maintenance.status === 'failed'
          ? ` Attention : la maintenance n’a pas pu démarrer (${maintenance.message}).`
          : ''),
  };
}

const withdrawSchema = z.object({ siteId: uuidSchema }).strict();

/** Reprend un site confie : le client n'y a plus acces en modification. */
export async function withdrawSiteAction(payload: unknown): Promise<ActionState> {
  const { session } = await requireAdminRole('platform_admin');
  const parsed = withdrawSchema.safeParse(payload);
  if (!parsed.success) return { status: 'error', message: 'Demande refusée.' };

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);
  const { error } = await db.rpc('withdraw_site', { p_site: parsed.data.siteId });
  if (error) return { status: 'error', message: explain(error.code, error.message) };

  revalidatePath(`/admin/sites/${parsed.data.siteId}`);
  revalidatePath('/admin/sites');
  return {
    status: 'success',
    message:
      'Site repris : il est de nouveau en construction, le client ne peut plus le modifier. Rien n’a été effacé.',
  };
}
