import { defineConfig, configDefaults } from 'vitest/config';

// Config used by Stryker. Excludes *.sim.test.ts files — they run 240+ full match
// simulations per test and far exceed Stryker's dry-run time budget.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: [
      ...configDefaults.exclude,
      'src/**/*.sim.test.ts',
    ],
    testTimeout: 15_000,
  },
});
