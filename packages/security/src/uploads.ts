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
  'image/svg+xml', 'text/html', 'application/xhtml+xml', 'application/javascript',
  'text/javascript', 'application/x-httpd-php', 'application/x-msdownload',
  'application/x-sh', 'application/octet-stream',
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
    return { valid: false, error: 'Ce type de fichier n’est pas autorise pour des raisons de securite.' };
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
