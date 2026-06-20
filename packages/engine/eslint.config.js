import { baseConfig, vitestTestGlobals } from '../../eslint.config.base.mjs';

export default [
  ...baseConfig({
    tsconfigRootDir: import.meta.dirname,
    forbidBackend: true,
    globals: {
      console: 'readonly',
      process: 'readonly',
      Buffer: 'readonly',
      global: 'readonly',
      globalThis: 'readonly',
    },
  }),
  {
    files: ['**/*.test.ts'],
    languageOptions: {
      globals: vitestTestGlobals,
    },
  },
  {
    // Engine is fully clear of `!` — hold the line here so it can't regress
    // (the shared base config only warns, to keep this opt-in per package).
    rules: { '@typescript-eslint/no-non-null-assertion': 'error' },
  },
  {
    ignores: ['node_modules/**'],
  },
];
