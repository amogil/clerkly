// Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5, account-profile.1.2, account-profile.1.7

import { ipcMain } from 'electron';
import { AuthIPCHandlers } from '../../../src/main/auth/AuthIPCHandlers';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { UserManager, User } from '../../../src/main/auth/UserManager';

// Mock Electron modules
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
}));

// Mock MainEventBus
const mockPublish = jest.fn();
jest.mock('../../../src/main/events/MainEventBus', () => ({
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

// Mock OAuthClientManager
jest.mock('../../../src/main/auth/OAuthClientManager');

// Mock UserManager
jest.mock('../../../src/main/auth/UserManager');

describe('AuthIPCHandlers', () => {
  let authIPCHandlers: AuthIPCHandlers;
  let mockOAuthClient: jest.Mocked<OAuthClientManager>;
  let mockProfileManager: jest.Mocked<UserManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOAuthClient = {
      startAuthFlow: jest.fn(),
      getAuthStatus: jest.fn(),
      logout: jest.fn(),
    } as any;

    mockProfileManager = {
      getCurrentUser: jest.fn(),
      fetchProfile: jest.fn(),
      updateProfileAfterTokenRefresh: jest.fn(),
    } as any;

    authIPCHandlers = new AuthIPCHandlers(mockOAuthClient);
  });

  describe('Handler Registration', () => {
    /* Preconditions: AuthIPCHandlers instance created, handlers not yet registered
       Action: Call registerHandlers()
       Assertions: All five IPC handlers are registered (auth:start-login, auth:get-status, auth:logout, auth:get-user, auth:refresh-user)
       Requirements: google-oauth-auth.8.1, account-profile.1.2, account-profile.1.5 */
    it('should register all IPC handlers', () => {
      authIPCHandlers.registerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledWith('auth:start-login', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('auth:get-status', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('auth:logout', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('auth:get-user', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('auth:refresh-user', expect.any(Function));
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
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('auth:get-user');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('auth:refresh-user');
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
    beforeEach(() => {
      mockPublish.mockClear();
    });

    /* Preconditions: User is logged in, logout initiated
       Action: Call auth:logout handler
       Assertions: OAuthClientManager.logout is called, returns success: true, publishes user.logout event via EventBus
       Requirements: google-oauth-auth.8.3, google-oauth-auth.8.4, google-oauth-auth.8.5 */
    it('should handle logout request successfully', async () => {
      mockOAuthClient.logout.mockResolvedValue(undefined);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:logout'
      )?.[1];

      const result = await handler({});

      expect(mockOAuthClient.logout).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
      // Verify user.logout event was published via EventBus
      expect(mockPublish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockPublish.mock.calls[0][0];
      expect(publishedEvent.type).toBe('user.logout');
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

  describe('auth:get-user Handler', () => {
    const mockUser: User = {
      user_id: 'abc123xyz0',
      email: 'test@example.com',
      name: 'Test User',
      google_id: '123456789',
      locale: 'en',
      last_synced: Date.now(),
    };

    /* Preconditions: UserManager set, user exists
       Action: Call auth:get-user handler
       Assertions: Returns success: true with user data
       Requirements: account-profile.1.2, account-profile.1.7 */
    it('should return user when profile manager is set and user exists', async () => {
      authIPCHandlers.setUserManager(mockProfileManager);
      mockProfileManager.getCurrentUser.mockReturnValue(mockUser);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-user'
      )?.[1];

      const result = await handler({});

      expect(mockProfileManager.getCurrentUser).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        user: mockUser,
      });
    });

    /* Preconditions: UserManager set, no user logged in
       Action: Call auth:get-user handler
       Assertions: Returns success: true with user: null
       Requirements: account-profile.1.2, account-profile.1.7 */
    it('should return null user when no user logged in', async () => {
      authIPCHandlers.setUserManager(mockProfileManager);
      mockProfileManager.getCurrentUser.mockReturnValue(null);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-user'
      )?.[1];

      const result = await handler({});

      expect(mockProfileManager.getCurrentUser).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        user: null,
      });
    });

    /* Preconditions: UserManager not set
       Action: Call auth:get-user handler
       Assertions: Returns success: true with user: null, warning logged
       Requirements: account-profile.1.2 */
    it('should return null when profile manager is not set', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:get-user'
      )?.[1];

      const result = await handler({});

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AuthIPCHandlers] User manager not set')
      );
      expect(result).toEqual({
        success: true,
        user: null,
      });

      consoleWarnSpy.mockRestore();
    });
  });

  describe('auth:refresh-user Handler', () => {
    const mockUser: User = {
      user_id: 'abc123xyz0',
      email: 'test@example.com',
      name: 'Test User Updated',
      google_id: '123456789',
      locale: 'en',
      last_synced: Date.now(),
    };

    beforeEach(() => {
      mockPublish.mockClear();
    });

    /* Preconditions: UserManager set, user authenticated, Google API available
       Action: Call auth:refresh-user handler
       Assertions: fetchProfile() called, returns success: true with fresh user data
       Requirements: account-profile.1.5 */
    it('should refresh user successfully', async () => {
      authIPCHandlers.setUserManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockResolvedValue(mockUser);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-user'
      )?.[1];

      const result = await handler({});

      expect(mockProfileManager.fetchProfile).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        user: mockUser,
      });
    });

    /* Preconditions: UserManager set, user not authenticated
       Action: Call auth:refresh-user handler
       Assertions: fetchProfile() called, returns success: true with user: null
       Requirements: account-profile.1.5 */
    it('should return null when user is not authenticated', async () => {
      authIPCHandlers.setUserManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockResolvedValue(null);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-user'
      )?.[1];

      const result = await handler({});

      expect(mockProfileManager.fetchProfile).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        user: null,
      });
    });

    /* Preconditions: UserManager not set
       Action: Call auth:refresh-user handler
       Assertions: Returns success: false with error message, warning logged
       Requirements: account-profile.1.5 */
    it('should return error when profile manager is not set', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-user'
      )?.[1];

      const result = await handler({});

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AuthIPCHandlers] User manager not set')
      );
      expect(result).toEqual({
        success: false,
        error: 'User manager not initialized',
        user: null,
      });

      consoleWarnSpy.mockRestore();
    });

    /* Preconditions: UserManager throws error during fetchProfile
       Action: Call auth:refresh-user handler
       Assertions: Returns success: false with error message
       Requirements: account-profile.1.5 */
    it('should handle profile refresh error', async () => {
      const errorMessage = 'Network error';
      authIPCHandlers.setUserManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockRejectedValue(new Error(errorMessage));

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-user'
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
    beforeEach(() => {
      mockPublish.mockClear();
    });

    /* Preconditions: Auth success event triggered
       Action: Call sendAuthSuccess()
       Assertions: auth.succeeded event published via EventBus
       Requirements: google-oauth-auth.8.4 */
    it('should publish auth.succeeded event via EventBus', () => {
      authIPCHandlers.sendAuthSuccess('user-123');

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockPublish.mock.calls[0][0];
      expect(publishedEvent.type).toBe('auth.succeeded');
      expect(publishedEvent.userId).toBe('user-123');
    });

    /* Preconditions: Auth error event triggered
       Action: Call sendAuthError()
       Assertions: auth.failed event published via EventBus with error details
       Requirements: google-oauth-auth.8.4 */
    it('should publish auth.failed event via EventBus', () => {
      const errorMessage = 'Authentication failed';
      const errorCode = 'access_denied';
      authIPCHandlers.sendAuthError(errorMessage, errorCode);

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockPublish.mock.calls[0][0];
      expect(publishedEvent.type).toBe('auth.failed');
      expect(publishedEvent.error).toBe(errorMessage);
      expect(publishedEvent.errorCode).toBe(errorCode);
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
    beforeEach(() => {
      mockPublish.mockClear();
    });

    /* Preconditions: Error occurs
       Action: Call sendErrorNotification()
       Assertions: Error logged to console, error.created event published via EventBus
       Requirements: error-notifications.1.1, error-notifications.1.4 */
    it('should publish error.created event via EventBus and log to console', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const errorMessage = 'Failed to save data';
      const context = 'DataManager';
      authIPCHandlers.sendErrorNotification(errorMessage, context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[${context}] Error: ${errorMessage}`)
      );
      expect(mockPublish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockPublish.mock.calls[0][0];
      expect(publishedEvent.type).toBe('error.created');
      expect(publishedEvent.message).toBe(errorMessage);
      expect(publishedEvent.context).toBe(context);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Profile Update Broadcasting', () => {
    const mockUser: User = {
      user_id: 'abc123xyz0',
      email: 'test@example.com',
      name: 'Test User',
      google_id: '123456789',
      locale: 'en',
      last_synced: Date.now(),
    };

    beforeEach(() => {
      mockPublish.mockClear();
    });

    /* Preconditions: Profile refreshed successfully
       Action: Call auth:refresh-user handler
       Assertions: profile.synced event published via EventBus
       Requirements: account-profile.1.5 */
    it('should publish profile.synced event via EventBus after refresh', async () => {
      authIPCHandlers.setUserManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockResolvedValue(mockUser);

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-user'
      )?.[1];

      await handler({});

      expect(mockPublish).toHaveBeenCalledTimes(1);
      const publishedEvent = mockPublish.mock.calls[0][0];
      expect(publishedEvent.type).toBe('profile.synced');
      expect(publishedEvent.user.user_id).toBe(mockUser.user_id);
      expect(publishedEvent.user.email).toBe(mockUser.email);
      expect(publishedEvent.user.name).toBe(mockUser.name);
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
       Action: Call auth:refresh-user handler with non-Error rejection
       Assertions: Returns success: false with 'Unknown error' message
       Requirements: account-profile.1.5 */
    it('should handle non-Error exceptions in refresh user', async () => {
      authIPCHandlers.setUserManager(mockProfileManager);
      mockProfileManager.fetchProfile.mockRejectedValue('String error');

      authIPCHandlers.registerHandlers();
      const handler = (ipcMain.handle as jest.Mock).mock.calls.find(
        (call) => call[0] === 'auth:refresh-user'
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
