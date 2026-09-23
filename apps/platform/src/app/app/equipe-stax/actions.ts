'use server';

import { revalidatePath } from 'next/cache';
import { assignableRoles, ROLE_LABELS } from '@stax/business';
import { tryCreateServiceClient, unwrapList, unwrapMaybe } from '@stax/database';
import { sendEmail, teamInvitationEmail } from '@stax/emails';
import { hmacHex, randomToken } from '@stax/security';
import { inviteMemberSchema, updateMemberRoleSchema, uuidSchema } from '@stax/validation';
import type { OrgRole } from '@stax/types';
import { absolutePlatformUrl, guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { getWorkspace } from '~/lib/workspace';

/**
 * Collaborateurs d'une organisation.
 *
 * Deux regles structurent cet ecran :
 *
 *  1. personne ne peut attribuer un role plus puissant que le sien. Un
 *     administrateur invite des editeurs, jamais un proprietaire. La liste des
 *     roles attribuables est calculee cote serveur : le formulaire ne la
 *     choisit pas ;
 *  2. le JETON d'invitation n'est jamais stocke en clair. Seul son HMAC vit en
 *     base. Une fuite de la base ne permet donc pas de rejouer une invitation.
 *
 * Une organisation garde toujours au moins un proprietaire : le dernier ne peut
 * ni etre retrograde ni etre retire.
 */

const INVITATION_DAYS = 7;

export async function inviteMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db, userId } = await getWorkspace();

  if (!workspace.capabilities.includes('members.manage')) {
    return { status: 'error', message: 'Votre rôle ne permet pas d’inviter des collaborateurs.' };
  }

  const guard = await guardAction({ limit: 'apiWrite', userId });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const parsed = inviteMemberSchema.safeParse({
    email: formData.get('email'),
    role: formData.get('role'),
    message: formData.get('message') || undefined,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Vérifiez l’adresse e-mail et le rôle choisi.',
      errors: { email: ['Adresse e-mail invalide.'] },
    };
  }

  // Le role demande est confronte a ce que l'INVITANT peut reellement donner.
  const allowed = assignableRoles(workspace.role);
  if (!allowed.includes(parsed.data.role as OrgRole)) {
    return {
      status: 'error',
      message: `Votre rôle ne permet pas d’attribuer le rôle « ${ROLE_LABELS[parsed.data.role as OrgRole]} ».`,
    };
  }

  const email = parsed.data.email.trim().toLowerCase();

  const existing = unwrapList<{
    id: string;
    accepted_at: string | null;
    revoked_at: string | null;
  }>(
    (await db
      .from('organization_invitations')
      .select('id, accepted_at, revoked_at')
      .eq('organization_id', workspace.organization.id)
      .eq('email', email)
      .is('accepted_at', null)
      .is('revoked_at', null)) as never,
  );

  if (existing.length > 0) {
    return {
      status: 'error',
      message: 'Une invitation est déjà en attente pour cette adresse.',
    };
  }

  // Le jeton clair ne vit que le temps de l'e-mail. La base n'en garde que le
  // HMAC : on ne peut pas remonter du hache au lien.
  const token = randomToken(32);
  const tokenHash = await hmacHex(token, 'organization-invitation');
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000).toISOString();

  const { error } = await db.from('organization_invitations').insert({
    organization_id: workspace.organization.id,
    email,
    role: parsed.data.role,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by: userId,
  });

  if (error) {
    return { status: 'error', message: 'Cette invitation n’a pas pu être créée.' };
  }

  const link = absolutePlatformUrl(`/invitation?jeton=${token}`);

  try {
    await sendEmail(
      teamInvitationEmail({
        to: email,
        inviteUrl: link,
        organizationName: workspace.organization.name,
        roleLabel: ROLE_LABELS[parsed.data.role as OrgRole],
      }),
      { db, organizationId: workspace.organization.id },
    );
  } catch (mailError) {
    // L'invitation existe : on le dit plutot que de laisser croire a un echec.
    console.error('[stax:invitations] e-mail non envoye', mailError);
    return {
      status: 'success',
      message:
        'Invitation créée, mais l’e-mail n’a pas pu partir. Transmettez le lien vous-même depuis la liste ci-dessous, ou réessayez.',
    };
  }

  revalidatePath('/app/equipe-stax');
  return { status: 'success', message: `Invitation envoyée à ${email}.` };
}

export async function revokeInvitationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db } = await getWorkspace();

  if (!workspace.capabilities.includes('members.manage')) {
    return { status: 'error', message: 'Votre rôle ne permet pas de gérer les invitations.' };
  }

  const invitationId = formData.get('invitationId');
  if (typeof invitationId !== 'string' || !uuidSchema.safeParse(invitationId).success) {
    return { status: 'error', message: 'Cette invitation est introuvable.' };
  }

  const { error } = await db
    .from('organization_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('organization_id', workspace.organization.id)
    .is('accepted_at', null);

  if (error) return { status: 'error', message: 'Cette invitation n’a pas pu être annulée.' };

  revalidatePath('/app/equipe-stax');
  return { status: 'success', message: 'Invitation annulée. Le lien ne fonctionne plus.' };
}

export async function updateMemberRoleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db, userId } = await getWorkspace();

  if (!workspace.capabilities.includes('members.manage')) {
    return { status: 'error', message: 'Votre rôle ne permet pas de modifier les accès.' };
  }

  const parsed = updateMemberRoleSchema.safeParse({
    memberId: formData.get('memberId'),
    role: formData.get('role'),
  });

  if (!parsed.success) return { status: 'error', message: 'Ce changement est impossible.' };

  const allowed = assignableRoles(workspace.role);
  if (!allowed.includes(parsed.data.role)) {
    return {
      status: 'error',
      message: `Votre rôle ne permet pas d’attribuer le rôle « ${ROLE_LABELS[parsed.data.role]} ».`,
    };
  }

  const member = unwrapMaybe<{ id: string; user_id: string; role: string }>(
    (await db
      .from('organization_members')
      .select('id, user_id, role')
      .eq('id', parsed.data.memberId)
      .eq('organization_id', workspace.organization.id)
      .maybeSingle()) as never,
  );

  if (!member) return { status: 'error', message: 'Ce collaborateur est introuvable.' };

  // Une organisation sans proprietaire serait ingerable : plus personne ne
  // pourrait ni facturer, ni inviter, ni resilier.
  if (member.role === 'owner' && parsed.data.role !== 'owner') {
    const owners = unwrapList<{ id: string }>(
      (await db
        .from('organization_members')
        .select('id')
        .eq('organization_id', workspace.organization.id)
        .eq('role', 'owner')) as never,
    );

    if (owners.length <= 1) {
      return {
        status: 'error',
        message:
          'Votre organisation doit garder au moins un propriétaire. Nommez d’abord quelqu’un d’autre.',
      };
    }
  }

  const { error } = await db
    .from('organization_members')
    .update({ role: parsed.data.role })
    .eq('id', member.id)
    .eq('organization_id', workspace.organization.id);

  if (error) return { status: 'error', message: 'Ce changement n’a pas pu être enregistré.' };

  // Sans cle de service, l'action reste faite ; seule la trace manque, et
  // `tryCreateServiceClient` l'a journalise.
  await tryCreateServiceClient()
    ?.from('audit_logs')
    .insert({
      actor_id: userId,
      actor_email: workspace.profile.email,
      actor_type: 'user',
      organization_id: workspace.organization.id,
      action: 'member.role_changed',
      target_type: 'organization_member',
      target_id: member.id,
      metadata_safe: { from: member.role, to: parsed.data.role },
    });

  revalidatePath('/app/equipe-stax');
  return { status: 'success', message: 'Accès mis à jour.' };
}

export async function removeMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace, db, userId } = await getWorkspace();

  if (!workspace.capabilities.includes('members.manage')) {
    return { status: 'error', message: 'Votre rôle ne permet pas de retirer un collaborateur.' };
  }

  const memberId = formData.get('memberId');
  if (typeof memberId !== 'string' || !uuidSchema.safeParse(memberId).success) {
    return { status: 'error', message: 'Ce collaborateur est introuvable.' };
  }

  const member = unwrapMaybe<{ id: string; user_id: string; role: string }>(
    (await db
      .from('organization_members')
      .select('id, user_id, role')
      .eq('id', memberId)
      .eq('organization_id', workspace.organization.id)
      .maybeSingle()) as never,
  );

  if (!member) return { status: 'error', message: 'Ce collaborateur est introuvable.' };

  if (member.user_id === userId) {
    return {
      status: 'error',
      message: 'Vous ne pouvez pas retirer votre propre accès depuis cet écran.',
    };
  }

  if (member.role === 'owner') {
    const owners = unwrapList<{ id: string }>(
      (await db
        .from('organization_members')
        .select('id')
        .eq('organization_id', workspace.organization.id)
        .eq('role', 'owner')) as never,
    );

    if (owners.length <= 1) {
      return {
        status: 'error',
        message: 'Votre organisation doit garder au moins un propriétaire.',
      };
    }
  }

  const { error } = await db
    .from('organization_members')
    .delete()
    .eq('id', member.id)
    .eq('organization_id', workspace.organization.id);

  if (error) return { status: 'error', message: 'Cet accès n’a pas pu être retiré.' };

  // Sans cle de service, l'action reste faite ; seule la trace manque, et
  // `tryCreateServiceClient` l'a journalise.
  await tryCreateServiceClient()
    ?.from('audit_logs')
    .insert({
      actor_id: userId,
      actor_email: workspace.profile.email,
      actor_type: 'user',
      organization_id: workspace.organization.id,
      action: 'member.removed',
      target_type: 'organization_member',
      target_id: member.id,
      metadata_safe: { role: member.role },
    });

  revalidatePath('/app/equipe-stax');
  return { status: 'success', message: 'Accès retiré.' };
}
