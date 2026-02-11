// Requirements: error-notifications.1.1, error-notifications.1.4, error-notifications.1.5

import { BrowserWindow } from 'electron';
import { handleBackgroundError, shouldFilterError } from '../../src/main/ErrorHandler';

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
     Requirements: error-notifications.1.4 */
  it('should log error to console with context', () => {
    const error = new Error('Test error');
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[Test Context] Error:'));
  });

  /* Preconditions: Error object with stack trace
     Action: call handleBackgroundError()
     Assertions: stack trace logged to console
     Requirements: error-notifications.1.4 */
  it('should log stack trace if available', () => {
    const error = new Error('Test error');
    error.stack = 'Error: Test error\n    at test.ts:10:5';
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Test Context] Stack trace:')
    );
  });

  /* Preconditions: String error message
     Action: call handleBackgroundError()
     Assertions: string logged to console
     Requirements: error-notifications.1.4 */
  it('should handle string error messages', () => {
    const error = 'Simple error message';
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[Test Context] Error:'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Simple error message'));
  });

  /* Preconditions: Error and context provided, one window open
     Action: call handleBackgroundError()
     Assertions: error:notify event sent to window
     Requirements: error-notifications.1.1 */
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
     Requirements: error-notifications.1.1 */
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
     Requirements: error-notifications.1.1, error-notifications.1.4 */
  it('should handle case when no windows are open', () => {
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([]);

    const error = new Error('Test error');
    const context = 'Test Context';

    expect(() => handleBackgroundError(error, context)).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[Test Context] Error:'));
  });

  /* Preconditions: Error with special characters in message
     Action: call handleBackgroundError()
     Assertions: message properly logged and sent
     Requirements: error-notifications.1.1, error-notifications.1.4 */
  it('should handle errors with special characters', () => {
    const error = new Error('Error: "test" & <special> chars');
    const context = 'Test Context';

    handleBackgroundError(error, context);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[Test Context] Error:'));
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'error:notify',
      'Error: "test" & <special> chars',
      'Test Context'
    );
  });
});

describe('shouldFilterError', () => {
  /* Preconditions: Error "No user logged in" during logout
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5, user-data-isolation.1.21 */
  it('should filter "No user logged in" error during logout', () => {
    const error = new Error('No user logged in');
    const context = 'Logout';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "No user logged in" during logout (case insensitive)
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5, user-data-isolation.1.21 */
  it('should filter "No user logged in" error during logout (case insensitive)', () => {
    const error = new Error('NO USER LOGGED IN');
    const context = 'LOGOUT';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "No user logged in" during different context
     Action: call shouldFilterError()
     Assertions: returns false (error should NOT be filtered)
     Requirements: error-notifications.1.5 */
  it('should NOT filter "No user logged in" error during other operations', () => {
    const error = new Error('No user logged in');
    const context = 'Profile Loading';

    expect(shouldFilterError(error, context)).toBe(false);
  });

  /* Preconditions: Error "Operation cancelled"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should filter cancelled operation errors', () => {
    const error = new Error('Operation cancelled');
    const context = 'Data Sync';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "Request aborted"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should filter aborted operation errors', () => {
    const error = new Error('Request aborted');
    const context = 'API Request';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "Race condition detected"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should filter race condition errors', () => {
    const error = new Error('Race condition detected');
    const context = 'Background Process';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Error "Concurrent operation failed"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should filter concurrent operation errors', () => {
    const error = new Error('Concurrent operation failed');
    const context = 'Data Sync';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: String error message "cancelled"
     Action: call shouldFilterError()
     Assertions: returns true (error should be filtered)
     Requirements: error-notifications.1.5 */
  it('should handle string error messages', () => {
    const error = 'Operation cancelled';
    const context = 'Data Sync';

    expect(shouldFilterError(error, context)).toBe(true);
  });

  /* Preconditions: Normal error that should not be filtered
     Action: call shouldFilterError()
     Assertions: returns false (error should NOT be filtered)
     Requirements: error-notifications.1.5 */
  it('should NOT filter normal errors', () => {
    const error = new Error('Network connection failed');
    const context = 'API Request';

    expect(shouldFilterError(error, context)).toBe(false);
  });
});

describe('handleBackgroundError with filtering', () => {
  let mockWindow: any;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create mock window
    mockWindow = {
      webContents: {
        send: jest.fn(),
      },
    };

    // Mock BrowserWindow.getAllWindows
    (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

    // Spy on console methods
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  /* Preconditions: Error "No user logged in" during logout
     Action: call handleBackgroundError()
     Assertions: error logged, filter message logged, no IPC event sent
     Requirements: error-notifications.1.5, user-data-isolation.1.21 */
  it('should filter "No user logged in" error during logout', () => {
    const error = new Error('No user logged in');
    const context = 'Logout';

    handleBackgroundError(error, context);

    // Error should be logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[Logout] Error:'));

    // Filter message should be logged
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Logout] Error filtered (race condition)')
    );

    // No IPC event should be sent
    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });

  /* Preconditions: Error "Operation cancelled"
     Action: call handleBackgroundError()
     Assertions: error logged, filter message logged, no IPC event sent
     Requirements: error-notifications.1.5 */
  it('should filter cancelled operation errors', () => {
    const error = new Error('Operation cancelled');
    const context = 'Data Sync';

    handleBackgroundError(error, context);

    // Error should be logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[Data Sync] Error:'));

    // Filter message should be logged
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Data Sync] Error filtered (race condition)')
    );

    // No IPC event should be sent
    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });

  /* Preconditions: Error "Race condition detected"
     Action: call handleBackgroundError()
     Assertions: error logged, filter message logged, no IPC event sent
     Requirements: error-notifications.1.5 */
  it('should filter race condition errors', () => {
    const error = new Error('Race condition detected');
    const context = 'Background Process';

    handleBackgroundError(error, context);

    // Error should be logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Background Process] Error:')
    );

    // Filter message should be logged
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Background Process] Error filtered (race condition)')
    );

    // No IPC event should be sent
    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });

  /* Preconditions: Normal error that should not be filtered
     Action: call handleBackgroundError()
     Assertions: error logged, IPC event sent, no filter message
     Requirements: error-notifications.1.1, error-notifications.1.4 */
  it('should NOT filter normal errors', () => {
    const error = new Error('Network connection failed');
    const context = 'API Request';

    handleBackgroundError(error, context);

    // Error should be logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('[API Request] Error:'));

    // No filter message should be logged
    expect(consoleInfoSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Error filtered (race condition)')
    );

    // IPC event should be sent
    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      'error:notify',
      'Network connection failed',
      'API Request'
    );
  });
});
