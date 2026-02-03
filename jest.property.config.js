// Requirements: testing.2.1, testing.2.2, testing.2.3

const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/property/**/*.property.test.ts'],
  testTimeout: 30000, // 30 seconds for 100+ iterations
  automock: false,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts'
  }
};
