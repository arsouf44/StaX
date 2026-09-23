import { isProduction } from '@stax/config';
import { randomToken } from './crypto';

/**
 * En-tetes de securite HTTP.
 *
 * Deux profils distincts :
 *  - `platform` : l'application StaX (tableau de bord, administration) ;
 *  - `tenant-site` : les sites publics des clients, plus permissifs sur les
 *    images et les polices, mais tout aussi stricts sur les scripts.
 *
 * Aucun site client ne peut executer de JavaScript arbitraire : le CSP
 * n'autorisé que les scripts de l'origine et ceux portant le nonce de la
 * requete. C'est la derniere barriere contre une injection qui aurait
 * traverse la validation et l'assainissement.
 */

export type SecurityProfile = 'platform' | 'tenant-site' | 'api';

export interface SecurityHeaderOptions {
  profile: SecurityProfile;
  nonce?: string;
  /** Origines supplementaires autorisees (Stripe, Turnstile, Supabase…). */
  connectSrc?: readonly string[];
  /**
   * Empreintes de scripts inline connus, au format `'sha256-…'`.
   *
   * Sert aux scripts constants qui doivent s'executer avant le premier rendu
   * (application du theme) : un nonce y obligerait a rendre dynamique chaque
   * page prerendue, alors qu'une empreinte reste valable indefiniment. Les
   * empreintes restent honorees en presence de `'strict-dynamic'`.
   */
  scriptHashes?: readonly string[];
  frameSrc?: readonly string[];
  /**
   * Origines d images supplementaires. En production, le stockage des photos
   * est en https et deja couvert ; le nommer reste plus precis, et c est ce
   * qui permet a une pile locale (http) d afficher les photos des clients.
   */
  imgSrc?: readonly string[];
  /** Desactive `upgrade-insecure-requests` en developpement local. */
  allowInsecure?: boolean;
  /** Le site autorise-t-il l'intégration d'une carte tierce ? */
  allowMaps?: boolean;
}

export function generateNonce(): string {
  return randomToken(16);
}

const STRIPE_SCRIPT = 'https://js.stripe.com';
const STRIPE_FRAME = 'https://js.stripe.com https://hooks.stripe.com';
const STRIPE_CONNECT = 'https://api.stripe.com';
const TURNSTILE = 'https://challenges.cloudflare.com';

export function buildContentSecurityPolicy(options: SecurityHeaderOptions): string {
  const nonce = options.nonce ? `'nonce-${options.nonce}'` : '';
  const isPlatform = options.profile === 'platform';

  const scriptSrc = [
    "'self'",
    nonce,
    ...(options.scriptHashes ?? []),
    "'strict-dynamic'",
    STRIPE_SCRIPT,
    TURNSTILE,
  ]
    .filter(Boolean)
    .join(' ');

  const connect = ["'self'", STRIPE_CONNECT, TURNSTILE, ...(options.connectSrc ?? [])].join(' ');

  const frame = [
    "'self'",
    STRIPE_FRAME,
    TURNSTILE,
    ...(options.frameSrc ?? []),
    // Contenus integres de la liste blanche (section « Contenu intégré »). Ils
    // ne sont charges qu apres un clic du visiteur : voir renderEmbed.
    ...(options.allowMaps
      ? [
          'https://www.openstreetmap.org',
          'https://www.google.com',
          'https://www.youtube-nocookie.com',
          'https://player.vimeo.com',
          'https://calendly.com',
        ]
      : []),
  ].join(' ');

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Les styles restent en 'unsafe-inline' : les jetons de theme par tenant
    // sont injectes en variables CSS, et un nonce sur chaque style serait
    // incompatible avec le streaming SSR. Aucun style ne provient de
    // l'utilisateur : ils sont generes a partir de valeurs validees.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    ["img-src 'self' data: blob: https:", ...(options.imgSrc ?? [])].join(' '),
    "media-src 'self' https:",
    `connect-src ${connect}`,
    `frame-src ${frame}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Interdit l'integration du tableau de bord dans un iframe tiers
    // (protection contre le clickjacking).
    isPlatform ? "frame-ancestors 'none'" : "frame-ancestors 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];

  if (!options.allowInsecure && isProduction()) {
    directives.push('upgrade-insecure-requests');
  }
  return directives.join('; ');
}

export function securityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildContentSecurityPolicy(options),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': options.profile === 'platform' ? 'DENY' : 'SAMEORIGIN',
    'Permissions-Policy': [
      'accelerometer=()',
      'camera=()',
      'geolocation=(self)',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=(self "https://js.stripe.com")',
      'usb=()',
      'interest-cohort=()',
    ].join(', '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': options.profile === 'platform' ? 'same-origin' : 'cross-origin',
    'X-DNS-Prefetch-Control': 'on',
  };

  if (isProduction()) {
    // 2 ans, sous-domaines inclus, eligible a la preload list.
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
  }

  if (options.profile === 'api') {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, private';
    headers['Pragma'] = 'no-cache';
  }
  return headers;
}

/** En-tetes de cache selon la nature de la ressource. */
export const CACHE_POLICIES = {
  /** Donnees d'un utilisateur authentifie : jamais mises en cache. */
  private: 'no-store, no-cache, must-revalidate, private',
  /** Page publiee d'un site client : revalidation courte, cache partage. */
  publishedPage: 'public, max-age=0, s-maxage=60, stale-while-revalidate=600',
  /** Ressource immuable versionnee par son empreinte. */
  immutable: 'public, max-age=31536000, immutable',
  /** Reponse d'API publique et non sensible. */
  publicApi: 'public, max-age=0, s-maxage=30',
} as const;

/**
 * CORS restrictif : seule une origine explicitement autorisee obtient une
 * reponse. Jamais de joker avec des identifiants.
 */
export function corsHeaders(
  requestOrigin: string | null,
  allowedOrigins: readonly string[],
): Record<string, string> {
  if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': requestOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
