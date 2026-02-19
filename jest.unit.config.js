// Requirements: testing.1.2, testing.1.3

const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/unit/**/*.test.tsx'],
  testTimeout: 10000,
  automock: false,
  testEnvironment: 'jsdom', // React components need jsdom
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
    '^react-markdown$': '<rootDir>/tests/__mocks__/react-markdown.tsx'
  }
};
