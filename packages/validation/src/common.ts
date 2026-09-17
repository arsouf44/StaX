import { z } from 'zod';

/**
 * Primitives de validation partagees.
 *
 * Toute donnee entrante — formulaire, action serveur, route API, webhook —
 * traverse un schema. Aucune mutation n'accepte un objet brut : c'est la
 * protection contre l'affectation de masse (mass assignment).
 */

export const uuidSchema = z.string().uuid({ message: 'Identifiant invalide.' });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Adresse e-mail trop courte.')
  .max(254, 'Adresse e-mail trop longue.')
  .email('Adresse e-mail invalide.');

/** Numero francais ou international, tolerant sur les separateurs. */
export const phoneSchema = z
  .string()
  .trim()
  .min(6, 'Numéro de téléphone trop court.')
  .max(30, 'Numéro de téléphone trop long.')
  .regex(/^[+0-9][0-9\s.\-()]{5,29}$/, 'Numéro de téléphone invalide.');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Trop court.')
  .max(63, 'Trop long.')
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Utilisez uniquement lettres, chiffres et tirets.');

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(4, 'Nom de domaine trop court.')
  .max(253, 'Nom de domaine trop long.')
  .regex(
    /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/,
    'Nom de domaine invalide. Exemple : mon-entreprise.fr',
  )
  .refine((value) => !value.startsWith('www.') || value.split('.').length > 2, {
    message: 'Nom de domaine invalide.',
  });

/** Chemin de page interne : toujours relatif a la racine, jamais absolu. */
export const pathSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(200, 'Chemin trop long.')
  .regex(/^\/([a-z0-9]+(?:[-/][a-z0-9]+)*)?$/, 'Chemin invalide. Exemple : /nos-services');

/** Montant en centimes : entier, positif, plafonne a 100 000 000 EUR. */
export const centsSchema = z
  .number()
  .int('Le montant doit être un entier de centimes.')
  .min(0, 'Le montant ne peut pas être negatif.')
  .max(10_000_000_000, 'Montant hors limites.');

export const currencySchema = z.literal('EUR');
export const localeSchema = z.enum(['fr', 'en']);

export const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Z][0-9A-Z\s-]{2,9}$/i, 'Code postal invalide.');

export const countrySchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(2, 'Code pays invalide.')
  .regex(/^[A-Z]{2}$/, 'Code pays invalide.');

export const timezoneSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^[A-Za-z]+\/[A-Za-z_+-]+$/, 'Fuseau horaire invalide.');

/** Texte libre borne, nettoye des espaces superflus. */
export function boundedText(min: number, max: number, label = 'Ce champ') {
  return z
    .string()
    .trim()
    .min(
      min,
      min === 1 ? `${label} est obligatoire.` : `${label} doit faire au moins ${min} caractères.`,
    )
    .max(max, `${label} ne peut pas dépasser ${max} caractères.`);
}

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

/** Couleur hexadecimale, seule forme acceptee dans les jetons de theme. */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Couleur invalide. Exemple : #1A1A1A');

/** URL publique : HTTPS uniquement, pour ne jamais degrader une page en HTTP. */
export const httpsUrlSchema = z
  .string()
  .trim()
  .url('Adresse invalide.')
  .max(2048)
  .refine((value) => value.startsWith('https://'), {
    message: 'L adresse doit commencer par https://',
  });

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.');
export const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Champ piege anti-robot : doit rester vide. */
export const honeypotSchema = z.string().max(0, 'Requête refusée.').optional().or(z.literal(''));

/** Pagination normalisee, plafonnee pour ne jamais exposer un scan complet. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export const sortSchema = z.object({
  sort: z.string().max(40).optional(),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Traduit une erreur Zod en carte champ -> messages, directement exploitable
 * par un formulaire.
 */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_form';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

export type ValidationOutcome<T> =
  { success: true; data: T } | { success: false; errors: Record<string, string[]> };

/** Validation d une entree, sans exception : le resultat est explicite. */
export function validate<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): ValidationOutcome<z.infer<T>> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { success: true, data: parsed.data };
  return { success: false, errors: fieldErrors(parsed.error) };
}

/** Lit un FormData en objet simple, en conservant les champs multiples. */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    const normalized = value instanceof File ? value : String(value);
    if (key in result) {
      const existing = result[key];
      result[key] = Array.isArray(existing) ? [...existing, normalized] : [existing, normalized];
    } else {
      result[key] = normalized;
    }
  }
  return result;
}
