// Requirements: ui.6.1, ui.6.2, ui.6.5, ui.6.6, ui.6.7, ui.6.8

import { UserProfileManager, UserProfile } from '../../../src/main/auth/UserProfileManager';
import { DataManager } from '../../../src/main/DataManager';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock electron BrowserWindow for error notifications
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('UserProfileManager', () => {
  let dataManager: DataManager;
  let oauthClient: OAuthClientManager;
  let tokenStorage: TokenStorageManager;
  let profileManager: UserProfileManager;
  let testDbPath: string;
  let mockSelfProfileManager: jest.Mocked<UserProfileManager>;

  const mockProfile: Omit<UserProfile, 'lastUpdated'> = {
    id: '123456789',
    email: 'test@example.com',
    verified_email: true,
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    locale: 'en',
    picture: 'https://example.com/photo.jpg',
  };

  beforeEach(() => {
    // Create test database
    testDbPath = path.join(os.tmpdir(), `test-profile-${Date.now()}`);

    // Ensure migrations directory exists for tests
    const migrationsPath = path.join(__dirname, '..', '..', '..', 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }

    dataManager = new DataManager(testDbPath);
    dataManager.initialize();

    // Requirements: ui.12.10 - Mock UserProfileManager for data isolation
    // Note: We need to mock it BEFORE creating the real profileManager
    mockSelfProfileManager = {
      getCurrentEmail: jest.fn().mockReturnValue('test@example.com'),
    } as unknown as jest.Mocked<UserProfileManager>;

    dataManager.setUserProfileManager(mockSelfProfileManager);

    // Create mocked dependencies
    tokenStorage = {
      loadTokens: jest.fn(),
    } as unknown as TokenStorageManager;

    oauthClient = {
      getAuthStatus: jest.fn(),
    } as unknown as OAuthClientManager;

    // Create profile manager
    profileManager = new UserProfileManager(dataManager, oauthClient, tokenStorage);

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    dataManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  describe('fetchProfile', () => {
    /* Preconditions: OAuthClientManager returns authorized status with valid access token, fetch returns successful response from Google UserInfo API
       Action: Call fetchProfile()
       Assertions: HTTP request made to correct endpoint with Bearer token, profile saved via DataManager.saveData() with key 'user_profile', returned profile has correct structure with lastUpdated timestamp
       Requirements: ui.6.2, ui.6.6 */
    it('should successfully fetch profile data from Google API', async () => {
      // Mock authorized status
      (oauthClient.getAuthStatus as jest.Mock).mockResolvedValue({
        authorized: true,
      });

      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockProfile,
      });

      // Call fetchProfile
      const result = await profileManager.fetchProfile();

      // Verify fetch was called with correct parameters
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith('https://www.googleapis.com/oauth2/v1/userinfo', {
        headers: {
          Authorization: 'Bearer test-access-token',
        },
      });

      // Verify profile structure
      expect(result).not.toBeNull();
      expect(result).toMatchObject(mockProfile);
      expect(result?.lastUpdated).toBeDefined();
      expect(typeof result?.lastUpdated).toBe('number');

      // Verify profile was saved to database
      const savedProfile = dataManager.loadData('user_profile');
      expect(savedProfile.success).toBe(true);
      expect(savedProfile.data).toMatchObject(mockProfile);
    });

    /* Preconditions: OAuthClientManager returns authorized status, fetch throws network error, DataManager has cached profile data
       Action: Call fetchProfile()
       Assertions: Error logged to console, cached profile returned from loadProfile(), no exception thrown (graceful error handling)
       Requirements: ui.6.7 */
    it('should return cached profile data when API request fails', async () => {
      // Save cached profile first
      const cachedProfile: UserProfile = {
        ...mockProfile,
        lastUpdated: Date.now() - 3600000, // 1 hour ago
      };
      dataManager.saveData('user_profile', cachedProfile);

      // Mock authorized status
      (oauthClient.getAuthStatus as jest.Mock).mockResolvedValue({
        authorized: true,
      });

      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Mock API error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call fetchProfile
      const result = await profileManager.fetchProfile();

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Failed to fetch profile:')
      );

      // Verify cached profile was returned
      expect(result).not.toBeNull();
      expect(result).toMatchObject(cachedProfile);

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: OAuthClientManager returns unauthorized status (authorized: false) or no access token available
       Action: Call fetchProfile()
       Assertions: Method returns null, fetch not called, console log message about not authenticated
       Requirements: ui.6.1 */
    it('should return null when user is not authenticated', async () => {
      // Mock unauthorized status
      (oauthClient.getAuthStatus as jest.Mock).mockResolvedValue({
        authorized: false,
      });

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call fetchProfile
      const result = await profileManager.fetchProfile();

      // Verify null returned
      expect(result).toBeNull();

      // Verify fetch was not called
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify log message
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] No access token available')
      );

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: OAuthClientManager returns authorized status but TokenStorageManager returns null or no access token
       Action: Call fetchProfile()
       Assertions: Method returns null, fetch not called, console log message about no access token
       Requirements: ui.6.1 */
    it('should return null when no access token is available', async () => {
      // Mock authorized status
      (oauthClient.getAuthStatus as jest.Mock).mockResolvedValue({
        authorized: true,
      });

      // Mock no tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue(null);

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call fetchProfile
      const result = await profileManager.fetchProfile();

      // Verify null returned
      expect(result).toBeNull();

      // Verify fetch was not called
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify log message
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] No access token available')
      );

      consoleInfoSpy.mockRestore();
    });
  });

  describe('saveProfile', () => {
    /* Preconditions: Valid UserProfile object with all required fields
       Action: Call saveProfile(testProfile)
       Assertions: DataManager.saveData() called with key 'user_profile' and profile object, success logged to console
       Requirements: ui.6.2 */
    it('should correctly save profile data to DataManager', async () => {
      const testProfile: UserProfile = {
        ...mockProfile,
        lastUpdated: Date.now(),
      };

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call saveProfile
      await profileManager.saveProfile(testProfile);

      // Verify profile was saved
      const savedProfile = dataManager.loadData('user_profile');
      expect(savedProfile.success).toBe(true);
      expect(savedProfile.data).toMatchObject(testProfile);

      // Verify success log
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Profile saved to local storage')
      );

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: DataManager.saveData() fails (throws error or returns failure)
       Action: Call saveProfile(testProfile)
       Assertions: Error logged to console, exception thrown to caller
       Requirements: ui.6.2 */
    it('should handle save errors and throw exception', async () => {
      const testProfile: UserProfile = {
        ...mockProfile,
        lastUpdated: Date.now(),
      };

      // Close database to cause save error
      dataManager.close();

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call saveProfile and expect error
      await expect(profileManager.saveProfile(testProfile)).rejects.toThrow();

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Failed to save profile:')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('loadProfile', () => {
    /* Preconditions: DataManager has saved profile data with key 'user_profile'
       Action: Call loadProfile()
       Assertions: Returns UserProfile object with correct structure, success logged to console
       Requirements: ui.6.7 */
    it('should correctly load profile data from DataManager', async () => {
      const testProfile: UserProfile = {
        ...mockProfile,
        lastUpdated: Date.now(),
      };

      // Save profile first
      dataManager.saveData('user_profile', testProfile);

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call loadProfile
      const result = await profileManager.loadProfile();

      // Verify profile loaded correctly
      expect(result).not.toBeNull();
      expect(result).toMatchObject(testProfile);

      // Verify success log
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Profile loaded from local storage')
      );

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: DataManager has no profile data (result.success = false or result.data = null)
       Action: Call loadProfile()
       Assertions: Returns null, console log message about no profile found
       Requirements: ui.6.7 */
    it('should return null when no profile data exists', async () => {
      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call loadProfile (no data saved)
      const result = await profileManager.loadProfile();

      // Verify null returned
      expect(result).toBeNull();

      // Verify log message
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] No profile found in local storage')
      );

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: DataManager.loadData() throws error
       Action: Call loadProfile()
       Assertions: Returns null instead of throwing, error logged to console
       Requirements: ui.6.7 */
    it('should handle load errors gracefully and return null', async () => {
      // Create a new profile manager with a mock DataManager that throws
      const mockDataManager = {
        loadData: jest.fn().mockImplementation(() => {
          throw new Error('Database error');
        }),
      } as unknown as DataManager;

      const testProfileManager = new UserProfileManager(mockDataManager, oauthClient, tokenStorage);

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call loadProfile
      const result = await testProfileManager.loadProfile();

      // Verify null returned (no exception thrown)
      expect(result).toBeNull();

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Failed to load profile:')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('clearProfile', () => {
    /* Preconditions: DataManager has saved profile data
       Action: Call clearProfile()
       Assertions: DataManager.deleteData() called with key 'user_profile', profile removed from database, success logged to console
       Requirements: ui.6.8 */
    it('should delete profile data from DataManager', async () => {
      const testProfile: UserProfile = {
        ...mockProfile,
        lastUpdated: Date.now(),
      };

      // Save profile first
      dataManager.saveData('user_profile', testProfile);

      // Verify profile exists
      let savedProfile = dataManager.loadData('user_profile');
      expect(savedProfile.success).toBe(true);

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call clearProfile
      await profileManager.clearProfile();

      // Verify profile was deleted
      savedProfile = dataManager.loadData('user_profile');
      expect(savedProfile.success).toBe(false);

      // Verify success log
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Profile cleared from local storage')
      );

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: DataManager.deleteData() fails (throws error or returns failure)
       Action: Call clearProfile()
       Assertions: Error logged to console, exception thrown to caller
       Requirements: ui.6.8 */
    it('should handle delete errors and throw exception', async () => {
      // Close database to cause delete error
      dataManager.close();

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call clearProfile and expect error
      await expect(profileManager.clearProfile()).rejects.toThrow();

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Failed to clear profile:')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('updateProfileAfterTokenRefresh', () => {
    /* Preconditions: UserProfileManager instance created
       Action: Call updateProfileAfterTokenRefresh()
       Assertions: fetchProfile() method called exactly once, console log message about updating profile after token refresh
       Requirements: ui.6.5 */
    it('should call fetchProfile() when invoked', async () => {
      // Spy on fetchProfile method
      const fetchProfileSpy = jest.spyOn(profileManager, 'fetchProfile').mockResolvedValue(null);

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call updateProfileAfterTokenRefresh
      await profileManager.updateProfileAfterTokenRefresh();

      // Verify fetchProfile was called
      expect(fetchProfileSpy).toHaveBeenCalledTimes(1);

      // Verify log message
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Updating profile after token refresh')
      );

      fetchProfileSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });
  });

  describe('getCurrentEmail', () => {
    /* Preconditions: fetchProfile() successfully fetched profile with email
       Action: Call getCurrentEmail()
       Assertions: Returns the email from the fetched profile
       Requirements: ui.12.10, ui.12.15 */
    it('should return current email after fetchProfile()', async () => {
      // Mock authorized status and tokens
      (oauthClient.getAuthStatus as jest.Mock).mockResolvedValue({
        authorized: true,
      });
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
      });

      // Mock fetch to return profile
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockProfile,
      });

      // Fetch profile
      await profileManager.fetchProfile();

      // Get current email
      const email = profileManager.getCurrentEmail();

      expect(email).toBe('test@example.com');
    });

    /* Preconditions: loadProfile() successfully loaded profile with email
       Action: Call getCurrentEmail()
       Assertions: Returns the email from the loaded profile
       Requirements: ui.12.10, ui.12.17 */
    it('should return current email after loadProfile()', async () => {
      const testProfile: UserProfile = {
        ...mockProfile,
        lastUpdated: Date.now(),
      };

      // Save profile first
      dataManager.saveData('user_profile', testProfile);

      // Load profile
      await profileManager.loadProfile();

      // Get current email
      const email = profileManager.getCurrentEmail();

      expect(email).toBe('test@example.com');
    });

    /* Preconditions: clearProfile() was called
       Action: Call getCurrentEmail()
       Assertions: Returns null
       Requirements: ui.12.10, ui.12.18 */
    it('should return null after clearProfile()', async () => {
      // First set email by fetching profile
      (oauthClient.getAuthStatus as jest.Mock).mockResolvedValue({
        authorized: true,
      });
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockProfile,
      });

      await profileManager.fetchProfile();
      expect(profileManager.getCurrentEmail()).toBe('test@example.com');

      // Clear profile
      await profileManager.clearProfile();

      // Get current email
      const email = profileManager.getCurrentEmail();

      expect(email).toBeNull();
    });

    /* Preconditions: No profile fetched or loaded
       Action: Call getCurrentEmail()
       Assertions: Returns null
       Requirements: ui.12.10 */
    it('should return null when no profile exists', () => {
      const email = profileManager.getCurrentEmail();

      expect(email).toBeNull();
    });

    /* Preconditions: updateProfileAfterTokenRefresh() successfully updated profile
       Action: Call getCurrentEmail()
       Assertions: Returns the updated email
       Requirements: ui.12.10, ui.12.16 */
    it('should return updated email after updateProfileAfterTokenRefresh()', async () => {
      // Mock authorized status and tokens
      (oauthClient.getAuthStatus as jest.Mock).mockResolvedValue({
        authorized: true,
      });
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
      });

      // Mock fetch to return profile with new email
      const updatedProfile = {
        ...mockProfile,
        email: 'updated@example.com',
      };
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => updatedProfile,
      });

      // Update profile after token refresh
      await profileManager.updateProfileAfterTokenRefresh();

      // Get current email
      const email = profileManager.getCurrentEmail();

      expect(email).toBe('updated@example.com');
    });
  });

  describe('fetchProfileSynchronously', () => {
    /* Preconditions: TokenStorageManager returns valid access token, fetch returns successful response from Google UserInfo API
       Action: Call fetchProfileSynchronously()
       Assertions: Profile fetched from API, profile saved via DataManager.saveData(), method returns { success: true, profile: {...} }, currentUserEmail cached
       Requirements: google-oauth-auth.3.6, google-oauth-auth.3.8, ui.6.3, ui.6.4 */
    it('should successfully fetch and save profile synchronously', async () => {
      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockProfile,
      });

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call fetchProfileSynchronously
      const result = await profileManager.fetchProfileSynchronously();

      // Verify success result
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.profile).toMatchObject(mockProfile);
        expect(result.profile.lastUpdated).toBeDefined();
      }

      // Verify fetch was called with correct parameters
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v1/userinfo',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-access-token',
          },
        })
      );

      // Verify profile was saved to database
      const savedProfile = dataManager.loadData('user_profile');
      expect(savedProfile.success).toBe(true);
      expect(savedProfile.data).toMatchObject(mockProfile);

      // Verify currentUserEmail was cached
      expect(profileManager.getCurrentEmail()).toBe('test@example.com');

      // Verify success log
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Profile fetched and saved synchronously')
      );

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: TokenStorageManager returns valid access token, fetch returns HTTP error (500, 401, etc.)
       Action: Call fetchProfileSynchronously()
       Assertions: TokenStorageManager.deleteTokens() called, method returns { success: false, error: 'profile_fetch_failed' }, error logged
       Requirements: google-oauth-auth.3.7, ui.6.4, ui.6.5 */
    it('should clear tokens and return error when API request fails', async () => {
      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Mock deleteTokens
      const deleteTokensMock = jest.fn().mockResolvedValue(undefined);
      (tokenStorage as any).deleteTokens = deleteTokensMock;

      // Mock API error (HTTP 500)
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
      });

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call fetchProfileSynchronously
      const result = await profileManager.fetchProfileSynchronously();

      // Verify error result
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('profile_fetch_failed');
      }

      // Verify tokens were cleared
      expect(deleteTokensMock).toHaveBeenCalledTimes(1);

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] UserInfo API error during sync fetch')
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: TokenStorageManager returns null or no access token
       Action: Call fetchProfileSynchronously()
       Assertions: TokenStorageManager.deleteTokens() called, method returns { success: false, error: 'profile_fetch_failed' }, error logged
       Requirements: google-oauth-auth.3.7, ui.6.4 */
    it('should clear tokens and return error when no access token available', async () => {
      // Mock no tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue(null);

      // Mock deleteTokens
      const deleteTokensMock = jest.fn().mockResolvedValue(undefined);
      (tokenStorage as any).deleteTokens = deleteTokensMock;

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call fetchProfileSynchronously
      const result = await profileManager.fetchProfileSynchronously();

      // Verify error result
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('profile_fetch_failed');
      }

      // Verify tokens were cleared
      expect(deleteTokensMock).toHaveBeenCalledTimes(1);

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[UserProfileManager] No access token available for synchronous fetch'
        )
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: TokenStorageManager returns valid access token, fetch throws network error
       Action: Call fetchProfileSynchronously()
       Assertions: TokenStorageManager.deleteTokens() called, method returns { success: false, error: 'profile_fetch_failed' }, error logged
       Requirements: google-oauth-auth.3.7, ui.6.4, ui.6.5 */
    it('should clear tokens and return error when network error occurs', async () => {
      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Mock deleteTokens
      const deleteTokensMock = jest.fn().mockResolvedValue(undefined);
      (tokenStorage as any).deleteTokens = deleteTokensMock;

      // Mock network error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call fetchProfileSynchronously
      const result = await profileManager.fetchProfileSynchronously();

      // Verify error result
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('profile_fetch_failed');
      }

      // Verify tokens were cleared
      expect(deleteTokensMock).toHaveBeenCalledTimes(1);

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UserProfileManager] Failed to fetch profile synchronously:')
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: TokenStorageManager returns valid access token, fetch times out after 10 seconds
       Action: Call fetchProfileSynchronously()
       Assertions: TokenStorageManager.deleteTokens() called, method returns { success: false, error: 'profile_fetch_failed' }, timeout handled gracefully
       Requirements: google-oauth-auth.3.7, ui.6.4 */
    it('should handle timeout and clear tokens', async () => {
      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Mock deleteTokens
      const deleteTokensMock = jest.fn().mockResolvedValue(undefined);
      (tokenStorage as any).deleteTokens = deleteTokensMock;

      // Mock fetch that never resolves (simulating timeout)
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AbortError')), 100);
          })
      );

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call fetchProfileSynchronously
      const result = await profileManager.fetchProfileSynchronously();

      // Verify error result
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('profile_fetch_failed');
      }

      // Verify tokens were cleared
      expect(deleteTokensMock).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});
