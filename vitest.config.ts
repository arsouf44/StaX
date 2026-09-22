import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@stax/types': r('./packages/types/src/index.ts'),
      '@stax/config/dotenv': r('./packages/config/src/dotenv.ts'),
      '@stax/config/identity': r('./packages/config/src/identity.ts'),
      '@stax/config': r('./packages/config/src/index.ts'),
      '@stax/validation': r('./packages/validation/src/index.ts'),
      // Le sous-chemin doit venir AVANT le module racine : vite applique la
      // premiere correspondance, et `@stax/payments` capturerait sinon
      // `@stax/payments/money`.
      '@stax/payments/money': r('./packages/payments/src/money.ts'),
      '@stax/payments': r('./packages/payments/src/index.ts'),
      '@stax/business': r('./packages/business/src/index.ts'),
      '@stax/security': r('./packages/security/src/index.ts'),
      '@stax/site-engine': r('./packages/site-engine/src/index.ts'),
      '@stax/database': r('./packages/database/src/index.ts'),
      '@stax/analytics': r('./packages/analytics/src/index.ts'),
      '@stax/emails': r('./packages/emails/src/index.ts'),
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
