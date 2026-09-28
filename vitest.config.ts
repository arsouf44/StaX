import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@nemasus/types': r('./packages/types/src/index.ts'),
      '@nemasus/config/dotenv': r('./packages/config/src/dotenv.ts'),
      '@nemasus/config/identity': r('./packages/config/src/identity.ts'),
      '@nemasus/config': r('./packages/config/src/index.ts'),
      '@nemasus/validation': r('./packages/validation/src/index.ts'),
      // Le sous-chemin doit venir AVANT le module racine : vite applique la
      // premiere correspondance, et `@nemasus/payments` capturerait sinon
      // `@nemasus/payments/money`.
      '@nemasus/payments/money': r('./packages/payments/src/money.ts'),
      '@nemasus/payments': r('./packages/payments/src/index.ts'),
      '@nemasus/business': r('./packages/business/src/index.ts'),
      '@nemasus/security': r('./packages/security/src/index.ts'),
      '@nemasus/site-engine': r('./packages/site-engine/src/index.ts'),
      '@nemasus/site-contract': r('./packages/site-contract/src/index.ts'),
      '@nemasus/infrastructure': r('./packages/infrastructure/src/index.ts'),
      '@nemasus/database': r('./packages/database/src/index.ts'),
      '@nemasus/analytics': r('./packages/analytics/src/index.ts'),
      '@nemasus/emails': r('./packages/emails/src/index.ts'),
      // Modules serveur de la plateforme (routes de webhooks, publication),
      // appeles tels quels par les tests de securite.
      '~': r('./apps/platform/src'),
      'server-only': r('./tests/fixtures/server-only.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', 'packages/ui/**'],
    },
    testTimeout: 20_000,
  },
});
