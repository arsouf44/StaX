'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionClient } from '@stax/auth';
import {
  fieldErrors,
  formDataToObject,
  mfaChallengeSchema,
  mfaEnrollSchema,
} from '@stax/validation';
import { guardAction } from '~/lib/action-guard';
import { safeRedirectTarget } from '~/lib/session';
import type { AuthFormState } from '../actions';

/**
 * Second facteur.
 *
 * Ce qui compte ici : un facteur ENROLE ne suffit pas, il doit etre VALIDE
 * pour la session en cours. Supabase materialise cela par le niveau
 * d assurance `aal2` porte par le jeton. Les gardes du back-office exigent ce
 * niveau, et pas seulement la presence d un facteur.
 */

function adapter(store: Awaited<ReturnType<typeof cookies>>) {
  return {
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
      for (const cookie of list) store.set(cookie.name, cookie.value, cookie.options ?? {});
    },
  };
}

export interface MfaEnrollState extends AuthFormState {
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

/** Demarre l enrolement et renvoie le QR code a scanner. */
export async function startMfaEnrollmentAction(): Promise<MfaEnrollState> {
  const store = await cookies();
  const client = createSessionClient(adapter(store));

  const { data: user } = await client.auth.getUser();
  if (!user.user) return { status: 'error', message: 'Votre session a expiré. Reconnectez-vous.' };

  // Un enrolement precedent reste parfois inacheve : on le retire plutot que
  // d empiler des facteurs inutilisables dans l application du client.
  const { data: factors } = await client.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status !== 'verified') {
      await client.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `StaX ${new Date().toISOString().slice(0, 10)}`,
  });

  if (error || !data) {
    return {
      status: 'error',
      message: 'L’enrôlement n’a pas pu démarrer. Réessayez dans quelques instants.',
    };
  }

  return {
    status: 'success',
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/** Confirme l enrolement avec un premier code a six chiffres. */
export async function confirmMfaEnrollmentAction(
  _previous: MfaEnrollState,
  formData: FormData,
): Promise<MfaEnrollState> {
  const parsed = mfaEnrollSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Le code doit contenir six chiffres.',
      errors: fieldErrors(parsed.error),
    };
  }

  const guard = await guardAction({ limit: 'adminSensitive' });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const store = await cookies();
  const client = createSessionClient(adapter(store));

  const { data: challenge, error: challengeError } = await client.auth.mfa.challenge({
    factorId: parsed.data.factorId,
  });
  if (challengeError || !challenge) {
    return { status: 'error', message: 'La vérification n’a pas pu démarrer. Réessayez.' };
  }

  const { error } = await client.auth.mfa.verify({
    factorId: parsed.data.factorId,
    challengeId: challenge.id,
    code: parsed.data.code,
  });

  if (error) {
    return {
      status: 'error',
      message: 'Ce code n’est pas valide. Vérifiez l’heure de votre téléphone et réessayez.',
    };
  }

  redirect('/app/parametres/securite?mfa=active');
}

/** Valide le second facteur pour la session en cours. */
export async function verifyMfaChallengeAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = formDataToObject(formData);
  const parsed = mfaChallengeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Le code doit contenir six chiffres.',
      errors: fieldErrors(parsed.error),
    };
  }

  // Limite stricte : sans elle, six chiffres se devinent en quelques heures.
  const guard = await guardAction({ limit: 'login' });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const store = await cookies();
  const client = createSessionClient(adapter(store));

  const { error } = await client.auth.mfa.verify({
    factorId: parsed.data.factorId,
    challengeId: parsed.data.challengeId,
    code: parsed.data.code,
  });

  if (error) {
    return { status: 'error', message: 'Code incorrect ou expiré. Réessayez avec un code récent.' };
  }

  redirect(safeRedirectTarget(typeof raw.redirectTo === 'string' ? raw.redirectTo : null));
}
