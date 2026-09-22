import { z } from 'zod';
import { assertServerOnly, deployEnvironment, isProduction, readAllEnv, readEnv } from './runtime';

/* -------------------------------------------------------------------------- */
/*  Public configuration (safe to ship in a browser bundle)                    */
/* -------------------------------------------------------------------------- */

const publicSchema = z.object({
  /** Canonical origin of the platform application, e.g. https://stax.fr */
  NEXT_PUBLIC_PLATFORM_URL: z.string().url().default('http://localhost:3000'),
  /** Apex domain used to mint tenant subdomains, e.g. `sites.stax.fr`. */
  NEXT_PUBLIC_SITES_DOMAIN: z.string().min(3).default('sites.localhost'),
  /** Supabase project URL — public by design. */
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().default('http://127.0.0.1:54321'),
  /**
   * Supabase anon/publishable key. Public by design: every table it can reach is
   * protected by row level security. It is NOT the service role key.
   */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10).default('anon-key-not-configured'),
  /** Cloudflare Turnstile site key (public half of the pair). */
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().default('fr'),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let publicCache: PublicEnv | null = null;

/**
 * Public configuration. Next.js inlines `process.env.NEXT_PUBLIC_*` at build time,
 * so the literal member accesses below are required — a dynamic lookup would be
 * replaced by `undefined` in the client bundle.
 */
export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache;
  const raw = {
    NEXT_PUBLIC_PLATFORM_URL: process.env.NEXT_PUBLIC_PLATFORM_URL,
    NEXT_PUBLIC_SITES_DOMAIN: process.env.NEXT_PUBLIC_SITES_DOMAIN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  };
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''),
  );
  const parsed = publicSchema.safeParse(cleaned);
  if (!parsed.success) {
    throw new Error(
      `[StaX] Configuration publique invalide : ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join(' | ')}`,
    );
  }
  publicCache = parsed.data;
  return publicCache;
}

/* -------------------------------------------------------------------------- */
/*  Server configuration (secrets — never bundled client side)                 */
/* -------------------------------------------------------------------------- */

const optionalSecret = z.string().min(1).optional();

const serverSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  /** Full-access Postgres key. Server only, always. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_JWT_SECRET: optionalSecret,
  SUPABASE_DB_URL: optionalSecret,

  STRIPE_SECRET_KEY: optionalSecret,
  STRIPE_WEBHOOK_SECRET: optionalSecret,
  STRIPE_CONNECT_WEBHOOK_SECRET: optionalSecret,
  STRIPE_CONNECT_CLIENT_ID: optionalSecret,

  CLOUDFLARE_API_TOKEN: optionalSecret,
  CLOUDFLARE_ACCOUNT_ID: optionalSecret,
  CLOUDFLARE_ZONE_ID: optionalSecret,
  /** Cloudflare for SaaS fallback origin used by custom hostnames. */
  CLOUDFLARE_SAAS_FALLBACK_ORIGIN: optionalSecret,
  TURNSTILE_SECRET_KEY: optionalSecret,

  EMAIL_PROVIDER: z.enum(['console', 'resend', 'postmark']).default('console'),
  EMAIL_API_KEY: optionalSecret,
  EMAIL_FROM: z.string().default('StaX <bonjour@localhost>'),
  EMAIL_REPLY_TO: z.string().optional(),

  ADMIN_EMAIL: z.string().email().optional(),
  /**
   * Bootstrap password for the very first platform owner. Provided once by the
   * operator through the secret store; never committed, never logged, never echoed.
   */
  ADMIN_BOOTSTRAP_PASSWORD: optionalSecret,

  /** 32+ byte secret used to HMAC activation codes, preview tokens and CSRF tokens. */
  STAX_SECRET_KEY: z.string().min(32),

  PLATFORM_URL: z.string().url().optional(),
  SITES_DOMAIN: z.string().optional(),
  PREVIEW_DOMAIN: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let serverCache: ServerEnv | null = null;

/** Local-only fallbacks so `pnpm dev` and the test suite work with an empty `.env`. */
function developmentFallbacks(): Record<string, string> {
  return {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_ANON_KEY: 'local-development-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'local-development-service-role-key',
    STAX_SECRET_KEY: 'stax-development-only-secret-key-not-for-production-use',
    EMAIL_FROM: 'StaX (dev) <bonjour@localhost>',
  };
}

export function serverEnv(): ServerEnv {
  assertServerOnly('@stax/config/env#serverEnv');
  if (serverCache) return serverCache;

  const source = readAllEnv();
  const withDefaults =
    deployEnvironment() === 'production' ? source : { ...developmentFallbacks(), ...source };

  const parsed = serverSchema.safeParse(withDefaults);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(
      `[StaX] Variables d'environnement serveur manquantes ou invalides : ${missing}. ` +
        'Consultez .env.example et docs/deployment.md.',
    );
  }
  serverCache = parsed.data;
  return serverCache;
}

/** Test helper: forces the next read to re-validate. */
export function resetEnvCache(): void {
  serverCache = null;
  publicCache = null;
}

/* -------------------------------------------------------------------------- */
/*  Capability probes — features degrade instead of crashing when unconfigured */
/* -------------------------------------------------------------------------- */

export type CapabilityKey =
  'stripe' | 'stripe_connect' | 'cloudflare_domains' | 'turnstile' | 'email';

export function hasCapability(key: CapabilityKey): boolean {
  switch (key) {
    case 'stripe':
      return Boolean(readEnv('STRIPE_SECRET_KEY') && readEnv('STRIPE_WEBHOOK_SECRET'));
    case 'stripe_connect':
      return Boolean(readEnv('STRIPE_SECRET_KEY') && readEnv('STRIPE_CONNECT_CLIENT_ID'));
    case 'cloudflare_domains':
      return Boolean(readEnv('CLOUDFLARE_API_TOKEN') && readEnv('CLOUDFLARE_ZONE_ID'));
    case 'turnstile':
      return Boolean(readEnv('TURNSTILE_SECRET_KEY'));
    case 'email':
      return readEnv('EMAIL_PROVIDER') !== 'console' ? Boolean(readEnv('EMAIL_API_KEY')) : true;
    default:
      return false;
  }
}

/** Every capability the current deployment is missing, for /admin/system. */
export function missingCapabilities(): CapabilityKey[] {
  const keys: CapabilityKey[] = [
    'stripe',
    'stripe_connect',
    'cloudflare_domains',
    'turnstile',
    'email',
  ];
  return keys.filter((key) => !hasCapability(key));
}

export function platformUrl(): string {
  return readEnv('PLATFORM_URL') ?? publicEnv().NEXT_PUBLIC_PLATFORM_URL;
}

export function sitesDomain(): string {
  return readEnv('SITES_DOMAIN') ?? publicEnv().NEXT_PUBLIC_SITES_DOMAIN;
}

/**
 * Adresse publique d un site a partir de son nom d hote.
 *
 * En production : `https://<hote>`. En developpement et en test, le moteur
 * des sites tourne en local (`wrangler dev`) : `SITES_PUBLIC_SCHEME` et
 * `SITES_PUBLIC_PORT` permettent aux liens « Voir mon site » de rester vrais.
 */
export function publicSiteUrl(hostname: string, path = '/'): string {
  const scheme = readEnv('SITES_PUBLIC_SCHEME') === 'http' ? 'http' : 'https';
  const port = readEnv('SITES_PUBLIC_PORT');
  const suffix = port && /^[0-9]{2,5}$/.test(port) ? `:${port}` : '';
  return `${scheme}://${hostname}${suffix}${path.startsWith('/') ? path : `/${path}`}`;
}

export function previewDomain(): string {
  return readEnv('PREVIEW_DOMAIN') ?? `preview.${sitesDomain()}`;
}

export { deployEnvironment, isProduction };
