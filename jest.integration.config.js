// Requirements: testing.3.1, testing.3.2, testing.3.3

const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/integration/**/*.integration.test.ts'],
  testTimeout: 60000, // 60 seconds for real Electron tests
  testEnvironment: 'node',
  automock: false,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // CRITICAL: Do NOT mock Electron - use real Electron API
  moduleNameMapper: {}
};
