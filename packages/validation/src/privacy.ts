import { z } from 'zod';
import {
  boundedText,
  consentCheckbox,
  emailSchema,
  honeypotSchema,
  optionalText,
  uuidSchema,
} from './common';

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

/**
 * Signalement d'un contenu illicite (reglement (UE) 2022/2065, article 16).
 *
 * L'identite est exigee, sauf pour un contenu d'abus sur mineurs : c'est la
 * seule exception que le reglement prevoit, et elle ne doit pas decourager un
 * signalement de ce type.
 */
export const CONTENT_REPORT_CATEGORIES = [
  'illegal',
  'intellectual_property',
  'privacy',
  'defamation',
  'fraud',
  'hate',
  'child_abuse',
  'other',
] as const;

export const contentReportSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(2000, 'Adresse trop longue.')
      .regex(/^https?:\/\/[^\s/]+/i, 'Indiquez l’adresse complète, commençant par https://'),
    category: z.enum(CONTENT_REPORT_CATEGORIES),
    explanation: boundedText(20, 5000, 'Votre explication'),
    name: optionalText(120),
    email: emailSchema.optional().or(z.literal('').transform(() => undefined)),
    goodFaith: consentCheckbox(
      'Confirmez que votre signalement est fait de bonne foi et que les informations sont exactes.',
    ),
    website: honeypotSchema,
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.category === 'child_abuse') return;
    if (!value.name) {
      context.addIssue({ code: 'custom', path: ['name'], message: 'Indiquez votre nom.' });
    }
    if (!value.email) {
      context.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Indiquez votre adresse e-mail pour recevoir la réponse.',
      });
    }
  });

export type ContentReportInput = z.infer<typeof contentReportSchema>;
