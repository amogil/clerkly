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
    dataManager = new DataManager(testDbPath);
    dataManager.initialize();

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
        '[UserProfileManager] Failed to fetch profile:',
        expect.any(Error)
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

      // Spy on console.log
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Call fetchProfile
      const result = await profileManager.fetchProfile();

      // Verify null returned
      expect(result).toBeNull();

      // Verify fetch was not called
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify log message
      expect(consoleLogSpy).toHaveBeenCalledWith('[UserProfileManager] No access token available');

      consoleLogSpy.mockRestore();
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

      // Spy on console.log
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Call fetchProfile
      const result = await profileManager.fetchProfile();

      // Verify null returned
      expect(result).toBeNull();

      // Verify fetch was not called
      expect(global.fetch).not.toHaveBeenCalled();

      // Verify log message
      expect(consoleLogSpy).toHaveBeenCalledWith('[UserProfileManager] No access token available');

      consoleLogSpy.mockRestore();
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

      // Spy on console.log
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Call saveProfile
      await profileManager.saveProfile(testProfile);

      // Verify profile was saved
      const savedProfile = dataManager.loadData('user_profile');
      expect(savedProfile.success).toBe(true);
      expect(savedProfile.data).toMatchObject(testProfile);

      // Verify success log
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[UserProfileManager] Profile saved to local storage'
      );

      consoleLogSpy.mockRestore();
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
        '[UserProfileManager] Failed to save profile:',
        expect.any(Error)
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

      // Spy on console.log
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Call loadProfile
      const result = await profileManager.loadProfile();

      // Verify profile loaded correctly
      expect(result).not.toBeNull();
      expect(result).toMatchObject(testProfile);

      // Verify success log
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[UserProfileManager] Profile loaded from local storage'
      );

      consoleLogSpy.mockRestore();
    });

    /* Preconditions: DataManager has no profile data (result.success = false or result.data = null)
       Action: Call loadProfile()
       Assertions: Returns null, console log message about no profile found
       Requirements: ui.6.7 */
    it('should return null when no profile data exists', async () => {
      // Spy on console.log
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Call loadProfile (no data saved)
      const result = await profileManager.loadProfile();

      // Verify null returned
      expect(result).toBeNull();

      // Verify log message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[UserProfileManager] No profile found in local storage'
      );

      consoleLogSpy.mockRestore();
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
        '[UserProfileManager] Failed to load profile:',
        expect.any(Error)
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

      // Spy on console.log
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Call clearProfile
      await profileManager.clearProfile();

      // Verify profile was deleted
      savedProfile = dataManager.loadData('user_profile');
      expect(savedProfile.success).toBe(false);

      // Verify success log
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[UserProfileManager] Profile cleared from local storage'
      );

      consoleLogSpy.mockRestore();
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
        '[UserProfileManager] Failed to clear profile:',
        expect.any(Error)
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

      // Spy on console.log
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Call updateProfileAfterTokenRefresh
      await profileManager.updateProfileAfterTokenRefresh();

      // Verify fetchProfile was called
      expect(fetchProfileSpy).toHaveBeenCalledTimes(1);

      // Verify log message
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[UserProfileManager] Updating profile after token refresh'
      );

      fetchProfileSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});
