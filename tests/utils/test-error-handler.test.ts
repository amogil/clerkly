// Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TestErrorHandlerImpl,
  testErrorHandler,
  withAsyncErrorHandling,
  withMockErrorHandling,
  assertWithErrorHandling,
  withTimeout,
  type TestContext,
  type ErrorDetails,
} from "./test-error-handler";

describe("TestErrorHandler", () => {
  let handler: TestErrorHandlerImpl;

  beforeEach(() => {
    handler = new TestErrorHandlerImpl();
    handler.clearErrorHistory();
  });

  describe("handleAsyncError", () => {
    /* Preconditions: TestErrorHandler instance is initialized with empty error history
       Action: call handleAsyncError with an Error and test context
       Assertions: error is recorded in history with correct type, message includes test name and error message, error is re-thrown
       Requirements: testing-infrastructure.4.1 */
    it("should handle async errors and record them in history", () => {
      const error = new Error("Async operation failed");
      const context: TestContext = {
        testName: "test async operation",
        testFile: "test.ts",
      };

      expect(() => handler.handleAsyncError(error, context)).toThrow();

      const history = handler.getErrorHistory();
      expect(history).toHaveLength(1);
      expect(history[0].errorType).toBe("async");
      expect(history[0].message).toContain("test async operation");
      expect(history[0].message).toContain("Async operation failed");
      expect(history[0].context.testName).toBe("test async operation");
      expect(history[0].originalError).toBe(error);
    });

    /* Preconditions: TestErrorHandler instance with error callback set
       Action: call handleAsyncError with an Error
       Assertions: error callback is invoked with error details
       Requirements: testing-infrastructure.4.1 */
    it("should notify error callback when handling async errors", () => {
      const callback = vi.fn();
      handler.setErrorCallback(callback);

      const error = new Error("Callback test");
      const context: TestContext = { testName: "callback test" };

      try {
        handler.handleAsyncError(error, context);
      } catch {
        // Expected to throw
      }

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          errorType: "async",
          message: expect.stringContaining("Callback test"),
        }),
      );
    });

    /* Preconditions: TestErrorHandler instance is initialized
       Action: call handleAsyncError with Error containing stack trace
       Assertions: error details include the stack trace
       Requirements: testing-infrastructure.4.1 */
    it("should preserve stack trace in error details", () => {
      const error = new Error("Stack trace test");
      const context: TestContext = { testName: "stack test" };

      try {
        handler.handleAsyncError(error, context);
      } catch {
        // Expected to throw
      }

      const history = handler.getErrorHistory();
      expect(history[0].stack).toBeDefined();
      expect(history[0].stack).toContain("Stack trace test");
    });
  });

  describe("handleMockError", () => {
    /* Preconditions: TestErrorHandler instance is initialized with empty error history
       Action: call handleMockError with mock name and Error
       Assertions: error is recorded with type "mock", message includes mock name, error is re-thrown
       Requirements: testing-infrastructure.4.3 */
    it("should handle mock errors and record them in history", () => {
      const error = new Error("Mock setup failed");
      const mockName = "FileSystemMock";

      expect(() => handler.handleMockError(mockName, error)).toThrow();

      const history = handler.getErrorHistory();
      expect(history).toHaveLength(1);
      expect(history[0].errorType).toBe("mock");
      expect(history[0].message).toContain("FileSystemMock");
      expect(history[0].message).toContain("Mock setup failed");
      expect(history[0].context.metadata?.mockName).toBe(mockName);
    });

    /* Preconditions: TestErrorHandler instance is initialized
       Action: call handleMockError with different mock names
       Assertions: each error is recorded separately with correct mock name
       Requirements: testing-infrastructure.4.3 */
    it("should handle multiple mock errors independently", () => {
      const error1 = new Error("Network mock failed");
      const error2 = new Error("Database mock failed");

      try {
        handler.handleMockError("NetworkMock", error1);
      } catch {
        // Expected
      }

      try {
        handler.handleMockError("DatabaseMock", error2);
      } catch {
        // Expected
      }

      const history = handler.getErrorHistory();
      expect(history).toHaveLength(2);
      expect(history[0].context.metadata?.mockName).toBe("NetworkMock");
      expect(history[1].context.metadata?.mockName).toBe("DatabaseMock");
    });
  });

  describe("handleAssertionError", () => {
    /* Preconditions: TestErrorHandler instance is initialized with empty error history
       Action: call handleAssertionError with assertion description, expected and actual values
       Assertions: error is recorded with type "assertion", message includes expected and actual values, AssertionError is thrown
       Requirements: testing-infrastructure.4.3 */
    it("should handle assertion errors with detailed comparison", () => {
      const assertion = "value should equal 42";
      const expected = 42;
      const actual = 24;

      expect(() => handler.handleAssertionError(assertion, expected, actual)).toThrow(
        /Assertion failed/,
      );

      const history = handler.getErrorHistory();
      expect(history).toHaveLength(1);
      expect(history[0].errorType).toBe("assertion");
      expect(history[0].message).toContain("value should equal 42");
      expect(history[0].message).toContain("Expected: 42");
      expect(history[0].message).toContain("Actual: 24");
    });

    /* Preconditions: TestErrorHandler instance is initialized
       Action: call handleAssertionError with complex objects as expected and actual
       Assertions: error message contains formatted object representations
       Requirements: testing-infrastructure.4.3 */
    it("should format complex values in assertion errors", () => {
      const assertion = "objects should match";
      const expected = { name: "John", age: 30 };
      const actual = { name: "Jane", age: 25 };

      try {
        handler.handleAssertionError(assertion, expected, actual);
      } catch {
        // Expected
      }

      const history = handler.getErrorHistory();
      expect(history[0].message).toContain("John");
      expect(history[0].message).toContain("Jane");
    });

    /* Preconditions: TestErrorHandler instance is initialized
       Action: call handleAssertionError with null and undefined values
       Assertions: error message correctly formats null and undefined
       Requirements: testing-infrastructure.4.3 */
    it("should handle null and undefined values in assertions", () => {
      try {
        handler.handleAssertionError("should not be null", "value", null);
      } catch {
        // Expected
      }

      try {
        handler.handleAssertionError("should not be undefined", "value", undefined);
      } catch {
        // Expected
      }

      const history = handler.getErrorHistory();
      expect(history[0].message).toContain("null");
      expect(history[1].message).toContain("undefined");
    });

    /* Preconditions: TestErrorHandler instance is initialized
       Action: call handleAssertionError with arrays as expected and actual
       Assertions: error message contains formatted array representations
       Requirements: testing-infrastructure.4.3 */
    it("should format arrays in assertion errors", () => {
      const assertion = "arrays should match";
      const expected = [1, 2, 3];
      const actual = [1, 2, 4];

      try {
        handler.handleAssertionError(assertion, expected, actual);
      } catch {
        // Expected
      }

      const history = handler.getErrorHistory();
      expect(history[0].message).toContain("[1, 2, 3]");
      expect(history[0].message).toContain("[1, 2, 4]");
    });

    /* Preconditions: TestErrorHandler instance is initialized
       Action: call handleAssertionError with large arrays
       Assertions: error message truncates large arrays appropriately
       Requirements: testing-infrastructure.4.3 */
    it("should truncate large arrays in assertion errors", () => {
      const assertion = "large arrays";
      const expected = Array.from({ length: 100 }, (_, i) => i);
      const actual = Array.from({ length: 100 }, (_, i) => i + 1);

      try {
        handler.handleAssertionError(assertion, expected, actual);
      } catch {
        // Expected
      }

      const history = handler.getErrorHistory();
      expect(history[0].message).toContain("100 items");
    });
  });

  describe("handleTimeoutError", () => {
    /* Preconditions: TestErrorHandler instance is initialized with empty error history
       Action: call handleTimeoutError with test name and timeout value
       Assertions: error is recorded with type "timeout", message includes test name and timeout
       Requirements: testing-infrastructure.4.1 */
    it("should handle timeout errors", () => {
      const testName = "slow async test";
      const timeout = 5000;

      handler.handleTimeoutError(testName, timeout);

      const history = handler.getErrorHistory();
      expect(history).toHaveLength(1);
      expect(history[0].errorType).toBe("timeout");
      expect(history[0].message).toContain("slow async test");
      expect(history[0].message).toContain("5000ms");
      expect(history[0].context.metadata?.timeout).toBe(timeout);
    });
  });

  describe("error history management", () => {
    /* Preconditions: TestErrorHandler instance with multiple errors recorded
       Action: call getErrorHistory
       Assertions: returns array of all recorded errors in order
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should maintain error history", () => {
      try {
        handler.handleMockError("Mock1", new Error("Error 1"));
      } catch {
        // Expected
      }

      try {
        handler.handleMockError("Mock2", new Error("Error 2"));
      } catch {
        // Expected
      }

      const history = handler.getErrorHistory();
      expect(history).toHaveLength(2);
      expect(history[0].message).toContain("Error 1");
      expect(history[1].message).toContain("Error 2");
    });

    /* Preconditions: TestErrorHandler instance with errors recorded
       Action: call clearErrorHistory
       Assertions: error history is empty after clearing
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should clear error history", () => {
      try {
        handler.handleMockError("Mock", new Error("Test"));
      } catch {
        // Expected
      }

      expect(handler.getErrorHistory()).toHaveLength(1);

      handler.clearErrorHistory();
      expect(handler.getErrorHistory()).toHaveLength(0);
    });

    /* Preconditions: TestErrorHandler instance with max history size set to 3
       Action: record 5 errors
       Assertions: only the last 3 errors are retained in history
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should limit history size to prevent memory leaks", () => {
      handler.setMaxHistorySize(3);

      for (let i = 0; i < 5; i++) {
        try {
          handler.handleMockError(`Mock${i}`, new Error(`Error ${i}`));
        } catch {
          // Expected
        }
      }

      const history = handler.getErrorHistory();
      expect(history).toHaveLength(3);
      expect(history[0].message).toContain("Error 2");
      expect(history[2].message).toContain("Error 4");
    });

    /* Preconditions: TestErrorHandler instance with multiple error types recorded
       Action: call getErrorsByType with specific error type
       Assertions: returns only errors of the specified type
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should filter errors by type", () => {
      try {
        handler.handleMockError("Mock", new Error("Mock error"));
      } catch {
        // Expected
      }

      try {
        handler.handleAsyncError(new Error("Async error"), { testName: "test" });
      } catch {
        // Expected
      }

      const mockErrors = handler.getErrorsByType("mock");
      const asyncErrors = handler.getErrorsByType("async");

      expect(mockErrors).toHaveLength(1);
      expect(asyncErrors).toHaveLength(1);
      expect(mockErrors[0].errorType).toBe("mock");
      expect(asyncErrors[0].errorType).toBe("async");
    });

    /* Preconditions: TestErrorHandler instance with errors from multiple tests
       Action: call getErrorsForTest with specific test name
       Assertions: returns only errors from the specified test
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should filter errors by test name", () => {
      try {
        handler.handleAsyncError(new Error("Error 1"), { testName: "test1" });
      } catch {
        // Expected
      }

      try {
        handler.handleAsyncError(new Error("Error 2"), { testName: "test2" });
      } catch {
        // Expected
      }

      const test1Errors = handler.getErrorsForTest("test1");
      const test2Errors = handler.getErrorsForTest("test2");

      expect(test1Errors).toHaveLength(1);
      expect(test2Errors).toHaveLength(1);
      expect(test1Errors[0].context.testName).toBe("test1");
      expect(test2Errors[0].context.testName).toBe("test2");
    });

    /* Preconditions: TestErrorHandler instance is initialized
       Action: check hasErrors before and after recording an error
       Assertions: returns false when empty, true when errors exist
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should check if errors exist", () => {
      expect(handler.hasErrors()).toBe(false);

      try {
        handler.handleMockError("Mock", new Error("Test"));
      } catch {
        // Expected
      }

      expect(handler.hasErrors()).toBe(true);
    });

    /* Preconditions: TestErrorHandler instance with multiple errors recorded
       Action: call getLastError
       Assertions: returns the most recently recorded error
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should get last error", () => {
      try {
        handler.handleMockError("Mock1", new Error("First"));
      } catch {
        // Expected
      }

      try {
        handler.handleMockError("Mock2", new Error("Last"));
      } catch {
        // Expected
      }

      const lastError = handler.getLastError();
      expect(lastError?.message).toContain("Last");
    });
  });

  describe("helper functions", () => {
    /* Preconditions: async function that throws an error
       Action: wrap function with withAsyncErrorHandling and execute
       Assertions: error is caught and handled, recorded in global error handler
       Requirements: testing-infrastructure.4.1 */
    it("withAsyncErrorHandling should wrap async functions", async () => {
      const asyncFn = async () => {
        throw new Error("Async test error");
      };

      const wrapped = withAsyncErrorHandling("test async", asyncFn);

      await expect(wrapped()).rejects.toThrow();

      const history = testErrorHandler.getErrorHistory();
      expect(history.some((e) => e.context.testName === "test async")).toBe(true);
    });

    /* Preconditions: function that throws an error
       Action: wrap function with withMockErrorHandling and execute
       Assertions: error is caught and handled, recorded in global error handler
       Requirements: testing-infrastructure.4.3 */
    it("withMockErrorHandling should wrap mock operations", () => {
      const mockFn = () => {
        throw new Error("Mock operation failed");
      };

      expect(() => withMockErrorHandling("TestMock", mockFn)).toThrow();

      const history = testErrorHandler.getErrorHistory();
      expect(history.some((e) => e.errorType === "mock")).toBe(true);
    });

    /* Preconditions: assertion condition is false
       Action: call assertWithErrorHandling with false condition
       Assertions: assertion error is thrown and recorded
       Requirements: testing-infrastructure.4.3 */
    it("assertWithErrorHandling should handle failed assertions", () => {
      expect(() => assertWithErrorHandling("value should be 42", false, 42, 24)).toThrow();

      const history = testErrorHandler.getErrorHistory();
      expect(history.some((e) => e.errorType === "assertion")).toBe(true);
    });

    /* Preconditions: assertion condition is true
       Action: call assertWithErrorHandling with true condition
       Assertions: no error is thrown, no error is recorded
       Requirements: testing-infrastructure.4.3 */
    it("assertWithErrorHandling should pass successful assertions", () => {
      const initialLength = testErrorHandler.getErrorHistory().length;

      expect(() => assertWithErrorHandling("value should be 42", true, 42, 42)).not.toThrow();

      const finalLength = testErrorHandler.getErrorHistory().length;
      expect(finalLength).toBe(initialLength);
    });

    /* Preconditions: async function that completes within timeout
       Action: wrap function with withTimeout and execute
       Assertions: function completes successfully without timeout error
       Requirements: testing-infrastructure.4.1 */
    it("withTimeout should allow fast operations to complete", async () => {
      const fastFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "success";
      };

      const result = await withTimeout("fast test", fastFn, 1000);
      expect(result).toBe("success");
    });

    /* Preconditions: async function that takes longer than timeout
       Action: wrap function with withTimeout and execute
       Assertions: timeout error is thrown and recorded
       Requirements: testing-infrastructure.4.1 */
    it("withTimeout should handle slow operations", async () => {
      const slowFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return "success";
      };

      await expect(withTimeout("slow test", slowFn, 50)).rejects.toThrow(/timed out/);

      const history = testErrorHandler.getErrorHistory();
      expect(history.some((e) => e.errorType === "timeout")).toBe(true);
    });
  });

  describe("error callback", () => {
    /* Preconditions: TestErrorHandler instance with error callback set
       Action: record multiple errors
       Assertions: callback is invoked for each error
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should invoke callback for all error types", () => {
      const callback = vi.fn();
      handler.setErrorCallback(callback);

      try {
        handler.handleMockError("Mock", new Error("Mock error"));
      } catch {
        // Expected
      }

      try {
        handler.handleAsyncError(new Error("Async error"), { testName: "test" });
      } catch {
        // Expected
      }

      expect(callback).toHaveBeenCalledTimes(2);
    });

    /* Preconditions: TestErrorHandler instance with error callback that throws
       Action: record an error
       Assertions: callback error is caught and logged, original error is still recorded
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should handle errors in callback gracefully", () => {
      const callback = vi.fn(() => {
        throw new Error("Callback error");
      });
      handler.setErrorCallback(callback);

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        handler.handleMockError("Mock", new Error("Test"));
      } catch {
        // Expected
      }

      expect(consoleSpy).toHaveBeenCalled();
      expect(handler.getErrorHistory()).toHaveLength(1);

      consoleSpy.mockRestore();
    });
  });

  describe("edge cases", () => {
    /* Preconditions: TestErrorHandler instance is initialized
       Action: set max history size to invalid value (0)
       Assertions: error is thrown
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should reject invalid max history size", () => {
      expect(() => handler.setMaxHistorySize(0)).toThrow();
      expect(() => handler.setMaxHistorySize(-1)).toThrow();
    });

    /* Preconditions: TestErrorHandler instance with no errors
       Action: call getLastError
       Assertions: returns undefined
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should return undefined for last error when history is empty", () => {
      expect(handler.getLastError()).toBeUndefined();
    });

    /* Preconditions: TestErrorHandler instance is initialized
       Action: call getErrorsForTest with non-existent test name
       Assertions: returns empty array
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should return empty array for non-existent test", () => {
      const errors = handler.getErrorsForTest("non-existent");
      expect(errors).toEqual([]);
    });

    /* Preconditions: TestErrorHandler instance is initialized
       Action: call getErrorsByType with type that has no errors
       Assertions: returns empty array
       Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3 */
    it("should return empty array for error type with no errors", () => {
      const errors = handler.getErrorsByType("timeout");
      expect(errors).toEqual([]);
    });
  });
});
