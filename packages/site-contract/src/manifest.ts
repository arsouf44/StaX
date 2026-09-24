import { z } from 'zod';
import { CONTRACT_LIMITS, CONTRACT_VERSION } from './constants';

/**
 * `stax.manifest.json` — le contrat d'edition d'UN site.
 *
 * Chaque site StaX est concu et developpe individuellement, dans son propre
 * depot. Son developpeur y declare, dans ce fichier, CE QUI EST MODIFIABLE par
 * le client apres la livraison — et rien d'autre : titres, textes, images,
 * horaires, pages, collections, formulaires. Le design, la mise en page, le
 * code et les integrations restent ceux qui ont ete developpes pour le client :
 * le manifeste ne decrit pas un site, il decrit une surface d'edition.
 *
 * StaX n'impose aucune structure de site. Deux sites peuvent avoir des
 * manifestes sans aucun point commun ; c'est le but.
 */

/* -------------------------------------------------------------------------- */
/*  Identifiants                                                               */
/* -------------------------------------------------------------------------- */

/** Page, section, groupe, collection : kebab-case, stable dans le temps. */
export const blockIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9-]{0,48}$/,
    'Identifiant attendu en minuscules : lettres, chiffres, tirets.',
  );

/** Champ : camelCase ou snake_case, stable dans le temps. */
export const fieldIdSchema = z
  .string()
  .regex(
    /^[a-z][a-zA-Z0-9_]{0,48}$/,
    'Identifiant de champ attendu : une lettre minuscule puis lettres, chiffres, _.',
  );

const labelSchema = z.string().trim().min(1).max(80);
const helpSchema = z.string().trim().max(300).optional();

/** Chemin de fichier DANS le depot : relatif, sans remontee. */
const repoPathSchema = z
  .string()
  .regex(/^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/, 'Chemin relatif au depot, sans « .. ».');

const localeSchema = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Code de langue attendu : fr, en, de-CH…');

/* -------------------------------------------------------------------------- */
/*  Champs                                                                     */
/* -------------------------------------------------------------------------- */

const common = {
  id: fieldIdSchema,
  label: labelSchema,
  help: helpSchema,
  required: z.boolean().optional(),
  /**
   * Traduisible. Par defaut, les champs textuels le sont (texte, texte riche,
   * lien, SEO) et les autres non (telephone, horaires, nombre…).
   */
  localized: z.boolean().optional(),
};

export const textFieldSchema = z
  .object({
    ...common,
    type: z.literal('text'),
    maxLength: z.number().int().min(1).max(CONTRACT_LIMITS.textMax).optional(),
    minLength: z.number().int().min(0).max(CONTRACT_LIMITS.textMax).optional(),
    multiline: z.boolean().optional(),
    placeholder: z.string().max(120).optional(),
  })
  .strict();

export const richTextFieldSchema = z
  .object({
    ...common,
    type: z.literal('richtext'),
    maxLength: z.number().int().min(1).max(CONTRACT_LIMITS.richTextMax).optional(),
    blocks: z
      .array(z.enum(['paragraph', 'heading', 'list', 'quote']))
      .min(1)
      .optional(),
    marks: z.array(z.enum(['bold', 'italic', 'link'])).optional(),
  })
  .strict();

const imageOptions = {
  /** Indication donnee au client (« 16:9 »), jamais un recadrage force. */
  aspectRatio: z
    .string()
    .regex(/^\d{1,2}:\d{1,2}$/)
    .optional(),
  minWidth: z.number().int().min(1).max(10000).optional(),
  /** Texte alternatif obligatoire (accessibilite). Vrai par defaut. */
  altRequired: z.boolean().optional(),
};

export const imageFieldSchema = z
  .object({ ...common, type: z.literal('image'), ...imageOptions })
  .strict();

export const galleryFieldSchema = z
  .object({
    ...common,
    type: z.literal('gallery'),
    ...imageOptions,
    min: z.number().int().min(0).max(CONTRACT_LIMITS.galleryImages).optional(),
    max: z.number().int().min(1).max(CONTRACT_LIMITS.galleryImages).optional(),
  })
  .strict();

export const linkFieldSchema = z
  .object({
    ...common,
    type: z.literal('link'),
    /** Autorise les liens vers d'autres sites (vrai par defaut). */
    allowExternal: z.boolean().optional(),
    labelMaxLength: z.number().int().min(1).max(120).optional(),
  })
  .strict();

export const urlFieldSchema = z
  .object({
    ...common,
    type: z.literal('url'),
    allowExternal: z.boolean().optional(),
    allowInternal: z.boolean().optional(),
  })
  .strict();

export const phoneFieldSchema = z.object({ ...common, type: z.literal('phone') }).strict();
export const emailFieldSchema = z.object({ ...common, type: z.literal('email') }).strict();

export const numberFieldSchema = z
  .object({
    ...common,
    type: z.literal('number'),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    integer: z.boolean().optional(),
    unit: z.string().max(20).optional(),
  })
  .strict();

export const booleanFieldSchema = z.object({ ...common, type: z.literal('boolean') }).strict();

export const selectFieldSchema = z
  .object({
    ...common,
    type: z.literal('select'),
    options: z
      .array(
        z
          .object({
            value: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
            label: labelSchema,
          })
          .strict(),
      )
      .min(1)
      .max(CONTRACT_LIMITS.selectOptions),
  })
  .strict();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ.');

export const dateFieldSchema = z
  .object({ ...common, type: z.literal('date'), min: isoDate.optional(), max: isoDate.optional() })
  .strict();

export const openingHoursFieldSchema = z
  .object({
    ...common,
    type: z.literal('opening_hours'),
    /** Fermetures et horaires exceptionnels (vrai par defaut). */
    exceptions: z.boolean().optional(),
  })
  .strict();

export const seoFieldSchema = z
  .object({
    ...common,
    type: z.literal('seo'),
    titleMax: z.number().int().min(20).max(120).optional(),
    descriptionMax: z.number().int().min(50).max(320).optional(),
    /** Image de partage (reseaux sociaux). */
    image: z.boolean().optional(),
  })
  .strict();

export const addressFieldSchema = z.object({ ...common, type: z.literal('address') }).strict();

export const navigationFieldSchema = z
  .object({
    ...common,
    type: z.literal('navigation'),
    maxItems: z.number().int().min(1).max(CONTRACT_LIMITS.navigationItems).optional(),
    /** 1 = liste simple, 2 = sous-menus. */
    maxDepth: z.union([z.literal(1), z.literal(2)]).optional(),
  })
  .strict();

/** Tous les champs « simples », utilisables aussi dans une liste repetable. */
export const simpleFieldSchema = z.discriminatedUnion('type', [
  textFieldSchema,
  richTextFieldSchema,
  imageFieldSchema,
  galleryFieldSchema,
  linkFieldSchema,
  urlFieldSchema,
  phoneFieldSchema,
  emailFieldSchema,
  numberFieldSchema,
  booleanFieldSchema,
  selectFieldSchema,
  dateFieldSchema,
  openingHoursFieldSchema,
  seoFieldSchema,
  addressFieldSchema,
]);

/**
 * Liste repetable : membres d'une equipe, questions frequentes, temoignages,
 * plats d'une carte. Ses elements portent un identifiant stable (`_id`), pour
 * que la preview et l'historique suivent un element meme deplace.
 */
export const repeaterFieldSchema = z
  .object({
    ...common,
    type: z.literal('repeater'),
    itemLabel: labelSchema.optional(),
    min: z.number().int().min(0).max(CONTRACT_LIMITS.repeaterItems).optional(),
    max: z.number().int().min(1).max(CONTRACT_LIMITS.repeaterItems).optional(),
    fields: z.array(simpleFieldSchema).min(1).max(20),
  })
  .strict();

export const fieldSchema = z.discriminatedUnion('type', [
  textFieldSchema,
  richTextFieldSchema,
  imageFieldSchema,
  galleryFieldSchema,
  linkFieldSchema,
  urlFieldSchema,
  phoneFieldSchema,
  emailFieldSchema,
  numberFieldSchema,
  booleanFieldSchema,
  selectFieldSchema,
  dateFieldSchema,
  openingHoursFieldSchema,
  seoFieldSchema,
  addressFieldSchema,
  navigationFieldSchema,
  repeaterFieldSchema,
]);

export type SimpleFieldDefinition = z.infer<typeof simpleFieldSchema>;
export type FieldDefinition = z.infer<typeof fieldSchema>;
export type FieldType = FieldDefinition['type'];
export type RepeaterFieldDefinition = z.infer<typeof repeaterFieldSchema>;

/** Types lisibles, pour la documentation et les messages. */
export const FIELD_TYPES: readonly FieldType[] = [
  'text',
  'richtext',
  'image',
  'gallery',
  'link',
  'url',
  'phone',
  'email',
  'number',
  'boolean',
  'select',
  'date',
  'opening_hours',
  'seo',
  'address',
  'navigation',
  'repeater',
];

/* -------------------------------------------------------------------------- */
/*  Structure : groupes, pages, sections, collections                         */
/* -------------------------------------------------------------------------- */

const fieldsArray = z.array(fieldSchema).min(1).max(CONTRACT_LIMITS.fieldsPerSection);

export const groupSchema = z
  .object({
    id: blockIdSchema,
    label: labelSchema,
    help: helpSchema,
    fields: fieldsArray,
  })
  .strict();

export const sectionSchema = groupSchema;

export const pageSchema = z
  .object({
    id: blockIdSchema,
    label: labelSchema,
    /** Adresse de la page sur le site : sert a l'apercu et au plan de l'editeur. */
    path: z
      .string()
      .regex(/^\/([a-z0-9][a-z0-9-/]*)?$/, 'Chemin attendu : /, /contact, /nos-services…'),
    help: helpSchema,
    /** La page expose un titre et une description pour les moteurs de recherche. */
    seo: z.boolean().optional(),
    sections: z.array(sectionSchema).max(CONTRACT_LIMITS.sectionsPerPage),
  })
  .strict();

export const collectionSchema = z
  .object({
    id: blockIdSchema,
    label: labelSchema,
    itemLabel: labelSchema,
    help: helpSchema,
    /** `articles` : actualites datees. `entries` : realisations, fiches, biens… */
    kind: z.enum(['articles', 'entries']).optional(),
    /** Si les elements ont leur propre page : `/actualites/{slug}`. */
    route: z
      .string()
      .regex(/^\/[a-z0-9-/]*\{slug\}[a-z0-9-/]*$/, 'Route attendue : /actualites/{slug}')
      .optional(),
    /** Champ texte dont est derive l'adresse (slug) d'un element. */
    slugFrom: fieldIdSchema.optional(),
    min: z.number().int().min(0).max(CONTRACT_LIMITS.collectionItems).optional(),
    max: z.number().int().min(1).max(CONTRACT_LIMITS.collectionItems).optional(),
    fields: fieldsArray,
  })
  .strict();

/* -------------------------------------------------------------------------- */
/*  Formulaires : recus dans la messagerie StaX du client                      */
/* -------------------------------------------------------------------------- */

export const FORM_FIELD_BASIC_TYPES = ['text', 'textarea', 'email', 'tel', 'consent'] as const;
export const FORM_FIELD_ADVANCED_TYPES = [
  'select',
  'multiselect',
  'radio',
  'checkbox',
  'number',
  'date',
  'time',
] as const;

export const formFieldSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/, 'Nom de champ : minuscules, chiffres, _.'),
    label: labelSchema,
    type: z.enum([...FORM_FIELD_BASIC_TYPES, ...FORM_FIELD_ADVANCED_TYPES]),
    required: z.boolean().optional(),
    placeholder: z.string().max(120).optional(),
    help: helpSchema,
    options: z
      .array(z.object({ value: z.string().min(1).max(60), label: labelSchema }).strict())
      .max(CONTRACT_LIMITS.selectOptions)
      .optional(),
  })
  .strict();

export const formSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/),
    label: labelSchema,
    kind: z
      .enum(['contact', 'quote', 'reservation', 'newsletter', 'callback', 'application', 'custom'])
      .optional(),
    successMessage: z.string().trim().max(300).optional(),
    fields: z.array(formFieldSchema).min(1).max(CONTRACT_LIMITS.formFields),
  })
  .strict();

/** Modules StaX que le code du site utilise, via l'API des sites. */
export const SITE_MODULES = [
  'contact',
  'booking',
  'products',
  'orders',
  'payments',
  'customer-accounts',
  'donations',
  'newsletter',
] as const;
export type SiteModule = (typeof SITE_MODULES)[number];

/* -------------------------------------------------------------------------- */
/*  Manifeste                                                                  */
/* -------------------------------------------------------------------------- */

export const manifestSchema = z
  .object({
    $schema: z.string().url().optional(),
    contract: z.literal(CONTRACT_VERSION),
    site: z
      .object({
        name: z.string().trim().min(1).max(120),
        locales: z.array(localeSchema).min(1).max(CONTRACT_LIMITS.locales),
        defaultLocale: localeSchema,
      })
      .strict(),
    content: z
      .object({
        /** Fichier ou StaX ecrit le contenu publie. */
        file: repoPathSchema.refine((path) => path.endsWith('.json'), 'Fichier .json attendu.'),
        /** Dossier du depot ou StaX depose les images envoyees par le client. */
        mediaDir: repoPathSchema,
        /** Adresse publique de ce dossier sur le site (« /media/stax »). */
        mediaUrl: z
          .string()
          .regex(/^\/[A-Za-z0-9._/-]{0,120}$/, 'Chemin public attendu : /media/stax'),
      })
      .strict(),
    preview: z
      .object({
        /** Le site inclut le pont d'apercu StaX dans ses builds d'apercu. */
        bridge: z.boolean(),
      })
      .strict()
      .optional(),
    globals: z.array(groupSchema).max(CONTRACT_LIMITS.globals).optional(),
    pages: z.array(pageSchema).min(1).max(CONTRACT_LIMITS.pages),
    collections: z.array(collectionSchema).max(CONTRACT_LIMITS.collections).optional(),
    forms: z.array(formSchema).max(CONTRACT_LIMITS.forms).optional(),
    modules: z.array(z.enum(SITE_MODULES)).optional(),
    integrations: z
      .object({
        /** Le site envoie sa mesure d'audience a StaX (sans cookie). */
        analytics: z.boolean().optional(),
        customerAccounts: z
          .object({ loginPath: z.string().regex(/^\/[a-z0-9-/]*$/) })
          .strict()
          .optional(),
        orderStatusPath: z
          .string()
          .regex(/^\/[a-z0-9-/]*$/)
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (!manifest.site.locales.includes(manifest.site.defaultLocale)) {
      context.addIssue({
        code: 'custom',
        path: ['site', 'defaultLocale'],
        message: 'La langue par defaut doit figurer dans la liste des langues.',
      });
    }

    const unique = (values: string[], path: (string | number)[], what: string) => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value)) {
          context.addIssue({
            code: 'custom',
            path: [...path, index],
            message: `${what} « ${value} » est declare deux fois.`,
          });
        }
        seen.add(value);
      });
    };

    unique(
      manifest.pages.map((page) => page.id),
      ['pages'],
      'La page',
    );
    unique(
      manifest.pages.map((page) => page.path),
      ['pages'],
      'Le chemin',
    );
    unique(
      (manifest.globals ?? []).map((group) => group.id),
      ['globals'],
      'Le groupe',
    );
    unique(
      (manifest.collections ?? []).map((collection) => collection.id),
      ['collections'],
      'La collection',
    );
    unique(
      (manifest.forms ?? []).map((form) => form.slug),
      ['forms'],
      'Le formulaire',
    );

    const checkFields = (fields: readonly FieldDefinition[], path: (string | number)[]) => {
      unique(
        fields.map((field) => field.id),
        [...path, 'fields'],
        'Le champ',
      );
      fields.forEach((field, index) => {
        if (field.type === 'repeater') {
          unique(
            field.fields.map((sub) => sub.id),
            [...path, 'fields', index, 'fields'],
            'Le champ',
          );
          if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
            context.addIssue({
              code: 'custom',
              path: [...path, 'fields', index],
              message: 'min doit etre inferieur ou egal a max.',
            });
          }
        }
        if (field.type === 'number' && field.min !== undefined && field.max !== undefined) {
          if (field.min > field.max) {
            context.addIssue({
              code: 'custom',
              path: [...path, 'fields', index],
              message: 'min doit etre inferieur ou egal a max.',
            });
          }
        }
      });
    };

    manifest.pages.forEach((page, pageIndex) => {
      unique(
        page.sections.map((section) => section.id),
        ['pages', pageIndex, 'sections'],
        'La section',
      );
      page.sections.forEach((section, sectionIndex) =>
        checkFields(section.fields, ['pages', pageIndex, 'sections', sectionIndex]),
      );
    });
    (manifest.globals ?? []).forEach((group, index) =>
      checkFields(group.fields, ['globals', index]),
    );
    (manifest.collections ?? []).forEach((collection, index) => {
      checkFields(collection.fields, ['collections', index]);
      if (collection.slugFrom) {
        const source = collection.fields.find((field) => field.id === collection.slugFrom);
        if (!source || source.type !== 'text') {
          context.addIssue({
            code: 'custom',
            path: ['collections', index, 'slugFrom'],
            message: 'slugFrom doit designer un champ texte de la collection.',
          });
        }
      }
      if (collection.route && !collection.slugFrom) {
        context.addIssue({
          code: 'custom',
          path: ['collections', index, 'route'],
          message: 'Une collection avec des pages (route) doit indiquer slugFrom.',
        });
      }
    });

    (manifest.forms ?? []).forEach((form, formIndex) => {
      unique(
        form.fields.map((field) => field.name),
        ['forms', formIndex, 'fields'],
        'Le champ',
      );
      form.fields.forEach((field, fieldIndex) => {
        const needsOptions =
          field.type === 'select' || field.type === 'multiselect' || field.type === 'radio';
        if (needsOptions && (!field.options || field.options.length === 0)) {
          context.addIssue({
            code: 'custom',
            path: ['forms', formIndex, 'fields', fieldIndex, 'options'],
            message: 'Une liste de choix doit declarer ses options.',
          });
        }
      });
    });

    const modules = new Set(manifest.modules ?? []);
    if ((manifest.forms?.length ?? 0) > 0 && !modules.has('contact')) {
      context.addIssue({
        code: 'custom',
        path: ['modules'],
        message: 'Des formulaires sont declares : ajoutez le module « contact ».',
      });
    }
    if (modules.has('customer-accounts') && !manifest.integrations?.customerAccounts) {
      context.addIssue({
        code: 'custom',
        path: ['integrations', 'customerAccounts'],
        message: 'Le module comptes clients exige integrations.customerAccounts.loginPath.',
      });
    }
  });

export type SiteManifest = z.infer<typeof manifestSchema>;
export type ManifestPage = z.infer<typeof pageSchema>;
export type ManifestSection = z.infer<typeof sectionSchema>;
export type ManifestGroup = z.infer<typeof groupSchema>;
export type ManifestCollection = z.infer<typeof collectionSchema>;
export type ManifestForm = z.infer<typeof formSchema>;
export type ManifestFormField = z.infer<typeof formFieldSchema>;

/* -------------------------------------------------------------------------- */
/*  Lecture                                                                    */
/* -------------------------------------------------------------------------- */

export interface ContractIssue {
  /** Chemin lisible : `pages[0].sections[1].fields[2].maxLength`. */
  path: string;
  message: string;
}

export interface ManifestSummary {
  pages: number;
  sections: number;
  fields: number;
  locales: number;
  forms: number;
  collections: number;
  advancedForms: boolean;
  modules: SiteModule[];
}

export type ManifestParseResult =
  | { ok: true; manifest: SiteManifest; summary: ManifestSummary; warnings: ContractIssue[] }
  | { ok: false; errors: ContractIssue[]; contractVersion: number | null };

export function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, segment) => {
    if (typeof segment === 'number') return `${out}[${segment}]`;
    const key = String(segment);
    return out ? `${out}.${key}` : key;
  }, '');
}

function countFields(fields: readonly FieldDefinition[]): number {
  return fields.reduce(
    (total, field) => total + 1 + (field.type === 'repeater' ? field.fields.length : 0),
    0,
  );
}

export function summarizeManifest(manifest: SiteManifest): ManifestSummary {
  const sections = manifest.pages.reduce((total, page) => total + page.sections.length, 0);
  const fields =
    manifest.pages.reduce(
      (total, page) =>
        total + page.sections.reduce((sum, section) => sum + countFields(section.fields), 0),
      0,
    ) +
    (manifest.globals ?? []).reduce((total, group) => total + countFields(group.fields), 0) +
    (manifest.collections ?? []).reduce((total, col) => total + countFields(col.fields), 0);

  const advancedTypes = new Set<string>(FORM_FIELD_ADVANCED_TYPES);
  // Le NOMBRE de formulaires releve du quota `max_forms` ; « avances » designe
  // les types de champs (listes de choix, dates, nombres…).
  const advancedForms = (manifest.forms ?? []).some((form) =>
    form.fields.some((field) => advancedTypes.has(field.type)),
  );

  return {
    pages: manifest.pages.length,
    sections,
    fields,
    locales: manifest.site.locales.length,
    forms: manifest.forms?.length ?? 0,
    collections: manifest.collections?.length ?? 0,
    advancedForms,
    modules: [...new Set(manifest.modules ?? [])],
  };
}

/** Lit et valide un manifeste (objet deja parse, ou texte JSON brut). */
export function parseManifest(input: unknown): ManifestParseResult {
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      return {
        ok: false,
        contractVersion: null,
        errors: [{ path: '', message: 'Le fichier n’est pas un JSON valide.' }],
      };
    }
  }

  const declared =
    raw !== null && typeof raw === 'object' && 'contract' in raw
      ? Number((raw as { contract: unknown }).contract)
      : null;

  if (declared !== null && Number.isFinite(declared) && declared !== CONTRACT_VERSION) {
    return {
      ok: false,
      contractVersion: declared,
      errors: [
        {
          path: 'contract',
          message: `Version de contrat ${declared} inconnue : cette version de StaX lit la version ${CONTRACT_VERSION}.`,
        },
      ],
    };
  }

  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      contractVersion: declared,
      errors: parsed.error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: issue.message,
      })),
    };
  }

  const manifest = parsed.data;
  const warnings: ContractIssue[] = [];
  if (!manifest.preview?.bridge) {
    warnings.push({
      path: 'preview.bridge',
      message:
        'Le pont d’aperçu n’est pas déclaré : le client verra l’aperçu, mais sans pouvoir cliquer sur un élément pour le modifier.',
    });
  }
  if (!manifest.integrations?.analytics) {
    warnings.push({
      path: 'integrations.analytics',
      message:
        'La mesure d’audience StaX n’est pas déclarée : les statistiques du client resteront vides.',
    });
  }
  return { ok: true, manifest, summary: summarizeManifest(manifest), warnings };
}

/* -------------------------------------------------------------------------- */
/*  Parcours                                                                   */
/* -------------------------------------------------------------------------- */

/** Le champ est-il traduisible, compte tenu de son type et du manifeste ? */
export function isLocalized(field: FieldDefinition, manifest: SiteManifest): boolean {
  if (manifest.site.locales.length < 2) return false;
  if (field.localized !== undefined) return field.localized;
  return (
    field.type === 'text' ||
    field.type === 'richtext' ||
    field.type === 'link' ||
    field.type === 'seo' ||
    field.type === 'navigation'
  );
}

export function findPage(manifest: SiteManifest, pageId: string): ManifestPage | undefined {
  return manifest.pages.find((page) => page.id === pageId);
}
