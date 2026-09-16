/**
 * Manipulation sure des URL et des noms d'hote.
 *
 * Trois familles de failles sont traitees ici :
 *  - redirection ouverte : une URL de retour fournie par l'utilisateur ;
 *  - SSRF : une URL fournie par l'utilisateur que le serveur irait chercher ;
 *  - traversee de chemin : un nom de fichier ou un chemin construit a partir
 *    d'une entree utilisateur.
 */

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]');
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Valide un chemin de redirection interne.
 * Refuse tout ce qui n'est pas un chemin relatif a la racine : URL absolue,
 * protocole, double barre oblique (qui vaut une URL protocole-relative),
 * anti-slash, caracteres de controle.
 */
export function safeRedirectPath(input: string | null | undefined, fallback = '/'): string {
  if (!input) return fallback;
  const value = input.trim();
  if (value.length === 0 || value.length > 2048) return fallback;
  if (!value.startsWith('/')) return fallback;
  // `//evil.com` et `/\evil.com` sont interpretes comme des URL externes.
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (CONTROL_CHARS.test(value)) return fallback;
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(value)) return fallback;
  return value;
}

/** Valide une URL absolue destinee a etre affichee (lien sortant, reseau social). */
export function safeExternalUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url.toString();
}

/** Protocoles acceptes dans un lien de contenu client. */
const SAFE_LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:', 'tel:']);

export function safeLinkHref(input: string | null | undefined): string | null {
  if (!input) return null;
  const value = input.trim();
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#')) return value;
  try {
    const url = new URL(value);
    if (!SAFE_LINK_PROTOCOLS.has(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const PRIVATE_IPV4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

/**
 * L'hote designe-t-il une ressource interne ? Utilise avant toute requete
 * sortante declenchee par une URL fournie par un utilisateur (SSRF).
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return true;
  if (host.startsWith('fe80:')) return true;
  if (host.endsWith('.internal') || host.endsWith('.local')) return true;
  // Metadonnees des fournisseurs cloud.
  if (host === '169.254.169.254' || host === 'metadata.google.internal') return true;
  return PRIVATE_IPV4.some((pattern) => pattern.test(host));
}

export interface FetchGuardResult {
  allowed: boolean;
  reason?: string;
  url?: URL;
}

/**
 * Autorise ou refuse une requete sortante vers une URL fournie par un
 * utilisateur (import d'image, verification d'un site existant...).
 */
export function guardOutboundUrl(input: string): FetchGuardResult {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { allowed: false, reason: 'URL invalide.' };
  }
  if (url.protocol !== 'https:') {
    return { allowed: false, reason: 'Seul le protocole HTTPS est autorise.' };
  }
  if (url.username || url.password) {
    return { allowed: false, reason: 'Les identifiants dans l’URL sont interdits.' };
  }
  if (isPrivateHost(url.hostname)) {
    return { allowed: false, reason: 'Cette adresse designe une ressource interne.' };
  }
  if (url.port && url.port !== '443') {
    return { allowed: false, reason: 'Seul le port 443 est autorise.' };
  }
  return { allowed: true, url };
}

/** Nettoie un nom de fichier televerse : pas de chemin, pas de caractere hostile. */
export function safeFileName(input: string, fallback = 'fichier'): string {
  const base = input.split(/[/\\]/).pop() ?? '';
  const cleaned = base
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 120);
  if (cleaned.length === 0 || cleaned === '.' || cleaned === '..') return fallback;
  return cleaned;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Chemin de stockage cloisonne par tenant, impossible a faire sortir de son prefixe. */
export function tenantStoragePath(
  organizationId: string,
  siteId: string | null,
  fileName: string,
  now = Date.now(),
): string {
  if (!isUuid(organizationId)) {
    throw new Error('Identifiant d’organisation invalide.');
  }
  if (siteId && !isUuid(siteId)) {
    throw new Error('Identifiant de site invalide.');
  }
  const scope = siteId ? `sites/${siteId}` : 'org';
  return `${organizationId}/${scope}/${now}-${safeFileName(fileName)}`;
}

export function slugify(input: string, maxLength = 60): string {
  return input
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}
