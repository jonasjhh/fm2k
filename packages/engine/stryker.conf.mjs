const config = {
  packageManager: 'pnpm',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  testRunner: 'jest',
  plugins: ['@stryker-mutator/jest-runner', '@stryker-mutator/typescript-checker'],
  checkers: ['typescript'],
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
    '!src/game-events.ts',
    '!src/shared/types.ts',
  ],
  coverageAnalysis: 'perTest',
  incremental: true,
  thresholds: { high: 80, low: 60, break: null },
  htmlReporter: { fileName: '../../reports/mutation/html/index.html' },
  jsonReporter: { fileName: '../../reports/mutation/mutation.json' },
};

export default config;
