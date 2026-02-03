// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2
// Combined configuration for unit and property-based tests with coverage

const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '**/tests/unit/**/*.test.tsx',
    '**/tests/property/**/*.property.test.ts'
  ],
  testTimeout: 30000, // 30 seconds to accommodate property-based tests
  automock: false,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts'
  }
};
