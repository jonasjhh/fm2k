/**
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  packageManager: 'pnpm',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  testRunner: 'jest',
  plugins: ['@stryker-mutator/jest-runner'],
  mutate: [
    'src/**/*.ts',
    '!src/**/*.test.ts'
  ],
  coverageAnalysis: 'off',
  thresholds: {
    high: 80,
    low: 60,
    break: null
  },
  htmlReporter: {
    fileName: 'reports/mutation/html/index.html'
  },
  jsonReporter: {
    fileName: 'reports/mutation/mutation.json'
  }
};

export default config;