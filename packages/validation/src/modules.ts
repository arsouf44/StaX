import { z } from 'zod';
import {
  boundedText,
  centsSchema,
  emailSchema,
  honeypotSchema,
  isoDateSchema,
  optionalText,
  phoneSchema,
  slugSchema,
  uuidSchema,
} from './common.js';

/**
 * Schemas des modules metier : carte, prestations, reservations, catalogue,
 * biens, chambres, formulaires publics.
 */

/* --- Carte de restaurant ------------------------------------------------- */

export const ALLERGENS = [
  'gluten', 'crustaces', 'oeufs', 'poissons', 'arachides', 'soja', 'lait',
  'fruits-a-coque', 'celeri', 'moutarde', 'sesame', 'sulfites', 'lupin', 'mollusques',
] as const;

export const DIETARY_TAGS = [
  'vegetarien', 'vegan', 'sans-gluten', 'sans-lactose', 'halal', 'fait-maison', 'bio', 'local',
] as const;

export const menuCategorySchema = z
  .object({
    name: boundedText(1, 80, 'Le nom de la categorie'),
    description: optionalText(400),
    menuGroup: z
      .enum(['main', 'lunch', 'dinner', 'drinks', 'wine', 'dessert', 'brunch', 'set_menu', 'kids'])
      .default('main'),
    isVisible: z.boolean().default(true),
  })
  .strict();

export const menuItemSchema = z
  .object({
    categoryId: uuidSchema,
    name: boundedText(1, 120, 'Le nom du plat'),
    description: optionalText(600),
    priceCents: centsSchema.nullable().optional(),
    imageMediaId: uuidSchema.nullable().optional(),
    allergens: z.array(z.enum(ALLERGENS)).max(14).default([]),
    dietaryTags: z.array(z.enum(DIETARY_TAGS)).max(8).default([]),
    options: z
      .array(
        z
          .object({
            label: boundedText(1, 60, 'Le libelle'),
            choices: z
              .array(
                z.object({
                  label: boundedText(1, 60, 'Le choix'),
                  extraCents: centsSchema.default(0),
                }),
              )
              .min(1)
              .max(20),
            required: z.boolean().default(false),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    isAvailable: z.boolean().default(true),
    isSignature: z.boolean().default(false),
  })
  .strict();

/* --- Prestations et equipe ----------------------------------------------- */

export const serviceSchema = z
  .object({
    name: boundedText(1, 120, 'Le nom de la prestation'),
    slug: slugSchema.optional(),
    category: optionalText(60),
    description: optionalText(1500),
    priceCents: centsSchema.nullable().optional(),
    priceFrom: z.boolean().default(false),
    priceSuffix: optionalText(30),
    durationMinutes: z.number().int().min(5).max(1440).nullable().optional(),
    imageMediaId: uuidSchema.nullable().optional(),
    isBookable: z.boolean().default(false),
    isEmergency: z.boolean().default(false),
    isVisible: z.boolean().default(true),
  })
  .strict();

export const teamMemberSchema = z
  .object({
    fullName: boundedText(2, 100, 'Le nom'),
    roleLabel: optionalText(80),
    bio: optionalText(1500),
    photoMediaId: uuidSchema.nullable().optional(),
    email: emailSchema.optional().or(z.literal('')),
    phone: phoneSchema.optional().or(z.literal('')),
    acceptsBookings: z.boolean().default(false),
    isVisible: z.boolean().default(true),
  })
  .strict();

export const serviceAreaSchema = z
  .object({
    label: boundedText(1, 80, 'Le libelle'),
    postalCode: optionalText(12),
    city: optionalText(80),
    radiusKm: z.number().int().min(1).max(500).nullable().optional(),
  })
  .strict();

/* --- Horaires ------------------------------------------------------------ */

const timeSchema = z
  .string()
  .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Heure invalide. Format attendu : 09:30');

export const openingHourSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: timeSchema,
    closesAt: timeSchema,
    service: z.enum(['all_day', 'morning', 'lunch', 'afternoon', 'dinner', 'night']).default('all_day'),
    label: optionalText(40),
  })
  .strict()
  .refine((data) => data.closesAt > data.opensAt, {
    message: 'L heure de fermeture doit suivre l heure d ouverture.',
    path: ['closesAt'],
  });

export const openingHoursSchema = z.array(openingHourSchema).max(28);

export const closureSchema = z
  .object({
    startsOn: isoDateSchema,
    endsOn: isoDateSchema,
    reason: optionalText(120),
    blocksBooking: z.boolean().default(true),
  })
  .strict()
  .refine((data) => data.endsOn >= data.startsOn, {
    message: 'La date de fin doit suivre la date de debut.',
    path: ['endsOn'],
  });

/* --- Reservations -------------------------------------------------------- */

export const bookingServiceSchema = z
  .object({
    name: boundedText(1, 120, 'Le nom'),
    description: optionalText(800),
    serviceId: uuidSchema.nullable().optional(),
    durationMinutes: z.number().int().min(5).max(1440).default(60),
    bufferMinutes: z.number().int().min(0).max(240).default(0),
    capacityPerSlot: z.number().int().min(1).max(500).default(1),
    leadTimeHours: z.number().int().min(0).max(720).default(2),
    horizonDays: z.number().int().min(1).max(730).default(90),
    requiresApproval: z.boolean().default(true),
    depositCents: centsSchema.nullable().optional(),
    priceCents: centsSchema.nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

export const availabilityRuleSchema = z
  .object({
    bookingServiceId: uuidSchema.nullable().optional(),
    teamMemberId: uuidSchema.nullable().optional(),
    dayOfWeek: z.number().int().min(0).max(6),
    startsAt: timeSchema,
    endsAt: timeSchema,
    slotIntervalMinutes: z.number().int().min(5).max(240).default(30),
    capacity: z.number().int().min(1).max(500).nullable().optional(),
    validFrom: isoDateSchema.nullable().optional(),
    validUntil: isoDateSchema.nullable().optional(),
  })
  .strict()
  .refine((data) => data.endsAt > data.startsAt, {
    message: 'L heure de fin doit suivre l heure de debut.',
    path: ['endsAt'],
  });

/** Demande de reservation depuis un site public. */
export const publicBookingSchema = z
  .object({
    bookingServiceId: uuidSchema.optional(),
    teamMemberId: uuidSchema.optional(),
    startsAt: z.string().datetime({ offset: true }),
    partySize: z.number().int().min(1).max(100).default(1),
    customerName: boundedText(2, 100, 'Votre nom'),
    customerEmail: emailSchema.optional().or(z.literal('')),
    customerPhone: phoneSchema.optional().or(z.literal('')),
    customerNote: optionalText(1000),
    acceptPrivacy: z.literal(true, {
      message: 'Vous devez accepter la politique de confidentialite.',
    }),
    website: honeypotSchema,
    elapsedMs: z.coerce.number().int().min(0).optional(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.customerEmail) || Boolean(data.customerPhone), {
    message: 'Indiquez au moins un e-mail ou un telephone.',
    path: ['customerEmail'],
  });

export const bookingStatusUpdateSchema = z
  .object({
    bookingId: uuidSchema,
    status: z.enum(['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']),
    internalNote: optionalText(1000),
    cancellationReason: optionalText(500),
  })
  .strict();

/* --- Catalogue produits -------------------------------------------------- */

export const productSchema = z
  .object({
    name: boundedText(1, 150, 'Le nom du produit'),
    slug: slugSchema.optional(),
    categoryId: uuidSchema.nullable().optional(),
    description: optionalText(600),
    longDescription: optionalText(8000),
    priceCents: centsSchema,
    compareAtPriceCents: centsSchema.nullable().optional(),
    vatRateBps: z.number().int().min(0).max(10_000).default(2000),
    sku: z.string().trim().max(60).optional().or(z.literal('')),
    trackInventory: z.boolean().default(false),
    stockQuantity: z.number().int().min(0).max(1_000_000).default(0),
    allowBackorder: z.boolean().default(false),
    weightGrams: z.number().int().min(0).max(1_000_000).nullable().optional(),
    images: z.array(uuidSchema).max(12).default([]),
    isVisible: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
  })
  .strict()
  .refine(
    (data) =>
      data.compareAtPriceCents == null || data.compareAtPriceCents > data.priceCents,
    {
      message: 'Le prix barre doit etre superieur au prix de vente.',
      path: ['compareAtPriceCents'],
    },
  );

export const productVariantSchema = z
  .object({
    productId: uuidSchema,
    name: boundedText(1, 100, 'Le nom de la variante'),
    sku: z.string().trim().max(60).optional().or(z.literal('')),
    options: z.record(z.string().max(40), z.string().max(80)).default({}),
    priceCents: centsSchema.nullable().optional(),
    stockQuantity: z.number().int().min(0).max(1_000_000).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

/** Panier soumis depuis un site public : quantites uniquement, jamais de prix. */
export const publicCartSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: uuidSchema,
          variantId: uuidSchema.optional(),
          quantity: z.number().int().min(1).max(99),
        }),
      )
      .min(1, 'Votre panier est vide.')
      .max(50),
    fulfillmentMethod: z.enum(['pickup', 'delivery', 'shipping', 'digital']).default('pickup'),
    customerName: boundedText(2, 100, 'Votre nom'),
    customerEmail: emailSchema,
    customerPhone: phoneSchema.optional().or(z.literal('')),
    shippingAddress: z
      .object({
        line1: boundedText(1, 120, 'L adresse'),
        line2: optionalText(120),
        postalCode: boundedText(2, 12, 'Le code postal'),
        city: boundedText(1, 80, 'La ville'),
        country: z.string().length(2).default('FR'),
      })
      .strict()
      .optional(),
    customerNote: optionalText(1000),
    acceptTerms: z.literal(true, { message: 'Vous devez accepter les conditions de vente.' }),
    website: honeypotSchema,
  })
  .strict()
  .refine(
    (data) =>
      data.fulfillmentMethod !== 'shipping' && data.fulfillmentMethod !== 'delivery'
        ? true
        : Boolean(data.shippingAddress),
    { message: 'Indiquez votre adresse de livraison.', path: ['shippingAddress'] },
  );

/* --- Immobilier et hebergement ------------------------------------------ */

export const propertySchema = z
  .object({
    title: boundedText(3, 150, 'Le titre'),
    slug: slugSchema.optional(),
    reference: optionalText(40),
    description: optionalText(8000),
    transactionKind: z.enum(['sale', 'rent', 'seasonal']).default('sale'),
    propertyKind: z
      .enum(['apartment', 'house', 'land', 'commercial', 'parking', 'building', 'other'])
      .default('apartment'),
    priceCents: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
    surfaceM2: z.number().min(1).max(100_000).nullable().optional(),
    landSurfaceM2: z.number().min(1).max(10_000_000).nullable().optional(),
    rooms: z.number().int().min(0).max(100).nullable().optional(),
    bedrooms: z.number().int().min(0).max(100).nullable().optional(),
    bathrooms: z.number().int().min(0).max(50).nullable().optional(),
    floor: z.number().int().min(-5).max(200).nullable().optional(),
    energyClass: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).nullable().optional(),
    ghgClass: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']).nullable().optional(),
    city: optionalText(80),
    postalCode: optionalText(12),
    features: z.array(z.string().max(40)).max(30).default([]),
    images: z.array(uuidSchema).max(30).default([]),
    status: z.enum(['available', 'under_offer', 'sold', 'rented', 'draft']).default('available'),
    isVisible: z.boolean().default(true),
  })
  .strict();

export const roomSchema = z
  .object({
    name: boundedText(1, 100, 'Le nom'),
    slug: slugSchema.optional(),
    description: optionalText(3000),
    capacity: z.number().int().min(1).max(50).default(2),
    bedConfiguration: optionalText(120),
    surfaceM2: z.number().min(1).max(1000).nullable().optional(),
    basePriceCents: centsSchema.nullable().optional(),
    amenities: z.array(z.string().max(40)).max(40).default([]),
    images: z.array(uuidSchema).max(20).default([]),
    quantity: z.number().int().min(1).max(500).default(1),
    isVisible: z.boolean().default(true),
  })
  .strict();

/* --- Formulaires publics ------------------------------------------------- */

export const formFieldSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,40}$/, 'Identifiant de champ invalide.'),
    label: boundedText(1, 80, 'Le libelle'),
    type: z.enum([
      'text', 'textarea', 'email', 'tel', 'number', 'date', 'time', 'datetime',
      'select', 'multiselect', 'radio', 'checkbox', 'file', 'hidden', 'consent',
    ]),
    placeholder: optionalText(120),
    helpText: optionalText(200),
    isRequired: z.boolean().default(false),
    options: z
      .array(z.object({ value: z.string().max(80), label: z.string().max(120) }))
      .max(50)
      .default([]),
  })
  .strict();

export const formDefinitionSchema = z
  .object({
    name: boundedText(1, 80, 'Le nom du formulaire'),
    slug: slugSchema,
    kind: z
      .enum(['contact', 'quote', 'reservation', 'newsletter', 'callback', 'application', 'custom'])
      .default('contact'),
    description: optionalText(400),
    successMessage: boundedText(5, 300, 'Le message de confirmation'),
    notifyEmails: z.array(emailSchema).max(5).default([]),
    requireCaptcha: z.boolean().default(false),
    isActive: z.boolean().default(true),
    fields: z.array(formFieldSchema).min(1, 'Ajoutez au moins un champ.').max(30),
  })
  .strict();

/**
 * Soumission publique. Le contenu est valide dynamiquement contre la
 * definition du formulaire : ce schema borne l enveloppe (taille, nombre de
 * champs) avant toute autre verification.
 */
export const publicSubmissionSchema = z
  .object({
    formSlug: slugSchema,
    values: z
      .record(
        z.string().max(40),
        z.union([z.string().max(10_000), z.array(z.string().max(200)).max(50), z.boolean()]),
      )
      .refine((v) => Object.keys(v).length <= 40, { message: 'Trop de champs.' }),
    website: honeypotSchema,
    elapsedMs: z.coerce.number().int().min(0).max(86_400_000).optional(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

export const contactSchema = z
  .object({
    firstName: optionalText(60),
    lastName: optionalText(60),
    email: emailSchema.optional().or(z.literal('')),
    phone: phoneSchema.optional().or(z.literal('')),
    company: optionalText(120),
    status: z.enum(['new', 'contacted', 'qualified', 'won', 'lost']).default('new'),
    tags: z.array(z.string().max(30)).max(20).default([]),
    notes: optionalText(4000),
  })
  .strict()
  .refine((data) => Boolean(data.email) || Boolean(data.phone) || Boolean(data.lastName), {
    message: 'Indiquez au moins un nom, un e-mail ou un telephone.',
    path: ['email'],
  });
