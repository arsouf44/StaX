import { z } from 'zod';
import {
  boundedText,
  hexColorSchema,
  hostnameSchema,
  localeSchema,
  optionalText,
  pathSchema,
  slugSchema,
  timezoneSchema,
  uuidSchema,
} from './common';

/**
 * Site, pages, theme et domaines.
 *
 * Les polices et presets sont des enumerations fermees : un client ne peut
 * charger ni une police arbitraire, ni une feuille de style externe. Le theme
 * se limite a des jetons de design valides, jamais a du CSS libre.
 */

export const FONT_CHOICES = [
  'geist',
  'inter',
  'sora',
  'fraunces',
  'instrument-serif',
  'ibm-plex-sans',
] as const;

export const THEME_PRESETS = ['graphite', 'slate', 'nocturne', 'ember', 'lumen', 'forest'] as const;

export const fontSchema = z.enum(FONT_CHOICES);
export const presetSchema = z.enum(THEME_PRESETS);

export const themeTokensSchema = z
  .object({
    accent: hexColorSchema.optional(),
    background: hexColorSchema.optional(),
    foreground: hexColorSchema.optional(),
    surface: hexColorSchema.optional(),
    radius: z.enum(['none', 'sm', 'md', 'lg', 'full']).optional(),
    density: z.enum(['compact', 'comfortable', 'spacious']).optional(),
    buttonStyle: z.enum(['solid', 'outline', 'soft', 'pill']).optional(),
    headingScale: z.enum(['subtle', 'balanced', 'dramatic']).optional(),
  })
  .strict();

export const siteThemeSchema = z
  .object({
    preset: presetSchema,
    fontHeading: fontSchema,
    fontBody: fontSchema,
    tokens: themeTokensSchema.default({}),
    logoMediaId: uuidSchema.nullable().optional(),
    faviconMediaId: uuidSchema.nullable().optional(),
  })
  .strict();

export const navigationItemSchema = z
  .object({
    label: boundedText(1, 40, 'Le libelle'),
    // Lien interne uniquement dans la navigation : aucune redirection sortante
    // imposee aux visiteurs depuis le menu principal.
    path: pathSchema,
    children: z
      .array(
        z.object({
          label: boundedText(1, 40, 'Le libelle'),
          path: pathSchema,
        }),
      )
      .max(8)
      .optional(),
  })
  .strict();

export const navigationSchema = z
  .object({
    primary: z.array(navigationItemSchema).max(10),
    footer: z.array(navigationItemSchema).max(20),
  })
  .strict();

export const siteSettingsSchema = z
  .object({
    businessName: boundedText(1, 120, 'Le nom affiche'),
    tagline: optionalText(160),
    description: optionalText(600),
    email: z.string().email().optional().or(z.literal('')),
    phone: optionalText(30),
    addressLine1: optionalText(120),
    addressLine2: optionalText(120),
    postalCode: optionalText(12),
    city: optionalText(80),
    country: z.string().length(2).default('FR'),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    socialLinks: z
      .object({
        facebook: z.string().url().max(300).optional().or(z.literal('')),
        instagram: z.string().url().max(300).optional().or(z.literal('')),
        linkedin: z.string().url().max(300).optional().or(z.literal('')),
        x: z.string().url().max(300).optional().or(z.literal('')),
        youtube: z.string().url().max(300).optional().or(z.literal('')),
        tiktok: z.string().url().max(300).optional().or(z.literal('')),
      })
      .strict()
      .default({}),
    notificationEmails: z.array(z.string().email()).max(5).default([]),
    cookieBannerEnabled: z.boolean().default(true),
    analyticsEnabled: z.boolean().default(true),
  })
  .strict();

export const seoSettingsSchema = z
  .object({
    seoTitle: optionalText(70),
    seoDescription: optionalText(170),
    seoKeywords: z.array(z.string().max(40)).max(12).default([]),
    ogImageMediaId: uuidSchema.nullable().optional(),
    robotsIndexable: z.boolean().default(true),
    googleSiteVerification: z
      .string()
      .trim()
      .max(120)
      .regex(/^[A-Za-z0-9_-]*$/, 'Code de vérification invalide.')
      .optional()
      .or(z.literal('')),
  })
  .strict();

export const pageSchema = z
  .object({
    title: boundedText(1, 80, 'Le titre'),
    path: pathSchema,
    kind: z
      .enum([
        'home',
        'standard',
        'contact',
        'legal',
        'menu',
        'services',
        'products',
        'booking',
        'gallery',
        'team',
        'blog',
        'listing',
      ])
      .default('standard'),
    locale: localeSchema.default('fr'),
    seoTitle: optionalText(70),
    seoDescription: optionalText(170),
    robotsIndexable: z.boolean().default(true),
    showInNav: z.boolean().default(true),
    isPublished: z.boolean().default(true),
  })
  .strict();

export const reorderSchema = z
  .object({
    ids: z.array(uuidSchema).min(1).max(200),
  })
  .strict();

export const siteCreateSchema = z
  .object({
    organizationId: uuidSchema,
    name: boundedText(2, 120, 'Le nom du site'),
    subdomain: slugSchema,
    businessTypeSlug: slugSchema,
    templateSlug: slugSchema.optional(),
    timezone: timezoneSchema.default('Europe/Paris'),
  })
  .strict();

export const domainAttachSchema = z
  .object({
    siteId: uuidSchema,
    hostname: hostnameSchema,
    makePrimary: z.boolean().default(false),
  })
  .strict()
  .refine((data) => !data.hostname.endsWith('.local') && !data.hostname.endsWith('.localhost'), {
    message: 'Ce nom de domaine ne peut pas être utilise.',
    path: ['hostname'],
  });

export const redirectSchema = z
  .object({
    sourcePath: pathSchema,
    targetPath: z.string().trim().max(2048).min(1),
    statusCode: z
      .union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)])
      .default(301),
  })
  .strict()
  .refine((data) => data.sourcePath !== data.targetPath, {
    message: 'La source et la destination doivent être differentes.',
    path: ['targetPath'],
  });

export const publishSchema = z
  .object({
    siteId: uuidSchema,
    label: optionalText(120),
    scheduledFor: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export const rollbackSchema = z
  .object({
    siteId: uuidSchema,
    versionId: uuidSchema,
  })
  .strict();
