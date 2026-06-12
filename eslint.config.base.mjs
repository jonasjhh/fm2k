import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// Rules shared by every workspace member, so linting is consistent everywhere.
export const sharedRules = {
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  'prefer-const': 'error',
  'no-var': 'error',
  'no-trailing-spaces': 'error',
  'semi': ['error', 'always'],
  'quotes': ['error', 'single'],
  'comma-dangle': ['error', 'always-multiline'],
  'object-curly-spacing': ['error', 'always'],
  'array-bracket-spacing': ['error', 'never'],
  'eol-last': ['error', 'always'],
  'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1, maxBOF: 0 }],
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-inferrable-types': 'error',
  '@typescript-eslint/prefer-nullish-coalescing': 'warn',
  '@typescript-eslint/no-non-null-assertion': 'warn',
  'eqeqeq': ['error', 'always'],
  'curly': ['error', 'all'],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-wrappers': 'error',
  'no-throw-literal': 'error',
  'no-undef-init': 'error',
  'no-unreachable': 'error',
  // ── Loop / termination safety ──────────────────────────────────────────────
  // Curbs the genuinely-bad subset of patterns that produce non-terminating
  // mutants under mutation testing (loops mutated into infinite loops). These
  // are the timeout-prone patterns that a simple lint rule can actually catch.
  'no-constant-condition': ['error', { checkLoops: true }],
  'no-unmodified-loop-condition': 'error',
  'no-unreachable-loop': 'error',
};

// Globals available in Vitest test files (globals: true).
export const vitestTestGlobals = {
  describe: 'readonly',
  test: 'readonly',
  it: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  vi: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
};

// Architecture boundary: generic packages must never depend on the backend.
const forbidBackendRule = {
  'no-restricted-imports': ['error', {
    patterns: [{
      group: ['@fm2k/backend', '@fm2k/backend/*'],
      message: 'Dependency rule: packages/* must not import from @fm2k/backend. The backend builds on top of the packages, never the reverse.',
    }],
  }],
};

/**
 * Build the base flat-config array for a workspace member.
 * @param {object} opts
 * @param {string} opts.tsconfigRootDir - import.meta.dirname of the package.
 * @param {boolean} [opts.jsx] - enable JSX parsing (apps/web).
 * @param {Record<string, 'readonly'|'writable'>} [opts.globals] - environment globals.
 * @param {boolean} [opts.forbidBackend] - forbid importing @fm2k/backend (for packages/*).
 */
export function baseConfig({ tsconfigRootDir, jsx = false, globals = {}, forbidBackend = false }) {
  return [
    js.configs.recommended,
    {
      files: jsx ? ['**/*.ts', '**/*.tsx'] : ['**/*.ts'],
      languageOptions: {
        parser: tsparser,
        parserOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          ...(jsx ? { ecmaFeatures: { jsx: true } } : {}),
          project: './tsconfig.json',
          tsconfigRootDir,
        },
        globals,
      },
      plugins: {
        '@typescript-eslint': tseslint,
      },
      rules: { ...sharedRules, ...(forbidBackend ? forbidBackendRule : {}) },
    },
  ];
}
