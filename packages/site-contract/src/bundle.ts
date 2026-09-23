import { CONTENT_SCHEMA_URL, CONTRACT_VERSION } from './constants';
import {
  collectionItemPath,
  PAGE_SEO_FIELD,
  stableStringify,
  type CollectionItem,
  type ContentDocument,
} from './content';
import type { FieldDefinition, SimpleFieldDefinition, SiteManifest } from './manifest';
import { isLocalized } from './manifest';
import { richTextSchema, richTextToHtml, type RichText } from './richtext';
import { isItemId, normalizePhone, type ImageValue } from './values';

/**
 * Le « bundle » de contenu : le fichier que StaX ecrit dans le depot du site
 * a chaque publication (chemin `content.file` du manifeste), et que le code du
 * site lit a la construction.
 *
 *   {
 *     "contract": 1,
 *     "stax": { "site": "…", "version": 18, "release": "…", "preview": null },
 *     "defaultLocale": "fr",
 *     "locales": {
 *       "fr": {
 *         "globals":     { "<groupe>": { "<champ>": … } },
 *         "pages":       { "<page>": { "path": "/", "seo": …, "sections": { … } } },
 *         "collections": { "<collection>": [ { "_id", "_slug", "_path", "<champ>": … } ] }
 *       }
 *     }
 *   }
 *
 * Chaque langue est complete : un texte non traduit reprend la langue par
 * defaut. Chaque champ declare est present (`null` s'il est vide), pour que le
 * code du site n'ait pas a deviner. Le texte riche arrive en HTML deja sur, et
 * en blocs pour qui prefere les rendre lui-meme. Les images deposees par le
 * client sont ecrites dans `content.mediaDir` et referencees par leur adresse
 * publique (`content.mediaUrl`).
 *
 * La serialisation est stable (cles triees) : un meme contenu donne toujours
 * le meme fichier, donc des commits lisibles et des publications idempotentes.
 */

export interface MediaDescriptor {
  id: string;
  /** Nom du fichier dans le depot : `<id>.<extension>`. */
  fileName: string;
  width?: number | null;
  height?: number | null;
}

export interface BundleMeta {
  siteId: string;
  version: number | null;
  releaseId: string | null;
  /** Build d'apercu : revision du brouillon affichee. */
  preview?: { revision: number } | null;
}

export interface ResolvedImage {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface ContentBundle {
  $schema: string;
  contract: typeof CONTRACT_VERSION;
  stax: {
    site: string;
    version: number | null;
    release: string | null;
    preview: { revision: number } | null;
  };
  defaultLocale: string;
  locales: Record<string, LocaleContent>;
}

export interface LocaleContent {
  globals: Record<string, Record<string, unknown>>;
  pages: Record<
    string,
    { path: string; seo: unknown; sections: Record<string, Record<string, unknown>> }
  >;
  collections: Record<string, Array<Record<string, unknown>>>;
}

/* -------------------------------------------------------------------------- */
/*  Medias                                                                     */
/* -------------------------------------------------------------------------- */

const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

export function mediaExtension(mimeType: string): string | null {
  return MEDIA_EXTENSIONS[mimeType.toLowerCase()] ?? null;
}

export function mediaFileName(mediaId: string, mimeType: string): string | null {
  const extension = mediaExtension(mimeType);
  return extension ? `${mediaId.toLowerCase()}.${extension}` : null;
}

export function mediaRepoPath(manifest: SiteManifest, fileName: string): string {
  return `${manifest.content.mediaDir.replace(/\/+$/, '')}/${fileName}`;
}

export function mediaPublicUrl(manifest: SiteManifest, fileName: string): string {
  const base = manifest.content.mediaUrl.replace(/\/+$/, '');
  return `${base}/${fileName}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function collectFromImage(value: unknown, out: Set<string>) {
  if (isRecord(value) && typeof value['mediaId'] === 'string')
    out.add(value['mediaId'].toLowerCase());
}

function collectFromField(
  field: FieldDefinition | SimpleFieldDefinition,
  value: unknown,
  out: Set<string>,
) {
  if (value === undefined || value === null) return;
  switch (field.type) {
    case 'image':
      collectFromImage(value, out);
      return;
    case 'gallery':
      if (Array.isArray(value)) value.forEach((image) => collectFromImage(image, out));
      return;
    case 'seo':
      if (isRecord(value)) collectFromImage(value['image'], out);
      return;
    case 'repeater':
      if (Array.isArray(value)) {
        for (const item of value) {
          if (!isRecord(item)) continue;
          for (const sub of field.fields) collectFromField(sub, item[sub.id], out);
        }
      }
      return;
    default:
      return;
  }
}

function collectFromLocalized(
  field: FieldDefinition,
  value: unknown,
  manifest: SiteManifest,
  out: Set<string>,
) {
  if (isLocalized(field, manifest)) {
    if (isRecord(value))
      Object.values(value).forEach((entry) => collectFromField(field, entry, out));
  } else {
    collectFromField(field, value, out);
  }
}

/** Photos de la mediatheque utilisees par un contenu (a deposer dans le depot). */
export function collectMediaIds(manifest: SiteManifest, content: ContentDocument): string[] {
  const out = new Set<string>();
  for (const group of manifest.globals ?? []) {
    for (const field of group.fields) {
      collectFromLocalized(field, content.globals[group.id]?.[field.id], manifest, out);
    }
  }
  for (const page of manifest.pages) {
    const pageContent = content.pages[page.id];
    if (!pageContent) continue;
    if (page.seo) collectFromLocalized(PAGE_SEO_FIELD, pageContent.seo, manifest, out);
    for (const section of page.sections) {
      for (const field of section.fields) {
        collectFromLocalized(field, pageContent.sections[section.id]?.[field.id], manifest, out);
      }
    }
  }
  for (const collection of manifest.collections ?? []) {
    for (const item of content.collections[collection.id] ?? []) {
      if (item.hidden) continue;
      for (const field of collection.fields) {
        collectFromLocalized(field, item.values[field.id], manifest, out);
      }
    }
  }
  return [...out].sort();
}

/* -------------------------------------------------------------------------- */
/*  Resolution d'une valeur pour une langue                                    */
/* -------------------------------------------------------------------------- */

interface ResolveContext {
  manifest: SiteManifest;
  media: ReadonlyMap<string, MediaDescriptor>;
  missingMedia: Set<string>;
}

function resolveImage(value: unknown, context: ResolveContext): ResolvedImage | null {
  if (!isRecord(value)) return null;
  const image = value as unknown as ImageValue;
  const alt = typeof image.alt === 'string' ? image.alt : '';
  if (image.mediaId) {
    const media = context.media.get(image.mediaId.toLowerCase());
    if (!media) {
      context.missingMedia.add(image.mediaId.toLowerCase());
      return null;
    }
    return {
      src: mediaPublicUrl(context.manifest, media.fileName),
      alt,
      width: image.width ?? media.width ?? null,
      height: image.height ?? media.height ?? null,
    };
  }
  if (typeof image.src === 'string' && image.src) {
    return { src: image.src, alt, width: image.width ?? null, height: image.height ?? null };
  }
  return null;
}

function resolveSimple(
  field: SimpleFieldDefinition,
  value: unknown,
  context: ResolveContext,
): unknown {
  if (value === undefined || value === null) return null;
  switch (field.type) {
    case 'richtext': {
      const parsed = richTextSchema.safeParse(value);
      if (!parsed.success || parsed.data.length === 0) return null;
      return { html: richTextToHtml(parsed.data), blocks: parsed.data };
    }
    case 'image':
      return resolveImage(value, context);
    case 'gallery':
      return Array.isArray(value)
        ? value.map((image) => resolveImage(image, context)).filter((image) => image !== null)
        : [];
    case 'phone': {
      if (typeof value !== 'string' || !value) return null;
      const phone = normalizePhone(value);
      return phone ? { display: phone.display, href: phone.href } : null;
    }
    case 'seo': {
      if (!isRecord(value)) return null;
      return {
        title: typeof value['title'] === 'string' ? value['title'] : null,
        description: typeof value['description'] === 'string' ? value['description'] : null,
        image: field.image ? resolveImage(value['image'], context) : null,
      };
    }
    case 'text':
    case 'url':
    case 'email':
    case 'date':
    case 'select':
      return typeof value === 'string' && value !== '' ? value : null;
    default:
      return value;
  }
}

function resolveField(
  field: FieldDefinition,
  stored: unknown,
  locale: string,
  context: ResolveContext,
): unknown {
  let value = stored;
  if (isLocalized(field, context.manifest)) {
    const values = isRecord(stored) ? stored : {};
    const own = values[locale];
    const fallback = values[context.manifest.site.defaultLocale];
    value = own !== undefined && own !== null && own !== '' ? own : fallback;
  }
  if (value === undefined || value === null)
    return field.type === 'repeater' || field.type === 'navigation' || field.type === 'gallery'
      ? []
      : null;

  if (field.type === 'navigation') return Array.isArray(value) ? value : [];
  if (field.type === 'repeater') {
    if (!Array.isArray(value)) return [];
    return value.filter(isRecord).map((item) => {
      const out: Record<string, unknown> = { _id: item['_id'] };
      for (const sub of field.fields) out[sub.id] = resolveSimple(sub, item[sub.id], context);
      return out;
    });
  }
  return resolveSimple(field, value, context);
}

function resolveFields(
  fields: readonly FieldDefinition[],
  values: Record<string, unknown> | undefined,
  locale: string,
  context: ResolveContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields)
    out[field.id] = resolveField(field, values?.[field.id], locale, context);
  return out;
}

function resolveLocale(
  content: ContentDocument,
  locale: string,
  context: ResolveContext,
): LocaleContent {
  const { manifest } = context;
  const out: LocaleContent = { globals: {}, pages: {}, collections: {} };
  for (const group of manifest.globals ?? []) {
    out.globals[group.id] = resolveFields(group.fields, content.globals[group.id], locale, context);
  }
  for (const page of manifest.pages) {
    const pageContent = content.pages[page.id];
    const sections: Record<string, Record<string, unknown>> = {};
    for (const section of page.sections) {
      sections[section.id] = resolveFields(
        section.fields,
        pageContent?.sections[section.id],
        locale,
        context,
      );
    }
    out.pages[page.id] = {
      path: page.path,
      seo: page.seo ? resolveField(PAGE_SEO_FIELD, pageContent?.seo, locale, context) : null,
      sections,
    };
  }
  for (const collection of manifest.collections ?? []) {
    const items = (content.collections[collection.id] ?? []).filter((item) => !item.hidden);
    out.collections[collection.id] = items.map((item) => {
      const entry: Record<string, unknown> = {
        _id: item.id,
        _slug: item.slug ?? null,
        _path: item.slug ? collectionItemPath(collection, item.slug) : null,
      };
      Object.assign(entry, resolveFields(collection.fields, item.values, locale, context));
      return entry;
    });
  }
  return out;
}

export interface BuiltBundle {
  bundle: ContentBundle;
  /** Texte exact du fichier ecrit dans le depot. */
  json: string;
  /** Photos referencees mais introuvables : la publication doit etre refusee. */
  missingMedia: string[];
}

export function buildContentBundle(
  manifest: SiteManifest,
  content: ContentDocument,
  media: ReadonlyMap<string, MediaDescriptor>,
  meta: BundleMeta,
): BuiltBundle {
  const context: ResolveContext = { manifest, media, missingMedia: new Set() };
  const locales: Record<string, LocaleContent> = {};
  for (const locale of manifest.site.locales)
    locales[locale] = resolveLocale(content, locale, context);

  const bundle: ContentBundle = {
    $schema: CONTENT_SCHEMA_URL,
    contract: CONTRACT_VERSION,
    stax: {
      site: meta.siteId,
      version: meta.version,
      release: meta.releaseId,
      preview: meta.preview ?? null,
    },
    defaultLocale: manifest.site.defaultLocale,
    locales,
  };
  return {
    bundle,
    json: `${stableStringify(bundle, 2)}\n`,
    missingMedia: [...context.missingMedia].sort(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Lecture d'un bundle existant (import du contenu initial du site)           */
/* -------------------------------------------------------------------------- */

function unresolveImage(value: unknown): ImageValue | undefined {
  if (!isRecord(value) || typeof value['src'] !== 'string' || !value['src']) return undefined;
  const image: ImageValue = {
    src: value['src'],
    alt: typeof value['alt'] === 'string' ? value['alt'] : '',
  };
  if (typeof value['width'] === 'number') image.width = value['width'];
  if (typeof value['height'] === 'number') image.height = value['height'];
  return image;
}

function unresolveSimple(field: SimpleFieldDefinition, value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  switch (field.type) {
    case 'richtext': {
      if (isRecord(value) && Array.isArray(value['blocks'])) return value['blocks'] as RichText;
      return Array.isArray(value) ? value : undefined;
    }
    case 'image':
      return unresolveImage(value);
    case 'gallery':
      return Array.isArray(value) ? value.map(unresolveImage).filter(Boolean) : undefined;
    case 'phone':
      return isRecord(value) && typeof value['display'] === 'string' ? value['display'] : value;
    case 'seo': {
      if (!isRecord(value)) return undefined;
      const seo: Record<string, unknown> = {};
      if (typeof value['title'] === 'string') seo['title'] = value['title'];
      if (typeof value['description'] === 'string') seo['description'] = value['description'];
      const image = unresolveImage(value['image']);
      if (image) seo['image'] = image;
      return seo;
    }
    default:
      return value;
  }
}

function unresolveSingle(field: FieldDefinition, value: unknown): unknown {
  if (field.type === 'repeater') {
    if (!Array.isArray(value)) return undefined;
    return value.filter(isRecord).map((item) => {
      const out: Record<string, unknown> = { _id: isItemId(item['_id']) ? item['_id'] : undefined };
      for (const sub of field.fields) {
        const subValue = unresolveSimple(sub, item[sub.id]);
        if (subValue !== undefined) out[sub.id] = subValue;
      }
      return out;
    });
  }
  if (field.type === 'navigation') return Array.isArray(value) ? value : undefined;
  return unresolveSimple(field, value);
}

function unresolveField(
  field: FieldDefinition,
  manifest: SiteManifest,
  read: (locale: string) => unknown,
): unknown {
  if (!isLocalized(field, manifest))
    return unresolveSingle(field, read(manifest.site.defaultLocale));
  const out: Record<string, unknown> = {};
  for (const locale of manifest.site.locales) {
    const value = unresolveSingle(field, read(locale));
    if (value !== undefined) out[locale] = value;
  }
  return out;
}

/**
 * Reconstruit un contenu a partir d'un bundle deja present dans le depot :
 * c'est ainsi que StaX reprend les textes et images mis en place par le
 * developpeur du site, qui deviennent la version 1. Le resultat doit ensuite
 * passer par `validateContent`.
 */
export function contentFromBundle(manifest: SiteManifest, input: unknown): ContentDocument {
  const bundle = isRecord(input) ? input : {};
  const localesInput = isRecord(bundle['locales']) ? bundle['locales'] : {};
  const at = (locale: string): Record<string, unknown> =>
    isRecord(localesInput[locale]) ? (localesInput[locale] as Record<string, unknown>) : {};
  const dig = (value: unknown, ...keys: string[]): unknown =>
    keys.reduce<unknown>((current, key) => (isRecord(current) ? current[key] : undefined), value);

  const content: ContentDocument = { globals: {}, pages: {}, collections: {} };

  for (const group of manifest.globals ?? []) {
    const values: Record<string, unknown> = {};
    for (const field of group.fields) {
      const value = unresolveField(field, manifest, (locale) =>
        dig(at(locale), 'globals', group.id, field.id),
      );
      if (value !== undefined) values[field.id] = value;
    }
    content.globals[group.id] = values;
  }

  for (const page of manifest.pages) {
    const sections: Record<string, Record<string, unknown>> = {};
    for (const section of page.sections) {
      const values: Record<string, unknown> = {};
      for (const field of section.fields) {
        const value = unresolveField(field, manifest, (locale) =>
          dig(at(locale), 'pages', page.id, 'sections', section.id, field.id),
        );
        if (value !== undefined) values[field.id] = value;
      }
      sections[section.id] = values;
    }
    const pageContent: ContentDocument['pages'][string] = { sections };
    if (page.seo) {
      const seo = unresolveField(PAGE_SEO_FIELD, manifest, (locale) =>
        dig(at(locale), 'pages', page.id, 'seo'),
      );
      if (seo !== undefined) pageContent.seo = seo;
    }
    content.pages[page.id] = pageContent;
  }

  for (const collection of manifest.collections ?? []) {
    const defaultItems = dig(at(manifest.site.defaultLocale), 'collections', collection.id);
    const items: CollectionItem[] = [];
    if (Array.isArray(defaultItems)) {
      for (const [index, raw] of defaultItems.entries()) {
        if (!isRecord(raw)) continue;
        const id = isItemId(raw['_id']) ? raw['_id'] : undefined;
        const findIn = (locale: string): Record<string, unknown> | undefined => {
          const list = dig(at(locale), 'collections', collection.id);
          if (!Array.isArray(list)) return undefined;
          const match = id
            ? list.find((entry) => isRecord(entry) && entry['_id'] === id)
            : list[index];
          return isRecord(match) ? match : undefined;
        };
        const values: Record<string, unknown> = {};
        for (const field of collection.fields) {
          const value = unresolveField(field, manifest, (locale) => findIn(locale)?.[field.id]);
          if (value !== undefined) values[field.id] = value;
        }
        const item: CollectionItem = { id: id ?? '', values };
        if (typeof raw['_slug'] === 'string' && raw['_slug']) item.slug = raw['_slug'];
        items.push(item);
      }
    }
    content.collections[collection.id] = items;
  }

  return content;
}
