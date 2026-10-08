'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { createSessionClient } from '@nemasus/auth';
import {
  fieldErrors,
  formDataToObject,
  passwordResetRequestSchema,
  passwordResetSchema,
  signInSchema,
} from '@nemasus/validation';
import { guardAction } from '~/lib/action-guard';
import { requestPasswordReset, resetPassword } from '~/lib/password-reset';
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
 *  2. AUCUN role n est attribue ici. Les comptes clients naissent du code
 *     d acces personnel (`/acces`) ; le role de plateforme vient de
 *     `profiles.platform_role`, ecrit uniquement par le script
 *     d approvisionnement avec la cle de service.
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

/** Message unique, volontairement identique pour toutes les causes d echec. */
const GENERIC_SIGNIN_ERROR =
  'Identifiants incorrects. Vérifiez votre adresse e-mail et votre mot de passe.';

/**
 * Message de panne.
 *
 * Distinct de l echec d identifiants, et c est voulu : dire « service
 * indisponible » quand le fournisseur d authentification est injoignable ne
 * revele rien sur l existence d un compte, et evite de faire douter quelqu un
 * de son propre mot de passe. Il ne remplace JAMAIS le message generique en
 * cas de refus reel.
 */
const SERVICE_UNAVAILABLE =
  'Le service d’authentification est momentanément indisponible. Réessayez dans quelques instants.';

/**
 * Delai maximal accorde au fournisseur d'authentification.
 *
 * Un appel reseau sans borne est un point de panne : si Supabase Auth devient
 * lent ou injoignable, chaque tentative de connexion immobiliserait un worker
 * et laisserait la personne devant un bouton qui tourne indefiniment. Passe ce
 * delai, on rend la main avec un message honnete.
 *
 * La valeur est volontairement plus courte qu'un timeout de plateforme : mieux
 * vaut inviter a reessayer que de faire attendre trente secondes.
 */
const AUTH_TIMEOUT_MS = 8_000;

class AuthTimeoutError extends Error {
  constructor() {
    super('auth-timeout');
    this.name = 'AuthTimeoutError';
  }
}

function withAuthTimeout<T>(operation: Promise<T>, timeoutMs = AUTH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    operation,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new AuthTimeoutError()), timeoutMs);
      // Le minuteur ne doit pas retenir le processus une fois la course gagnee.
      void operation.finally(() => clearTimeout(timer)).catch(() => undefined);
    }),
  ]);
}

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

  let data: Awaited<ReturnType<typeof client.auth.signInWithPassword>>['data'];
  let error: Awaited<ReturnType<typeof client.auth.signInWithPassword>>['error'];
  try {
    ({ data, error } = await withAuthTimeout(
      client.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      }),
    ));
  } catch {
    // Fournisseur injoignable : on le dit, plutot que de laisser une exception
    // remonter jusqu a une page d erreur generique.
    return { status: 'error', message: SERVICE_UNAVAILABLE };
  }

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
      'Si un compte correspond à cette adresse, vous recevrez un e-mail permettant de ' +
      'réinitialiser votre mot de passe. Le lien est valable une heure. Pensez à vérifier vos ' +
      'courriers indésirables.',
  };

  if (!parsed.success) return uniformAnswer;

  const guard = await guardAction({
    limit: 'passwordReset',
    honeypot: parsed.data.website,
    turnstileToken: parsed.data.turnstileToken,
  });
  if (!guard.ok) return { status: 'error', message: guard.message };

  // Le lien part APRES la reponse : la duree de l envoi (qui n a lieu que si
  // le compte existe) ne doit pas permettre de distinguer une adresse connue.
  // Meme en panne, la reponse reste identique.
  const email = parsed.data.email;
  const ipHash = guard.ipHash;
  after(async () => {
    try {
      await withAuthTimeout(requestPasswordReset(email, ipHash), 15_000);
    } catch {
      // Journalise par requestPasswordReset ; rien a montrer au visiteur.
    }
  });
  return uniformAnswer;
}

const RESET_MESSAGES: Record<string, string> = {
  invalid: 'Ce lien de réinitialisation n’est pas valide. Demandez-en un nouveau.',
  expired: 'Ce lien a expiré (il est valable une heure). Demandez-en un nouveau.',
  used: 'Ce lien a déjà servi. Si vous n’êtes pas à l’origine du changement, demandez un nouveau lien.',
  weak_password:
    'Ce mot de passe a été refusé : il est trop faible ou figure dans une liste de mots de passe compromis. Choisissez-en un autre.',
  unavailable:
    'Le mot de passe n’a pas pu être modifié pour le moment. Votre lien reste valable : réessayez dans un instant.',
};

export async function updatePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = String(formData.get('jeton') ?? '');
  const parsed = passwordResetSchema.safeParse({
    password: formData.get('password') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
  });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Le mot de passe ne respecte pas les règles de sécurité.',
      errors: fieldErrors(parsed.error),
    };
  }

  const guard = await guardAction({ limit: 'passwordReset' });
  if (!guard.ok) return { status: 'error', message: guard.message };

  let outcome: Awaited<ReturnType<typeof resetPassword>>;
  try {
    // Plusieurs appels successifs (jeton, session, mot de passe, fermeture des
    // sessions) : un delai plus long que pour une simple connexion.
    outcome = await withAuthTimeout(resetPassword(token, parsed.data.password), 25_000);
  } catch {
    return { status: 'error', message: RESET_MESSAGES['unavailable'] };
  }
  if (!outcome.ok) {
    return {
      status: 'error',
      message: RESET_MESSAGES[outcome.reason] ?? RESET_MESSAGES['invalid'],
    };
  }

  // Toutes les sessions du compte sont fermees, y compris celle de ce
  // navigateur s il en avait une : on repart d une connexion propre.
  const store = await cookies();
  const client = createSessionClient(cookieAdapter(store));
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);

  redirect('/connexion?reinitialise=1');
}
