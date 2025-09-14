/**
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  packageManager: 'pnpm',
  reporters: ['clear-text', 'progress'],
  testRunner: 'jest',
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts'
  ],
  coverageAnalysis: 'off',
  thresholds: {
    high: 80,
    low: 60,
    break: null
  }
};

export default config;