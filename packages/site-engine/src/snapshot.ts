import { z } from 'zod';
import { blockSettingsSchema } from './blocks/primitives';
import { getBlockDefinition, type ParsedBlock } from './blocks/registry';
import { parseLegalIdentity, type LegalIdentity } from './legal';

/**
 * Snapshot publie.
 *
 * C est la SEULE source lue par le runtime public. Il est construit par
 * app.build_site_snapshot() en base, puis fige : le brouillon peut evoluer
 * librement sans affecter ce qui est en ligne.
 *
 * Le snapshot est revalide ici a la lecture. Un bloc invalide est ignore,
 * jamais rendu tel quel : mieux vaut une section manquante qu une page cassee
 * ou une injection affichee.
 */

export const snapshotPageSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  kind: z.string().default('standard'),
  locale: z.string().default('fr'),
  seoTitle: z.string().nullable().optional(),
  seoDescription: z.string().nullable().optional(),
  robotsIndexable: z.boolean().default(true),
  showInNav: z.boolean().default(true),
  sortOrder: z.number().default(100),
  blocks: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        version: z.number().default(1),
        props: z.record(z.string(), z.unknown()).default({}),
        settings: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .default([]),
});

export const snapshotSchema = z.object({
  site: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    businessType: z.string().nullable().optional(),
    planSlug: z.string().nullable().optional(),
    defaultLocale: z.string().default('fr'),
    enabledLocales: z.array(z.string()).default(['fr']),
    timezone: z.string().default('Europe/Paris'),
    isDemo: z.boolean().default(false),
  }),
  theme: z
    .object({
      preset: z.string().default('graphite'),
      tokens: z.record(z.string(), z.unknown()).default({}),
      fontHeading: z.string().default('geist'),
      fontBody: z.string().default('geist'),
      logoUrl: z.string().nullable().optional(),
      faviconUrl: z.string().nullable().optional(),
    })
    .default({
      preset: 'graphite',
      tokens: {},
      fontHeading: 'geist',
      fontBody: 'geist',
    }),
  settings: z.record(z.string(), z.unknown()).default({}),
  pages: z.array(snapshotPageSchema).default([]),
  redirects: z
    .array(z.object({ from: z.string(), to: z.string(), status: z.number().default(301) }))
    .default([]),
  generatedAt: z.string().optional(),
});

export type SiteSnapshot = z.infer<typeof snapshotSchema>;
export type SnapshotPage = z.infer<typeof snapshotPageSchema>;

export interface RenderablePage {
  id: string;
  path: string;
  title: string;
  kind: string;
  locale: string;
  seoTitle: string | null;
  seoDescription: string | null;
  robotsIndexable: boolean;
  showInNav: boolean;
  blocks: ParsedBlock[];
  /** Blocs ecartes a la validation, exposes en developpement uniquement. */
  droppedBlocks: string[];
}

export interface ParsedSnapshot {
  snapshot: SiteSnapshot;
  pages: RenderablePage[];
  /** Index chemin -> page, pour une resolution en temps constant. */
  pagesByPath: Map<string, RenderablePage>;
  redirects: Map<string, { to: string; status: number }>;
  warnings: string[];
}

export function parseSnapshot(raw: unknown): ParsedSnapshot | null {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) return null;

  const warnings: string[] = [];
  const pages: RenderablePage[] = [];

  for (const page of parsed.data.pages) {
    const blocks: ParsedBlock[] = [];
    const dropped: string[] = [];

    for (const block of page.blocks) {
      const definition = getBlockDefinition(block.type);
      if (!definition) {
        dropped.push(block.type);
        warnings.push(`Bloc inconnu ignore : ${block.type} (page ${page.path})`);
        continue;
      }
      const props = definition.schema.safeParse(block.props);
      if (!props.success) {
        dropped.push(block.type);
        warnings.push(`Bloc invalide ignore : ${block.type} (page ${page.path})`);
        continue;
      }
      const settings = blockSettingsSchema.safeParse(block.settings);
      blocks.push({
        id: block.id,
        type: block.type,
        version: block.version,
        props: props.data as Record<string, unknown>,
        settings: settings.success ? settings.data : blockSettingsSchema.parse({}),
      });
    }

    pages.push({
      id: page.id,
      path: normalizePath(page.path),
      title: page.title,
      kind: page.kind,
      locale: page.locale,
      seoTitle: page.seoTitle ?? null,
      seoDescription: page.seoDescription ?? null,
      robotsIndexable: page.robotsIndexable,
      showInNav: page.showInNav,
      blocks,
      droppedBlocks: dropped,
    });
  }

  const pagesByPath = new Map(pages.map((page) => [page.path, page]));
  const redirects = new Map(
    parsed.data.redirects.map((r) => [normalizePath(r.from), { to: r.to, status: r.status }]),
  );

  return { snapshot: parsed.data, pages, pagesByPath, redirects, warnings };
}

/** Normalise un chemin : toujours prefixe par /, jamais suffixe par / (sauf racine). */
export function normalizePath(path: string): string {
  const value = path.trim().toLowerCase();
  const prefixed = value.startsWith('/') ? value : `/${value}`;
  if (prefixed === '/') return '/';
  return prefixed.replace(/\/+$/, '');
}

export interface SiteSettingsView {
  businessName: string;
  tagline: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  socialLinks: Record<string, string>;
  seoTitle: string | null;
  seoDescription: string | null;
  robotsIndexable: boolean;
  enabledModules: string[];
  navigation: { primary: NavLink[]; footer: NavLink[] };
  cookieBannerEnabled: boolean;
  analyticsEnabled: boolean;
  googleSiteVerification: string | null;
  /** Identite legale de l editeur du site (mentions obligatoires). */
  legalIdentity: LegalIdentity;
}

export interface NavLink {
  label: string;
  path: string;
  children?: NavLink[];
}

const navLinkSchema: z.ZodType<NavLink> = z.lazy(() =>
  z.object({
    label: z.string().max(60),
    path: z.string().max(300),
    children: z.array(navLinkSchema).max(8).optional(),
  }),
);

const settingsViewSchema = z.object({
  business_name: z.string().nullable().default(null),
  tagline: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  address_line1: z.string().nullable().default(null),
  address_line2: z.string().nullable().default(null),
  postal_code: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  country: z.string().default('FR'),
  latitude: z.coerce.number().nullable().default(null),
  longitude: z.coerce.number().nullable().default(null),
  social_links: z.record(z.string(), z.string()).default({}),
  seo_title: z.string().nullable().default(null),
  seo_description: z.string().nullable().default(null),
  robots_indexable: z.boolean().default(true),
  enabled_modules: z.array(z.string()).default([]),
  navigation: z
    .object({
      primary: z.array(navLinkSchema).default([]),
      footer: z.array(navLinkSchema).default([]),
    })
    .default({ primary: [], footer: [] }),
  cookie_banner_enabled: z.boolean().default(true),
  analytics_enabled: z.boolean().default(true),
  google_site_verification: z.string().nullable().default(null),
  legal_identity: z.unknown().optional(),
});

export function parseSiteSettings(raw: unknown, fallbackName: string): SiteSettingsView {
  const parsed = settingsViewSchema.safeParse(raw ?? {});
  const data = parsed.success ? parsed.data : settingsViewSchema.parse({});
  return {
    businessName: data.business_name ?? fallbackName,
    tagline: data.tagline,
    description: data.description,
    email: data.email,
    phone: data.phone,
    addressLine1: data.address_line1,
    addressLine2: data.address_line2,
    postalCode: data.postal_code,
    city: data.city,
    country: data.country,
    latitude: data.latitude,
    longitude: data.longitude,
    socialLinks: data.social_links,
    seoTitle: data.seo_title,
    seoDescription: data.seo_description,
    robotsIndexable: data.robots_indexable,
    enabledModules: data.enabled_modules,
    navigation: data.navigation,
    cookieBannerEnabled: data.cookie_banner_enabled,
    analyticsEnabled: data.analytics_enabled,
    googleSiteVerification: data.google_site_verification,
    legalIdentity: parseLegalIdentity(data.legal_identity),
  };
}
