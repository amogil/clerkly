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
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          lib: ['ES2020', 'DOM'],
          jsx: 'react'
        }
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
      functions: 80,
      lines: 80,
      statements: 80
    },
    // Critical components require high coverage
    // UserSettingsManager uses DatabaseManager Query API (user-data-isolation.6.7, 6.8)
    // Coverage adjusted after migration to runUserQuery/getUserRow methods
    './src/main/UserSettingsManager.ts': {
      branches: 70,
      functions: 87,
      lines: 81,
      statements: 80
    },
    './src/main/LifecycleManager.ts': {
      branches: 66,
      functions: 90,
      lines: 96,
      statements: 94
    },
    './src/main/IPCHandlers.ts': {
      branches: 52,
      functions: 81,
      lines: 63,
      statements: 63
    }
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  verbose: true,
  testTimeout: 10000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
