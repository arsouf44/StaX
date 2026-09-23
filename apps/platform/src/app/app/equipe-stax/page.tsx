import type { Metadata } from 'next';
import { assignableRoles, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@stax/business';
import { unwrapList } from '@stax/database';
import type { OrgRole } from '@stax/types';
import { PermissionDenied } from '@stax/ui';
import { PageHeader } from '~/components/app/page-header';
import { getWorkspace } from '~/lib/workspace';
import { TeamManager, type InvitationRow, type MemberRow } from './team-manager';

export const metadata: Metadata = { title: 'Collaborateurs' };

const DATE = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

export default async function TeamPage() {
  const { workspace, db, userId } = await getWorkspace();

  if (!workspace.capabilities.includes('org.view')) {
    return <PermissionDenied message="Votre rôle ne donne pas accès à cette page." />;
  }

  const canManage = workspace.capabilities.includes('members.manage');

  const memberRows = unwrapList<{
    id: string;
    user_id: string;
    role: OrgRole;
    created_at: string;
    profiles: { first_name: string | null; last_name: string | null; email: string } | null;
  }>(
    (await db
      .from('organization_members')
      .select(
        'id, user_id, role, created_at, profiles!organization_members_user_id_fkey ( first_name, last_name, email )',
      )
      .eq('organization_id', workspace.organization.id)
      .order('created_at', { ascending: true })
      .limit(100)) as never,
  );

  const invitationRows = canManage
    ? unwrapList<{ id: string; email: string; role: OrgRole; expires_at: string }>(
        (await db
          .from('organization_invitations')
          .select('id, email, role, expires_at')
          .eq('organization_id', workspace.organization.id)
          .is('accepted_at', null)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
          .limit(50)) as never,
      )
    : [];

  const members: MemberRow[] = memberRows.map((row) => {
    const profile = row.profiles;
    const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();

    return {
      id: row.id,
      name: name || (profile?.email ?? 'Collaborateur'),
      email: profile?.email ?? '',
      role: row.role,
      roleLabel: ROLE_LABELS[row.role] ?? row.role,
      roleDescription: ROLE_DESCRIPTIONS[row.role] ?? '',
      isSelf: row.user_id === userId,
      joinedLabel: DATE.format(new Date(row.created_at)),
    };
  });

  const now = new Date();
  const invitations: InvitationRow[] = invitationRows.map((row) => ({
    id: row.id,
    email: row.email,
    roleLabel: ROLE_LABELS[row.role] ?? row.role,
    expiresLabel: DATE.format(new Date(row.expires_at)),
    expired: new Date(row.expires_at) < now,
  }));

  // Les roles proposables sont calcules a partir du role REEL de la personne :
  // le formulaire ne peut pas en proposer d'autres, et l'action les revalide.
  const assignable = (canManage ? assignableRoles(workspace.role) : []).map((role) => ({
    value: role,
    label: ROLE_LABELS[role],
    description: ROLE_DESCRIPTIONS[role],
  }));

  return (
    <>
      <PageHeader
        title="Collaborateurs"
        description="Qui a accès à votre espace, et jusqu’où. Chaque accès est limité à ce dont la personne a besoin."
      />
      <TeamManager
        members={members}
        invitations={invitations}
        assignable={assignable}
        canManage={canManage}
      />
    </>
  );
}
