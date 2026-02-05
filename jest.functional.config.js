// Requirements: testing.4.1, testing.4.2, testing.4.3

const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/functional/**/*.functional.test.ts'],
  testTimeout: 120000, // 120 seconds for real Electron tests with windows
  testEnvironment: 'node',
  automock: false,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  // CRITICAL: Do NOT mock Electron - use real Electron API and show windows
  // Requirements: testing.4.2
  moduleNameMapper: {},
  // Show only failures by default, full output with --verbose flag
  verbose: false,
  // Ensure Electron is available in test environment
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
  },
};
