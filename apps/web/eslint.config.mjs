import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import { baseConfig, vitestTestGlobals } from '../../eslint.config.base.mjs';

export default [
  ...baseConfig({
    tsconfigRootDir: import.meta.dirname,
    jsx: true,
    globals: {
      console: 'readonly',
      window: 'readonly',
      document: 'readonly',
      fetch: 'readonly',
      URL: 'readonly',
      URLSearchParams: 'readonly',
      setTimeout: 'readonly',
      clearTimeout: 'readonly',
      Promise: 'readonly',
      React: 'readonly',
      localStorage: 'readonly',
      indexedDB: 'readonly',
      alert: 'readonly',
      confirm: 'readonly',
      prompt: 'readonly',
    },
  }),
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'react': react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      '@typescript-eslint/no-unused-expressions': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Web is fully clear of `!` — hold the line here so it can't regress
      // (the shared base config only warns, to keep this opt-in per package).
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: vitestTestGlobals,
    },
  },
  {
    ignores: ['node_modules/**', '.next/**'],
  },
];
