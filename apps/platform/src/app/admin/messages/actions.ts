'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { unwrapList, unwrapMaybe } from '@stax/database';
import { sendEmail, teamReplyEmail } from '@stax/emails';
import { uuidSchema } from '@stax/validation';
import { absolutePlatformUrl, guardAction } from '~/lib/action-guard';
import { requireAdminRole } from '~/lib/admin';
import type { ActionState } from '~/lib/form-state';

/**
 * Réponse de l'équipe à un client.
 *
 * Le message est écrit avec le JETON de la personne de l'équipe : la base
 * impose le côté « StaX » (0055) — il ne peut pas être choisi. Les
 * responsables de l'entreprise cliente reçoivent la réponse par e-mail.
 */

const schema = z
  .object({
    projectId: uuidSchema,
    body: z.string().trim().min(2, 'Votre réponse est vide.').max(5000),
  })
  .strict();

export async function replyAsTeamAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { session, db } = await requireAdminRole('support');
  const parsed = schema.safeParse({
    projectId: formData.get('projectId'),
    body: formData.get('body'),
  });
  if (!parsed.success) return { status: 'error', message: 'Écrivez votre réponse.' };

  const guard = await guardAction({ limit: 'apiWrite', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const project = unwrapMaybe<{ id: string; organization_id: string; site_id: string | null }>(
    (await db
      .from('projects')
      .select('id, organization_id, site_id')
      .eq('id', parsed.data.projectId)
      .maybeSingle()) as never,
  );
  if (!project) return { status: 'error', message: 'Cette discussion est introuvable.' };

  const { error } = await db.from('project_messages').insert({
    project_id: project.id,
    author_id: session.user.id,
    author_side: 'stax',
    body: parsed.data.body,
  });
  if (error) {
    console.error('[stax:admin-messages] reponse refusee', error.code, error.message);
    return { status: 'error', message: 'La réponse n’a pas pu être envoyée.' };
  }
  await db.rpc('mark_conversation_read', { p_project: project.id });

  // Prévenir les responsables du compte client (pas l'équipe StaX elle-même).
  const members = unwrapList<{
    role: string;
    profiles: { email: string; first_name: string | null; platform_role: string | null } | null;
  }>(
    (await db
      .from('organization_members')
      .select(
        'role, profiles!organization_members_user_id_fkey ( email, first_name, platform_role )',
      )
      .eq('organization_id', project.organization_id)
      .in('role', ['owner', 'admin'])) as never,
  );
  let notified = 0;
  for (const member of members) {
    if (!member.profiles || member.profiles.platform_role) continue;
    const sent = await sendEmail(
      teamReplyEmail({
        to: member.profiles.email,
        firstName: member.profiles.first_name,
        excerpt: parsed.data.body,
        conversationUrl: absolutePlatformUrl('/app/discussion'),
      }),
      { db, organizationId: project.organization_id, siteId: project.site_id ?? undefined },
    ).catch(() => ({ ok: false, skipped: false }));
    if (sent.ok && !sent.skipped) notified += 1;
  }

  revalidatePath(`/admin/messages/${project.id}`);
  revalidatePath('/admin/messages');
  return {
    status: 'success',
    message:
      notified > 0
        ? 'Réponse envoyée. Le client a été prévenu par e-mail.'
        : 'Réponse envoyée. Elle apparaît dans l’espace du client (e-mail non envoyé : fournisseur non configuré ou aucun responsable).',
  };
}
