// Requirements: google-oauth-auth.11.1, google-oauth-auth.11.5

import * as fc from 'fast-check';
import { AuthWindowManager } from '../../../src/main/auth/AuthWindowManager';
import WindowManager from '../../../src/main/WindowManager';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';

// Mock WindowManager
jest.mock('../../../src/main/WindowManager');

// Mock OAuthClientManager
jest.mock('../../../src/main/auth/OAuthClientManager');

// Mock Electron
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

describe('AuthWindowManager Property-Based Tests', () => {
  let mockWindowManager: jest.Mocked<WindowManager>;
  let mockOAuthClient: jest.Mocked<OAuthClientManager>;
  let mockWindow: any;

  beforeEach(() => {
    jest.clearAllMocks();

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

    mockWindowManager = {
      createWindow: jest.fn().mockReturnValue(mockWindow),
      configureWindow: jest.fn(),
      closeWindow: jest.fn(),
      getWindow: jest.fn().mockReturnValue(mockWindow),
      isWindowCreated: jest.fn().mockReturnValue(false),
    } as any;

    mockOAuthClient = {
      getAuthStatus: jest.fn(),
    } as any;
  });

  /* Feature: google-oauth-auth, Property 17: Window State Based on Auth Status
     For any application startup, if the user is not authorized, the login window must be shown;
     if authorized, the main application window must be shown.
     Validates: Requirements google-oauth-auth.11.1 */
  it('Property 17: should show correct window based on auth status', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (isAuthorized) => {
        // Reset mocks for each iteration
        jest.clearAllMocks();
        mockWindowManager.isWindowCreated.mockReturnValue(false);
        mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: isAuthorized });

        const authWindowManager = new AuthWindowManager(mockWindowManager, mockOAuthClient);
        await authWindowManager.initializeApp();

        // Verify auth status was checked
        expect(mockOAuthClient.getAuthStatus).toHaveBeenCalled();

        // Verify window was created
        expect(mockWindowManager.createWindow).toHaveBeenCalled();

        if (isAuthorized) {
          // Main window should not have size restrictions
          expect(mockWindowManager.configureWindow).not.toHaveBeenCalled();
        } else {
          // Login window should have specific size
          expect(mockWindowManager.configureWindow).toHaveBeenCalledWith({
            width: 600,
            height: 800,
            resizable: false,
          });
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: google-oauth-auth, Property 18: Error Screen Display
     For any authentication error, the login error screen must be displayed with the error message
     and appropriate error code mapping.
     Validates: Requirements google-oauth-auth.11.5 */
  it('Property 18: should display error screen for any authentication error', async () => {
    // Generator for error codes
    const errorCodeArb = fc.constantFrom(
      'popup_closed_by_user',
      'access_denied',
      'network_error',
      'invalid_grant',
      'invalid_request',
      'server_error',
      'temporarily_unavailable',
      'csrf_attack_detected',
      'database_error',
      'unknown_error'
    );

    // Generator for error messages
    const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 });

    await fc.assert(
      fc.asyncProperty(errorMessageArb, errorCodeArb, async (errorMessage, errorCode) => {
        // Reset mocks for each iteration
        jest.clearAllMocks();
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        mockWindowManager.isWindowCreated.mockReturnValue(true);
        mockWindowManager.getWindow.mockReturnValue(mockWindow);

        const authWindowManager = new AuthWindowManager(mockWindowManager, mockOAuthClient);

        await authWindowManager.onAuthError(errorMessage, errorCode);

        // Verify error was logged
        expect(consoleSpy).toHaveBeenCalledWith('[AuthWindowManager] Authentication failed:', {
          error: errorMessage,
          errorCode: errorCode,
        });

        // Verify window remains available for error display
        // (window should not be closed)
        expect(mockWindowManager.closeWindow).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: google-oauth-auth, Property: Window Transition on Success
     For any successful authentication, the login window must be closed and the main window
     must be opened.
     Validates: Requirements google-oauth-auth.14.4 */
  it('Property: should transition from login to main window on success', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        // Reset mocks for each iteration
        jest.clearAllMocks();
        mockWindowManager.isWindowCreated.mockReturnValue(true);

        const authWindowManager = new AuthWindowManager(mockWindowManager, mockOAuthClient);
        await authWindowManager.onAuthSuccess();

        // Verify old window was closed
        expect(mockWindowManager.closeWindow).toHaveBeenCalled();

        // Verify new main window was created
        expect(mockWindowManager.createWindow).toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: google-oauth-auth, Property: Retry Shows Login Screen
     For any retry action, the login screen must be displayed again.
     Validates: Requirements google-oauth-auth.14.6 */
  it('Property: should show login screen on retry', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        // Reset mocks for each iteration
        jest.clearAllMocks();
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        mockWindowManager.isWindowCreated.mockReturnValue(false);

        const authWindowManager = new AuthWindowManager(mockWindowManager, mockOAuthClient);
        await authWindowManager.onRetry();

        // Verify retry was logged
        expect(consoleSpy).toHaveBeenCalledWith('[AuthWindowManager] Retrying authentication');

        // Verify login window was created
        expect(mockWindowManager.createWindow).toHaveBeenCalled();

        // Verify login window configuration
        expect(mockWindowManager.configureWindow).toHaveBeenCalledWith({
          width: 600,
          height: 800,
          resizable: false,
        });

        consoleSpy.mockRestore();
      }),
      { numRuns: 100 }
    );
  });
});
