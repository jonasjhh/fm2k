import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import { baseConfig, vitestTestGlobals } from '../../eslint.config.base.mjs';

export default [
  ...baseConfig({
    tsconfigRootDir: import.meta.dirname,
    forbidBackend: true,
    jsx: true,
    globals: {
      console: 'readonly',
      window: 'readonly',
      document: 'readonly',
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
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      globals: vitestTestGlobals,
    },
  },
  {
    ignores: ['node_modules/**'],
  },
];
