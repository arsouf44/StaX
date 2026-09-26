import { z } from 'zod';
import {
  boundedText,
  checkboxSchema,
  consentCheckbox,
  emailSchema,
  honeypotSchema,
  localeSchema,
  optionalFromForm,
  phoneSchema,
} from './common';

/**
 * Schemas d authentification et d activation.
 *
 * La politique de mot de passe suit les recommandations de l ANSSI et du NIST :
 * une longueur minimale elevee plutot qu une contrainte de composition, qui
 * pousse en pratique a des mots de passe faibles et previsibles.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Mots de passe interdits, trop courants pour offrir la moindre protection. */
const FORBIDDEN_PASSWORDS = new Set([
  'motdepasse',
  'password',
  'azertyuiop',
  'qwertyuiop',
  '123456789012',
  'motdepasse123',
  'password123',
  'administrateur',
  'bienvenue123',
]);

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caracteres.`,
  )
  .max(PASSWORD_MAX_LENGTH, 'Mot de passe trop long.')
  .refine((value) => !FORBIDDEN_PASSWORDS.has(value.toLowerCase()), {
    message: 'Ce mot de passe est trop courant. Choisissez-en un autre.',
  })
  .refine((value) => new Set(value).size >= 5, {
    message: 'Ce mot de passe est trop répétitif.',
  });

export const signUpSchema = z
  .object({
    firstName: boundedText(1, 60, 'Le prenom'),
    lastName: boundedText(1, 60, 'Le nom'),
    email: emailSchema,
    password: passwordSchema,
    // « facultatif » sur le formulaire : un champ laisse vide envoie `''`,
    // pas `undefined`. Sans cette traduction, toute inscription sans telephone
    // echouait sur « Numero de telephone trop court ».
    phone: optionalFromForm(phoneSchema),
    locale: localeSchema.default('fr'),
    acceptTerms: consentCheckbox(
      'Vous devez accepter les conditions générales pour créer un compte.',
    ),
    marketingOptIn: checkboxSchema,
    website: honeypotSchema,
    turnstileToken: z.string().max(4096).optional(),
    /** Page ou revenir apres la confirmation de l'adresse (chemin interne). */
    redirectTo: z.string().max(2048).optional(),
  })
  .strict();

export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Saisissez votre mot de passe.').max(PASSWORD_MAX_LENGTH),
    redirectTo: z.string().max(2048).optional(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

export const passwordResetRequestSchema = z
  .object({
    email: emailSchema,
    website: honeypotSchema,
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

export const passwordResetSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Saisissez votre mot de passe actuel.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  })
  .refine((data) => data.password !== data.currentPassword, {
    message: 'Le nouveau mot de passe doit être different de l ancien.',
    path: ['password'],
  });

/** Code d activation : 12 caracteres, tirets et espaces tolerés a la saisie. */
export const activationCodeSchema = z
  .string()
  .trim()
  .min(12, 'Le code doit contenir 12 caractères.')
  .max(20, 'Code trop long.')
  .transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  .refine((value) => value.length === 12, { message: 'Le code doit contenir 12 caractères.' })
  .refine((value) => /^[A-Z2-9]+$/.test(value), {
    message: 'Ce code contient des caractères invalides.',
  });

export const activationSchema = z
  .object({
    code: activationCodeSchema,
    email: emailSchema,
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

export const activationCompleteSchema = z
  .object({
    code: activationCodeSchema,
    email: emailSchema,
    firstName: boundedText(1, 60, 'Le prenom'),
    lastName: boundedText(1, 60, 'Le nom'),
    password: passwordSchema,
    acceptTerms: consentCheckbox('Vous devez accepter les conditions générales.'),
  })
  .strict();

export const mfaEnrollSchema = z
  .object({
    factorId: z.string().min(1).max(200),
    code: z
      .string()
      .trim()
      .regex(/^[0-9]{6}$/, 'Le code doit contenir 6 chiffres.'),
  })
  .strict();

export const mfaChallengeSchema = z
  .object({
    factorId: z.string().min(1).max(200),
    challengeId: z.string().min(1).max(200),
    code: z
      .string()
      .trim()
      .regex(/^[0-9]{6}$/, 'Le code doit contenir 6 chiffres.'),
  })
  .strict();

/**
 * Estimation de robustesse affichee a la saisie. Purement indicative :
 * la validation du serveur reste seule contraignante.
 */
export function passwordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hints: string[];
} {
  const hints: string[] = [];
  let score = 0;

  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  else hints.push(`Au moins ${PASSWORD_MIN_LENGTH} caracteres.`);

  if (password.length >= 16) score += 1;
  else if (password.length >= PASSWORD_MIN_LENGTH)
    hints.push('Un mot de passe plus long est plus sur.');

  const variety =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password));
  if (variety >= 3) score += 1;
  else hints.push('Melangez majuscules, minuscules, chiffres ou symboles.');

  if (new Set(password).size >= password.length * 0.6) score += 1;
  else hints.push('Evitez les répétitions.');

  const labels = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Excellent'] as const;
  const bounded = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  return { score: bounded, label: labels[bounded], hints };
}
