'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSessionClient } from '@nemasus/auth';
import { createUserClient, tryCreateServiceClient } from '@nemasus/database';
import { boundedText, passwordSchema } from '@nemasus/validation';
import { TERMS_OF_USE_VERSION } from '~/content/legal';
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

/* -------------------------------------------------------------------------- */
/*  Invitation d'une personne sans compte                                      */
/* -------------------------------------------------------------------------- */

const signupSchema = z
  .object({
    token: z.string().trim().min(16).max(200),
    firstName: boundedText(1, 60, 'Le prénom'),
    lastName: boundedText(1, 60, 'Le nom'),
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal('on', {
      message: 'Acceptez les conditions générales d’utilisation pour créer votre compte.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

/**
 * Le lien d'invitation a été envoyé à l'adresse invitée : il prouve qu'on la
 * lit. Le compte est donc créé, adresse confirmée, pour CETTE adresse — jamais
 * une autre — puis l'invitation est acceptée avec le jeton de la personne,
 * par la fonction habituelle (qui revérifie l'adresse).
 */
export async function acceptInvitationWithNewAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    token: formData.get('token') ?? '',
    firstName: formData.get('firstName') ?? '',
    lastName: formData.get('lastName') ?? '',
    password: formData.get('password') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
    acceptTerms: formData.get('acceptTerms') ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Certains champs doivent être corrigés.',
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const guard = await guardAction({ limit: 'signup' });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const service = tryCreateServiceClient();
  if (service === null) {
    return { status: 'error', message: 'La création de compte est momentanément indisponible.' };
  }

  const tokenHash = await invitationTokenHash(parsed.data.token);
  const { data: contextData } = await service.rpc('invitation_signup_context', {
    p_token_hash: tokenHash,
  });
  const context = (contextData ?? {}) as {
    ok?: boolean;
    code?: string;
    email?: string;
    hasAccount?: boolean;
  };
  if (!context.ok || !context.email) {
    return { status: 'error', message: MESSAGES[context.code ?? ''] ?? MESSAGES['invalid'] };
  }
  if (context.hasAccount) {
    return {
      status: 'error',
      message:
        'Un compte existe déjà pour cette adresse : connectez-vous pour accepter l’invitation.',
    };
  }

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: context.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      locale: 'fr',
      terms_of_use_version: TERMS_OF_USE_VERSION,
      terms_accepted_at: new Date().toISOString(),
    },
  });
  if (createError || !created.user) {
    return {
      status: 'error',
      message:
        createError?.code === 'weak_password'
          ? 'Ce mot de passe a été refusé : choisissez-en un plus robuste.'
          : 'Le compte n’a pas pu être créé. Réessayez dans un instant.',
    };
  }

  const store = await cookies();
  const session = createSessionClient({
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list) => {
      for (const cookie of list) store.set(cookie.name, cookie.value, cookie.options ?? {});
    },
  });
  const { data: signedIn, error: signInError } = await session.auth.signInWithPassword({
    email: context.email,
    password: parsed.data.password,
  });
  if (signInError || !signedIn.session) {
    redirect(`/connexion?suivant=${encodeURIComponent(`/invitation?jeton=${parsed.data.token}`)}`);
  }

  const db = createUserClient(signedIn.session.access_token);
  const { data, error } = await db.rpc('accept_organization_invitation', {
    p_token_hash: tokenHash,
  });
  const result = (data ?? {}) as { ok?: boolean; code?: string; organizationId?: string };
  if (error || !result.ok || !result.organizationId) {
    return { status: 'error', message: MESSAGES[result.code ?? ''] ?? MESSAGES['invalid'] };
  }

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
