// Requirements: clerkly.2.1, clerkly.2.5
import { resetAllMocks } from './mocks/electron';

beforeEach(() => {
  resetAllMocks();
});

jest.setTimeout(10000);

Object.defineProperty(process, 'platform', {
  value: 'darwin',
  writable: true
});

process.env.NODE_ENV = 'test';

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidTimestamp(): R;
      toBeValidPath(): R;
    }
  }
  
  var testUtils: {
    waitFor(condition: () => Promise<boolean> | boolean, timeout?: number, interval?: number): Promise<boolean>;
    createMockEvent(): any;
    sleep(ms: number): Promise<void>;
  };
}

expect.extend({
  toBeValidTimestamp(received: any) {
    const pass = typeof received === 'number' && received > 0 && received <= Date.now();
    return {
      message: () => pass 
        ? `expected ${received} not to be a valid timestamp`
        : `expected ${received} to be a valid timestamp`,
      pass
    };
  },

  toBeValidPath(received: any) {
    const pass = typeof received === 'string' && received.length > 0;
    return {
      message: () => pass
        ? `expected ${received} not to be a valid path`
        : `expected ${received} to be a valid path`,
      pass
    };
  }
});

global.testUtils = {
  async waitFor(condition: () => Promise<boolean> | boolean, timeout = 5000, interval = 100): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Timeout waiting for condition after ${timeout}ms`);
  },

  createMockEvent() {
    return {
      sender: {
        send: jest.fn()
      },
      reply: jest.fn()
    };
  },

  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
