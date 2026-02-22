// Requirements: testing.2.1, testing.2.2, testing.2.3

const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/property/**/*.property.test.{ts,tsx}'],
  testTimeout: 30000, // 30 seconds for 100+ iterations
  automock: false,
  // Limit workers to reduce memory usage: property-based tests are CPU-intensive
  maxWorkers: 2,
  workerIdleMemoryLimit: '256MB',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts'
  },
  // Ensure TSX files are properly transformed
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json'
      }
    ]
  }
};
