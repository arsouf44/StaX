// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

/**
 * Flat ESLint config for the StaX monorepo.
 * Rules are intentionally strict: the repository has a `--max-warnings=0` gate in CI.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.open-next/**',
      '**/.wrangler/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.generated.ts',
      'packages/database/src/generated/**',
      'supabase/functions/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          // L'argent ne doit jamais devenir un flottant. Cible uniquement les
          // valeurs nommees en centimes : `deltaBps / 100` reste legitime.
          selector: "BinaryExpression[operator='/'][right.value=100][left.name=/[Cc]ents$/]",
          message:
            'Ne divisez pas des montants en centimes par 100. Utilisez formatMoney() ou toMajorUnits() de @stax/payments.',
        },
        {
          selector:
            "BinaryExpression[operator='/'][right.value=100][left.property.name=/[Cc]ents$/]",
          message:
            'Ne divisez pas des montants en centimes par 100. Utilisez formatMoney() ou toMajorUnits() de @stax/payments.',
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'object-shorthand': 'error',
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Guardrail: secrets must never be read from a client-exposed namespace.
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            "N'accedez pas a process.env directement : utilisez serverEnv()/publicEnv() de @stax/config/env.",
        },
      ],
    },
  },
  {
    // The env module itself, config scripts and tests are allowed raw access.
    // `dotenv.ts` a pour role exact de REMPLIR process.env depuis les fichiers
    // de la racine : c'est le seul module autorise a y ecrire.
    files: [
      'packages/config/src/env.ts',
      'packages/config/src/runtime.ts',
      'packages/config/src/dotenv.ts',
      'scripts/**/*.ts',
      'tests/**/*.ts',
      '**/*.config.{ts,mjs,js}',
      '**/vitest.config.ts',
    ],
    rules: {
      'no-restricted-properties': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['tests/**/*.ts', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
);
