// Requirements: google-oauth-auth.11.1, google-oauth-auth.11.2, google-oauth-auth.11.3, google-oauth-auth.11.4, google-oauth-auth.11.5, google-oauth-auth.11.6

import { AuthWindowManager } from '../../../src/main/auth/AuthWindowManager';
import WindowManager from '../../../src/main/WindowManager';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';

// Mock WindowManager
jest.mock('../../../src/main/WindowManager');

// Mock OAuthClientManager
jest.mock('../../../src/main/auth/OAuthClientManager');

// Mock Electron's BrowserWindow
jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    close: jest.fn(),
    webContents: {
      session: {
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
      },
      on: jest.fn(),
    },
  })),
}));

describe('AuthWindowManager', () => {
  let authWindowManager: AuthWindowManager;
  let mockWindowManager: jest.Mocked<WindowManager>;
  let mockOAuthClient: jest.Mocked<OAuthClientManager>;
  let mockWindow: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock window
    mockWindow = {
      loadFile: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      once: jest.fn(),
      removeAllListeners: jest.fn(),
      close: jest.fn(),
      webContents: {
        session: {
          webRequest: {
            onHeadersReceived: jest.fn(),
          },
        },
        on: jest.fn(),
      },
    };

    // Create mock WindowManager
    mockWindowManager = {
      createWindow: jest.fn().mockReturnValue(mockWindow),
      configureWindow: jest.fn(),
      closeWindow: jest.fn(),
      getWindow: jest.fn().mockReturnValue(mockWindow),
      isWindowCreated: jest.fn().mockReturnValue(false),
    } as any;

    // Create mock OAuthClientManager
    mockOAuthClient = {
      getAuthStatus: jest.fn(),
    } as any;

    // Create AuthWindowManager instance
    authWindowManager = new AuthWindowManager(mockWindowManager, mockOAuthClient);
  });

  /* Preconditions: AuthWindowManager is instantiated with mocked dependencies
     Action: call initializeApp when user is not authorized
     Assertions: getAuthStatus is called, showLoginWindow is invoked
     Requirements: google-oauth-auth.11.1, google-oauth-auth.11.2 */
  it('should show login window when user is not authorized', async () => {
    mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: false });

    await authWindowManager.initializeApp();

    expect(mockOAuthClient.getAuthStatus).toHaveBeenCalledTimes(1);
    expect(mockWindowManager.createWindow).toHaveBeenCalled();
  });

  /* Preconditions: AuthWindowManager is instantiated with mocked dependencies
     Action: call initializeApp when user is authorized
     Assertions: getAuthStatus is called, showMainWindow is invoked
     Requirements: google-oauth-auth.11.1, google-oauth-auth.11.3 */
  it('should show main window when user is authorized', async () => {
    mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: true });
    mockWindowManager.isWindowCreated.mockReturnValue(false);

    await authWindowManager.initializeApp();

    expect(mockOAuthClient.getAuthStatus).toHaveBeenCalledTimes(1);
    expect(mockWindowManager.createWindow).toHaveBeenCalled();
    // Main window should not have size restrictions
    expect(mockWindowManager.configureWindow).not.toHaveBeenCalled();
  });

  /* Preconditions: AuthWindowManager is instantiated, login window is shown
     Action: call onAuthSuccess to handle successful authentication
     Assertions: existing window is reused for main content
     Requirements: google-oauth-auth.11.4 */
  it('should close login window and open main window on auth success', async () => {
    mockWindowManager.isWindowCreated.mockReturnValue(true);

    await authWindowManager.onAuthSuccess();

    expect(mockWindowManager.getWindow).toHaveBeenCalled();
  });

  /* Preconditions: AuthWindowManager is instantiated, login window is shown
     Action: call onAuthError with error message and code
     Assertions: error is logged, window remains open for error display
     Requirements: google-oauth-auth.11.5 */
  it('should show login error screen on auth error', async () => {
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
    mockWindowManager.isWindowCreated.mockReturnValue(true);
    mockWindowManager.getWindow.mockReturnValue(mockWindow);

    await authWindowManager.onAuthError('Test error', 'test_error_code');

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthWindowManager] Authentication failed:')
    );

    consoleSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated, error screen is shown
     Action: call onRetry to retry authentication
     Assertions: showLoginWindow is called to display login screen again
     Requirements: google-oauth-auth.11.6 */
  it('should show login screen again on retry', async () => {
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
    mockWindowManager.isWindowCreated.mockReturnValue(false);

    await authWindowManager.onRetry();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthWindowManager] Retrying authentication')
    );
    expect(mockWindowManager.createWindow).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call getWindow method
     Assertions: returns the current window instance
     Requirements: google-oauth-auth.11.1 */
  it('should return current window instance', () => {
    const window = authWindowManager.getWindow();
    expect(window).toBeNull(); // Initially null before any window is created
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call initializeApp when getAuthStatus throws error
     Assertions: error is caught, login window is shown as fallback
     Requirements: google-oauth-auth.11.1, google-oauth-auth.11.2 */
  it('should show login window on initialization error', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockOAuthClient.getAuthStatus.mockRejectedValue(new Error('Auth check failed'));

    await authWindowManager.initializeApp();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthWindowManager] Failed to initialize app:')
    );
    expect(mockWindowManager.createWindow).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated, window already exists
     Action: call initializeApp when user is not authorized and window exists
     Assertions: existing window is reused
     Requirements: google-oauth-auth.11.2 */
  it('should reuse existing window for login screen', async () => {
    mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: false });
    mockWindowManager.isWindowCreated.mockReturnValue(true);

    await authWindowManager.initializeApp();

    expect(mockWindowManager.getWindow).toHaveBeenCalled();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call onAuthError when no window exists
     Assertions: login window is created before showing error
     Requirements: google-oauth-auth.11.5 */
  it('should create login window if not exists when showing error', async () => {
    mockWindowManager.isWindowCreated.mockReturnValue(false);
    mockWindowManager.getWindow.mockReturnValue(null);

    await authWindowManager.onAuthError('Test error');

    expect(mockWindowManager.createWindow).toHaveBeenCalled();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call initializeApp when createWindow returns null
     Assertions: error is logged and thrown after retry fails
     Requirements: google-oauth-auth.11.2 */
  it('should handle window creation failure in showLoginWindow', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: false });
    mockWindowManager.createWindow.mockReturnValue(null as any);

    // initializeApp catches errors and tries to show login window
    // Since createWindow returns null, it will fail and throw error
    await expect(authWindowManager.initializeApp()).rejects.toThrow('Failed to create window');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthWindowManager] Failed to show login window:')
    );

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call initializeApp when createWindow throws error
     Assertions: error is logged and thrown after retry fails
     Requirements: google-oauth-auth.11.2 */
  it('should handle configuration error in showLoginWindow', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: false });
    mockWindowManager.createWindow.mockImplementation(() => {
      throw new Error('Configuration failed');
    });

    // initializeApp catches errors and tries to show login window
    await expect(authWindowManager.initializeApp()).rejects.toThrow('Configuration failed');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthWindowManager] Failed to show login window:')
    );

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call onAuthSuccess when createWindow returns null
     Assertions: error is thrown and logged
     Requirements: google-oauth-auth.11.4 */
  it('should handle window creation failure in showMainWindow', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockWindowManager.isWindowCreated.mockReturnValue(false); // Window doesn't exist
    mockWindowManager.createWindow.mockReturnValue(null as any);

    await expect(authWindowManager.onAuthSuccess()).rejects.toThrow('Failed to create main window');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthWindowManager] Failed to show main window:')
    );

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call onAuthSuccess when closeWindow throws error
     Assertions: error is caught and logged
     Requirements: google-oauth-auth.11.4 */
  it('should handle close window error in showMainWindow', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockWindowManager.isWindowCreated.mockReturnValue(false); // Window doesn't exist
    mockWindowManager.createWindow.mockImplementation(() => {
      throw new Error('Create failed');
    });

    await expect(authWindowManager.onAuthSuccess()).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthWindowManager] Failed to show main window:')
    );

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call onAuthError when showLoginWindow throws error
     Assertions: error is caught and logged
     Requirements: google-oauth-auth.11.5 */
  it('should handle error when showLoginError fails to create window', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockWindowManager.isWindowCreated.mockReturnValue(false);
    mockWindowManager.createWindow.mockReturnValue(null as any);

    await expect(authWindowManager.onAuthError('Test error')).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthWindowManager] Failed to show login error:')
    );

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call onRetry when createWindow throws error
     Assertions: error is caught and logged
     Requirements: google-oauth-auth.11.6 */
  it('should handle error when retry fails', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockWindowManager.isWindowCreated.mockReturnValue(false);
    mockWindowManager.createWindow.mockImplementation(() => {
      throw new Error('Create failed');
    });

    await expect(authWindowManager.onRetry()).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AuthWindowManager] Failed to retry authentication:')
    );

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call onAuthSuccess when handleAuthSuccess throws error
     Assertions: error is propagated
     Requirements: google-oauth-auth.11.4 */
  it('should propagate error from handleAuthSuccess', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockWindowManager.isWindowCreated.mockReturnValue(false); // Window doesn't exist
    mockWindowManager.createWindow.mockReturnValue(null as any);

    await expect(authWindowManager.onAuthSuccess()).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  /* Preconditions: AuthWindowManager is instantiated
     Action: call onAuthError when handleAuthError throws error
     Assertions: error is propagated
     Requirements: google-oauth-auth.11.5 */
  it('should propagate error from handleAuthError', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockWindowManager.isWindowCreated.mockReturnValue(false);
    mockWindowManager.createWindow.mockReturnValue(null as any);

    await expect(authWindowManager.onAuthError('Test error', 'code')).rejects.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
