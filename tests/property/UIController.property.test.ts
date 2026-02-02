/**
 * @jest-environment jsdom
 */

// Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3, clerkly.2.6, clerkly.2.8
import * as fc from 'fast-check';
import { UIController } from '../../src/renderer/UIController';

describe('Property Tests - UI Controller', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Create a fresh container for each test
    container = document.createElement('div');
    container.setAttribute('data-testid', 'test-container');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  /* Preconditions: UIController initialized with container, performance threshold set to 100ms
     Action: execute render() operations with various simulated execution times (both < 100ms and > 100ms)
     Assertions: for all operations < 100ms, performanceWarning is false; for all operations > 100ms, performanceWarning is true
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6: Performance Threshold Monitoring - render() correctly sets performanceWarning based on execution time', () => {
    // Generate arbitrary execution times: mix of fast (<= 100ms) and slow (> 100ms)
    const executionTimeArbitrary = fc.oneof(
      fc.integer({ min: 0, max: 100 }), // Fast operations (no warning)
      fc.integer({ min: 101, max: 500 }) // Slow operations (warning)
    );

    fc.assert(
      fc.property(executionTimeArbitrary, (executionTime: number) => {
        const uiController = new UIController(container);

        // Mock performance.now to simulate specific execution time
        const originalNow = performance.now;
        let callCount = 0;
        performance.now = jest.fn(() => {
          callCount++;
          if (callCount === 1) return 0; // Start time
          return executionTime; // End time
        });

        try {
          // Execute render
          const result = uiController.render();

          // Verify result
          expect(result.success).toBe(true);
          expect(result.renderTime).toBe(executionTime);

          // Verify performance warning is set correctly
          // Note: threshold is exclusive (> 100ms), so 100ms does not trigger warning
          if (executionTime > 100) {
            expect(result.performanceWarning).toBe(true);
          } else {
            expect(result.performanceWarning).toBe(false);
          }
        } finally {
          // Restore original performance.now
          performance.now = originalNow;
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: UIController initialized with container, UI already rendered
     Action: execute updateView() operations with various simulated execution times (both < 100ms and > 100ms)
     Assertions: for all operations < 100ms, performanceWarning is false; for all operations > 100ms, performanceWarning is true
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6: Performance Threshold Monitoring - updateView() correctly sets performanceWarning based on execution time', () => {
    // Generate arbitrary execution times and data
    const executionTimeArbitrary = fc.oneof(
      fc.integer({ min: 0, max: 100 }), // Fast operations (no warning)
      fc.integer({ min: 101, max: 500 }) // Slow operations (warning)
    );

    const dataArbitrary = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.object(),
      fc.array(fc.anything()),
      fc.constantFrom(null, undefined)
    );

    fc.assert(
      fc.property(executionTimeArbitrary, dataArbitrary, (executionTime: number, data: any) => {
        const uiController = new UIController(container);

        // Render first to create content area
        uiController.render();

        // Mock performance.now to simulate specific execution time
        const originalNow = performance.now;
        let callCount = 0;
        performance.now = jest.fn(() => {
          callCount++;
          if (callCount === 1) return 0; // Start time
          return executionTime; // End time
        });

        try {
          // Execute updateView
          const result = uiController.updateView(data);

          // Verify result
          expect(result.success).toBe(true);
          expect(result.updateTime).toBe(executionTime);

          // Verify performance warning is set correctly
          // Note: threshold is exclusive (> 100ms), so 100ms does not trigger warning
          if (executionTime > 100) {
            expect(result.performanceWarning).toBe(true);
          } else {
            expect(result.performanceWarning).toBe(false);
          }
        } finally {
          // Restore original performance.now
          performance.now = originalNow;
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: UIController initialized with container
     Action: execute render() with execution time exactly at threshold boundary (100ms)
     Assertions: performanceWarning is false (threshold is exclusive, > 100ms)
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: render() at exact threshold boundary (100ms) does not trigger warning', () => {
    const uiController = new UIController(container);

    // Mock performance.now to simulate exactly 100ms
    const originalNow = performance.now;
    let callCount = 0;
    performance.now = jest.fn(() => {
      callCount++;
      if (callCount === 1) return 0; // Start time
      return 100; // End time (exactly at threshold)
    });

    try {
      const result = uiController.render();

      expect(result.success).toBe(true);
      expect(result.renderTime).toBe(100);
      expect(result.performanceWarning).toBe(false); // Should NOT warn at threshold (exclusive)
    } finally {
      performance.now = originalNow;
    }
  });

  /* Preconditions: UIController initialized with container, UI rendered
     Action: execute updateView() with execution time exactly at threshold boundary (100ms)
     Assertions: performanceWarning is false (threshold is exclusive, > 100ms)
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: updateView() at exact threshold boundary (100ms) does not trigger warning', () => {
    const uiController = new UIController(container);
    uiController.render();

    // Mock performance.now to simulate exactly 100ms
    const originalNow = performance.now;
    let callCount = 0;
    performance.now = jest.fn(() => {
      callCount++;
      if (callCount === 1) return 0; // Start time
      return 100; // End time (exactly at threshold)
    });

    try {
      const result = uiController.updateView({ test: 'data' });

      expect(result.success).toBe(true);
      expect(result.updateTime).toBe(100);
      expect(result.performanceWarning).toBe(false); // Should NOT warn at threshold (exclusive)
    } finally {
      performance.now = originalNow;
    }
  });

  /* Preconditions: UIController initialized with container
     Action: execute render() with very fast execution time (< 10ms)
     Assertions: performanceWarning is false, renderTime is accurate
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: very fast render() operations (< 10ms) do not trigger warning', () => {
    const fastTimeArbitrary = fc.integer({ min: 0, max: 9 });

    fc.assert(
      fc.property(fastTimeArbitrary, (executionTime: number) => {
        const uiController = new UIController(container);

        // Mock performance.now
        const originalNow = performance.now;
        let callCount = 0;
        performance.now = jest.fn(() => {
          callCount++;
          if (callCount === 1) return 0;
          return executionTime;
        });

        try {
          const result = uiController.render();

          expect(result.success).toBe(true);
          expect(result.renderTime).toBe(executionTime);
          expect(result.performanceWarning).toBe(false);
        } finally {
          performance.now = originalNow;
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: UIController initialized with container
     Action: execute render() with very slow execution time (> 1000ms)
     Assertions: performanceWarning is true, renderTime is accurate
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: very slow render() operations (> 1000ms) trigger warning', () => {
    const slowTimeArbitrary = fc.integer({ min: 1000, max: 5000 });

    fc.assert(
      fc.property(slowTimeArbitrary, (executionTime: number) => {
        const uiController = new UIController(container);

        // Mock performance.now
        const originalNow = performance.now;
        let callCount = 0;
        performance.now = jest.fn(() => {
          callCount++;
          if (callCount === 1) return 0;
          return executionTime;
        });

        try {
          const result = uiController.render();

          expect(result.success).toBe(true);
          expect(result.renderTime).toBe(executionTime);
          expect(result.performanceWarning).toBe(true);
        } finally {
          performance.now = originalNow;
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: UIController initialized with container, UI rendered
     Action: execute updateView() with very fast execution time (< 10ms)
     Assertions: performanceWarning is false, updateTime is accurate
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: very fast updateView() operations (< 10ms) do not trigger warning', () => {
    const fastTimeArbitrary = fc.integer({ min: 0, max: 9 });

    fc.assert(
      fc.property(fastTimeArbitrary, (executionTime: number) => {
        const uiController = new UIController(container);
        uiController.render();

        // Mock performance.now
        const originalNow = performance.now;
        let callCount = 0;
        performance.now = jest.fn(() => {
          callCount++;
          if (callCount === 1) return 0;
          return executionTime;
        });

        try {
          const result = uiController.updateView({ test: 'data' });

          expect(result.success).toBe(true);
          expect(result.updateTime).toBe(executionTime);
          expect(result.performanceWarning).toBe(false);
        } finally {
          performance.now = originalNow;
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: UIController initialized with container, UI rendered
     Action: execute updateView() with very slow execution time (> 1000ms)
     Assertions: performanceWarning is true, updateTime is accurate
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: very slow updateView() operations (> 1000ms) trigger warning', () => {
    const slowTimeArbitrary = fc.integer({ min: 1000, max: 5000 });

    fc.assert(
      fc.property(slowTimeArbitrary, (executionTime: number) => {
        const uiController = new UIController(container);
        uiController.render();

        // Mock performance.now
        const originalNow = performance.now;
        let callCount = 0;
        performance.now = jest.fn(() => {
          callCount++;
          if (callCount === 1) return 0;
          return executionTime;
        });

        try {
          const result = uiController.updateView({ test: 'data' });

          expect(result.success).toBe(true);
          expect(result.updateTime).toBe(executionTime);
          expect(result.performanceWarning).toBe(true);
        } finally {
          performance.now = originalNow;
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: UIController initialized with container
     Action: execute render() with execution time just at threshold (100ms)
     Assertions: performanceWarning is false (threshold is exclusive)
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: render() at threshold (100ms) does not trigger warning', () => {
    const uiController = new UIController(container);

    // Mock performance.now to simulate 100ms
    const originalNow = performance.now;
    let callCount = 0;
    performance.now = jest.fn(() => {
      callCount++;
      if (callCount === 1) return 0;
      return 100;
    });

    try {
      const result = uiController.render();

      expect(result.success).toBe(true);
      expect(result.renderTime).toBe(100);
      expect(result.performanceWarning).toBe(false);
    } finally {
      performance.now = originalNow;
    }
  });

  /* Preconditions: UIController initialized with container
     Action: execute render() with execution time just above threshold (101ms)
     Assertions: performanceWarning is true
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: render() just above threshold (101ms) triggers warning', () => {
    const uiController = new UIController(container);

    // Mock performance.now to simulate 101ms
    const originalNow = performance.now;
    let callCount = 0;
    performance.now = jest.fn(() => {
      callCount++;
      if (callCount === 1) return 0;
      return 101;
    });

    try {
      const result = uiController.render();

      expect(result.success).toBe(true);
      expect(result.renderTime).toBe(101);
      expect(result.performanceWarning).toBe(true);
    } finally {
      performance.now = originalNow;
    }
  });

  /* Preconditions: UIController initialized with container, UI rendered
     Action: execute updateView() with execution time just at threshold (100ms)
     Assertions: performanceWarning is false (threshold is exclusive)
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: updateView() at threshold (100ms) does not trigger warning', () => {
    const uiController = new UIController(container);
    uiController.render();

    // Mock performance.now to simulate 100ms
    const originalNow = performance.now;
    let callCount = 0;
    performance.now = jest.fn(() => {
      callCount++;
      if (callCount === 1) return 0;
      return 100;
    });

    try {
      const result = uiController.updateView({ test: 'data' });

      expect(result.success).toBe(true);
      expect(result.updateTime).toBe(100);
      expect(result.performanceWarning).toBe(false);
    } finally {
      performance.now = originalNow;
    }
  });

  /* Preconditions: UIController initialized with container, UI rendered
     Action: execute updateView() with execution time just above threshold (101ms)
     Assertions: performanceWarning is true
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: updateView() just above threshold (101ms) triggers warning', () => {
    const uiController = new UIController(container);
    uiController.render();

    // Mock performance.now to simulate 101ms
    const originalNow = performance.now;
    let callCount = 0;
    performance.now = jest.fn(() => {
      callCount++;
      if (callCount === 1) return 0;
      return 101;
    });

    try {
      const result = uiController.updateView({ test: 'data' });

      expect(result.success).toBe(true);
      expect(result.updateTime).toBe(101);
      expect(result.performanceWarning).toBe(true);
    } finally {
      performance.now = originalNow;
    }
  });

  /* Preconditions: UIController initialized with container
     Action: execute multiple render() operations with varying execution times
     Assertions: each operation independently sets performanceWarning correctly
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6: multiple operations independently monitor performance', () => {
    const executionTimesArbitrary = fc.array(fc.integer({ min: 0, max: 500 }), {
      minLength: 2,
      maxLength: 10,
    });

    fc.assert(
      fc.property(executionTimesArbitrary, (executionTimes: number[]) => {
        const uiController = new UIController(container);
        const originalNow = performance.now;

        for (const executionTime of executionTimes) {
          let callCount = 0;
          performance.now = jest.fn(() => {
            callCount++;
            if (callCount === 1) return 0;
            return executionTime;
          });

          const result = uiController.render();

          expect(result.success).toBe(true);
          expect(result.renderTime).toBe(executionTime);

          // Note: threshold is exclusive (> 100ms)
          if (executionTime > 100) {
            expect(result.performanceWarning).toBe(true);
          } else {
            expect(result.performanceWarning).toBe(false);
          }
        }

        performance.now = originalNow;
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: UIController initialized with container
     Action: execute render() that fails with error, measure time
     Assertions: performanceWarning still set correctly based on execution time even on failure
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: performance monitoring works even when operation fails', () => {
    const executionTimeArbitrary = fc.oneof(
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 100, max: 500 })
    );

    fc.assert(
      fc.property(executionTimeArbitrary, (executionTime: number) => {
        const badContainer = document.createElement('div');
        const uiController = new UIController(badContainer);

        // Mock innerHTML setter to throw error
        const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
        Object.defineProperty(badContainer, 'innerHTML', {
          set: () => {
            throw new Error('Test error');
          },
          configurable: true,
        });

        // Mock performance.now
        const originalNow = performance.now;
        let callCount = 0;
        performance.now = jest.fn(() => {
          callCount++;
          if (callCount === 1) return 0;
          return executionTime;
        });

        try {
          const result = uiController.render();

          // Even on failure, performance monitoring should work
          expect(result.success).toBe(false);
          expect(result.renderTime).toBe(executionTime);

          // Note: threshold is exclusive (> 100ms)
          if (executionTime > 100) {
            expect(result.performanceWarning).toBe(true);
          } else {
            expect(result.performanceWarning).toBe(false);
          }
        } finally {
          performance.now = originalNow;
          if (originalInnerHTML) {
            Object.defineProperty(badContainer, 'innerHTML', originalInnerHTML);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: UIController initialized with container
     Action: execute render() with zero execution time
     Assertions: performanceWarning is false, renderTime is 0
     Requirements: clerkly.nfr.1.2, clerkly.nfr.1.3 */
  // Feature: clerkly, Property 6
  test('Property 6 edge case: zero execution time does not trigger warning', () => {
    const uiController = new UIController(container);

    // Mock performance.now to simulate 0ms
    const originalNow = performance.now;
    performance.now = jest.fn(() => {
      return 0; // Both start and end at 0
    });

    try {
      const result = uiController.render();

      expect(result.success).toBe(true);
      expect(result.renderTime).toBe(0);
      expect(result.performanceWarning).toBe(false);
    } finally {
      performance.now = originalNow;
    }
  });
});
