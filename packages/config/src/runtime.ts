/**
 * Runtime environment access.
 *
 * Nemasus runs on two different runtimes:
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

/**
 * Nemasus s'appelait StaX. Les variables `NEMASUS_*` ont remplace les
 * `STAX_*` ; un deploiement configure sous l'ancien nom continue de
 * fonctionner (la cle `STAX_SECRET_KEY` signe des jetons encore valides : la
 * perdre au renommage les invaliderait tous). Le nouveau nom l'emporte
 * toujours.
 */
const CURRENT_PREFIX = 'NEMASUS_';
const LEGACY_PREFIX = 'STAX_';

function rawValue(key: string): string | undefined {
  return injectedSource?.[key] ?? processEnv()[key];
}

/** Reads a single variable from the active source. Never throws. */
export function readEnv(key: string): string | undefined {
  let value = rawValue(key);
  if ((value === undefined || value.trim().length === 0) && key.startsWith(CURRENT_PREFIX)) {
    value = rawValue(LEGACY_PREFIX + key.slice(CURRENT_PREFIX.length));
  }
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Snapshot of the active source, used by the schema validators. */
export function readAllEnv(): EnvSource {
  const snapshot: EnvSource = { ...processEnv(), ...(injectedSource ?? {}) };
  for (const [key, value] of Object.entries(snapshot)) {
    if (!key.startsWith(LEGACY_PREFIX)) continue;
    const current = CURRENT_PREFIX + key.slice(LEGACY_PREFIX.length);
    if (snapshot[current] === undefined || snapshot[current]?.trim() === '') {
      snapshot[current] = value;
    }
  }
  return snapshot;
}

export function isBrowser(): boolean {
  // On interroge `globalThis` plutot que `window` directement : le typage d'un
  // Worker Cloudflare ne declare pas le DOM, et une reference directe y serait
  // une erreur de compilation alors que le test doit rester valable partout.
  const scope = globalThis as { window?: { document?: unknown } };
  return scope.window !== undefined && scope.window.document !== undefined;
}

export type DeployEnvironment = 'development' | 'preview' | 'production' | 'test';

export function deployEnvironment(): DeployEnvironment {
  const raw = (readEnv('NEMASUS_ENV') ?? readEnv('NODE_ENV') ?? 'development').toLowerCase();
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
      `[Nemasus] ${moduleName} est un module serveur et ne doit jamais être importe cote navigateur.`,
    );
  }
}
