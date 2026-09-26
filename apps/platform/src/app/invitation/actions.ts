'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createUserClient } from '@stax/database';
import { guardAction } from '~/lib/action-guard';
import { invitationTokenHash } from '~/lib/invitations';
import type { ActionState } from '~/lib/form-state';
import { requireSession } from '~/lib/session';
import { ORG_COOKIE, SITE_COOKIE } from '~/lib/workspace';

/**
 * Accepter une invitation de collaborateur.
 *
 * Le jeton est long et aléatoire ; la base n'en connaît que l'empreinte, et
 * n'accepte l'invitation que pour l'adresse invitée.
 */

const schema = z.object({ token: z.string().trim().min(16).max(200) });

const MESSAGES: Record<string, string> = {
  invalid:
    'Cette invitation n’est pas reconnue. Demandez à la personne qui vous a invité de la renvoyer.',
  revoked: 'Cette invitation a été annulée.',
  expired: 'Cette invitation a expiré. Demandez-en une nouvelle.',
  already_used: 'Cette invitation a déjà été utilisée par un autre compte.',
  email_mismatch:
    'Cette invitation a été envoyée à une autre adresse e-mail que celle de ce compte. ' +
    'Connectez-vous avec l’adresse invitée.',
};

export async function acceptInvitationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({ token: formData.get('token') ?? '' });
  if (!parsed.success) return { status: 'error', message: MESSAGES['invalid'] };

  const session = await requireSession();
  const guard = await guardAction({ limit: 'activation', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);
  const { data, error } = await db.rpc('accept_organization_invitation', {
    p_token_hash: await invitationTokenHash(parsed.data.token),
  });
  const result = (data ?? {}) as { ok?: boolean; code?: string; organizationId?: string };
  if (error || !result.ok || !result.organizationId) {
    return { status: 'error', message: MESSAGES[result.code ?? ''] ?? MESSAGES['invalid'] };
  }

  const store = await cookies();
  store.set(ORG_COOKIE, result.organizationId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  store.delete(SITE_COOKIE);
  redirect('/app');
}
