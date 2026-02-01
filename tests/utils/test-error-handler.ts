// Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3

/**
 * Test context information for error handling
 */
export interface TestContext {
  testName: string;
  testFile?: string;
  testSuite?: string;
  startTime?: number;
  metadata?: Record<string, any>;
}

/**
 * Error details for structured error reporting
 */
export interface ErrorDetails {
  message: string;
  stack?: string;
  context: TestContext;
  timestamp: number;
  errorType: "async" | "mock" | "assertion" | "timeout" | "unknown";
  originalError?: Error;
}

/**
 * Interface for handling test errors in unit tests
 * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
 */
export interface TestErrorHandler {
  handleAsyncError(error: Error, context: TestContext): void;
  handleMockError(mockName: string, error: Error): void;
  handleAssertionError(assertion: string, expected: any, actual: any): void;
  handleTimeoutError(testName: string, timeout: number): void;
  getErrorHistory(): ErrorDetails[];
  clearErrorHistory(): void;
  setErrorCallback(callback: (error: ErrorDetails) => void): void;
}

/**
 * Implementation of TestErrorHandler for comprehensive error handling in unit tests
 * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
 */
export class TestErrorHandlerImpl implements TestErrorHandler {
  private errorHistory: ErrorDetails[] = [];
  private errorCallback?: (error: ErrorDetails) => void;
  private maxHistorySize: number = 100;

  /**
   * Handle asynchronous errors in tests
   * Requirements: testing-infrastructure.4.1
   */
  handleAsyncError(error: Error, context: TestContext): void {
    const errorDetails: ErrorDetails = {
      message: `Async error in test "${context.testName}": ${error.message}`,
      stack: error.stack,
      context,
      timestamp: Date.now(),
      errorType: "async",
      originalError: error,
    };

    this.recordError(errorDetails);
    this.notifyCallback(errorDetails);

    // Re-throw to ensure test fails
    throw new Error(errorDetails.message, { cause: error });
  }

  /**
   * Handle mock-related errors
   * Requirements: testing-infrastructure.4.3
   */
  handleMockError(mockName: string, error: Error): void {
    const errorDetails: ErrorDetails = {
      message: `Mock error in "${mockName}": ${error.message}`,
      stack: error.stack,
      context: {
        testName: mockName,
        metadata: { mockName },
      },
      timestamp: Date.now(),
      errorType: "mock",
      originalError: error,
    };

    this.recordError(errorDetails);
    this.notifyCallback(errorDetails);

    // Re-throw to ensure test fails
    throw new Error(errorDetails.message, { cause: error });
  }

  /**
   * Handle assertion errors with detailed comparison
   * Requirements: testing-infrastructure.4.3
   */
  handleAssertionError(assertion: string, expected: any, actual: any): void {
    const expectedStr = this.formatValue(expected);
    const actualStr = this.formatValue(actual);

    const errorDetails: ErrorDetails = {
      message: `Assertion failed: ${assertion}\nExpected: ${expectedStr}\nActual: ${actualStr}`,
      context: {
        testName: assertion,
        metadata: {
          assertion,
          expected,
          actual,
        },
      },
      timestamp: Date.now(),
      errorType: "assertion",
    };

    this.recordError(errorDetails);
    this.notifyCallback(errorDetails);

    // Create assertion error
    const error = new Error(errorDetails.message);
    error.name = "AssertionError";
    throw error;
  }

  /**
   * Handle timeout errors in tests
   * Requirements: testing-infrastructure.4.1
   */
  handleTimeoutError(testName: string, timeout: number): void {
    const errorDetails: ErrorDetails = {
      message: `Test "${testName}" timed out after ${timeout}ms`,
      context: {
        testName,
        metadata: { timeout },
      },
      timestamp: Date.now(),
      errorType: "timeout",
    };

    this.recordError(errorDetails);
    this.notifyCallback(errorDetails);
  }

  /**
   * Get history of all recorded errors
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  getErrorHistory(): ErrorDetails[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Set callback for error notifications
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  setErrorCallback(callback: (error: ErrorDetails) => void): void {
    this.errorCallback = callback;
  }

  /**
   * Record error in history with size limit
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  private recordError(error: ErrorDetails): void {
    this.errorHistory.push(error);

    // Limit history size to prevent memory leaks
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Notify error callback if set
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  private notifyCallback(error: ErrorDetails): void {
    if (this.errorCallback) {
      try {
        this.errorCallback(error);
      } catch (callbackError) {
        console.error("Error in error callback:", callbackError);
      }
    }
  }

  /**
   * Format value for error messages
   * Requirements: testing-infrastructure.4.3
   */
  private formatValue(value: any): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return `"${value}"`;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      if (value.length <= 3) {
        return `[${value.map((v) => this.formatValue(v)).join(", ")}]`;
      }
      return `[${value
        .slice(0, 3)
        .map((v) => this.formatValue(v))
        .join(", ")}, ... (${value.length} items)]`;
    }
    if (typeof value === "object") {
      try {
        const json = JSON.stringify(value, null, 2);
        if (json.length <= 100) return json;
        return `${json.substring(0, 100)}... (truncated)`;
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  /**
   * Set maximum history size
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  setMaxHistorySize(size: number): void {
    if (size < 1) {
      throw new Error("Max history size must be at least 1");
    }
    this.maxHistorySize = size;

    // Trim history if needed
    while (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Get errors by type
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  getErrorsByType(errorType: ErrorDetails["errorType"]): ErrorDetails[] {
    return this.errorHistory.filter((error) => error.errorType === errorType);
  }

  /**
   * Get errors for specific test
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  getErrorsForTest(testName: string): ErrorDetails[] {
    return this.errorHistory.filter((error) => error.context.testName === testName);
  }

  /**
   * Check if any errors were recorded
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  hasErrors(): boolean {
    return this.errorHistory.length > 0;
  }

  /**
   * Get most recent error
   * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
   */
  getLastError(): ErrorDetails | undefined {
    return this.errorHistory[this.errorHistory.length - 1];
  }
}

/**
 * Global test error handler instance
 * Requirements: testing-infrastructure.4.1, testing-infrastructure.4.3
 */
export const testErrorHandler = new TestErrorHandlerImpl();

/**
 * Helper function to wrap async test functions with error handling
 * Requirements: testing-infrastructure.4.1
 */
export function withAsyncErrorHandling<T>(
  testName: string,
  fn: () => Promise<T>,
  context?: Partial<TestContext>,
): () => Promise<T> {
  return async () => {
    const fullContext: TestContext = {
      testName,
      startTime: Date.now(),
      ...context,
    };

    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error) {
        testErrorHandler.handleAsyncError(error, fullContext);
      }
      throw error;
    }
  };
}

/**
 * Helper function to wrap mock operations with error handling
 * Requirements: testing-infrastructure.4.3
 */
export function withMockErrorHandling<T>(mockName: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof Error) {
      testErrorHandler.handleMockError(mockName, error);
    }
    throw error;
  }
}

/**
 * Helper function to create assertion with error handling
 * Requirements: testing-infrastructure.4.3
 */
export function assertWithErrorHandling(
  assertion: string,
  condition: boolean,
  expected: any,
  actual: any,
): void {
  if (!condition) {
    testErrorHandler.handleAssertionError(assertion, expected, actual);
  }
}

/**
 * Helper function to create timeout wrapper
 * Requirements: testing-infrastructure.4.1
 */
export function withTimeout<T>(
  testName: string,
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  let isResolved = false;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        testErrorHandler.handleTimeoutError(testName, timeoutMs);
        const error = new Error(`Test "${testName}" timed out after ${timeoutMs}ms`);
        error.name = "TimeoutError";
        reject(error);
      }
    }, timeoutMs);
  });

  return Promise.race([
    fn()
      .then((result) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
        }
        return result;
      })
      .catch((error) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
        }
        throw error;
      }),
    timeoutPromise,
  ]);
}
