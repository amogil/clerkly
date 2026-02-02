// Requirements: clerkly.2.5

/**
 * Jest test setup file
 * This file runs before all tests to configure the test environment
 */

// Set test timeout
jest.setTimeout(10000);

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  // Keep error and warn for debugging
  error: jest.fn(),
  warn: jest.fn(),
  // Suppress log, debug, info in tests
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};
