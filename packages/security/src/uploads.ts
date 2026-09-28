/**
 * Validation des fichiers televerses.
 *
 * Trois verifications independantes, car aucune ne suffit seule :
 *  1. le type MIME declare doit appartenir a une liste blanche ;
 *  2. l'extension doit correspondre a ce type ;
 *  3. les premiers octets du fichier doivent porter la bonne signature.
 *
 * Un fichier renomme `photo.jpg` mais contenant du HTML est ainsi rejete.
 */

export type UploadCategory = 'image' | 'document' | 'video';

export interface UploadRule {
  mimeType: string;
  extensions: readonly string[];
  category: UploadCategory;
  maxBytes: number;
  /** Signature attendue en debut de fichier, en octets. */
  magic?: readonly (readonly number[])[];
  /** Offset de la signature. */
  magicOffset?: number;
}

const MB = 1024 * 1024;

export const UPLOAD_RULES: readonly UploadRule[] = [
  {
    mimeType: 'image/jpeg',
    extensions: ['jpg', 'jpeg'],
    category: 'image',
    maxBytes: 10 * MB,
    magic: [[0xff, 0xd8, 0xff]],
  },
  {
    mimeType: 'image/png',
    extensions: ['png'],
    category: 'image',
    maxBytes: 10 * MB,
    magic: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  },
  {
    mimeType: 'image/webp',
    extensions: ['webp'],
    category: 'image',
    maxBytes: 10 * MB,
    magic: [[0x52, 0x49, 0x46, 0x46]],
  },
  {
    mimeType: 'image/avif',
    extensions: ['avif'],
    category: 'image',
    maxBytes: 10 * MB,
  },
  {
    mimeType: 'image/gif',
    extensions: ['gif'],
    category: 'image',
    maxBytes: 5 * MB,
    magic: [[0x47, 0x49, 0x46, 0x38]],
  },
  {
    mimeType: 'application/pdf',
    extensions: ['pdf'],
    category: 'document',
    maxBytes: 25 * MB,
    magic: [[0x25, 0x50, 0x44, 0x46]],
  },
  {
    mimeType: 'video/mp4',
    extensions: ['mp4'],
    category: 'video',
    maxBytes: 100 * MB,
  },
  {
    mimeType: 'video/webm',
    extensions: ['webm'],
    category: 'video',
    maxBytes: 100 * MB,
  },
];

/**
 * Le SVG est volontairement ABSENT de la liste des formats acceptes par les
 * clients : c'est un document XML pouvant contenir du script. Seuls les
 * fichiers produits par la plateforme (logos internes) sont servis en SVG.
 */
export const REJECTED_ALWAYS = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/javascript',
  'text/javascript',
  'application/x-httpd-php',
  'application/x-msdownload',
  'application/x-sh',
  'application/octet-stream',
]);

export interface UploadValidationInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Premiers octets du fichier, pour la verification de signature. */
  header?: Uint8Array;
  allowedCategories?: readonly UploadCategory[];
  /** Plafond specifique, par exemple issu du quota de l'offre. */
  maxBytes?: number;
}

export interface UploadValidationResult {
  valid: boolean;
  error?: string;
  rule?: UploadRule;
}

function extensionOf(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? (parts.pop() ?? '') : '';
}

function matchesMagic(header: Uint8Array, rule: UploadRule): boolean {
  if (!rule.magic || rule.magic.length === 0) return true;
  const offset = rule.magicOffset ?? 0;
  return rule.magic.some((signature) =>
    signature.every((byte, index) => header[offset + index] === byte),
  );
}

export function validateUpload(input: UploadValidationInput): UploadValidationResult {
  const mimeType = input.mimeType.toLowerCase().split(';')[0]?.trim() ?? '';

  if (REJECTED_ALWAYS.has(mimeType)) {
    return {
      valid: false,
      error: 'Ce type de fichier n’est pas autorisé pour des raisons de sécurité.',
    };
  }

  const rule = UPLOAD_RULES.find((r) => r.mimeType === mimeType);
  if (!rule) {
    return { valid: false, error: 'Format de fichier non pris en charge.' };
  }

  if (input.allowedCategories && !input.allowedCategories.includes(rule.category)) {
    return { valid: false, error: 'Ce type de fichier n’est pas attendu a cet endroit.' };
  }

  const extension = extensionOf(input.fileName);
  if (!extension || !rule.extensions.includes(extension)) {
    return {
      valid: false,
      error: `L’extension du fichier ne correspond pas a son contenu (${rule.mimeType} attendu).`,
    };
  }

  if (input.sizeBytes <= 0) {
    return { valid: false, error: 'Le fichier est vide.' };
  }

  const limit = Math.min(rule.maxBytes, input.maxBytes ?? rule.maxBytes);
  if (input.sizeBytes > limit) {
    return {
      valid: false,
      error: `Fichier trop volumineux : ${Math.round(limit / MB)} Mo maximum.`,
    };
  }

  if (input.header && input.header.length > 0 && !matchesMagic(input.header, rule)) {
    return {
      valid: false,
      error: 'Le contenu du fichier ne correspond pas a son format declare.',
    };
  }

  return { valid: true, rule };
}

/** Quantite d'octets a lire pour verifier une signature. */
export const MAGIC_HEADER_BYTES = 16;

function startsWith(header: Uint8Array, bytes: readonly number[], offset = 0): boolean {
  return bytes.every((byte, index) => header[offset + index] === byte);
}

function ascii(header: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...header.slice(offset, offset + length));
}

/**
 * Type REEL d'un fichier, lu dans ses premiers octets (32 suffisent).
 *
 * Le type annonce par le navigateur vient de l'extension, et une requete
 * forgee annonce ce qu'elle veut : un document HTML declare `image/png`. On
 * range donc le fichier sous le type qu'il EST, et on refuse ce qui n'est
 * aucun des formats acceptes — SVG et HTML compris, puisqu'ils n'ont pas de
 * signature binaire.
 */
export function sniffMediaType(header: Uint8Array): string | null {
  if (startsWith(header, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(header, 0, 6) === 'GIF87a' || ascii(header, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(header, 0, 5) === '%PDF-') return 'application/pdf';
  // EBML : WebM, mais aussi Matroska (.mkv), que les navigateurs ne lisent
  // pas tous. Le type de document « webm » figure dans l'en-tete.
  if (startsWith(header, [0x1a, 0x45, 0xdf, 0xa3])) {
    return ascii(header, 0, header.length).includes('webm') ? 'video/webm' : null;
  }
  if (ascii(header, 4, 4) === 'ftyp') return isoMediaType(header);
  return null;
}

const AVIF_BRANDS = new Set(['avif', 'avis']);
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso3',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'dash',
  'M4V ',
  'mmp4',
  'MSNV',
]);

/**
 * Fichiers ISO (boite `ftyp`) : AVIF, MP4 — mais aussi HEIC (photos d'iPhone),
 * QuickTime ou audio M4A, qu'un navigateur n'affiche pas comme une image ou
 * une video du site. On lit la marque principale et les marques compatibles.
 */
function isoMediaType(header: Uint8Array): string | null {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const boxSize = header.length >= 4 ? view.getUint32(0) : 0;
  const end = Math.min(boxSize, header.length);
  const brands = [ascii(header, 8, 4)];
  for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(ascii(header, offset, 4));
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return 'image/avif';
  if (MP4_BRANDS.has(brands[0] ?? '')) return 'video/mp4';
  return null;
}

/** Octets a lire pour `sniffMediaType`. */
export const SNIFF_HEADER_BYTES = 64;
