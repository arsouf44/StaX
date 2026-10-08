'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSessionClient } from '@nemasus/auth';
import { passwordSchema } from '@nemasus/validation';
import { guardAction } from '~/lib/action-guard';
import { ACCESS_MESSAGES, signInWithAccessCode } from '~/lib/access-code';
import type { ActionState } from '~/lib/form-state';
import { normalizeAccessCode } from '~/lib/site-orders';
import { ORG_COOKIE, SITE_COOKIE } from '~/lib/workspace';

/**
 * « Accéder à mon site » : le client saisit le code reçu par e-mail.
 *
 * La garde commune limite le débit par adresse IP (et Turnstile s'il est
 * configuré) ; la base compte en plus les tentatives faites sur chaque code.
 * Avec ~60 bits d'entropie par code, deviner un code est hors de portée.
 */

const codeSchema = z
  .string()
  .trim()
  .max(40)
  .transform((value) => normalizeAccessCode(value))
  .refine((value) => value.replace(/-/g, '').length === 12);

function cookieAdapter(store: Awaited<ReturnType<typeof cookies>>) {
  return {
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
      for (const cookie of list) store.set(cookie.name, cookie.value, cookie.options ?? {});
    },
  };
}

export interface AccessState extends ActionState {
  code?: string;
}

export async function accessWithCodeAction(
  _previous: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const raw = String(formData.get('code') ?? '');
  const parsed = codeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'error',
      code: raw.slice(0, 40),
      message: 'Le code compte 12 lettres et chiffres, par exemple 7K2M-9QXP-4HTA.',
    };
  }

  const guard = await guardAction({
    limit: 'accessCode',
    honeypot: formData.get('website'),
    turnstileToken: formData.get('turnstileToken'),
  });
  if (!guard.ok) return { status: 'error', code: parsed.data, message: guard.message };

  const store = await cookies();
  const result = await signInWithAccessCode(parsed.data, cookieAdapter(store));
  if (!result.ok) {
    return { status: 'error', code: parsed.data, message: ACCESS_MESSAGES[result.reason] };
  }

  const options = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  };
  store.set(ORG_COOKIE, result.organizationId, options);
  if (result.siteId) store.set(SITE_COOKIE, result.siteId, options);
  else store.delete(SITE_COOKIE);

  const next = result.needsPassword ? '/acces/mot-de-passe' : '/app?bienvenue=1';
  if (result.needsMfa) redirect(`/mfa?suivant=${encodeURIComponent(next)}`);
  redirect(next);
}

/* -------------------------------------------------------------------------- */
/*  Premier mot de passe, juste après l'accès par code                         */
/* -------------------------------------------------------------------------- */

const firstPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

export async function setFirstPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = firstPasswordSchema.safeParse({
    password: formData.get('password') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors as Record<string, string[]>;
    return {
      status: 'error',
      message: 'Le mot de passe ne respecte pas les règles indiquées.',
      errors,
    };
  }

  const store = await cookies();
  const client = createSessionClient(cookieAdapter(store));
  const { data } = await client.auth.getUser();
  if (!data.user) {
    redirect('/connexion?suivant=%2Fapp');
  }

  const { error } = await client.auth.updateUser({
    password: parsed.data.password,
    data: { needs_password: false },
  });
  if (error) {
    return {
      status: 'error',
      message:
        error.code === 'weak_password'
          ? 'Ce mot de passe est trop faible ou figure dans une liste de mots de passe compromis. Choisissez-en un autre.'
          : error.code === 'same_password'
            ? 'Choisissez un mot de passe différent de l’actuel.'
            : 'Le mot de passe n’a pas pu être enregistré. Réessayez dans un instant.',
    };
  }

  redirect('/app?bienvenue=1');
}
