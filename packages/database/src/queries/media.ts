import { publicEnv, readEnv } from '@stax/config';

/**
 * URL publique d un media.
 *
 * Construite a partir du bucket et du chemin stockes en base, jamais depuis une
 * URL fournie par un utilisateur : un champ « url » librement saisi permettrait
 * de faire pointer une image du site d un client vers n importe quel serveur.
 *
 * Un media marque prive ne recoit PAS d URL publique : il doit passer par une
 * URL signee, generee cote serveur pour un destinataire identifie.
 */
export interface MediaRow {
  storage_bucket: string;
  storage_path: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  is_public: boolean;
}

function storageOrigin(): string {
  const url = readEnv('SUPABASE_URL') ?? publicEnv().NEXT_PUBLIC_SUPABASE_URL;
  return url.replace(/\/+$/, '');
}

export function mediaPublicUrl(bucket: string, path: string): string {
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${storageOrigin()}/storage/v1/object/public/${encodeURIComponent(bucket)}/${segments}`;
}

export interface PublicImage {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

export function toPublicImage(row: MediaRow | null | undefined): PublicImage | null {
  if (!row || !row.is_public || !row.storage_path) return null;
  return {
    url: mediaPublicUrl(row.storage_bucket, row.storage_path),
    alt: row.alt_text ?? '',
    ...(row.width ? { width: row.width } : {}),
    ...(row.height ? { height: row.height } : {}),
  };
}

/** Colonnes a selectionner pour toute jointure vers `media`. */
export const MEDIA_COLUMNS = 'storage_bucket, storage_path, alt_text, width, height, is_public';
