export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*_tests.ts', '**/*_test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
    }],
  },
  moduleFileExtensions: ['ts', 'js'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*_test*.ts',
    '!src/test-runner.ts',
    '!src/run-tests.ts',
  ],
  moduleNameMapper: {
    '^(.+)\\.js$': '$1',
  },
};