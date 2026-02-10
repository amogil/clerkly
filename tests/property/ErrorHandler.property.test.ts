// Requirements: ui.7.1, ui.7.4

import fc from 'fast-check';
import { BrowserWindow } from 'electron';
import { handleBackgroundError } from '../../src/main/ErrorHandler';

// Mock Electron
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(),
  },
}));

describe('ErrorHandler Property Tests', () => {
  let mockWindow: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create mock window
    mockWindow = {
      webContents: {
        send: jest.fn(),
      },
    };

    // Mock BrowserWindow.getAllWindows
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

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
     Assertions: error notification sent to renderer for all inputs
     Requirements: ui.7.1 */
  it('should send error notification for any background error', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 500 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        (errorMessage, context) => {
          // Reset mocks for each iteration
          jest.clearAllMocks();

          const error = new Error(errorMessage);
          handleBackgroundError(error, context);

          // Verify notification sent
          expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'error:notify',
            errorMessage,
            context
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 23: Логирование ошибок в консоль
     Preconditions: various error messages and contexts
     Action: call handleBackgroundError() with different inputs
     Assertions: error logged to console with context for all inputs
     Requirements: ui.7.4 */
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

  /* Feature: ui, Property 20: Уведомление отправляется всем окнам
     Preconditions: various numbers of windows (0-5)
     Action: call handleBackgroundError()
     Assertions: notification sent to all windows
     Requirements: ui.7.1 */
  it('should send notification to all open windows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }),
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (windowCount, errorMessage, context) => {
          // Create mock windows
          const mockWindows = Array.from({ length: windowCount }, () => ({
            webContents: {
              send: jest.fn(),
            },
          }));

          (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue(mockWindows);

          const error = new Error(errorMessage);
          handleBackgroundError(error, context);

          // Verify all windows received notification
          mockWindows.forEach((window) => {
            expect(window.webContents.send).toHaveBeenCalledWith(
              'error:notify',
              errorMessage,
              context
            );
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 23: Обработка различных типов ошибок
     Preconditions: various error types (Error, string, object)
     Action: call handleBackgroundError()
     Assertions: all error types handled correctly
     Requirements: ui.7.4 */
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
          jest.clearAllMocks();

          // Should not throw for any error type
          expect(() => handleBackgroundError(error, context)).not.toThrow();

          // Should log something
          expect(consoleErrorSpy).toHaveBeenCalled();

          // Should send notification
          expect(mockWindow.webContents.send).toHaveBeenCalledWith(
            'error:notify',
            expect.any(String),
            context
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
