/**
 * Bindings du Worker des sites clients.
 *
 * Les secrets ne sont jamais lus depuis `process.env` ici : sur un Worker
 * Cloudflare classique ils arrivent dans l objet `env` du gestionnaire
 * `fetch`, qui est installe une fois par requete via `setEnvSource`.
 */
export interface WorkerEnv {
  STAX_ENV?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_PLATFORM_URL?: string;
  NEXT_PUBLIC_SITES_DOMAIN?: string;
  NEXT_PUBLIC_PREVIEW_DOMAIN?: string;
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  FORM_TOKEN_SECRET?: string;
  SECRET_PEPPER?: string;
  [key: string]: string | undefined;
}
