'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSessionClient } from '@stax/auth';
import { fieldErrors, formDataToObject, passwordChangeSchema } from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { requireSession } from '~/lib/session';
import type { ActionState } from '~/lib/form-state';

/**
 * Securite du compte.
 *
 * Deux garanties tenues ici :
 *
 *  1. Le mot de passe actuel est REVERIFIE avant tout changement. Sans cela,
 *     un poste laisse ouvert suffirait a verrouiller le compte de son
 *     proprietaire.
 *
 *  2. Un changement de mot de passe ferme TOUTES les autres sessions. Si le
 *     compte etait compromis, l attaquant perd son acces a l instant meme.
 */

function adapter(store: Awaited<ReturnType<typeof cookies>>) {
  return {
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
      for (const cookie of list) store.set(cookie.name, cookie.value, cookie.options ?? {});
    },
  };
}

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = passwordChangeSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Certains champs doivent être corrigés.',
      errors: fieldErrors(parsed.error),
    };
  }

  const session = await requireSession();
  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const store = await cookies();
  const client = createSessionClient(adapter(store));

  // Reverification du mot de passe actuel : la session seule ne suffit pas
  // pour une action aussi sensible.
  const { error: reauthError } = await client.auth.signInWithPassword({
    email: session.user.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    return {
      status: 'error',
      message: 'Votre mot de passe actuel est incorrect.',
      errors: { currentPassword: ['Mot de passe incorrect.'] },
    };
  }

  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: 'error', message: 'Ce mot de passe n’a pas pu être enregistré.' };
  }

  await client.auth.signOut({ scope: 'others' });

  revalidatePath('/app/securite');
  return {
    status: 'success',
    message:
      'Mot de passe modifié. Toutes vos autres sessions ont été fermées : si quelqu’un était ' +
      'connecté ailleurs, il ne l’est plus.',
  };
}

export async function revokeOtherSessionsAction(): Promise<ActionState> {
  const session = await requireSession();
  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const store = await cookies();
  const client = createSessionClient(adapter(store));
  const { error } = await client.auth.signOut({ scope: 'others' });

  if (error) {
    return { status: 'error', message: 'Les autres sessions n’ont pas pu être fermées.' };
  }

  revalidatePath('/app/securite');
  return {
    status: 'success',
    message: 'Toutes vos autres sessions ont été fermées. Celle-ci reste ouverte.',
  };
}

export async function disableMfaAction(formData: FormData): Promise<ActionState> {
  const factorId = formData.get('factorId');
  if (typeof factorId !== 'string' || factorId.length === 0) {
    return { status: 'error', message: 'Facteur introuvable.' };
  }

  const session = await requireSession();

  // Un compte pour lequel la double authentification est OBLIGATOIRE ne peut
  // pas la desactiver lui-meme : ce serait annuler la protection qui justifie
  // son acces.
  if (session.profile.mfa_enforced) {
    return {
      status: 'error',
      message:
        'La double authentification est obligatoire pour ce compte : elle ne peut pas être ' +
        'désactivée.',
    };
  }

  const guard = await guardAction({ limit: 'adminSensitive', userId: session.user.id });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const store = await cookies();
  const client = createSessionClient(adapter(store));
  const { error } = await client.auth.mfa.unenroll({ factorId });

  if (error) {
    return { status: 'error', message: 'La désactivation a échoué. Réessayez.' };
  }

  revalidatePath('/app/securite');
  return { status: 'success', message: 'Double authentification désactivée.' };
}
