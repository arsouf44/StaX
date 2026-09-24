import { randomBytes } from 'node:crypto';
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
  // Les parcours complets tournent contre la pile locale, avec leur propre
  // configuration : playwright.stack.config.ts.
  testIgnore: ['**/journeys/**', '**/stack/**'],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    // Navigateur deja installe sur la machine (meme variable que
    // playwright.stack.config.ts) ; a defaut, celui de Playwright.
    launchOptions: { executablePath: process.env.STAX_E2E_CHROMIUM || undefined },
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
        env: {
          /*
           * Secrets JETABLES, regeneres a chaque execution.
           *
           * Le build de production exige une cle de signature : sans elle,
           * toute soumission de formulaire leve une exception et rend la page
           * d'erreur. Les tests verifieraient alors le comportement d'une
           * plateforme mal configuree, pas celui du produit.
           *
           * Aucune valeur reelle n'entre ici, et rien n'est lu depuis
           * l'environnement : ces cles ne valent que pour ce processus.
           */
          STAX_SECRET_KEY: randomBytes(48).toString('base64'),
          /*
           * Supabase pointe volontairement vers un port ferme. L'appel echoue
           * au reseau, ce qui est exactement le cas que les tests doivent
           * couvrir : une panne du fournisseur ne doit jamais reveler si une
           * adresse est connue, ni casser la page.
           */
          NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54399',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon-key-not-a-real-secret',
          SUPABASE_URL: 'http://127.0.0.1:54399',
          SUPABASE_ANON_KEY: 'e2e-anon-key-not-a-real-secret',
          SUPABASE_SERVICE_ROLE_KEY: 'e2e-service-key-not-a-real-secret',
        },
      },
});
