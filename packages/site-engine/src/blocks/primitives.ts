import { z } from 'zod';

/**
 * Schemas de blocs.
 *
 * Chaque bloc est une structure validee, jamais un objet JSON libre. Deux
 * consequences directes :
 *  - une injection ne peut pas survivre au cycle de vie du contenu, puisque
 *    aucun champ n est interprete comme du balisage ;
 *  - le contenu peut etre migre de facon sure grace au numero de version.
 */

/* --- Fragments reutilisables --------------------------------------------- */

export const mediaRefSchema = z.object({
  mediaId: z.string().uuid().nullable(),
  url: z.string().max(2048).nullable().optional(),
  alt: z.string().max(200).default(''),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const linkSchema = z.object({
  label: z.string().min(1).max(60),
  /** Chemin interne, ancre, mailto: ou tel: — jamais de javascript:. */
  href: z
    .string()
    .max(2048)
    .refine(
      (value) =>
        value.startsWith('/') ||
        value.startsWith('#') ||
        value.startsWith('https://') ||
        value.startsWith('mailto:') ||
        value.startsWith('tel:'),
      { message: 'Lien non autorise.' },
    ),
  style: z.enum(['primary', 'secondary', 'ghost', 'link']).default('primary'),
  external: z.boolean().default(false),
});

export const richParagraphSchema = z.object({
  kind: z.enum(['paragraph', 'heading', 'list', 'quote']).default('paragraph'),
  text: z.string().max(4000).default(''),
  items: z.array(z.string().max(500)).max(30).optional(),
  level: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
});

/** Reglages de presentation communs a tous les blocs. */
export const blockSettingsSchema = z.object({
  background: z.enum(['default', 'surface', 'contrast', 'accent', 'image', 'none']).default('default'),
  width: z.enum(['narrow', 'default', 'wide', 'full']).default('default'),
  spacing: z.enum(['none', 'compact', 'default', 'roomy']).default('default'),
  align: z.enum(['left', 'center']).default('left'),
  /** Animation d apparition. Desactivee si le visiteur demande moins d animations. */
  reveal: z.boolean().default(true),
  anchorId: z
    .string()
    .max(40)
    .regex(/^[a-z0-9-]*$/, 'Ancre invalide.')
    .optional(),
});

export type BlockSettings = z.infer<typeof blockSettingsSchema>;
