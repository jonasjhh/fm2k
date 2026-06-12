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
    ignores: ['node_modules/**'],
  },
];
