const config = {
  packageManager: 'pnpm',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
  checkers: ['typescript'],
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
    // Static data tables — mutants here are slow and low-value.
    '!src/name-data.ts',
  ],
  coverageAnalysis: 'perTest',
  incremental: true,
  timeoutMS: 10000,
  timeoutFactor: 1.5,
  thresholds: { high: 80, low: 60, break: null },
  htmlReporter: { fileName: '../../reports/mutation/names/index.html' },
  jsonReporter: { fileName: '../../reports/mutation/names/mutation.json' },
};

export default config;
