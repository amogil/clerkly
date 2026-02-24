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
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
    '^react-markdown$': '<rootDir>/tests/__mocks__/react-markdown.tsx',
    '^@/(.*)$': '<rootDir>/src/renderer/$1',
    // Mock AI Elements components that use ESM-only deps (use-stick-to-bottom, streamdown)
    '^.*/ai-elements/conversation$': '<rootDir>/tests/__mocks__/ai-elements/conversation.tsx',
    '^.*/ai-elements/message$': '<rootDir>/tests/__mocks__/ai-elements/message.tsx',
    '^.*/ai-elements/reasoning$': '<rootDir>/tests/__mocks__/ai-elements/reasoning.tsx',
  }
};
