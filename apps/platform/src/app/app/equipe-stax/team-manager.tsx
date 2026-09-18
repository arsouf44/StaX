'use client';

import { useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  Field,
  Icon,
  Input,
  Panel,
  Select,
  StatusPill,
  Table,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
} from '@stax/ui';
import { IDLE_STATE, type ActionState } from '~/lib/form-state';
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  updateMemberRoleAction,
} from './actions';

export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  roleDescription: string;
  isSelf: boolean;
  joinedLabel: string;
}

export interface InvitationRow {
  id: string;
  email: string;
  roleLabel: string;
  expiresLabel: string;
  expired: boolean;
}

export interface RoleChoice {
  value: string;
  label: string;
  description: string;
}

function SubmitButton({
  label,
  pendingLabel,
  variant = 'primary',
  size,
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      loading={pending}
      loadingLabel={pendingLabel}
    >
      {label}
    </Button>
  );
}

export function TeamManager({
  members,
  invitations,
  assignable,
  canManage,
}: {
  members: MemberRow[];
  invitations: InvitationRow[];
  assignable: RoleChoice[];
  canManage: boolean;
}) {
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [pendingRemove, setPendingRemove] = useState<MemberRow | null>(null);
  const [inviteState, setInviteState] = useState<ActionState>(IDLE_STATE);
  const [rowState, setRowState] = useState<ActionState>(IDLE_STATE);
  const [, startTransition] = useTransition();

  const invite = (formData: FormData) =>
    inviteMemberAction(IDLE_STATE, formData).then((result) => {
      setInviteState(result);
      if (result.status === 'success') setInviting(false);
    });

  const changeRole = (formData: FormData) =>
    updateMemberRoleAction(IDLE_STATE, formData).then((result) => {
      setRowState(result);
      if (result.status === 'success') setEditing(null);
    });

  const revoke = (formData: FormData) =>
    revokeInvitationAction(IDLE_STATE, formData).then(setRowState);

  const remove = (formData: FormData) =>
    removeMemberAction(IDLE_STATE, formData).then((result) => {
      setRowState(result);
      if (result.status === 'success') setPendingRemove(null);
    });

  return (
    <div className="space-y-8">
      {rowState.status === 'error' && rowState.message ? (
        <Alert tone="danger" live="alert">
          {rowState.message}
        </Alert>
      ) : null}
      {rowState.status === 'success' && rowState.message ? (
        <Alert tone="success" live="status">
          {rowState.message}
        </Alert>
      ) : null}
      {inviteState.status === 'success' && inviteState.message ? (
        <Alert tone="success" live="status">
          {inviteState.message}
        </Alert>
      ) : null}

      <section aria-labelledby="membres" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="membres" className="text-base font-medium">
            Collaborateurs
          </h2>
          {canManage && assignable.length > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setInviting(true)}>
              <Icon name="user-plus" size={16} aria-hidden="true" />
              Inviter quelqu’un
            </Button>
          ) : null}
        </div>

        <TableWrapper label="Collaborateurs">
          <Table>
            <THead>
              <TR>
                <TH scope="col">Personne</TH>
                <TH scope="col">Accès</TH>
                <TH scope="col">Depuis</TH>
                <TH scope="col">
                  <span className="sr-only">Actions</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {members.map((member) => (
                <TR key={member.id}>
                  <TD>
                    {member.name}
                    {member.isSelf ? (
                      <span className="ml-2 text-xs text-[var(--muted)]">vous</span>
                    ) : null}
                    <span className="block text-xs text-[var(--muted)]">{member.email}</span>
                  </TD>
                  <TD>
                    <StatusPill tone={member.role === 'owner' ? 'accent' : 'neutral'}>
                      {member.roleLabel}
                    </StatusPill>
                  </TD>
                  <TD className="text-[var(--foreground-muted)]">{member.joinedLabel}</TD>
                  <TD>
                    {canManage && assignable.length > 0 ? (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(member)}>
                          Modifier l’accès
                        </Button>
                        {!member.isSelf ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingRemove(member)}
                          >
                            Retirer
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      </section>

      {invitations.length > 0 ? (
        <section aria-labelledby="invitations" className="space-y-4">
          <h2 id="invitations" className="text-base font-medium">
            Invitations en attente
          </h2>
          <ul className="space-y-2">
            {invitations.map((invitation) => (
              <li key={invitation.id}>
                <Panel level={1} padding="md">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{invitation.email}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {invitation.roleLabel} ·{' '}
                        {invitation.expired
                          ? 'invitation expirée'
                          : `valable jusqu’au ${invitation.expiresLabel}`}
                      </p>
                    </div>
                    {canManage ? (
                      <form action={revoke}>
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <SubmitButton
                          label="Annuler"
                          pendingLabel="Annulation"
                          variant="ghost"
                          size="sm"
                        />
                      </form>
                    ) : null}
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Panel level={1} padding="lg">
        <h2 className="text-sm font-medium">Ce que permet chaque accès</h2>
        <dl className="mt-3 space-y-3 text-sm">
          {assignable.length > 0
            ? assignable.map((role) => (
                <div key={role.value}>
                  <dt className="font-medium">{role.label}</dt>
                  <dd className="mt-0.5 leading-relaxed text-[var(--foreground-muted)]">
                    {role.description}
                  </dd>
                </div>
              ))
            : members.map((member) => (
                <div key={member.id}>
                  <dt className="font-medium">{member.roleLabel}</dt>
                  <dd className="mt-0.5 leading-relaxed text-[var(--foreground-muted)]">
                    {member.roleDescription}
                  </dd>
                </div>
              ))}
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
          Ces règles ne sont pas de simples masquages d’écran : elles sont appliquées par la base de
          données. Un accès en lecture seule ne peut rien modifier, même en contournant l’interface.
        </p>
      </Panel>

      <Dialog
        open={inviting}
        onClose={() => setInviting(false)}
        size="md"
        title="Inviter un collaborateur"
      >
        <form action={invite} className="space-y-5" noValidate>
          {inviteState.status === 'error' && inviteState.message ? (
            <Alert tone="danger" live="alert">
              {inviteState.message}
            </Alert>
          ) : null}

          <Field label="Adresse e-mail" required error={inviteState.errors?.email}>
            <Input name="email" type="email" required autoComplete="off" />
          </Field>

          <Field label="Accès accordé" required>
            <Select name="role" defaultValue={assignable[0]?.value ?? 'viewer'} required>
              {assignable.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Message d’accompagnement"
            hint="Facultatif. Ajouté à l’e-mail d’invitation."
          >
            <Textarea name="message" rows={3} maxLength={500} />
          </Field>

          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
            <SubmitButton label="Envoyer l’invitation" pendingLabel="Envoi" />
            <Button variant="ghost" onClick={() => setInviting(false)}>
              Annuler
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="sm"
        title={`Accès de ${editing?.name ?? ''}`}
      >
        <form action={changeRole} className="space-y-5" noValidate>
          <input type="hidden" name="memberId" value={editing?.id ?? ''} />

          <Field label="Accès accordé" required>
            <Select
              key={editing?.id ?? 'none'}
              name="role"
              defaultValue={editing?.role ?? 'viewer'}
              required
            >
              {assignable.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex flex-wrap gap-3 border-t border-[var(--border)] pt-5">
            <SubmitButton label="Enregistrer" pendingLabel="Enregistrement" />
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Annuler
            </Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={pendingRemove !== null}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => {
          if (!pendingRemove) return;
          const payload = new FormData();
          payload.set('memberId', pendingRemove.id);
          startTransition(() => {
            void remove(payload);
          });
        }}
        tone="danger"
        confirmLabel="Retirer l’accès"
        title="Retirer cet accès ?"
        description="Cette personne perdra immédiatement l’accès à votre espace. Son compte StaX n’est pas supprimé, et ce qu’elle a créé reste en place."
      />
    </div>
  );
}
