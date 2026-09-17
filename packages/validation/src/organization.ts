import { z } from 'zod';
import {
  boundedText,
  countrySchema,
  emailSchema,
  httpsUrlSchema,
  optionalText,
  phoneSchema,
  postalCodeSchema,
  slugSchema,
  uuidSchema,
} from './common';

/**
 * Organisations et equipes.
 *
 * Les schemas sont `strict()` : une cle inconnue fait echouer la validation
 * plutot que d etre ignoree silencieusement. Aucune colonne sensible
 * (statut, marquage demo, identifiant Stripe, suspension) n est exposee.
 */

export const organizationProfileSchema = z
  .object({
    name: boundedText(2, 120, 'Le nom de l entreprise'),
    legalName: optionalText(150),
    siret: z
      .string()
      .trim()
      .regex(/^[0-9]{9}([0-9]{5})?$/, 'Le SIREN comporte 9 chiffres, le SIRET 14.')
      .optional()
      .or(z.literal('')),
    vatNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}[0-9A-Z]{2,13}$/, 'Numéro de TVA invalide.')
      .optional()
      .or(z.literal('')),
    addressLine1: optionalText(120),
    addressLine2: optionalText(120),
    postalCode: postalCodeSchema.optional().or(z.literal('')),
    city: optionalText(80),
    country: countrySchema.default('FR'),
    phone: phoneSchema.optional().or(z.literal('')),
    website: httpsUrlSchema.optional().or(z.literal('')),
    billingEmail: emailSchema.optional().or(z.literal('')),
  })
  .strict();

export type OrganizationProfileInput = z.infer<typeof organizationProfileSchema>;

export const createOrganizationSchema = z
  .object({
    name: boundedText(2, 120, 'Le nom de l entreprise'),
    slug: slugSchema.optional(),
    sectorSlug: slugSchema,
    businessTypeSlug: slugSchema,
  })
  .strict();

export const inviteMemberSchema = z
  .object({
    email: emailSchema,
    // `owner` est volontairement absent : la propriete se transfere
    // explicitement, jamais par simple invitation.
    role: z.enum(['admin', 'editor', 'billing', 'viewer']),
    message: optionalText(500),
  })
  .strict();

export const updateMemberRoleSchema = z
  .object({
    memberId: uuidSchema,
    role: z.enum(['owner', 'admin', 'editor', 'billing', 'viewer']),
  })
  .strict();

export const profileSchema = z
  .object({
    firstName: boundedText(1, 60, 'Le prenom'),
    lastName: boundedText(1, 60, 'Le nom'),
    phone: phoneSchema.optional().or(z.literal('')),
    locale: z.enum(['fr', 'en']).default('fr'),
    timezone: z.string().max(64).default('Europe/Paris'),
    marketingOptIn: z.boolean().default(false),
  })
  .strict();
