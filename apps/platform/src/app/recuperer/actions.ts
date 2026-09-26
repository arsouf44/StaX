'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createUserClient } from '@stax/database';
import { guardAction } from '~/lib/action-guard';
import type { ActionState } from '~/lib/form-state';
import { hashProposalCode, normalizeProposalCode } from '~/lib/proposals';
import { alertTeam } from '~/lib/team-alerts';
import { requireSession } from '~/lib/session';
import { ORG_COOKIE, SITE_COOKIE } from '~/lib/workspace';

/**
 * « Récupérer mon site » : le prospect, connecté, saisit son code.
 *
 * Le code seul ne suffit pas : la base exige que le compte porte l'adresse à
 * laquelle la proposition a été envoyée. Chaque saisie est comptée, et le
 * débit est limité comme pour un code d'activation.
 */

const schema = z.object({
  code: z
    .string()
    .trim()
    .transform((value) => normalizeProposalCode(value))
    .refine((value) => value.replace(/-/g, '').length === 12, 'Le code compte 12 caractères.'),
});

const MESSAGES: Record<string, string> = {
  invalid:
    'Ce code n’est pas reconnu. Vérifiez-le dans l’e-mail reçu (12 caractères, par exemple 7K2M-9QXP-4HTA).',
  expired:
    'Cette proposition a expiré. Écrivez-nous ou rappelez-nous : nous la prolongeons volontiers.',
  withdrawn: 'Cette proposition n’est plus disponible. Contactez-nous si vous pensez à une erreur.',
  email_mismatch:
    'Ce code a été envoyé à une autre adresse e-mail que celle de ce compte. Déconnectez-vous, ' +
    'puis créez votre compte (ou connectez-vous) avec l’adresse qui a reçu le message.',
  already_claimed: 'Ce site a déjà été récupéré avec un autre compte. Contactez-nous.',
};

export async function claimProposalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({ code: formData.get('code') ?? '' });
  if (!parsed.success) {
    return { status: 'error', message: 'Saisissez le code à 12 caractères reçu par e-mail.' };
  }

  const session = await requireSession();
  const guard = await guardAction({ limit: 'activation', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const db = createUserClient(session.user.accessToken);
  const { data, error } = await db.rpc('claim_site_proposal', {
    p_code_hash: await hashProposalCode(parsed.data.code),
  });
  if (error) {
    console.error('[stax:proposal] recuperation', error.code, error.message);
    return {
      status: 'error',
      message: 'La vérification n’a pas pu aboutir. Réessayez dans un instant.',
    };
  }

  const result = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    organizationId?: string;
    siteId?: string;
  };
  if (!result.ok || !result.organizationId || !result.siteId) {
    return { status: 'error', message: MESSAGES[result.code ?? ''] ?? MESSAGES['invalid'] };
  }

  const store = await cookies();
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  };
  store.set(ORG_COOKIE, result.organizationId, options);
  store.set(SITE_COOKIE, result.siteId, options);

  if (result.code === 'claimed') {
    await alertTeam({
      subject: `Un prospect a récupéré son site — ${session.profile.email}`,
      heading: 'Compte créé : le prospect voit son site',
      lines: [
        ['Client', session.profile.email],
        ['Étape suivante', 'paiement en ligne (ou question via la messagerie)'],
      ],
      path: '/admin/propositions',
    });
  }

  redirect('/app?bienvenue=1');
}
