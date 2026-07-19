const config = {
  packageManager: 'pnpm',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.mutation.config.ts' },
  plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
  checkers: ['typescript'],
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
    '!src/game-events.ts',
    '!src/test-setup.ts',
    // Pure type declarations — no runtime to mutate.
    '!src/**/types.ts',
    '!src/**/*-types.ts',
    // Static data tables (maps over imported JSON) — low-value mutants.
    // country-data.ts holds real transform logic and is intentionally mutated.
    '!src/data/teams-data.ts',
  ],
  coverageAnalysis: 'perTest',
  incremental: true,
  // Cap slow mutants (e.g. loops a mutant turns non-terminating) so they fail fast.
  timeoutMS: 10000,
  timeoutFactor: 1.5,
  thresholds: { high: 80, low: 60, break: null },
  htmlReporter: { fileName: '../../reports/mutation/engine/index.html' },
  jsonReporter: { fileName: '../../reports/mutation/engine/mutation.json' },
};

export default config;
