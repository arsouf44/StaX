import { defineConfig, devices } from '@playwright/test';

/**
 * Parcours de bout en bout CONTRE UNE VRAIE PILE : Postgres, authentification
 * et API Supabase (tests/e2e/stack), plateforme en build de production et
 * moteur des sites clients (Worker Cloudflare en local).
 *
 * Ces parcours verifient ce qu aucun test unitaire ne peut prouver : qu une
 * modification faite dans l editeur est reellement servie, en HTTP, sur
 * l adresse publique du site apres publication — et seulement apres.
 *
 * Prerequis :
 *   pnpm e2e:stack start          # base, authentification, API
 *   pnpm build                    # build de production
 *   pnpm test:e2e:stack           # demarre plateforme + sites, puis les tests
 *
 * Les parcours partagent une base : ils s executent l un apres l autre.
 */
const chromiumPath = process.env.STAX_E2E_CHROMIUM || undefined;

export default defineConfig({
  testDir: './tests/e2e/journeys',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:3100',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    ...devices['Desktop Chrome'],
    // Assez large pour que l apercu « ordinateur » de l editeur soit rendu a
    // 100 % : Playwright calcule mal la position d un clic dans un cadre
    // reduit par `transform` (le navigateur, lui, la calcule bien).
    viewport: { width: 1960, height: 1000 },
    launchOptions: {
      executablePath: chromiumPath,
      // Les sites clients vivent sur *.sites.stax.test : le navigateur les
      // resout vers le moteur local, comme le DNS vers Cloudflare en production.
      args: ['--host-resolver-rules=MAP *.sites.stax.test 127.0.0.1:3101'],
    },
  },

  webServer: [
    {
      command: 'tests/e2e/stack/serve.sh platform',
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'tests/e2e/stack/serve.sh sites',
      // Sans nom d hote connu, le moteur repond 404 : on attend le port.
      port: 3101,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
