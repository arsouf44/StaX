import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout.
 *
 * Ils couvrent les parcours dont l echec passerait inapercu dans les tests
 * unitaires : navigation reelle, formulaires reellement soumis, redirections
 * d authentification, accessibilite au clavier.
 *
 * Ils tournent contre un BUILD DE PRODUCTION, pas contre le serveur de
 * developpement : ce sont les optimisations du build (prerendu, decoupage,
 * en-tetes) qui cassent en silence, et un test contre `next dev` ne les verrait
 * jamais.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Un telephone d entree de gamme : la moitie des visiteurs d un site de
    // commercant arrive depuis un appareil de ce genre.
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm --filter @stax/platform exec next start -p 3100',
        url: 'http://127.0.0.1:3100',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
