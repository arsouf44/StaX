'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSessionClient, peekActivationCode, redeemActivationCode } from '@stax/auth';
import { createServiceClient } from '@stax/database';
import {
  activationCompleteSchema,
  activationSchema,
  fieldErrors,
  formDataToObject,
  passwordResetRequestSchema,
  passwordResetSchema,
  signInSchema,
  signUpSchema,
} from '@stax/validation';
import { TERMS_VERSION } from '~/content/legal';
import { absolutePlatformUrl, guardAction } from '~/lib/action-guard';
import { safeRedirectTarget } from '~/lib/session';

/**
 * Actions d authentification.
 *
 * Trois regles tenues partout dans ce fichier :
 *
 *  1. AUCUN message ne revele si une adresse e-mail existe. « Identifiants
 *     incorrects » et « si un compte existe, un e-mail a ete envoye » sont les
 *     seules reponses possibles — sinon le formulaire devient un outil
 *     d enumeration de la base clients.
 *
 *  2. AUCUN role n est attribue ici. Un compte cree par ce formulaire est un
 *     compte ordinaire, quelle que soit son adresse e-mail. Le role de
 *     plateforme vient de `profiles.platform_role`, ecrit uniquement par le
 *     script d approvisionnement avec la cle de service.
 *
 *  3. La destination apres connexion est toujours filtree : seul un chemin
 *     interne est accepte, jamais une URL absolue.
 */

export interface AuthFormState {
  status: 'idle' | 'error' | 'success';
  message?: string;
  errors?: Record<string, string[]>;
  /** Renseigne quand un second facteur est requis pour terminer la connexion. */
  mfaRequired?: boolean;
}

export const IDLE_STATE: AuthFormState = { status: 'idle' };

/** Message unique, volontairement identique pour toutes les causes d echec. */
const GENERIC_SIGNIN_ERROR =
  'Identifiants incorrects. Vérifiez votre adresse e-mail et votre mot de passe.';

function cookieAdapter(store: Awaited<ReturnType<typeof cookies>>) {
  return {
    getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
    setAll: (list: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => {
      for (const cookie of list) store.set(cookie.name, cookie.value, cookie.options ?? {});
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Connexion                                                                  */
/* -------------------------------------------------------------------------- */

export async function signInAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { status: 'error', message: GENERIC_SIGNIN_ERROR, errors: fieldErrors(parsed.error) };
  }

  const guard = await guardAction({
    limit: 'login',
    turnstileToken: parsed.data.turnstileToken,
  });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const store = await cookies();
  const client = createSessionClient(cookieAdapter(store));

  const { data, error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { status: 'error', message: GENERIC_SIGNIN_ERROR };
  }

  // Un compte desactive ne doit pas conserver de session ouverte.
  const { data: profile } = await client
    .from('profiles')
    .select('disabled_at, mfa_enforced')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profile?.disabled_at) {
    await client.auth.signOut({ scope: 'local' });
    return {
      status: 'error',
      message: 'Ce compte est désactivé. Contactez-nous si vous pensez qu’il s’agit d’une erreur.',
    };
  }

  // Un second facteur enrole impose une verification supplementaire : la
  // session obtenue reste au niveau aal1 tant qu il n a pas ete valide.
  const { data: factors } = await client.auth.mfa.listFactors();
  const verified = factors?.totp?.filter((factor) => factor.status === 'verified') ?? [];
  if (verified.length > 0) {
    redirect(`/mfa?suivant=${encodeURIComponent(safeRedirectTarget(parsed.data.redirectTo))}`);
  }

  if (profile?.mfa_enforced) {
    redirect('/mfa/configuration?raison=obligatoire');
  }

  redirect(safeRedirectTarget(parsed.data.redirectTo));
}

/* -------------------------------------------------------------------------- */
/*  Creation de compte                                                         */
/* -------------------------------------------------------------------------- */

export async function signUpAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = formDataToObject(formData);
  const parsed = signUpSchema.safeParse({
    ...raw,
    acceptTerms: raw.acceptTerms === 'on' || raw.acceptTerms === 'true' || raw.acceptTerms === true,
    marketingOptIn: raw.marketingOptIn === 'on' || raw.marketingOptIn === 'true',
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Certains champs doivent être corrigés.',
      errors: fieldErrors(parsed.error),
    };
  }

  const guard = await guardAction({
    limit: 'signup',
    honeypot: parsed.data.website,
    turnstileToken: parsed.data.turnstileToken,
  });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const store = await cookies();
  const client = createSessionClient(cookieAdapter(store));

  const { error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: absolutePlatformUrl('/app'),
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        phone: parsed.data.phone ?? null,
        locale: parsed.data.locale,
        marketing_opt_in: parsed.data.marketingOptIn,
        // Version des conditions acceptees, conservee comme preuve.
        terms_version: TERMS_VERSION,
        terms_accepted_at: new Date().toISOString(),
      },
    },
  });

  if (error) {
    // Supabase distingue « adresse deja utilisee » des autres erreurs. On ne
    // repercute PAS cette distinction : elle permettrait de tester si une
    // adresse est cliente. Le message est identique dans les deux cas, et un
    // e-mail est envoye a l adresse — la personne legitime saura quoi faire.
    return {
      status: 'success',
      message:
        'Si cette adresse peut être utilisée, un e-mail de confirmation vient de vous être ' +
        'envoyé. Vérifiez votre boîte de réception, y compris les indésirables.',
    };
  }

  return {
    status: 'success',
    message:
      'Votre compte est créé. Un e-mail de confirmation vient de vous être envoyé : ' +
      'cliquez sur le lien qu’il contient pour activer votre accès.',
  };
}

/* -------------------------------------------------------------------------- */
/*  Mot de passe oublie                                                        */
/* -------------------------------------------------------------------------- */

export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = passwordResetRequestSchema.safeParse(formDataToObject(formData));

  // Reponse identique quelle que soit l issue, y compris en cas de saisie
  // invalide : le formulaire ne doit jamais servir a tester des adresses.
  const uniformAnswer: AuthFormState = {
    status: 'success',
    message:
      'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être ' +
      'envoyé. Le lien est valable une heure.',
  };

  if (!parsed.success) return uniformAnswer;

  const guard = await guardAction({
    limit: 'passwordReset',
    honeypot: parsed.data.website,
    turnstileToken: parsed.data.turnstileToken,
  });
  if (!guard.ok) return { status: 'error', message: guard.message };

  const store = await cookies();
  const client = createSessionClient(cookieAdapter(store));
  await client.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: absolutePlatformUrl('/nouveau-mot-de-passe'),
  });

  return uniformAnswer;
}

export async function updatePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = passwordResetSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Le mot de passe ne respecte pas les règles de sécurité.',
      errors: fieldErrors(parsed.error),
    };
  }

  const store = await cookies();
  const client = createSessionClient(cookieAdapter(store));

  // Le lien de reinitialisation a ouvert une session : sans elle, il n y a
  // rien a modifier. On ne cree jamais de session depuis ce formulaire.
  const { data } = await client.auth.getUser();
  if (!data.user) {
    return {
      status: 'error',
      message:
        'Ce lien de réinitialisation a expiré ou a déjà été utilisé. Demandez-en un nouveau.',
    };
  }

  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: 'error', message: 'Ce mot de passe n’a pas pu être enregistré.' };
  }

  // Toutes les autres sessions sont fermees : si le compte etait compromis,
  // l attaquant perd son acces au moment meme du changement.
  await client.auth.signOut({ scope: 'others' });

  redirect('/connexion?reinitialise=1');
}

/* -------------------------------------------------------------------------- */
/*  Activation par code                                                        */
/* -------------------------------------------------------------------------- */

export interface ActivationState extends AuthFormState {
  /** Etape atteinte : verification du code, puis creation du compte. */
  step?: 'verify' | 'complete';
  code?: string;
  email?: string;
  organizationName?: string;
}

export async function verifyActivationCodeAction(
  _previous: ActivationState,
  formData: FormData,
): Promise<ActivationState> {
  const parsed = activationSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      step: 'verify',
      message: 'Vérifiez le code et l’adresse e-mail saisis.',
      errors: fieldErrors(parsed.error),
    };
  }

  const guard = await guardAction({
    limit: 'activation',
    turnstileToken: parsed.data.turnstileToken,
  });
  if (!guard.ok) return { status: 'error', step: 'verify', message: guard.message };

  // Verification SANS consommation : le compte n est cree qu une fois le code
  // reconnu valide. La tentative est tout de meme comptee en base, donc un
  // code ne peut pas etre teste indefiniment.
  const preview = await peekActivationCode(createServiceClient(), {
    code: parsed.data.code,
    email: parsed.data.email,
  });

  if (!preview.ok) {
    return { status: 'error', step: 'verify', message: preview.error.message };
  }

  return {
    status: 'success',
    step: 'complete',
    code: parsed.data.code,
    email: parsed.data.email,
    organizationName: preview.data.organizationName ?? undefined,
    message: 'Code valide. Créez votre mot de passe pour terminer.',
  };
}

export async function completeActivationAction(
  _previous: ActivationState,
  formData: FormData,
): Promise<ActivationState> {
  const raw = formDataToObject(formData);
  const parsed = activationCompleteSchema.safeParse({
    ...raw,
    acceptTerms: raw.acceptTerms === 'on' || raw.acceptTerms === 'true' || raw.acceptTerms === true,
  });

  if (!parsed.success) {
    return {
      status: 'error',
      step: 'complete',
      code: typeof raw.code === 'string' ? raw.code : undefined,
      email: typeof raw.email === 'string' ? raw.email : undefined,
      message: 'Certains champs doivent être corrigés.',
      errors: fieldErrors(parsed.error),
    };
  }

  const guard = await guardAction({ limit: 'activation' });
  if (!guard.ok) return { status: 'error', step: 'complete', message: guard.message };

  const service = createServiceClient();

  // Le code prouve que la personne a recu notre e-mail : l adresse est donc
  // deja verifiee, et lui redemander une confirmation n apporterait rien.
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
    },
  });

  if (createError || !created.user) {
    // Une adresse deja utilisee doit se connecter : le code lui sera rattache
    // apres authentification. On ne cree jamais de doublon.
    return {
      status: 'error',
      step: 'complete',
      code: parsed.data.code,
      email: parsed.data.email,
      message:
        'Un compte existe déjà pour cette adresse. Connectez-vous, puis saisissez votre code ' +
        'depuis votre espace.',
    };
  }

  const outcome = await redeemActivationCode(service, {
    code: parsed.data.code,
    userId: created.user.id,
    email: parsed.data.email,
  });

  if (!outcome.ok) {
    // Le code a ete consomme entre la verification et ici (ou revoque) :
    // on retire le compte tout juste cree plutot que de laisser un orphelin.
    await service.auth.admin.deleteUser(created.user.id);
    return { status: 'error', step: 'verify', message: outcome.error.message };
  }

  const store = await cookies();
  const client = createSessionClient(cookieAdapter(store));
  const { error } = await client.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    redirect('/connexion?active=1');
  }

  redirect('/app?bienvenue=1');
}
