// Requirements: testing-infrastructure.1.1, testing-infrastructure.1.2
// Combined configuration for unit tests with coverage

const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/unit/**/*.test.tsx'],
  testTimeout: 10000,
  automock: false,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts',
    '^yaml$': '<rootDir>/node_modules/yaml/dist/index.js',
    '^react-markdown$': '<rootDir>/tests/__mocks__/react-markdown.tsx',
    '^@/(.*)$': '<rootDir>/src/renderer/$1',
    '^nanoid$': '<rootDir>/tests/__mocks__/nanoid.ts',
    '^use-stick-to-bottom$': '<rootDir>/tests/__mocks__/use-stick-to-bottom.tsx',
    // Mock AI Elements components that use ESM-only deps (use-stick-to-bottom, streamdown)
    '^.*/ai-elements/conversation$': '<rootDir>/tests/__mocks__/ai-elements/conversation.tsx',
    '^.*/ai-elements/code-block$': '<rootDir>/tests/__mocks__/ai-elements/code-block.tsx',
    '^.*/ai-elements/message$': '<rootDir>/tests/__mocks__/ai-elements/message.tsx',
    '^.*/ai-elements/reasoning$': '<rootDir>/tests/__mocks__/ai-elements/reasoning.tsx',
    '^.*/ai-elements/tool$': '<rootDir>/tests/__mocks__/ai-elements/tool.tsx',
  }
};
