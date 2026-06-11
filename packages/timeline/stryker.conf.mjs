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
    '!src/**/types.ts',
    '!src/**/*-types.ts',
  ],
  coverageAnalysis: 'perTest',
  incremental: true,
  timeoutMS: 10000,
  timeoutFactor: 1.5,
  thresholds: { high: 80, low: 60, break: null },
  htmlReporter: { fileName: '../../reports/mutation/timeline/index.html' },
  jsonReporter: { fileName: '../../reports/mutation/timeline/mutation.json' },
};

export default config;
