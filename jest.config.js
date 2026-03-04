// Requirements: clerkly.2.5, clerkly.2.6, clerkly.2.7

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/__tests__/**/*.tsx',
    '**/?(*.)+(spec|test).ts',
    '**/?(*.)+(spec|test).tsx'
  ],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json'
      }
    ]
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // Critical components require high coverage
    // UserSettingsManager uses DatabaseManager Query API (user-data-isolation.6.7, 6.8)
    // Coverage adjusted after migration to runUserQuery/getUserRow methods
    './src/main/UserSettingsManager.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/main/LifecycleManager.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/main/IPCHandlers.ts': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
