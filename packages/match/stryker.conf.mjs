const config = {
  packageManager: 'pnpm',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  testRunner: 'vitest',
  // Mutation runs the fast, deterministic unit tests only (the heavy statistical/calibration
  // suites are excluded there — too slow under instrumentation, and poor mutant killers).
  vitest: { configFile: 'vitest.mutation.config.ts' },
  plugins: ['@stryker-mutator/vitest-runner', '@stryker-mutator/typescript-checker'],
  checkers: ['typescript'],
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
    '!src/**/types.ts',
    '!src/**/*-types.ts',
    // The distribution harness is only exercised by the (excluded) calibration suite.
    '!src/match/distribution.ts',
    // Pure balance-data tables (tunable magic numbers, like types) — not logic to mutate.
    '!src/tactics/formation-tendencies.ts',
  ],
  coverageAnalysis: 'perTest',
  incremental: true,
  timeoutMS: 20000,
  timeoutFactor: 1.5,
  thresholds: { high: 80, low: 60, break: null },
  htmlReporter: { fileName: '../../reports/mutation/match/index.html' },
  jsonReporter: { fileName: '../../reports/mutation/match/mutation.json' },
};

export default config;
