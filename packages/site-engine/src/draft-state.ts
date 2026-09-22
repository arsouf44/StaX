import { z } from 'zod';

/**
 * Etat complet du brouillon d un site.
 *
 * C est le format produit par `app.build_draft_state()` : il est conserve avec
 * chaque publication et chaque point de sauvegarde, et c est lui que l on
 * compare, verifie et restaure. Les noms de colonnes restent ceux de la base
 * (snake_case) : ce format ne sort jamais vers l interface telle quelle.
 */

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  version: z.number().default(1),
  props: z.record(z.string(), z.unknown()).default({}),
  settings: z.record(z.string(), z.unknown()).default({}),
  visible: z.boolean().default(true),
});

const linkSchema = z.object({ label: z.string().default(''), path: z.string().default('') });

const pageSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string().default(''),
  kind: z.string().default('standard'),
  locale: z.string().default('fr'),
  seo_title: z.string().nullable().optional(),
  seo_description: z.string().nullable().optional(),
  robots_indexable: z.boolean().default(true),
  is_visible_in_nav: z.boolean().default(true),
  sort_order: z.number().default(100),
  is_published: z.boolean().default(true),
  blocks: z.array(blockSchema).nullable().default([]),
});

export const draftStateSchema = z.object({
  format: z.number().default(1),
  theme: z
    .object({
      preset: z.string().nullable().optional(),
      tokens: z.record(z.string(), z.unknown()).nullable().optional(),
      font_heading: z.string().nullable().optional(),
      font_body: z.string().nullable().optional(),
      logo_media_id: z.string().nullable().optional(),
      favicon_media_id: z.string().nullable().optional(),
    })
    .passthrough()
    .default({}),
  settings: z
    .object({
      business_name: z.string().nullable().optional(),
      tagline: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      address_line1: z.string().nullable().optional(),
      postal_code: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      seo_title: z.string().nullable().optional(),
      seo_description: z.string().nullable().optional(),
      og_image_media_id: z.string().nullable().optional(),
      navigation: z
        .object({
          primary: z.array(linkSchema).default([]),
          footer: z.array(linkSchema).default([]),
        })
        .nullable()
        .optional(),
    })
    .passthrough()
    .default({}),
  pages: z.array(pageSchema).default([]),
});

export type DraftState = z.infer<typeof draftStateSchema>;
export type DraftPage = z.infer<typeof pageSchema>;
export type DraftBlock = z.infer<typeof blockSchema>;

/** Lecture tolerante : un etat illisible devient un etat vide, jamais une exception. */
export function parseDraftState(raw: unknown): DraftState {
  const parsed = draftStateSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  return draftStateSchema.parse({});
}
