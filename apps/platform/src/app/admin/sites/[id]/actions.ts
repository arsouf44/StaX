'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient, unwrapMaybe } from '@stax/database';
import { activationCodeHint, generateActivationCode, hashActivationCode } from '@stax/security';
import { emailSchema, optionalText, uuidSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';

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
