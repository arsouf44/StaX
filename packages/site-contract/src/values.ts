import type { FieldDefinition, SimpleFieldDefinition, SiteManifest } from './manifest';
import { isLocalized } from './manifest';
import {
  isExternalHref,
  isSafeHref,
  richTextLength,
  richTextSchema,
  type RichText,
} from './richtext';
import { CONTRACT_LIMITS } from './constants';

/**
 * Valeurs des champs du contrat d'edition, et leur validation.
 *
 * La validation est faite ICI, une seule fois pour tous les chemins : l'editeur
 * l'utilise pour guider le client, et le serveur de publication la rejoue sur
 * le contenu exact qui part dans le depot — y compris si un brouillon a ete
 * ecrit par une voie inattendue. Une valeur qui ne passe pas ne part pas.
 */

/* -------------------------------------------------------------------------- */
/*  Formes des valeurs                                                         */
/* -------------------------------------------------------------------------- */

export interface ImageValue {
  /** Photo de la mediatheque StaX : deposee dans le depot a la publication. */
  mediaId?: string;
  /** Image deja presente dans le site (chemin public ou URL https). */
  src?: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface LinkValue {
  label: string;
  href: string;
}

export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  mon: 'Lundi',
  tue: 'Mardi',
  wed: 'Mercredi',
  thu: 'Jeudi',
  fri: 'Vendredi',
  sat: 'Samedi',
  sun: 'Dimanche',
};

export interface TimeSlot {
  open: string;
  close: string;
}

export interface OpeningHoursValue {
  /** Jour sans creneau = ferme. */
  week: Record<WeekDay, TimeSlot[]>;
  exceptions?: Array<{ date: string; closed: boolean; slots?: TimeSlot[]; note?: string }>;
  note?: string;
}

export interface SeoValue {
  title?: string;
  description?: string;
  image?: ImageValue;
}

export interface AddressValue {
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  country: string;
}

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  children?: NavigationItem[];
}

export type RepeaterItem = { _id: string } & Record<string, unknown>;

export type FieldValue =
  | string
  | number
  | boolean
  | RichText
  | ImageValue
  | ImageValue[]
  | LinkValue
  | OpeningHoursValue
  | SeoValue
  | AddressValue
  | NavigationItem[]
  | RepeaterItem[];

/* -------------------------------------------------------------------------- */
/*  Resultat                                                                   */
/* -------------------------------------------------------------------------- */

export interface ValueIssue {
  path: string;
  message: string;
  /** `error` bloque la publication ; `warning` informe seulement. */
  severity: 'error' | 'warning';
}

export interface ValidationContext {
  path: string;
  /** `publish` exige les champs obligatoires ; `draft` les tolere. */
  mode: 'draft' | 'publish';
  issues: ValueIssue[];
}

function issue(
  context: ValidationContext,
  path: string,
  message: string,
  severity: 'error' | 'warning' = 'error',
) {
  context.issues.push({ path, message, severity });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim().length === 0) ||
  (Array.isArray(value) && value.length === 0);

/** Identifiant stable d'un element de liste. */
export function isItemId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(value);
}

export function newItemId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 14);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/;
const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chemin d'une image deja presente dans le site, ou URL https. */
export function isSafeImageSrc(src: string): boolean {
  const value = src.trim();
  if (value.startsWith('/'))
    return !value.startsWith('//') && !value.includes('..') && value.length <= 400;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Telephone lisible : chiffres, espaces, +, points, tirets, parentheses. */
export function normalizePhone(value: string): { display: string; href: string } | null {
  const display = value.trim().replace(/\s+/g, ' ');
  if (!/^\+?[0-9 ().-]{6,30}$/.test(display)) return null;
  const digits = display.replace(/[^0-9+]/g, '');
  const count = digits.replace(/\D/g, '').length;
  if (count < 6 || count > 20) return null;
  // Numero francais national : 0X XX XX XX XX -> +33 X XX XX XX XX pour tel:.
  const href = digits.startsWith('+')
    ? `tel:${digits}`
    : /^0\d{9}$/.test(digits)
      ? `tel:+33${digits.slice(1)}`
      : `tel:${digits}`;
  return { display, href };
}

/* -------------------------------------------------------------------------- */
/*  Validation d'une valeur simple                                             */
/* -------------------------------------------------------------------------- */

function validateText(
  field: Extract<SimpleFieldDefinition, { type: 'text' }>,
  value: unknown,
  context: ValidationContext,
  path: string,
): string | undefined {
  if (typeof value !== 'string') {
    issue(context, path, 'Texte attendu.');
    return undefined;
  }
  const max = field.maxLength ?? (field.multiline ? 2000 : 300);
  let text = value.replace(/\r\n/g, '\n');
  if (!field.multiline) text = text.replace(/\n+/g, ' ');
  if (text.length > max) {
    issue(context, path, `${text.length} caractères pour ${max} au maximum.`);
    return undefined;
  }
  if (field.minLength && text.trim().length > 0 && text.trim().length < field.minLength) {
    issue(context, path, `Au moins ${field.minLength} caractères.`);
  }
  return text;
}

function validateImage(
  field: { altRequired?: boolean },
  value: unknown,
  context: ValidationContext,
  path: string,
): ImageValue | undefined {
  if (!isRecord(value)) {
    issue(context, path, 'Image attendue.');
    return undefined;
  }
  const mediaId = typeof value['mediaId'] === 'string' ? value['mediaId'] : undefined;
  const src = typeof value['src'] === 'string' ? value['src'] : undefined;
  if (mediaId && !MEDIA_ID.test(mediaId)) {
    issue(context, path, 'Photo inconnue.');
    return undefined;
  }
  if (!mediaId && !src) {
    issue(context, path, 'Choisissez une photo.');
    return undefined;
  }
  if (!mediaId && src && !isSafeImageSrc(src)) {
    issue(context, path, 'Adresse d’image refusée.');
    return undefined;
  }
  const alt = typeof value['alt'] === 'string' ? value['alt'].trim().slice(0, 300) : '';
  if (!alt && field.altRequired !== false) {
    issue(
      context,
      `${path}.alt`,
      'Décrivez l’image en quelques mots (utile aux personnes malvoyantes et au référencement).',
      context.mode === 'publish' ? 'error' : 'warning',
    );
  }
  const image: ImageValue = { alt };
  if (mediaId) image.mediaId = mediaId.toLowerCase();
  else if (src) image.src = src.trim();
  for (const key of ['width', 'height'] as const) {
    const dimension = value[key];
    if (
      typeof dimension === 'number' &&
      Number.isInteger(dimension) &&
      dimension > 0 &&
      dimension < 20000
    ) {
      image[key] = dimension;
    }
  }
  return image;
}

function validateLink(
  field: { allowExternal?: boolean; labelMaxLength?: number },
  value: unknown,
  context: ValidationContext,
  path: string,
): LinkValue | undefined {
  if (!isRecord(value)) {
    issue(context, path, 'Bouton attendu : un texte et une destination.');
    return undefined;
  }
  const label = typeof value['label'] === 'string' ? value['label'].trim() : '';
  const href = typeof value['href'] === 'string' ? value['href'].trim() : '';
  const max = field.labelMaxLength ?? 60;
  if (label.length > max) {
    issue(context, `${path}.label`, `${label.length} caractères pour ${max} au maximum.`);
    return undefined;
  }
  if (href && !isSafeHref(href, { allowExternal: field.allowExternal !== false })) {
    issue(
      context,
      `${path}.href`,
      field.allowExternal === false
        ? 'Choisissez une page du site.'
        : 'Destination invalide : une page du site, une adresse https, un e-mail ou un téléphone.',
    );
    return undefined;
  }
  if ((label && !href) || (!label && href)) {
    issue(
      context,
      path,
      'Un bouton a besoin d’un texte ET d’une destination.',
      context.mode === 'publish' ? 'error' : 'warning',
    );
  }
  return { label, href };
}

function validateOpeningHours(
  field: { exceptions?: boolean },
  value: unknown,
  context: ValidationContext,
  path: string,
): OpeningHoursValue | undefined {
  if (!isRecord(value) || !isRecord(value['week'])) {
    issue(context, path, 'Horaires attendus.');
    return undefined;
  }
  const weekInput = value['week'];
  const week = {} as Record<WeekDay, TimeSlot[]>;
  const slotsOf = (raw: unknown, slotPath: string): TimeSlot[] | null => {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || raw.length > 6) {
      issue(context, slotPath, 'Jusqu’à 6 créneaux par jour.');
      return null;
    }
    const slots: TimeSlot[] = [];
    for (const [index, slot] of raw.entries()) {
      if (
        !isRecord(slot) ||
        typeof slot['open'] !== 'string' ||
        typeof slot['close'] !== 'string'
      ) {
        issue(context, `${slotPath}[${index}]`, 'Créneau attendu : ouverture et fermeture.');
        return null;
      }
      if (!TIME.test(slot['open']) || !TIME.test(slot['close'])) {
        issue(context, `${slotPath}[${index}]`, 'Heure attendue au format HH:MM.');
        return null;
      }
      // La fermeture apres minuit est admise (bar, restaurant) : 18:00 -> 02:00.
      if (slot['open'] === slot['close']) {
        issue(context, `${slotPath}[${index}]`, 'L’ouverture et la fermeture sont identiques.');
        return null;
      }
      slots.push({ open: slot['open'], close: slot['close'] });
    }
    return slots.sort((a, b) => a.open.localeCompare(b.open));
  };
  for (const day of WEEK_DAYS) {
    const slots = slotsOf(weekInput[day], `${path}.week.${day}`);
    if (slots === null) return undefined;
    week[day] = slots;
  }
  const result: OpeningHoursValue = { week };
  if (field.exceptions !== false && Array.isArray(value['exceptions'])) {
    const exceptions: NonNullable<OpeningHoursValue['exceptions']> = [];
    for (const [index, raw] of value['exceptions'].slice(0, 120).entries()) {
      const itemPath = `${path}.exceptions[${index}]`;
      if (!isRecord(raw) || typeof raw['date'] !== 'string' || !isValidIsoDate(raw['date'])) {
        issue(context, itemPath, 'Date attendue au format AAAA-MM-JJ.');
        return undefined;
      }
      const closed = raw['closed'] === true;
      const slots = closed ? [] : slotsOf(raw['slots'], `${itemPath}.slots`);
      if (slots === null) return undefined;
      const note = typeof raw['note'] === 'string' ? raw['note'].trim().slice(0, 120) : '';
      exceptions.push({
        date: raw['date'],
        closed,
        ...(slots.length ? { slots } : {}),
        ...(note ? { note } : {}),
      });
    }
    result.exceptions = exceptions.sort((a, b) => a.date.localeCompare(b.date));
  }
  if (typeof value['note'] === 'string' && value['note'].trim()) {
    result.note = value['note'].trim().slice(0, 200);
  }
  return result;
}

function validateSeo(
  field: { titleMax?: number; descriptionMax?: number; image?: boolean },
  value: unknown,
  context: ValidationContext,
  path: string,
): SeoValue | undefined {
  if (!isRecord(value)) {
    issue(context, path, 'Référencement attendu : un titre et une description.');
    return undefined;
  }
  const seo: SeoValue = {};
  const titleMax = field.titleMax ?? 70;
  const descriptionMax = field.descriptionMax ?? 160;
  if (typeof value['title'] === 'string' && value['title'].trim()) {
    const title = value['title'].trim();
    if (title.length > titleMax) {
      issue(
        context,
        `${path}.title`,
        `${title.length} caractères : Google affiche environ ${titleMax} caractères.`,
      );
      return undefined;
    }
    seo.title = title;
  }
  if (typeof value['description'] === 'string' && value['description'].trim()) {
    const description = value['description'].trim();
    if (description.length > descriptionMax) {
      issue(
        context,
        `${path}.description`,
        `${description.length} caractères : Google affiche environ ${descriptionMax} caractères.`,
      );
      return undefined;
    }
    seo.description = description;
  }
  if (field.image && value['image'] !== undefined && value['image'] !== null) {
    const image = validateImage({ altRequired: false }, value['image'], context, `${path}.image`);
    if (image) seo.image = image;
  }
  return seo;
}

function validateAddress(
  value: unknown,
  context: ValidationContext,
  path: string,
): AddressValue | undefined {
  if (!isRecord(value)) {
    issue(context, path, 'Adresse attendue.');
    return undefined;
  }
  const text = (key: string, max: number) =>
    typeof value[key] === 'string' ? (value[key] as string).trim().slice(0, max) : '';
  const address: AddressValue = {
    line1: text('line1', 160),
    postalCode: text('postalCode', 12),
    city: text('city', 100),
    country: (text('country', 2) || 'FR').toUpperCase(),
  };
  const line2 = text('line2', 160);
  if (line2) address.line2 = line2;
  if (!/^[A-Z]{2}$/.test(address.country)) {
    issue(context, `${path}.country`, 'Pays attendu en code à deux lettres (FR, BE, CH…).');
    return undefined;
  }
  if (address.postalCode && !/^[A-Za-z0-9 -]{3,12}$/.test(address.postalCode)) {
    issue(context, `${path}.postalCode`, 'Code postal invalide.');
    return undefined;
  }
  return address;
}

function validateNavigation(
  field: { maxItems?: number; maxDepth?: 1 | 2 },
  value: unknown,
  context: ValidationContext,
  path: string,
): NavigationItem[] | undefined {
  if (!Array.isArray(value)) {
    issue(context, path, 'Menu attendu : une liste de liens.');
    return undefined;
  }
  const maxItems = field.maxItems ?? 12;
  const maxDepth = field.maxDepth ?? 1;
  const walk = (
    items: unknown[],
    depth: number,
    itemsPath: string,
  ): NavigationItem[] | undefined => {
    if (items.length > maxItems) {
      issue(context, itemsPath, `${maxItems} liens au maximum.`);
      return undefined;
    }
    const result: NavigationItem[] = [];
    for (const [index, raw] of items.entries()) {
      const itemPath = `${itemsPath}[${index}]`;
      if (!isRecord(raw)) {
        issue(context, itemPath, 'Lien attendu.');
        return undefined;
      }
      const link = validateLink(
        { allowExternal: true, labelMaxLength: 40 },
        raw,
        context,
        itemPath,
      );
      if (!link) return undefined;
      const item: NavigationItem = {
        id: isItemId(raw['id']) ? raw['id'] : newItemId(),
        label: link.label,
        href: link.href,
      };
      if (Array.isArray(raw['children']) && raw['children'].length > 0) {
        if (depth >= maxDepth) {
          issue(context, `${itemPath}.children`, 'Ce menu n’accepte pas de sous-menu.');
          return undefined;
        }
        const children = walk(raw['children'], depth + 1, `${itemPath}.children`);
        if (!children) return undefined;
        item.children = children;
      }
      result.push(item);
    }
    return result;
  };
  return walk(value, 1, path);
}

/** Valide la valeur (non traduite) d'un champ simple. `undefined` = rejetee. */
export function validateSimpleValue(
  field: SimpleFieldDefinition,
  value: unknown,
  context: ValidationContext,
  path: string,
): FieldValue | undefined {
  switch (field.type) {
    case 'text':
      return validateText(field, value, context, path);
    case 'richtext': {
      const parsed = richTextSchema.safeParse(value);
      if (!parsed.success) {
        issue(context, path, 'Texte mis en forme illisible.');
        return undefined;
      }
      const allowedBlocks = new Set(field.blocks ?? ['paragraph', 'heading', 'list', 'quote']);
      const allowedMarks = new Set(field.marks ?? ['bold', 'italic', 'link']);
      for (const block of parsed.data) {
        if (!allowedBlocks.has(block.type)) {
          issue(
            context,
            path,
            `Ce texte n’accepte pas de ${block.type === 'heading' ? 'titre' : block.type === 'list' ? 'liste' : 'citation'}.`,
          );
          return undefined;
        }
        const inlines = block.type === 'list' ? block.items.flat() : block.children;
        for (const inline of inlines) {
          if (
            (inline.bold && !allowedMarks.has('bold')) ||
            (inline.italic && !allowedMarks.has('italic'))
          ) {
            issue(context, path, 'Mise en forme non prévue pour ce texte.');
            return undefined;
          }
          if (inline.href !== undefined) {
            if (!allowedMarks.has('link') || !isSafeHref(inline.href)) {
              issue(context, path, 'Lien refusé dans ce texte.');
              return undefined;
            }
          }
        }
      }
      const max = field.maxLength ?? 5000;
      const length = richTextLength(parsed.data);
      if (length > Math.min(max, CONTRACT_LIMITS.richTextMax)) {
        issue(context, path, `${length} caractères pour ${max} au maximum.`);
        return undefined;
      }
      return parsed.data;
    }
    case 'image':
      return validateImage(field, value, context, path);
    case 'gallery': {
      if (!Array.isArray(value)) {
        issue(context, path, 'Galerie attendue.');
        return undefined;
      }
      const max = field.max ?? 24;
      if (value.length > max) {
        issue(context, path, `${max} photos au maximum.`);
        return undefined;
      }
      const images: ImageValue[] = [];
      for (const [index, item] of value.entries()) {
        const image = validateImage(field, item, context, `${path}[${index}]`);
        if (!image) return undefined;
        images.push(image);
      }
      if (field.min && images.length < field.min && context.mode === 'publish') {
        issue(context, path, `Au moins ${field.min} photos.`);
      }
      return images;
    }
    case 'link':
      return validateLink(field, value, context, path);
    case 'url': {
      if (typeof value !== 'string') {
        issue(context, path, 'Adresse attendue.');
        return undefined;
      }
      const url = value.trim();
      if (!url) return '';
      const internalAllowed = field.allowInternal !== false;
      const externalAllowed = field.allowExternal !== false;
      const internal = url.startsWith('/') && !url.startsWith('//');
      const external = isExternalHref(url);
      if (
        (internal && !internalAllowed) ||
        (external && !externalAllowed) ||
        !isSafeHref(url) ||
        (!internal && !external)
      ) {
        issue(context, path, 'Adresse invalide.');
        return undefined;
      }
      return url;
    }
    case 'phone': {
      if (typeof value !== 'string') {
        issue(context, path, 'Numéro attendu.');
        return undefined;
      }
      if (!value.trim()) return '';
      const phone = normalizePhone(value);
      if (!phone) {
        issue(context, path, 'Numéro de téléphone invalide.');
        return undefined;
      }
      return phone.display;
    }
    case 'email': {
      if (typeof value !== 'string') {
        issue(context, path, 'Adresse e-mail attendue.');
        return undefined;
      }
      const email = value.trim().toLowerCase();
      if (email && !EMAIL.test(email)) {
        issue(context, path, 'Adresse e-mail invalide.');
        return undefined;
      }
      return email;
    }
    case 'number': {
      const number =
        typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : value;
      if (typeof number !== 'number' || !Number.isFinite(number)) {
        issue(context, path, 'Nombre attendu.');
        return undefined;
      }
      if (field.integer && !Number.isInteger(number)) {
        issue(context, path, 'Nombre entier attendu.');
        return undefined;
      }
      if (
        (field.min !== undefined && number < field.min) ||
        (field.max !== undefined && number > field.max)
      ) {
        issue(context, path, `Valeur attendue entre ${field.min ?? '−∞'} et ${field.max ?? '+∞'}.`);
        return undefined;
      }
      return number;
    }
    case 'boolean':
      if (typeof value !== 'boolean') {
        issue(context, path, 'Oui ou non attendu.');
        return undefined;
      }
      return value;
    case 'select': {
      if (typeof value !== 'string' || !field.options.some((option) => option.value === value)) {
        issue(context, path, 'Choix inconnu.');
        return undefined;
      }
      return value;
    }
    case 'date': {
      if (typeof value !== 'string' || !isValidIsoDate(value)) {
        issue(context, path, 'Date attendue.');
        return undefined;
      }
      if ((field.min && value < field.min) || (field.max && value > field.max)) {
        issue(context, path, 'Date hors de la période autorisée.');
        return undefined;
      }
      return value;
    }
    case 'opening_hours':
      return validateOpeningHours(field, value, context, path);
    case 'seo':
      return validateSeo(field, value, context, path);
    case 'address':
      return validateAddress(value, context, path);
    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/*  Champ complet : traduction, obligation, listes                             */
/* -------------------------------------------------------------------------- */

function isEmptyValue(field: FieldDefinition, value: unknown): boolean {
  if (isEmpty(value)) return true;
  if (field.type === 'link' && isRecord(value)) return !value['label'] && !value['href'];
  if (field.type === 'seo' && isRecord(value)) return !value['title'] && !value['description'];
  if (field.type === 'richtext' && Array.isArray(value)) {
    const parsed = richTextSchema.safeParse(value);
    return parsed.success && richTextLength(parsed.data) === 0;
  }
  return false;
}

function validateSingle(
  field: FieldDefinition,
  value: unknown,
  context: ValidationContext,
  path: string,
): FieldValue | undefined {
  if (field.type === 'navigation') return validateNavigation(field, value, context, path);
  if (field.type === 'repeater') {
    if (!Array.isArray(value)) {
      issue(context, path, 'Liste attendue.');
      return undefined;
    }
    const max = field.max ?? 20;
    if (value.length > max) {
      issue(context, path, `${max} éléments au maximum.`);
      return undefined;
    }
    const items: RepeaterItem[] = [];
    const seen = new Set<string>();
    for (const [index, raw] of value.entries()) {
      const itemPath = `${path}[${index}]`;
      if (!isRecord(raw)) {
        issue(context, itemPath, 'Élément illisible.');
        return undefined;
      }
      let id = isItemId(raw['_id']) ? raw['_id'] : newItemId();
      if (seen.has(id)) id = newItemId();
      seen.add(id);
      const item: RepeaterItem = { _id: id };
      for (const sub of field.fields) {
        const subValue = raw[sub.id];
        const subPath = `${itemPath}.${sub.id}`;
        if (isEmptyValue(sub, subValue)) {
          if (sub.required && context.mode === 'publish')
            issue(context, subPath, `« ${sub.label} » est obligatoire.`);
          continue;
        }
        const normalized = validateSimpleValue(sub, subValue, context, subPath);
        if (normalized !== undefined) item[sub.id] = normalized;
      }
      items.push(item);
    }
    if (field.min && items.length < field.min && context.mode === 'publish') {
      issue(context, path, `Au moins ${field.min} éléments.`);
    }
    return items;
  }
  return validateSimpleValue(field, value, context, path);
}

/**
 * Valide la valeur d'un champ, en tenant compte des langues du site.
 * Renvoie la valeur NORMALISEE (cles inconnues retirees), ou `undefined`.
 */
export function validateFieldValue(
  field: FieldDefinition,
  value: unknown,
  manifest: SiteManifest,
  context: ValidationContext,
  path: string,
): FieldValue | Record<string, FieldValue> | undefined {
  if (isLocalized(field, manifest)) {
    const locales = manifest.site.locales;
    const defaultLocale = manifest.site.defaultLocale;
    const input = isRecord(value) ? value : {};
    const result: Record<string, FieldValue> = {};
    for (const locale of locales) {
      const localePath = `${path}@${locale}`;
      const localeValue = input[locale];
      if (isEmptyValue(field, localeValue)) {
        if (locale === defaultLocale && field.required && context.mode === 'publish') {
          issue(context, localePath, `« ${field.label} » est obligatoire.`);
        } else if (locale !== defaultLocale && !isEmptyValue(field, input[defaultLocale])) {
          issue(
            context,
            localePath,
            `Traduction manquante (${locale}) : la version ${defaultLocale} sera affichée.`,
            'warning',
          );
        }
        continue;
      }
      const normalized = validateSingle(field, localeValue, context, localePath);
      if (normalized !== undefined) result[locale] = normalized;
    }
    return result;
  }

  if (isEmptyValue(field, value)) {
    if (field.required && context.mode === 'publish') {
      issue(context, path, `« ${field.label} » est obligatoire.`);
    }
    return undefined;
  }
  return validateSingle(field, value, context, path);
}
