// Requirements: ui.7.1, ui.7.4

import { BrowserWindow } from 'electron';
import { handleBackgroundError } from '../../src/main/ErrorHandler';

// Mock Electron
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(),
  },
}));

describe('ErrorHandler', () => {
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

  /* Preconditions: Error object and context provided
     Action: call handleBackgroundError()
     Assertions: error logged to console with context
     Requirements: ui.7.4 */
  it('should log error to console with context', () => {
    const error = new Error('Test error');
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Test Context] Error:', 'Test error');
  });

  /* Preconditions: Error object with stack trace
     Action: call handleBackgroundError()
     Assertions: stack trace logged to console
     Requirements: ui.7.4 */
  it('should log stack trace if available', () => {
    const error = new Error('Test error');
    error.stack = 'Error: Test error\n    at test.ts:10:5';
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Test Context] Stack trace:',
      'Error: Test error\n    at test.ts:10:5'
    );
  });

  /* Preconditions: String error message
     Action: call handleBackgroundError()
     Assertions: string logged to console
     Requirements: ui.7.4 */
  it('should handle string error messages', () => {
    const error = 'Simple error message';
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[Test Context] Error:', 'Simple error message');
  });

  /* Preconditions: Error and context provided, one window open
     Action: call handleBackgroundError()
     Assertions: error:notify event sent to window
     Requirements: ui.7.1 */
  it('should send error notification to renderer process', () => {
    const error = new Error('Test error');
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'error:notify',
      'Test error',
      'Test Context'
    );
  });

  /* Preconditions: Multiple windows open
     Action: call handleBackgroundError()
     Assertions: error:notify event sent to all windows
     Requirements: ui.7.1 */
  it('should send error notification to all renderer processes', () => {
    const mockWindow2 = {
      webContents: {
        send: jest.fn(),
      },
    };

    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow, mockWindow2]);

    const error = new Error('Test error');
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'error:notify',
      'Test error',
      'Test Context'
    );
    expect(mockWindow2.webContents.send).toHaveBeenCalledWith(
      'error:notify',
      'Test error',
      'Test Context'
    );
  });

  /* Preconditions: No windows open
     Action: call handleBackgroundError()
     Assertions: no errors thrown, error still logged
     Requirements: ui.7.1, ui.7.4 */
  it('should handle case when no windows are open', () => {
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([]);

    const error = new Error('Test error');
    const context = 'Test Context';

    expect(() => handleBackgroundError(error, context)).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith('[Test Context] Error:', 'Test error');
  });

  /* Preconditions: Error with special characters in message
     Action: call handleBackgroundError()
     Assertions: message properly logged and sent
     Requirements: ui.7.1, ui.7.4 */
  it('should handle errors with special characters', () => {
    const error = new Error('Error: "test" & <special> chars');
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Test Context] Error:',
      'Error: "test" & <special> chars'
    );
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'error:notify',
      'Error: "test" & <special> chars',
      'Test Context'
    );
  });
});
