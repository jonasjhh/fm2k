import { defineConfig, configDefaults } from 'vitest/config';

// Config used by Stryker. Excludes calibration and multi-system integration tests
// that orchestrate full seasons/leagues — too slow under instrumentation and they
// guard emergent behaviour, not the individual units Stryker targets.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      'src/**/*.calibration.test.ts',
      'src/**/league-manager-integration.test.ts',
    ],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 15_000,
  },
});
