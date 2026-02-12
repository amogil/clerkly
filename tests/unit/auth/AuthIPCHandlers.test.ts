// Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5, account-profile.1.2, account-profile.1.7

import { ipcMain, BrowserWindow } from 'electron';
import { AuthIPCHandlers } from '../../../src/main/auth/AuthIPCHandlers';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { UserProfileManager, UserProfile } from '../../../src/main/auth/UserProfileManager';

// Mock Electron modules
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

// Mock OAuthClientManager
jest.mock('../../../src/main/auth/OAuthClientManager');

// Mock UserProfileManager
jest.mock('../../../src/main/auth/UserProfileManager');

describe('AuthIPCHandlers', () => {
  let authIPCHandlers: AuthIPCHandlers;
  let mockOAuthClient: jest.Mocked<OAuthClientManager>;
  let mockProfileManager: jest.Mocked<UserProfileManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOAuthClient = {
      startAuthFlow: jest.fn(),
      getAuthStatus: jest.fn(),
      logout: jest.fn(),
    } as any;

    mockProfileManager = {
      loadProfile: jest.fn(),
      fetchProfile: jest.fn(),
      saveProfile: jest.fn(),
      clearProfile: jest.fn(),
      updateProfileAfterTokenRefresh: jest.fn(),
    } as any;

    authIPCHandlers = new AuthIPCHandlers(mockOAuthClient);
  });

  describe('Handler Registration', () => {
    /* Preconditions: AuthIPCHandlers instance created, handlers not yet registered
       Action: Call registerHandlers()
       Assertions: All five IPC handlers are registered (auth:start-login, auth:get-status, auth:logout, auth:get-profile, auth:refresh-profile)
       Requirements: google-oauth-auth.8.1, account-profile.1.2, account-profile.1.5 */
    it('should register all IPC handlers', () => {
      authIPCHandlers.registerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith('auth:start-login', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('auth:get-status', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('auth:logout', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('auth:get-profile', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('auth:refresh-profile', expect.any(Function));
    });

    /* Preconditions: Handlers already registered
       Action: Call registerHandlers() again
       Assertions: Warning is logged, handlers are not registered twice
       Requirements: google-oauth-auth.8.1 */
    it('should not register handlers twice', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      authIPCHandlers.registerHandlers();
      const firstCallCount = (ipcMain.handle as jest.Mock).mock.calls.length;

      authIPCHandlers.registerHandlers();
      const secondCallCount = (ipcMain.handle as jest.Mock).mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AuthIPCHandlers] Handlers already registered')
      );

      consoleWarnSpy.mockRestore();
    });

    /* Preconditions: Handlers registered
       Action: Call unregisterHandlers()
       Assertions: All five IPC handlers are removed
       Requirements: google-oauth-auth.8.1, account-profile.1.2, account-profile.1.5 */
    it('should unregister all IPC handlers', () => {
      authIPCHandlers.registerHandlers();
      authIPCHandlers.unregisterHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('auth:start-login');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('auth:get-status');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('auth:logout');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('auth:get-profile');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('auth:refresh-profile');
    });
  });

  describe('auth:start-login Handler', () => {
    /* Preconditions: OAuth client ready, user initiates login
       Action: Call auth:start-login handler
       Assertions: OAuthClientManager.startAuthFlow is called, returns success: true
       Requirements: google-oauth-auth.8.1, google-oauth-auth.8.5 */
    it('should handle start login request successfully', async () => {
      mockOAuthClient.startAuthFlow.mockResolvedValue(undefined);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:start-login'
      )?.[1];

      const result = await handler({});

      expect(mockOAuthClient.startAuthFlow).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    /* Preconditions: OAuth client throws error during startAuthFlow
       Action: Call auth:start-login handler
       Assertions: Returns success: false with error message
       Requirements: google-oauth-auth.8.1, google-oauth-auth.8.5 */
    it('should handle start login error', async () => {
      const errorMessage = 'Failed to open browser';
      mockOAuthClient.startAuthFlow.mockRejectedValue(new Error(errorMessage));

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:start-login'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
    });
  });

  describe('auth:get-status Handler', () => {
    /* Preconditions: User is authorized with valid tokens
       Action: Call auth:get-status handler
       Assertions: Returns success: true, authorized: true
       Requirements: google-oauth-auth.8.2, google-oauth-auth.8.5 */
    it('should return authorized status when user is logged in', async () => {
      mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: true });

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-status'
      )?.[1];

      const result = await handler({});

      expect(mockOAuthClient.getAuthStatus).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        authorized: true,
        error: undefined,
      });
    });

    /* Preconditions: User is not authorized, no tokens exist
       Action: Call auth:get-status handler
       Assertions: Returns success: true, authorized: false
       Requirements: google-oauth-auth.8.2, google-oauth-auth.8.5 */
    it('should return not authorized status when user is not logged in', async () => {
      mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: false });

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-status'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: true,
        authorized: false,
        error: undefined,
      });
    });

    /* Preconditions: OAuth client throws error during getAuthStatus
       Action: Call auth:get-status handler
       Assertions: Returns success: false, authorized: false with error message
       Requirements: google-oauth-auth.8.2, google-oauth-auth.8.5 */
    it('should handle get status error', async () => {
      const errorMessage = 'Database error';
      mockOAuthClient.getAuthStatus.mockRejectedValue(new Error(errorMessage));

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-status'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        authorized: false,
        error: errorMessage,
      });
    });
  });

  describe('auth:logout Handler', () => {
    /* Preconditions: User is logged in, logout initiated
       Action: Call auth:logout handler
       Assertions: OAuthClientManager.logout is called, returns success: true, sends auth:logout-complete event
       Requirements: google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5 */
    it('should handle logout request successfully', async () => {
      const mockWindow = {
        webContents: {
          send: jest.fn(),
        },
      };
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow]);

      mockOAuthClient.logout.mockResolvedValue(undefined);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:logout'
      )?.[1];

      const result = await handler({});

      expect(mockOAuthClient.logout).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('auth:logout-complete', {
        success: true,
      });
    });

    /* Preconditions: OAuth client throws error during logout
       Action: Call auth:logout handler
       Assertions: Returns success: false with error message
       Requirements: google-oauth-auth.8.3, google-oauth-auth.8.5 */
    it('should handle logout error', async () => {
      const errorMessage = 'Logout failed';
      mockOAuthClient.logout.mockRejectedValue(new Error(errorMessage));

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:logout'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
    });
  });

  describe('auth:get-profile Handler', () => {
    /* Preconditions: UserProfileManager set, profile exists in cache
       Action: Call auth:get-profile handler
       Assertions: Returns success: true with profile data
       Requirements: account-profile.1.2, account-profile.1.7 */
    it('should return profile when profile manager is set and profile exists', async () => {
      const mockProfile: UserProfile = {
        id: '123',
        email: 'test@example.com',
        verified_email: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        locale: 'en',
        lastUpdated: Date.now(),
      };

      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.loadProfile.mockResolvedValue(mockProfile);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-profile'
      )?.[1];

      const result = await handler({});

      expect(mockProfileManager.loadProfile).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        profile: mockProfile,
      });
    });

    /* Preconditions: UserProfileManager set, no profile in cache
       Action: Call auth:get-profile handler
       Assertions: Returns success: true with profile: null
       Requirements: account-profile.1.2, account-profile.1.7 */
    it('should return null profile when no profile exists in cache', async () => {
      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.loadProfile.mockResolvedValue(null);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-profile'
      )?.[1];

      const result = await handler({});

      expect(mockProfileManager.loadProfile).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        profile: null,
      });
    });

    /* Preconditions: UserProfileManager not set
       Action: Call auth:get-profile handler
       Assertions: Returns success: true with profile: null, warning logged
       Requirements: account-profile.1.2 */
    it('should return null when profile manager is not set', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-profile'
      )?.[1];

      const result = await handler({});

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AuthIPCHandlers] Profile manager not set')
      );
      expect(result).toEqual({
        success: true,
        profile: null,
      });

      consoleWarnSpy.mockRestore();
    });

    /* Preconditions: UserProfileManager throws error during loadProfile
       Action: Call auth:get-profile handler
       Assertions: Returns success: false with error message
       Requirements: account-profile.1.7 */
    it('should handle profile loading error', async () => {
      const errorMessage = 'Database error';
      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.loadProfile.mockRejectedValue(new Error(errorMessage));

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-profile'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: errorMessage,
        profile: null,
      });
    });
  });

  describe('auth:refresh-profile Handler', () => {
    /* Preconditions: UserProfileManager set, user authenticated, Google API available
       Action: Call auth:refresh-profile handler
       Assertions: fetchProfile() called, returns success: true with fresh profile data
       Requirements: account-profile.1.5 */
    it('should refresh profile successfully', async () => {
      const mockProfile: UserProfile = {
        id: '123',
        email: 'test@example.com',
        verified_email: true,
        name: 'Test User Updated',
        given_name: 'Test',
        family_name: 'User',
        locale: 'en',
        lastUpdated: Date.now(),
      };

      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockResolvedValue(mockProfile);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-profile'
      )?.[1];

      const result = await handler({});

      expect(mockProfileManager.fetchProfile).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        profile: mockProfile,
      });
    });

    /* Preconditions: UserProfileManager set, user not authenticated
       Action: Call auth:refresh-profile handler
       Assertions: fetchProfile() called, returns success: true with profile: null
       Requirements: account-profile.1.5 */
    it('should return null when user is not authenticated', async () => {
      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockResolvedValue(null);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-profile'
      )?.[1];

      const result = await handler({});

      expect(mockProfileManager.fetchProfile).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        profile: null,
      });
    });

    /* Preconditions: UserProfileManager not set
       Action: Call auth:refresh-profile handler
       Assertions: Returns success: false with error message, warning logged
       Requirements: account-profile.1.5 */
    it('should return error when profile manager is not set', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-profile'
      )?.[1];

      const result = await handler({});

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AuthIPCHandlers] Profile manager not set')
      );
      expect(result).toEqual({
        success: false,
        error: 'Profile manager not initialized',
        profile: null,
      });

      consoleWarnSpy.mockRestore();
    });

    /* Preconditions: UserProfileManager throws error during fetchProfile
       Action: Call auth:refresh-profile handler
       Assertions: Returns success: false with error message
       Requirements: account-profile.1.5 */
    it('should handle profile refresh error', async () => {
      const errorMessage = 'Network error';
      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockRejectedValue(new Error(errorMessage));

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-profile'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: errorMessage,
        profile: null,
      });
    });
  });

  describe('Event Broadcasting', () => {
    /* Preconditions: Multiple windows open, auth success event triggered
       Action: Call sendAuthSuccess()
       Assertions: auth:success event sent to all windows
       Requirements: google-oauth-auth.8.4 */
    it('should send auth success event to all windows', () => {
      const mockWindow1 = { webContents: { send: jest.fn() } };
      const mockWindow2 = { webContents: { send: jest.fn() } };
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow1, mockWindow2]);

      authIPCHandlers.sendAuthSuccess();

      expect(mockWindow1.webContents.send).toHaveBeenCalledWith('auth:success', {
        authorized: true,
      });
      expect(mockWindow2.webContents.send).toHaveBeenCalledWith('auth:success', {
        authorized: true,
      });
    });

    /* Preconditions: Multiple windows open, auth error event triggered
       Action: Call sendAuthError()
       Assertions: auth:error event sent to all windows with error details
       Requirements: google-oauth-auth.8.4 */
    it('should send auth error event to all windows', () => {
      const mockWindow1 = { webContents: { send: jest.fn() } };
      const mockWindow2 = { webContents: { send: jest.fn() } };
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow1, mockWindow2]);

      const errorMessage = 'Authentication failed';
      const errorCode = 'access_denied';
      authIPCHandlers.sendAuthError(errorMessage, errorCode);

      expect(mockWindow1.webContents.send).toHaveBeenCalledWith('auth:error', {
        error: errorMessage,
        errorCode: errorCode,
      });
      expect(mockWindow2.webContents.send).toHaveBeenCalledWith('auth:error', {
        error: errorMessage,
        errorCode: errorCode,
      });
    });
  });

  describe('Response Structure', () => {
    /* Preconditions: Any IPC handler called
       Action: Execute handler and get response
       Assertions: Response contains success boolean field
       Requirements: google-oauth-auth.8.5 */
    it('should return structured response with success field', async () => {
      mockOAuthClient.startAuthFlow.mockResolvedValue(undefined);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:start-login'
      )?.[1];

      const result = await handler({});

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
    });

    /* Preconditions: IPC handler encounters error
       Action: Execute handler that throws error
       Assertions: Response contains success: false and error string field
       Requirements: google-oauth-auth.8.5 */
    it('should return structured error response with success and error fields', async () => {
      mockOAuthClient.startAuthFlow.mockRejectedValue(new Error('Test error'));

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:start-login'
      )?.[1];

      const result = await handler({});

      expect(result).toHaveProperty('success');
      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });
  });

  describe('Error Notification', () => {
    /* Preconditions: Multiple windows open, error occurs
       Action: Call sendErrorNotification()
       Assertions: Error logged to console, error:notify event sent to all windows
       Requirements: error-notifications.1.1, error-notifications.1.4 */
    it('should send error notification to all windows and log to console', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockWindow1 = { webContents: { send: jest.fn() } };
      const mockWindow2 = { webContents: { send: jest.fn() } };
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow1, mockWindow2]);

      const errorMessage = 'Failed to save data';
      const context = 'DataManager';
      authIPCHandlers.sendErrorNotification(errorMessage, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[${context}] Error: ${errorMessage}`)
      );
      expect(mockWindow1.webContents.send).toHaveBeenCalledWith(
        'error:notify',
        errorMessage,
        context
      );
      expect(mockWindow2.webContents.send).toHaveBeenCalledWith(
        'error:notify',
        errorMessage,
        context
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: No windows open, error occurs
       Action: Call sendErrorNotification()
       Assertions: Error logged to console, no crash
       Requirements: error-notifications.1.4 */
    it('should handle error notification when no windows exist', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([]);

      const errorMessage = 'Failed to save data';
      const context = 'DataManager';

      expect(() => {
        authIPCHandlers.sendErrorNotification(errorMessage, context);
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[${context}] Error: ${errorMessage}`)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Profile Update Broadcasting', () => {
    /* Preconditions: Multiple windows open, profile refreshed successfully
       Action: Call auth:refresh-profile handler
       Assertions: auth:profile-updated event sent to all windows with profile data
       Requirements: account-profile.1.5 */
    it('should broadcast profile update to all windows after refresh', async () => {
      const mockProfile: UserProfile = {
        id: '123',
        email: 'test@example.com',
        verified_email: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        locale: 'en',
        lastUpdated: Date.now(),
      };

      const mockWindow1 = { webContents: { send: jest.fn() } };
      const mockWindow2 = { webContents: { send: jest.fn() } };
      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([mockWindow1, mockWindow2]);

      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockResolvedValue(mockProfile);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-profile'
      )?.[1];

      await handler({});

      expect(mockWindow1.webContents.send).toHaveBeenCalledWith(
        'auth:profile-updated',
        mockProfile
      );
      expect(mockWindow2.webContents.send).toHaveBeenCalledWith(
        'auth:profile-updated',
        mockProfile
      );
    });

    /* Preconditions: No windows open, profile refreshed successfully
       Action: Call auth:refresh-profile handler
       Assertions: No crash, profile returned successfully
       Requirements: account-profile.1.5 */
    it('should handle profile refresh when no windows exist', async () => {
      const mockProfile: UserProfile = {
        id: '123',
        email: 'test@example.com',
        verified_email: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        locale: 'en',
        lastUpdated: Date.now(),
      };

      (BrowserWindow.getAllWindows as jest.Mock).mockReturnValue([]);

      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockResolvedValue(mockProfile);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-profile'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: true,
        profile: mockProfile,
      });
    });
  });

  describe('Error Handling Edge Cases', () => {
    /* Preconditions: Handler throws non-Error object
       Action: Call auth:start-login handler with non-Error rejection
       Assertions: Returns success: false with 'Unknown error' message
       Requirements: google-oauth-auth.8.5 */
    it('should handle non-Error exceptions in start login', async () => {
      mockOAuthClient.startAuthFlow.mockRejectedValue('String error');

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:start-login'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: 'Unknown error',
      });
    });

    /* Preconditions: Handler throws non-Error object
       Action: Call auth:get-status handler with non-Error rejection
       Assertions: Returns success: false with 'Unknown error' message
       Requirements: google-oauth-auth.8.5 */
    it('should handle non-Error exceptions in get status', async () => {
      mockOAuthClient.getAuthStatus.mockRejectedValue('String error');

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-status'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        authorized: false,
        error: 'Unknown error',
      });
    });

    /* Preconditions: Handler throws non-Error object
       Action: Call auth:logout handler with non-Error rejection
       Assertions: Returns success: false with 'Unknown error' message
       Requirements: google-oauth-auth.8.5 */
    it('should handle non-Error exceptions in logout', async () => {
      mockOAuthClient.logout.mockRejectedValue('String error');

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:logout'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: 'Unknown error',
      });
    });

    /* Preconditions: Handler throws non-Error object
       Action: Call auth:get-profile handler with non-Error rejection
       Assertions: Returns success: false with 'Unknown error' message
       Requirements: account-profile.1.7 */
    it('should handle non-Error exceptions in get profile', async () => {
      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.loadProfile.mockRejectedValue('String error');

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-profile'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: 'Unknown error',
        profile: null,
      });
    });

    /* Preconditions: Handler throws non-Error object
       Action: Call auth:refresh-profile handler with non-Error rejection
       Assertions: Returns success: false with 'Unknown error' message
       Requirements: account-profile.1.5 */
    it('should handle non-Error exceptions in refresh profile', async () => {
      authIPCHandlers.setProfileManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockRejectedValue('String error');

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-profile'
      )?.[1];

      const result = await handler({});

      expect(result).toEqual({
        success: false,
        error: 'Unknown error',
        profile: null,
      });
    });
  });
});
