import { CONTRACT_LIMITS } from './constants';
import type { FieldDefinition, ManifestCollection, ManifestPage, SiteManifest } from './manifest';
import { isLocalized } from './manifest';
import {
  isItemId,
  newItemId,
  validateFieldValue,
  type FieldValue,
  type ValidationContext,
  type ValueIssue,
} from './values';

/**
 * Contenu d'un site : les valeurs des zones que son manifeste declare
 * modifiables, et rien d'autre.
 *
 * C'est ce document que StaX conserve (brouillon, versions publiees) et qu'il
 * valide avant chaque publication. Une cle que le manifeste ne declare pas est
 * retiree : le client ne peut pas, meme par une requete forgee, ecrire dans une
 * zone que le developpeur du site n'a pas ouverte.
 */

export interface CollectionItem {
  /** Identifiant stable : suit l'element s'il est deplace ou renomme. */
  id: string;
  /** Adresse de la page de l'element, si la collection a des pages. */
  slug?: string;
  /** Element prepare mais pas encore affiche sur le site. */
  hidden?: boolean;
  values: Record<string, unknown>;
}

export interface PageContent {
  /** Titre et description pour les moteurs de recherche (si la page les expose). */
  seo?: unknown;
  sections: Record<string, Record<string, unknown>>;
}

export interface ContentDocument {
  globals: Record<string, Record<string, unknown>>;
  pages: Record<string, PageContent>;
  collections: Record<string, CollectionItem[]>;
}

/** Champ SEO implicite d'une page qui declare `seo: true`. */
export const PAGE_SEO_FIELD: FieldDefinition = {
  id: 'seo',
  label: 'Référencement',
  type: 'seo',
  image: true,
};

/* -------------------------------------------------------------------------- */
/*  Adresses : relient un element du site a son champ dans l'editeur            */
/* -------------------------------------------------------------------------- */

/**
 * Adresse d'un champ, reprise telle quelle dans le code du site
 * (`data-stax="pages.accueil.hero.titre"`) : un clic sur l'element dans
 * l'apercu ouvre ce champ dans l'editeur.
 *
 *  - `globals.<groupe>.<champ>`
 *  - `pages.<page>.<section>.<champ>`   (`pages.<page>._seo` pour le SEO)
 *  - `collections.<collection>.<element>.<champ>`
 */
export type FieldAddress =
  | { scope: 'global'; groupId: string; fieldId: string }
  | { scope: 'page'; pageId: string; sectionId: string; fieldId: string }
  | { scope: 'page-seo'; pageId: string }
  | { scope: 'collection'; collectionId: string; itemId: string; fieldId: string };

export function formatFieldAddress(address: FieldAddress): string {
  switch (address.scope) {
    case 'global':
      return `globals.${address.groupId}.${address.fieldId}`;
    case 'page':
      return `pages.${address.pageId}.${address.sectionId}.${address.fieldId}`;
    case 'page-seo':
      return `pages.${address.pageId}._seo`;
    case 'collection':
      return `collections.${address.collectionId}.${address.itemId}.${address.fieldId}`;
  }
}

const SEGMENT = /^[A-Za-z0-9_-]{1,60}$/;

/** Lit une adresse ; les segments au-dela du champ (sous-champ, langue) sont ignores. */
export function parseFieldAddress(value: string): FieldAddress | null {
  if (typeof value !== 'string' || value.length > 300) return null;
  const parts = (value.split('@')[0] ?? '').split('.');
  if (!parts.every((part) => SEGMENT.test(part))) return null;
  const [scope, a, b, c] = parts;
  if (scope === 'globals' && a && b) return { scope: 'global', groupId: a, fieldId: b };
  if (scope === 'pages' && a && b === '_seo') return { scope: 'page-seo', pageId: a };
  if (scope === 'pages' && a && b && c)
    return { scope: 'page', pageId: a, sectionId: b, fieldId: c };
  if (scope === 'collections' && a && b && c) {
    return { scope: 'collection', collectionId: a, itemId: b, fieldId: c };
  }
  return null;
}

/** Le champ designe par une adresse existe-t-il dans ce manifeste ? */
export function resolveFieldAddress(
  manifest: SiteManifest,
  address: FieldAddress,
): FieldDefinition | undefined {
  switch (address.scope) {
    case 'global':
      return manifest.globals
        ?.find((group) => group.id === address.groupId)
        ?.fields.find((field) => field.id === address.fieldId);
    case 'page':
      return manifest.pages
        .find((page) => page.id === address.pageId)
        ?.sections.find((section) => section.id === address.sectionId)
        ?.fields.find((field) => field.id === address.fieldId);
    case 'page-seo':
      return manifest.pages.find((page) => page.id === address.pageId)?.seo
        ? PAGE_SEO_FIELD
        : undefined;
    case 'collection':
      return manifest.collections
        ?.find((collection) => collection.id === address.collectionId)
        ?.fields.find((field) => field.id === address.fieldId);
  }
}

/* -------------------------------------------------------------------------- */
/*  Serialisation stable et empreinte                                          */
/* -------------------------------------------------------------------------- */

/** JSON a cles triees : deux contenus egaux ont exactement le meme texte. */
export function stableStringify(value: unknown, indent?: number): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(input as Record<string, unknown>).sort()) {
        const child = (input as Record<string, unknown>)[key];
        if (child !== undefined) out[key] = normalize(child);
      }
      return out;
    }
    return input;
  };
  return JSON.stringify(normalize(value), null, indent);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Empreinte d'un contenu, independante de l'ordre des cles. */
export function contentHash(content: ContentDocument): Promise<string> {
  return sha256Hex(stableStringify(content));
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/* -------------------------------------------------------------------------- */
/*  Contenu vide et adresses d'elements                                        */
/* -------------------------------------------------------------------------- */

export function emptyContent(manifest: SiteManifest): ContentDocument {
  const content: ContentDocument = { globals: {}, pages: {}, collections: {} };
  for (const group of manifest.globals ?? []) content.globals[group.id] = {};
  for (const page of manifest.pages) {
    content.pages[page.id] = { sections: Object.fromEntries(page.sections.map((s) => [s.id, {}])) };
  }
  for (const collection of manifest.collections ?? []) content.collections[collection.id] = [];
  return content;
}

/** « Coupe du monde 2026 ! » -> « coupe-du-monde-2026 ». */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

/** Chemin public d'un element de collection : `/actualites/{slug}` -> `/actualites/mon-article`. */
export function collectionItemPath(collection: ManifestCollection, slug: string): string | null {
  if (!collection.route) return null;
  return collection.route.replace('{slug}', slug);
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

export interface ContentValidation {
  /** Contenu normalise : seules les zones declarees, aux formats attendus. */
  content: ContentDocument;
  issues: ValueIssue[];
  errors: ValueIssue[];
  warnings: ValueIssue[];
  /** Adresses qui avaient une valeur et que le manifeste ne declare plus. */
  dropped: string[];
  ok: boolean;
}

export interface ValidateOptions {
  /** `draft` : on enregistre, meme incomplet. `publish` : tout doit etre en regle. */
  mode: 'draft' | 'publish';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function validateFields(
  fields: readonly FieldDefinition[],
  input: Record<string, unknown>,
  manifest: SiteManifest,
  context: ValidationContext,
  base: string,
  dropped: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const declared = new Set(fields.map((field) => field.id));
  for (const key of Object.keys(input)) {
    if (!declared.has(key) && input[key] !== undefined && input[key] !== null) {
      dropped.push(`${base}.${key}`);
    }
  }
  for (const field of fields) {
    const value = validateFieldValue(
      field,
      input[field.id],
      manifest,
      context,
      `${base}.${field.id}`,
    );
    if (value === undefined) continue;
    if (isRecord(value) && isLocalized(field, manifest) && Object.keys(value).length === 0)
      continue;
    out[field.id] = value;
  }
  return out;
}

function defaultLocaleText(
  field: FieldDefinition,
  value: unknown,
  manifest: SiteManifest,
): string | undefined {
  const resolved = isLocalized(field, manifest)
    ? record(value)[manifest.site.defaultLocale]
    : value;
  return typeof resolved === 'string' ? resolved : undefined;
}

function validatePage(
  page: ManifestPage,
  input: unknown,
  manifest: SiteManifest,
  context: ValidationContext,
  dropped: string[],
): PageContent {
  const raw = record(input);
  const rawSections = record(raw['sections']);
  const out: PageContent = { sections: {} };
  const declared = new Set(page.sections.map((section) => section.id));
  for (const key of Object.keys(rawSections)) {
    if (!declared.has(key)) dropped.push(`pages.${page.id}.${key}`);
  }
  for (const section of page.sections) {
    out.sections[section.id] = validateFields(
      section.fields,
      record(rawSections[section.id]),
      manifest,
      context,
      `pages.${page.id}.${section.id}`,
      dropped,
    );
  }
  if (page.seo) {
    const seo = validateFieldValue(
      PAGE_SEO_FIELD,
      raw['seo'],
      manifest,
      context,
      `pages.${page.id}._seo`,
    );
    if (seo !== undefined && !(isRecord(seo) && Object.keys(seo).length === 0)) out.seo = seo;
  } else if (raw['seo'] !== undefined) {
    dropped.push(`pages.${page.id}._seo`);
  }
  return out;
}

function validateCollection(
  collection: ManifestCollection,
  input: unknown,
  manifest: SiteManifest,
  context: ValidationContext,
  dropped: string[],
): CollectionItem[] {
  const base = `collections.${collection.id}`;
  if (input !== undefined && !Array.isArray(input)) {
    context.issues.push({ path: base, message: 'Liste attendue.', severity: 'error' });
    return [];
  }
  const rawItems = (input ?? []) as unknown[];
  const max = Math.min(
    collection.max ?? CONTRACT_LIMITS.collectionItems,
    CONTRACT_LIMITS.collectionItems,
  );
  if (rawItems.length > max) {
    context.issues.push({
      path: base,
      message: `${max} éléments au maximum dans « ${collection.label} ».`,
      severity: 'error',
    });
  }

  const items: CollectionItem[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const slugField = collection.slugFrom
    ? collection.fields.find((field) => field.id === collection.slugFrom)
    : undefined;

  for (const raw of rawItems.slice(0, max)) {
    if (!isRecord(raw)) {
      context.issues.push({ path: base, message: 'Élément illisible.', severity: 'error' });
      continue;
    }
    let id = isItemId(raw['id']) ? raw['id'] : newItemId();
    if (ids.has(id)) id = newItemId();
    ids.add(id);

    const itemBase = `${base}.${id}`;
    const values = validateFields(
      collection.fields,
      record(raw['values']),
      manifest,
      context,
      itemBase,
      dropped,
    );
    const item: CollectionItem = { id, values };
    if (raw['hidden'] === true) item.hidden = true;

    if (collection.route) {
      // L'adresse d'un element : saisie, sinon derivee de son titre ; toujours
      // unique dans la collection.
      const requested = typeof raw['slug'] === 'string' ? slugify(raw['slug']) : '';
      const derived = slugField
        ? slugify(defaultLocaleText(slugField, values[slugField.id], manifest) ?? '')
        : '';
      let slug = requested || derived;
      if (!slug) {
        if (context.mode === 'publish' && !item.hidden) {
          context.issues.push({
            path: `${itemBase}.slug`,
            message: 'Cet élément a besoin d’un titre pour avoir sa propre page.',
            severity: 'error',
          });
        }
      } else {
        const stem = slug;
        let suffix = 2;
        while (slugs.has(slug)) slug = `${stem}-${suffix++}`.slice(0, 80);
        slugs.add(slug);
        item.slug = slug;
      }
    }
    items.push(item);
  }

  const visible = items.filter((item) => !item.hidden).length;
  if (collection.min && visible < collection.min && context.mode === 'publish') {
    context.issues.push({
      path: base,
      message: `Au moins ${collection.min} éléments visibles dans « ${collection.label} ».`,
      severity: 'error',
    });
  }
  return items;
}

/**
 * Valide un contenu contre un manifeste, et le normalise.
 *
 * - Les zones non declarees sont retirees (et listees dans `dropped`).
 * - En mode `publish`, les champs obligatoires doivent etre remplis.
 * - La taille totale est bornee.
 */
export function validateContent(
  manifest: SiteManifest,
  input: unknown,
  options: ValidateOptions,
): ContentValidation {
  const context: ValidationContext = { path: '', mode: options.mode, issues: [] };
  const dropped: string[] = [];
  const raw = record(input);
  const content: ContentDocument = { globals: {}, pages: {}, collections: {} };

  const rawGlobals = record(raw['globals']);
  const groups = manifest.globals ?? [];
  for (const key of Object.keys(rawGlobals)) {
    if (!groups.some((group) => group.id === key)) dropped.push(`globals.${key}`);
  }
  for (const group of groups) {
    content.globals[group.id] = validateFields(
      group.fields,
      record(rawGlobals[group.id]),
      manifest,
      context,
      `globals.${group.id}`,
      dropped,
    );
  }

  const rawPages = record(raw['pages']);
  for (const key of Object.keys(rawPages)) {
    if (!manifest.pages.some((page) => page.id === key)) dropped.push(`pages.${key}`);
  }
  for (const page of manifest.pages) {
    content.pages[page.id] = validatePage(page, rawPages[page.id], manifest, context, dropped);
  }

  const rawCollections = record(raw['collections']);
  const collections = manifest.collections ?? [];
  for (const key of Object.keys(rawCollections)) {
    if (!collections.some((collection) => collection.id === key))
      dropped.push(`collections.${key}`);
  }
  for (const collection of collections) {
    content.collections[collection.id] = validateCollection(
      collection,
      rawCollections[collection.id],
      manifest,
      context,
      dropped,
    );
  }

  const size = byteLength(stableStringify(content));
  if (size > CONTRACT_LIMITS.contentBytes) {
    context.issues.push({
      path: '',
      message: `Contenu trop volumineux (${Math.round(size / 1024)} Ko pour ${Math.round(
        CONTRACT_LIMITS.contentBytes / 1024,
      )} Ko au maximum).`,
      severity: 'error',
    });
  }

  const errors = context.issues.filter((entry) => entry.severity === 'error');
  const warnings = context.issues.filter((entry) => entry.severity === 'warning');
  return { content, issues: context.issues, errors, warnings, dropped, ok: errors.length === 0 };
}

/* -------------------------------------------------------------------------- */
/*  Lecture d'une valeur                                                       */
/* -------------------------------------------------------------------------- */

/** Valeur d'un champ a une adresse (non resolue : peut etre par langue). */
export function readFieldValue(content: ContentDocument, address: FieldAddress): unknown {
  switch (address.scope) {
    case 'global':
      return content.globals[address.groupId]?.[address.fieldId];
    case 'page':
      return content.pages[address.pageId]?.sections[address.sectionId]?.[address.fieldId];
    case 'page-seo':
      return content.pages[address.pageId]?.seo;
    case 'collection':
      return content.collections[address.collectionId]?.find((item) => item.id === address.itemId)
        ?.values[address.fieldId];
  }
}

/** Ecrit une valeur a une adresse (copie ; l'original n'est pas modifie). */
export function writeFieldValue(
  content: ContentDocument,
  address: FieldAddress,
  value: unknown,
): ContentDocument {
  const next: ContentDocument = structuredClone(content);
  switch (address.scope) {
    case 'global':
      next.globals[address.groupId] = {
        ...(next.globals[address.groupId] ?? {}),
        [address.fieldId]: value,
      };
      break;
    case 'page': {
      const page = next.pages[address.pageId] ?? { sections: {} };
      page.sections[address.sectionId] = {
        ...(page.sections[address.sectionId] ?? {}),
        [address.fieldId]: value,
      };
      next.pages[address.pageId] = page;
      break;
    }
    case 'page-seo': {
      const page = next.pages[address.pageId] ?? { sections: {} };
      page.seo = value;
      next.pages[address.pageId] = page;
      break;
    }
    case 'collection': {
      const items = next.collections[address.collectionId] ?? [];
      const item = items.find((entry) => entry.id === address.itemId);
      if (item) item.values = { ...item.values, [address.fieldId]: value };
      next.collections[address.collectionId] = items;
      break;
    }
  }
  return next;
}

export type { FieldValue };
