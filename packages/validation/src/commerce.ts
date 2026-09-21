import { z } from 'zod';
import {
  boundedText,
  consentCheckbox,
  emailSchema,
  hostnameSchema,
  honeypotSchema,
  optionalText,
  phoneSchema,
  slugSchema,
  uuidSchema,
} from './common';

/**
 * Commande, devis et remboursement.
 *
 * Point de securite majeur : AUCUN montant n est accepte depuis le client.
 * Le navigateur transmet une offre et un eventuel code promotionnel ; le prix
 * est relu dans le catalogue serveur par app.create_order().
 */

export const domainHandlingSchema = z.enum([
  'none',
  'customer_owned',
  'stax_purchase',
  'subdomain_only',
]);

export const startOrderSchema = z
  .object({
    planSlug: slugSchema,
    sectorSlug: slugSchema,
    businessTypeSlug: slugSchema,
  })
  .strict();

export const orderQuestionnaireSchema = z
  .object({
    orderId: uuidSchema,
    // Reponses libres, bornees pour ne pas permettre un envoi massif.
    answers: z.record(
      z.string().max(60),
      z.union([
        z.string().max(5000),
        z.number(),
        z.boolean(),
        z.array(z.string().max(200)).max(30),
      ]),
    ),
  })
  .strict();

export const orderDomainSchema = z
  .object({
    handling: domainHandlingSchema,
    hostname: hostnameSchema.optional(),
    subdomain: slugSchema.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.handling === 'none' || data.handling === 'subdomain_only' || Boolean(data.hostname),
    { message: 'Indiquez le nom de domaine souhaite.', path: ['hostname'] },
  )
  .refine((data) => data.handling !== 'subdomain_only' || Boolean(data.subdomain), {
    message: 'Choisissez l adresse de votre site.',
    path: ['subdomain'],
  });

export const checkoutSchema = z
  .object({
    planSlug: slugSchema,
    sectorSlug: slugSchema,
    businessTypeSlug: slugSchema,
    organizationName: boundedText(2, 120, 'Le nom de l entreprise'),
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(40)
      .regex(/^[A-Z0-9-]*$/, 'Code promotionnel invalide.')
      .optional()
      .or(z.literal('')),
    domain: orderDomainSchema,
    questionnaire: z
      .record(
        z.string().max(60),
        z.union([
          z.string().max(5000),
          z.number(),
          z.boolean(),
          z.array(z.string().max(200)).max(30),
        ]),
      )
      .default({}),
    customerNotes: optionalText(2000),
    acceptTerms: z.literal(true, {
      message: 'Vous devez accepter les conditions générales de vente.',
    }),
    // Version exacte des CGV affichee au client : conservee comme preuve.
    termsVersion: z.string().min(1).max(20),
  })
  .strict();

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const refundRequestSchema = z
  .object({
    orderId: uuidSchema,
    reason: boundedText(20, 2000, 'Le motif'),
    confirm: z.literal(true, { message: 'Confirmez votre demande de remboursement.' }),
  })
  .strict();

export const cancelSubscriptionSchema = z
  .object({
    subscriptionId: uuidSchema,
    reason: z.enum([
      'too_expensive',
      'no_longer_needed',
      'missing_features',
      'switching_provider',
      'business_closing',
      'other',
    ]),
    comment: optionalText(2000),
    confirm: z.literal(true, { message: 'Confirmez la résiliation.' }),
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*  Devis sur mesure                                                          */
/* -------------------------------------------------------------------------- */

export const quoteBriefSchema = z
  .object({
    contactName: boundedText(2, 100, 'Votre nom'),
    contactEmail: emailSchema,
    contactPhone: phoneSchema.optional().or(z.literal('')),
    companyName: optionalText(120),
    sectorSlug: slugSchema.optional(),
    businessTypeSlug: slugSchema.optional(),

    objective: boundedText(20, 3000, 'Votre objectif'),
    pageCountRange: z.enum(['1-5', '6-15', '16-30', '30+', 'unknown']),
    features: z
      .array(
        z.enum([
          'ecommerce',
          'booking',
          'payments',
          'customer_accounts',
          'multi_language',
          'advanced_animations',
          'custom_design',
          'integrations',
          'blog',
          'crm',
          'api',
          'mobile_app',
        ]),
      )
      .max(12)
      .default([]),
    integrations: optionalText(1000),
    hasContent: z.enum(['ready', 'partial', 'none']),
    hasDomain: z.enum(['yes', 'no', 'unsure']),
    deadline: z.enum(['asap', '1month', '3months', '6months', 'flexible']),
    budgetRange: z.enum(['under_1k', '1k_3k', '3k_10k', '10k_plus', 'undecided']),
    comments: optionalText(3000),

    acceptPrivacy: consentCheckbox('Vous devez accepter la politique de confidentialité.'),
    website: honeypotSchema,
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

export type QuoteBriefInput = z.infer<typeof quoteBriefSchema>;

export const quoteItemSchema = z
  .object({
    label: boundedText(2, 150, 'Le libelle'),
    description: optionalText(1000),
    quantity: z.number().positive().max(9999),
    unitPriceCents: z.number().int().min(-10_000_000).max(10_000_000),
    kind: z.enum(['one_time', 'recurring', 'discount']).default('one_time'),
  })
  .strict();

export const quoteDraftSchema = z
  .object({
    quoteId: uuidSchema,
    items: z.array(quoteItemSchema).min(1, 'Ajoutez au moins une ligne.').max(50),
    vatRateBps: z.number().int().min(0).max(10_000).default(2000),
    maintenancePriceCents: z.number().int().min(0).max(10_000_000).default(0),
    notes: optionalText(4000),
    expiresInDays: z.number().int().min(1).max(365).default(30),
  })
  .strict();

export const contactFormSchema = z
  .object({
    name: boundedText(2, 100, 'Votre nom'),
    email: emailSchema,
    phone: phoneSchema.optional().or(z.literal('')),
    company: optionalText(120),
    subject: z.enum(['sales', 'support', 'partnership', 'press', 'other']).default('sales'),
    message: boundedText(20, 5000, 'Votre message'),
    acceptPrivacy: consentCheckbox('Vous devez accepter la politique de confidentialité.'),
    website: honeypotSchema,
    elapsedMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();
