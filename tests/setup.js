// Requirements: clerkly.2.1, clerkly.2.5
// Jest setup file - runs before each test suite

const { resetAllMocks } = require('./mocks/electron');

/**
 * Global test setup
 * Configures the testing environment before each test suite
 */

// Reset all Electron mocks before each test
beforeEach(() => {
  resetAllMocks();
});

// Set up global test timeout
jest.setTimeout(10000);

// Suppress console errors during tests (optional - comment out if you want to see them)
// global.console.error = jest.fn();
// global.console.warn = jest.fn();

// Mock process.platform for Mac OS X testing
Object.defineProperty(process, 'platform', {
  value: 'darwin',
  writable: true
});

// Mock process.env for testing
process.env.NODE_ENV = 'test';

// Add custom matchers if needed
expect.extend({
  /**
   * Custom matcher to check if a value is a valid timestamp
   */
  toBeValidTimestamp(received) {
    const pass = typeof received === 'number' && received > 0 && received <= Date.now();
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid timestamp`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid timestamp`,
        pass: false
      };
    }
  },

  /**
   * Custom matcher to check if a path is valid
   */
  toBeValidPath(received) {
    const pass = typeof received === 'string' && received.length > 0;
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid path`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid path`,
        pass: false
      };
    }
  }
});

// Global test utilities
global.testUtils = {
  /**
   * Wait for a condition to be true
   * @param {Function} condition - Function that returns boolean
   * @param {number} timeout - Maximum time to wait in ms
   * @param {number} interval - Check interval in ms
   */
  async waitFor(condition, timeout = 5000, interval = 100) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  },

  /**
   * Create a mock event object for IPC testing
   */
  createMockEvent() {
    return {
      sender: {
        send: jest.fn()
      },
      reply: jest.fn()
    };
  },

  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
