/**
 * Runtime environment access.
 *
 * StaX runs on two different runtimes:
 *  - Next.js on Cloudflare Workers (OpenNext), where `process.env` is populated.
 *  - A plain Cloudflare Worker (the tenant site runtime), where variables and secrets
 *    arrive as the `env` argument of `fetch(request, env, ctx)`.
 *
 * Every package therefore reads configuration through this module instead of touching
 * `process.env` directly, and the worker installs its bindings once per request.
 */

export type EnvSource = Record<string, string | undefined>;

let injectedSource: EnvSource | null = null;

/**
 * Installs the Cloudflare `env` bindings object as the configuration source.
 * Must be called at the very top of the worker fetch handler.
 */
export function setEnvSource(source: EnvSource): void {
  injectedSource = source;
}

export function clearEnvSource(): void {
  injectedSource = null;
}

function processEnv(): EnvSource {
  return typeof process !== 'undefined' && process.env ? (process.env as EnvSource) : {};
}

/** Reads a single variable from the active source. Never throws. */
export function readEnv(key: string): string | undefined {
  const value = injectedSource?.[key] ?? processEnv()[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Snapshot of the active source, used by the schema validators. */
export function readAllEnv(): EnvSource {
  return { ...processEnv(), ...(injectedSource ?? {}) };
}

export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

export type DeployEnvironment = 'development' | 'preview' | 'production' | 'test';

export function deployEnvironment(): DeployEnvironment {
  const raw = (readEnv('STAX_ENV') ?? readEnv('NODE_ENV') ?? 'development').toLowerCase();
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'preview' || raw === 'staging') return 'preview';
  if (raw === 'test') return 'test';
  return 'development';
}

export function isProduction(): boolean {
  return deployEnvironment() === 'production';
}

/**
 * Guard for modules that must never be bundled into client code.
 * Throws loudly rather than silently leaking a secret into a browser bundle.
 */
export function assertServerOnly(moduleName: string): void {
  if (isBrowser()) {
    throw new Error(
      `[StaX] ${moduleName} est un module serveur et ne doit jamais être importe cote navigateur.`,
    );
  }
}
