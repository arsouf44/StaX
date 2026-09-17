import { z } from 'zod';
import { boundedText, emailSchema, honeypotSchema, optionalText, uuidSchema } from './common';

/**
 * RGPD : consentement, demandes d exercice des droits, cookies.
 */

export const COOKIE_CATEGORIES = ['necessary', 'analytics', 'marketing'] as const;
export type CookieCategory = (typeof COOKIE_CATEGORIES)[number];

/** Version du bandeau cookies. Toute evolution du texte incremente la version. */
export const COOKIE_POLICY_VERSION = '2026-01';

export const cookieConsentSchema = z
  .object({
    // `necessary` est toujours vrai : ces cookies ne dependent pas du
    // consentement, mais la valeur est enregistree pour la tracabilite.
    necessary: z.literal(true),
    analytics: z.boolean(),
    marketing: z.boolean(),
    version: z.string().max(20).default(COOKIE_POLICY_VERSION),
  })
  .strict();

export type CookieConsent = z.infer<typeof cookieConsentSchema>;

export const DEFAULT_COOKIE_CONSENT: CookieConsent = {
  necessary: true,
  analytics: false,
  marketing: false,
  version: COOKIE_POLICY_VERSION,
};

export const privacyRequestSchema = z
  .object({
    kind: z.enum(['export', 'deletion', 'rectification', 'objection']),
    email: emailSchema,
    details: boundedText(10, 4000, 'Votre demande'),
    organizationId: uuidSchema.optional(),
    confirmIdentity: z.literal(true, {
      message: 'Confirmez que vous etes bien la personne concernee.',
    }),
    website: honeypotSchema,
  })
  .strict();

export const dataExportSchema = z
  .object({
    organizationId: uuidSchema,
    scopes: z
      .array(
        z.enum([
          'account',
          'organization',
          'site_content',
          'messages',
          'contacts',
          'bookings',
          'products',
          'orders',
          'invoices',
        ]),
      )
      .min(1, 'Choisissez au moins un type de données.')
      .max(9),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .strict();

export const accountDeletionSchema = z
  .object({
    organizationId: uuidSchema,
    reason: optionalText(2000),
    // Le client doit ressaisir le nom exact de son organisation : une
    // suppression ne doit jamais tenir a un simple clic.
    confirmationText: z.string().min(1, 'Saisissez le nom exact de votre organisation.'),
    acknowledgeRetention: z.literal(true, {
      message:
        'Vous devez reconnaitre que les pièces comptables sont conservées le temps imposé par la loi.',
    }),
  })
  .strict();
