// Requirements: error-notifications.1.1, error-notifications.1.4

import fc from 'fast-check';
import { handleBackgroundError } from '../../src/main/ErrorHandler';

// Mock MainEventBus
const mockPublish = jest.fn();
jest.mock('../../src/main/events/MainEventBus', () => ({
  MainEventBus: {
    getInstance: jest.fn(() => ({
      publish: mockPublish,
      subscribe: jest.fn(),
      subscribeAll: jest.fn(),
      clear: jest.fn(),
      destroy: jest.fn(),
    })),
    resetInstance: jest.fn(),
  },
}));

// Mock Electron (still needed for MainEventBus internal usage)
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

describe('ErrorHandler Property Tests', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear mocks
    mockPublish.mockClear();

    // Spy on console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  /* Feature: ui, Property 20: Показ уведомления при ошибке фонового процесса
     Preconditions: various error messages and contexts
     Action: call handleBackgroundError() with different inputs
     Assertions: error.created event published via EventBus for all inputs
     Requirements: error-notifications.1.1 */
  it('should send error notification for any background error', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (errorMessage, context) => {
          // Skip filtered error messages (race conditions)
          const lowerMessage = errorMessage.toLowerCase();
          const lowerContext = context.toLowerCase();
          if (
            (lowerMessage.includes('no user logged in') && lowerContext.includes('logout')) ||
            lowerMessage.includes('cancelled') ||
            lowerMessage.includes('aborted') ||
            lowerMessage.includes('race condition') ||
            lowerMessage.includes('concurrent operation')
          ) {
            return true; // Skip this test case
          }

          // Reset mocks for each iteration
          mockPublish.mockClear();

          const error = new Error(errorMessage);
          handleBackgroundError(error, context);

          // Verify error.created event published via EventBus with typed event
          expect(mockPublish).toHaveBeenCalledTimes(1);
          const publishedEvent = mockPublish.mock.calls[0][0];
          expect(publishedEvent.type).toBe('error.created');
          expect(publishedEvent.message).toBe(errorMessage);
          expect(publishedEvent.context).toBe(context);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 23: Логирование ошибок в консоль
     Preconditions: various error messages and contexts
     Action: call handleBackgroundError() with different inputs
     Assertions: error logged to console with context for all inputs
     Requirements: error-notifications.1.4 */
  it('should log all errors to console with context', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (errorMessage, context) => {
          // Reset mocks for each iteration
          consoleErrorSpy.mockClear();

          const error = new Error(errorMessage);
          handleBackgroundError(error, context);

          // Verify console logging
          expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining(`[${context}] Error:`)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 20: Уведомление публикуется через EventBus
     Preconditions: various error messages and contexts
     Action: call handleBackgroundError()
     Assertions: error.created event published via EventBus
     Requirements: error-notifications.1.1 */
  it('should publish error.created event via EventBus', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (errorMessage, context) => {
          // Skip filtered error messages (race conditions)
          const lowerMessage = errorMessage.toLowerCase();
          const lowerContext = context.toLowerCase();
          if (
            (lowerMessage.includes('no user logged in') && lowerContext.includes('logout')) ||
            lowerMessage.includes('cancelled') ||
            lowerMessage.includes('aborted') ||
            lowerMessage.includes('race condition') ||
            lowerMessage.includes('concurrent operation')
          ) {
            return true; // Skip this test case
          }

          // Reset mocks
          mockPublish.mockClear();

          const error = new Error(errorMessage);
          handleBackgroundError(error, context);

          // Verify error.created event published with typed event
          expect(mockPublish).toHaveBeenCalledTimes(1);
          const publishedEvent = mockPublish.mock.calls[0][0];
          expect(publishedEvent.type).toBe('error.created');
          expect(publishedEvent.message).toBe(errorMessage);
          expect(publishedEvent.context).toBe(context);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 23: Обработка различных типов ошибок
     Preconditions: various error types (Error, string, object)
     Action: call handleBackgroundError()
     Assertions: all error types handled correctly
     Requirements: error-notifications.1.4 */
  it('should handle different error types', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.record({
            message: fc.string({ minLength: 1, maxLength: 100 }),
          }),
          fc.integer()
        ),
        fc.string({ minLength: 1, maxLength: 50 }),
        (error, context) => {
          // Reset mocks
          consoleErrorSpy.mockClear();
          mockPublish.mockClear();

          // Should not throw for any error type
          expect(() => handleBackgroundError(error, context)).not.toThrow();

          // Should log something
          expect(consoleErrorSpy).toHaveBeenCalled();

          // Note: error.created event may not be published for filtered errors
          // This test only verifies no exceptions are thrown
        }
      ),
      { numRuns: 100 }
    );
  });
});
