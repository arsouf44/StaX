import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Configuration lue a l'execution, et non figee au build.
 *
 * Deux incidents possibles que ces tests verrouillent :
 *  - le renommage StaX -> Nemasus : une cle deja posee sous l'ancien nom
 *    (`STAX_SECRET_KEY`) doit rester lue, sinon tous les jetons signes
 *    deviennent invalides au premier deploiement ;
 *  - un build sans les variables `NEXT_PUBLIC_*` : Next les remplace alors par
 *    `undefined`, et la plateforme retomberait sur ses valeurs locales
 *    (catalogue « indisponible ») si le serveur ne relisait pas sa
 *    configuration a l'execution.
 */

const KEYS = [
  'NEMASUS_SECRET_KEY',
  'STAX_SECRET_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_PLATFORM_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'PLATFORM_URL',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
] as const;

const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(async () => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  const { clearEnvSource } = await import('@nemasus/config');
  clearEnvSource();
  vi.resetModules();
});

function clearAll(): void {
  for (const key of KEYS) delete process.env[key];
}

describe('noms de variables apres le renommage', () => {
  it('lit encore STAX_SECRET_KEY quand NEMASUS_SECRET_KEY est absente', async () => {
    clearAll();
    const { readEnv, setEnvSource } = await import('@nemasus/config');
    setEnvSource({ STAX_SECRET_KEY: 'ancienne-cle' });
    expect(readEnv('NEMASUS_SECRET_KEY')).toBe('ancienne-cle');
  });

  it('prefere toujours le nouveau nom', async () => {
    clearAll();
    const { readEnv, setEnvSource } = await import('@nemasus/config');
    setEnvSource({ STAX_SECRET_KEY: 'ancienne-cle', NEMASUS_SECRET_KEY: 'nouvelle-cle' });
    expect(readEnv('NEMASUS_SECRET_KEY')).toBe('nouvelle-cle');
  });

  it('expose l ancien nom sous le nouveau pour la validation', async () => {
    clearAll();
    const { readAllEnv, setEnvSource } = await import('@nemasus/config');
    setEnvSource({ STAX_SECRET_KEY: 'ancienne-cle' });
    expect(readAllEnv()['NEMASUS_SECRET_KEY']).toBe('ancienne-cle');
  });
});

describe('configuration publique relue a l execution', () => {
  it('relit a l execution une valeur absente au build', async () => {
    clearAll();
    const { publicEnv, setEnvSource } = await import('@nemasus/config');
    setEnvSource({
      NEXT_PUBLIC_SUPABASE_URL: 'https://projet.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'cle-anon-publique',
      PLATFORM_URL: 'https://nemasus.example',
    });
    const env = publicEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://projet.supabase.co');
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('cle-anon-publique');
    expect(env.NEXT_PUBLIC_PLATFORM_URL).toBe('https://nemasus.example');
  });

  it('accepte le nom serveur des variables Supabase', async () => {
    clearAll();
    const { publicEnv, setEnvSource } = await import('@nemasus/config');
    setEnvSource({ SUPABASE_URL: 'https://autre.supabase.co', SUPABASE_ANON_KEY: 'cle-serveur' });
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('https://autre.supabase.co');
  });

  it('ne fige pas les valeurs locales tant que la configuration n est pas arrivee', async () => {
    clearAll();
    const { publicEnv, setEnvSource } = await import('@nemasus/config');
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    setEnvSource({ NEXT_PUBLIC_SUPABASE_URL: 'https://projet.supabase.co' });
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('https://projet.supabase.co');
  });
});

describe('adresse de la plateforme sur Vercel sans PLATFORM_URL', () => {
  const configured = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://projet.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'cle-anon-publique',
  };

  it('prend l adresse de production du projet au lieu de localhost', async () => {
    clearAll();
    const { platformUrl, publicEnv, setEnvSource } = await import('@nemasus/config');
    setEnvSource({
      ...configured,
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'sta-x-platform.vercel.app',
      VERCEL_URL: 'sta-x-platform-abc123.vercel.app',
    });
    expect(publicEnv().NEXT_PUBLIC_PLATFORM_URL).toBe('https://sta-x-platform.vercel.app');
    expect(platformUrl()).toBe('https://sta-x-platform.vercel.app');
  });

  it('prend l adresse de la branche sur un apercu', async () => {
    clearAll();
    const { publicEnv, setEnvSource } = await import('@nemasus/config');
    setEnvSource({
      ...configured,
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_BRANCH_URL: 'sta-x-platform-git-branche.vercel.app',
    });
    expect(publicEnv().NEXT_PUBLIC_PLATFORM_URL).toBe(
      'https://sta-x-platform-git-branche.vercel.app',
    );
  });

  it('prefere toujours PLATFORM_URL quand elle est posee', async () => {
    clearAll();
    const { publicEnv, setEnvSource } = await import('@nemasus/config');
    setEnvSource({
      ...configured,
      PLATFORM_URL: 'https://nemasus.example',
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'sta-x-platform.vercel.app',
    });
    expect(publicEnv().NEXT_PUBLIC_PLATFORM_URL).toBe('https://nemasus.example');
  });

  it('ignore ces variables hors de Vercel', async () => {
    clearAll();
    const { publicEnv, setEnvSource } = await import('@nemasus/config');
    setEnvSource({ ...configured, VERCEL_PROJECT_PRODUCTION_URL: 'hote.example' });
    expect(publicEnv().NEXT_PUBLIC_PLATFORM_URL).toBe('http://localhost:3000');
  });
});
