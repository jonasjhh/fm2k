import { defineConfig, configDefaults } from 'vitest/config';

// Config used by Stryker (mutation testing). It runs the fast, deterministic unit tests
// and EXCLUDES the heavy statistical/behavioural suites — those loop hundreds of full
// matches (too slow under mutation instrumentation) and their statistical assertions are
// poor mutant killers anyway. Mutation targets the pure logic; the statistical suites guard
// behaviour/calibration separately (see test:calibration).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      'src/**/*.calibration.test.ts',
      'src/**/action-vocabulary.test.ts',
      'src/**/discipline-setpieces.test.ts',
      'src/**/fatigue-integration.test.ts',
      'src/**/scale-calibration.test.ts',
    ],
    testTimeout: 20_000,
  },
});
