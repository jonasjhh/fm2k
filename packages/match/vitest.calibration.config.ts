import { defineConfig } from 'vitest/config';

// Opt-in config for the slow distribution/calibration suite (`pnpm test:calibration`).
// Kept out of the normal `test`/`check` run because it is heavy and is the deliberate
// target of balance tuning rather than a pass/fail unit gate.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.calibration.test.ts'],
    testTimeout: 120_000,
  },
});
