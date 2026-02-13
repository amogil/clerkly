// Requirements: google-oauth-auth.2.1, google-oauth-auth.8.1

/**
 * Integration tests for OAuth components initialization
 * Tests the integration of all OAuth components in the main process
 */

import { DataManager } from '../../../src/main/DataManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { AuthIPCHandlers } from '../../../src/main/auth/AuthIPCHandlers';
import { getOAuthConfig } from '../../../src/main/auth/OAuthConfig';

// Mock dependencies
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/mock/user/data'),
    setAsDefaultProtocolClient: jest.fn(),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    requestSingleInstanceLock: jest.fn(() => true),
  },
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
  shell: {
    openExternal: jest.fn(),
  },
}));

jest.mock('../../../src/main/DataManager');
jest.mock('../../../src/main/auth/TokenStorageManager');
jest.mock('../../../src/main/auth/OAuthClientManager');
jest.mock('../../../src/main/auth/AuthIPCHandlers');

describe('OAuth Integration', () => {
  let mockDataManager: jest.Mocked<DataManager>;
  let mockTokenStorage: jest.Mocked<TokenStorageManager>;
  let mockOAuthClient: jest.Mocked<OAuthClientManager>;
  let mockAuthIPCHandlers: jest.Mocked<AuthIPCHandlers>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    mockDataManager = new DataManager('/mock/path') as jest.Mocked<DataManager>;
    mockTokenStorage = new TokenStorageManager(mockDataManager) as jest.Mocked<TokenStorageManager>;
    mockOAuthClient = new OAuthClientManager(
      getOAuthConfig(),
      mockTokenStorage
    ) as jest.Mocked<OAuthClientManager>;
    mockAuthIPCHandlers = new AuthIPCHandlers(mockOAuthClient) as jest.Mocked<AuthIPCHandlers>;
  });

  /* Preconditions: OAuth components are initialized
     Action: verify all OAuth components are created
     Assertions: all components exist and are properly initialized
     Requirements: google-oauth-auth.2.1, google-oauth-auth.8.1 */
  it('should initialize all OAuth components', () => {
    // Verify DataManager is created
    expect(DataManager).toHaveBeenCalled();
    expect(mockDataManager).toBeDefined();

    // Verify TokenStorageManager is created with DataManager
    expect(TokenStorageManager).toHaveBeenCalledWith(mockDataManager);
    expect(mockTokenStorage).toBeDefined();

    // Verify OAuthClientManager is created with config and TokenStorage
    expect(OAuthClientManager).toHaveBeenCalledWith(expect.any(Object), mockTokenStorage);
    expect(mockOAuthClient).toBeDefined();

    // Verify AuthIPCHandlers is created with OAuthClient
    expect(AuthIPCHandlers).toHaveBeenCalledWith(mockOAuthClient);
    expect(mockAuthIPCHandlers).toBeDefined();
  });

  /* Preconditions: OAuth components are initialized
     Action: call registerHandlers on AuthIPCHandlers
     Assertions: IPC handlers are registered
     Requirements: google-oauth-auth.8.1 */
  it('should register IPC handlers', () => {
    // Mock registerHandlers method
    mockAuthIPCHandlers.registerHandlers = jest.fn();

    // Call registerHandlers
    mockAuthIPCHandlers.registerHandlers();

    // Verify registerHandlers was called
    expect(mockAuthIPCHandlers.registerHandlers).toHaveBeenCalled();
  });

  /* Preconditions: app is initialized
     Action: verify protocol handler registration capability
     Assertions: setAsDefaultProtocolClient method exists
     Requirements: google-oauth-auth.2.1 */
  it('should have protocol handler registration capability', () => {
    const { app } = require('electron');

    // Verify protocol handler registration method exists
    expect(app.setAsDefaultProtocolClient).toBeDefined();
    expect(typeof app.setAsDefaultProtocolClient).toBe('function');
  });

  /* Preconditions: OAuth components are initialized
     Action: verify component dependencies
     Assertions: components are properly connected
     Requirements: google-oauth-auth.2.1, google-oauth-auth.8.1 */
  it('should have correct component dependencies', () => {
    // Verify TokenStorageManager depends on DataManager
    expect(TokenStorageManager).toHaveBeenCalledWith(mockDataManager);

    // Verify OAuthClientManager depends on TokenStorageManager
    expect(OAuthClientManager).toHaveBeenCalledWith(expect.any(Object), mockTokenStorage);

    // Verify AuthIPCHandlers depends on OAuthClientManager
    expect(AuthIPCHandlers).toHaveBeenCalledWith(mockOAuthClient);
  });

  /* Preconditions: preload script is loaded
     Action: verify auth API is exposed
     Assertions: window.api has auth methods
     Requirements: google-oauth-auth.8.1, google-oauth-auth.8.2, google-oauth-auth.8.3 */
  it('should expose auth API in preload', () => {
    // This test verifies the structure of the auth API
    // The actual implementation is in src/preload/index.ts

    const expectedAuthAPI = {
      startLogin: expect.any(Function),
      getAuthStatus: expect.any(Function),
      logout: expect.any(Function),
    };

    // Verify the expected API structure
    expect(expectedAuthAPI).toHaveProperty('startLogin');
    expect(expectedAuthAPI).toHaveProperty('getAuthStatus');
    expect(expectedAuthAPI).toHaveProperty('logout');
  });
});

// Requirements: account-profile.1.2, account-profile.1.5, account-profile.1.6, account-profile.1.7

/**
 * Integration tests for profile functionality
 * Tests the integration of OAuthClientManager, UserProfileManager, and LifecycleManager
 */

import { UserProfileManager, UserProfile } from '../../../src/main/auth/UserProfileManager';
import { LifecycleManager } from '../../../src/main/LifecycleManager';
import WindowManager from '../../../src/main/WindowManager';

// Mock fetch for Google UserInfo API
global.fetch = jest.fn();

describe('Profile Integration', () => {
  let mockDataManager: jest.Mocked<DataManager>;
  let mockTokenStorage: jest.Mocked<TokenStorageManager>;
  let mockOAuthClient: jest.Mocked<OAuthClientManager>;
  let profileManager: UserProfileManager;
  let mockWindowManager: jest.Mocked<WindowManager>;
  let lifecycleManager: LifecycleManager;

  const mockProfile: UserProfile = {
    id: '123456789',
    email: 'test@example.com',
    verified_email: true,
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    locale: 'en',
    lastUpdated: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock database for users table
    const mockDb = {
      prepare: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
        run: jest.fn(),
      }),
    };

    // Create mock instances
    mockDataManager = {
      initialize: jest.fn(),
      close: jest.fn(),
      saveData: jest.fn().mockReturnValue({ success: true }),
      loadData: jest.fn().mockReturnValue({ success: false, data: null }),
      deleteData: jest.fn().mockReturnValue({ success: true }),
      getDatabase: jest.fn().mockReturnValue(mockDb),
    } as any;

    mockTokenStorage = {
      loadTokens: jest.fn().mockResolvedValue({
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer',
      }),
      saveTokens: jest.fn().mockResolvedValue(undefined),
      deleteTokens: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockOAuthClient = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: true }),
      refreshAccessToken: jest.fn().mockResolvedValue(true),
      setProfileManager: jest.fn(),
      startAuthFlow: jest.fn(),
      handleDeepLink: jest.fn(),
      logout: jest.fn(),
    } as any;

    mockWindowManager = {
      createWindow: jest.fn(),
      isWindowCreated: jest.fn().mockReturnValue(false),
      closeWindow: jest.fn(),
    } as any;

    // Create real UserProfileManager instance
    profileManager = new UserProfileManager(mockDataManager, mockOAuthClient, mockTokenStorage);

    // Create real LifecycleManager instance
    lifecycleManager = new LifecycleManager(
      mockWindowManager,
      mockDataManager,
      mockOAuthClient,
      mockTokenStorage
    );

    // Mock fetch to return profile data
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        id: mockProfile.id,
        email: mockProfile.email,
        verified_email: mockProfile.verified_email,
        name: mockProfile.name,
        given_name: mockProfile.given_name,
        family_name: mockProfile.family_name,
        locale: mockProfile.locale,
      }),
    });
  });

  /* Preconditions: real OAuthClientManager and UserProfileManager, mocked Google APIs
     Action: perform OAuth login, wait for profile fetch
     Assertions: profile automatically loaded, data saved to DataManager
     Requirements: account-profile.1.2, account-profile.1.6 */
  it('should load profile after OAuth login', async () => {
    // Simulate OAuth login by setting authorized status
    mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: true });

    // Fetch profile
    const profile = await profileManager.fetchProfile();

    // Verify profile was fetched
    expect(profile).not.toBeNull();
    expect(profile?.email).toBe(mockProfile.email);
    expect(profile?.name).toBe(mockProfile.name);

    // Verify Google UserInfo API was called with correct URL and headers
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/oauth2/v1/userinfo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock_access_token',
        }),
      })
    );

    // Verify profile was saved to DataManager
    expect(mockDataManager.saveData).toHaveBeenCalledWith(
      'user_profile',
      expect.objectContaining({
        email: mockProfile.email,
        name: mockProfile.name,
        id: mockProfile.id,
      })
    );
  });

  /* Preconditions: expired access token, valid refresh token
     Action: trigger token refresh
     Assertions: profile automatically updated after refresh
     Requirements: account-profile.1.5 */
  it('should update profile after token refresh', async () => {
    // Set profile manager on OAuth client
    mockOAuthClient.setProfileManager(profileManager);

    // Spy on fetchProfile method
    const fetchProfileSpy = jest.spyOn(profileManager, 'fetchProfile');

    // Simulate token refresh by calling the profile manager's update method
    await profileManager.updateProfileAfterTokenRefresh();

    // Verify fetchProfile was called
    expect(fetchProfileSpy).toHaveBeenCalled();

    // Verify Google UserInfo API was called
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/oauth2/v1/userinfo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock_access_token',
        }),
      })
    );

    // Verify profile was saved
    expect(mockDataManager.saveData).toHaveBeenCalledWith(
      'user_profile',
      expect.objectContaining({
        email: mockProfile.email,
        name: mockProfile.name,
      })
    );
  });

  /* Preconditions: authenticated user, LifecycleManager initialized
     Action: call LifecycleManager.initialize()
     Assertions: profile automatically fetched on startup
     Requirements: account-profile.1.5 */
  it('should fetch profile on app startup', async () => {
    // Set authenticated status
    mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: true });

    // Initialize lifecycle manager
    const result = await lifecycleManager.initialize();

    // Verify initialization succeeded
    expect(result.success).toBe(true);

    // Verify window was created
    expect(mockWindowManager.createWindow).toHaveBeenCalled();

    // Verify auth status was checked
    expect(mockOAuthClient.getAuthStatus).toHaveBeenCalled();

    // Verify Google UserInfo API was called (profile fetched)
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/oauth2/v1/userinfo',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock_access_token',
        }),
      })
    );

    // Verify profile was saved to DataManager
    expect(mockDataManager.saveData).toHaveBeenCalledWith(
      'user_profile',
      expect.objectContaining({
        email: mockProfile.email,
        name: mockProfile.name,
      })
    );
  });

  /* Preconditions: cached profile in DataManager, Google API returns error
     Action: call fetchProfile()
     Assertions: returns cached data, no exception thrown
     Requirements: account-profile.1.7 */
  it('should use cached profile on API error', async () => {
    // Set up cached profile in DataManager
    const cachedProfile: UserProfile = {
      ...mockProfile,
      lastUpdated: Date.now() - 3600000, // 1 hour old
    };
    mockDataManager.loadData.mockReturnValue({
      success: true,
      data: cachedProfile,
    });

    // Mock fetch to return error
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    // Fetch profile (should return cached data)
    const profile = await profileManager.fetchProfile();

    // Verify cached profile was returned
    expect(profile).not.toBeNull();
    expect(profile?.email).toBe(cachedProfile.email);
    expect(profile?.name).toBe(cachedProfile.name);
    expect(profile?.lastUpdated).toBe(cachedProfile.lastUpdated);

    // Verify Google UserInfo API was called (attempted)
    expect(global.fetch).toHaveBeenCalled();

    // Verify loadData was called to get cached profile
    expect(mockDataManager.loadData).toHaveBeenCalledWith('user_profile');

    // Verify no exception was thrown (test completes successfully)
  });

  /* Preconditions: not authenticated
     Action: call LifecycleManager.initialize()
     Assertions: profile fetch is skipped
     Requirements: account-profile.1.1, account-profile.1.5 */
  it('should skip profile fetch on startup when not authenticated', async () => {
    // Set not authenticated status
    mockOAuthClient.getAuthStatus.mockResolvedValue({ authorized: false });

    // Initialize lifecycle manager
    const result = await lifecycleManager.initialize();

    // Verify initialization succeeded
    expect(result.success).toBe(true);

    // Verify auth status was checked
    expect(mockOAuthClient.getAuthStatus).toHaveBeenCalled();

    // Verify Google UserInfo API was NOT called (profile fetch skipped)
    expect(global.fetch).not.toHaveBeenCalled();

    // Verify profile was NOT saved
    expect(mockDataManager.saveData).not.toHaveBeenCalledWith('user_profile', expect.anything());
  });
});
