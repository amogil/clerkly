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
    '^react-markdown$': '<rootDir>/tests/__mocks__/react-markdown.tsx',
    '^@/(.*)$': '<rootDir>/src/renderer/$1',
    '^use-stick-to-bottom$': '<rootDir>/tests/__mocks__/use-stick-to-bottom.tsx',
    // Mock AI Elements components that use ESM-only deps (use-stick-to-bottom, streamdown)
    '^.*/ai-elements/conversation$': '<rootDir>/tests/__mocks__/ai-elements/conversation.tsx',
    '^.*/ai-elements/message$': '<rootDir>/tests/__mocks__/ai-elements/message.tsx',
    '^.*/ai-elements/reasoning$': '<rootDir>/tests/__mocks__/ai-elements/reasoning.tsx'
  }
};
