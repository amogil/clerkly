// Requirements: account-profile.1.2, account-profile.1.3, account-profile.1.5, account-profile.1.6, account-profile.1.7, account-profile.1.8, user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.1, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.5, database-refactoring.2

import { UserManager } from '../../../src/main/auth/UserManager';
import { DatabaseManager } from '../../../src/main/DatabaseManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { MainEventBus } from '../../../src/main/events/MainEventBus';
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

describe('UserManager', () => {
  let dbManager: DatabaseManager;
  let tokenStorage: TokenStorageManager;
  let profileManager: UserManager;
  let testDbPath: string;
  let mockSelfUserManager: jest.Mocked<UserManager>;

  // Mock Google UserInfo API response
  const mockGoogleProfile = {
    id: '123456789',
    email: 'test@example.com',
    verified_email: true,
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
    locale: 'en',
  };

  beforeEach(() => {
    // Create test database
    testDbPath = path.join(os.tmpdir(), `test-profile-${Date.now()}`);

    // Ensure migrations directory exists for tests
    const migrationsPath = path.join(__dirname, '..', '..', '..', 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }

    // Requirements: user-data-isolation.1.5 - Mock UserManager for data isolation
    mockSelfUserManager = {
      getCurrentUserId: jest.fn().mockReturnValue('testUserId1'),
      findOrCreateUser: jest.fn().mockReturnValue({
        userId: 'testUserId1',
        name: 'Test User',
        email: 'test@example.com',
        googleId: '123456789',
        locale: 'en',
        lastSynced: Date.now(),
      }),
    } as unknown as jest.Mocked<UserManager>;

    // Requirements: database-refactoring.2 - Initialize DatabaseManager first
    dbManager = new DatabaseManager();
    dbManager.initialize(testDbPath);
    dbManager.setUserManager(mockSelfUserManager);

    // Create mocked dependencies
    tokenStorage = {
      loadTokens: jest.fn(),
      deleteTokens: jest.fn().mockResolvedValue(undefined),
    } as unknown as TokenStorageManager;

    // Create profile manager with DatabaseManager
    // Requirements: account-profile.1.3
    profileManager = new UserManager(dbManager, tokenStorage);

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  describe('generateUserId', () => {
    /* Preconditions: none
       Action: Call generateUserId() 100 times
       Assertions: All IDs have length 10, contain only alphanumeric characters (A-Z, a-z, 0-9)
       Requirements: user-data-isolation.0.2, user-data-isolation.1.1 */
    it('should generate valid 10-character alphanumeric user_id', () => {
      const alphanumericRegex = /^[A-Za-z0-9]{10}$/;

      for (let i = 0; i < 100; i++) {
        const userId = (profileManager as any).generateUserId();
        expect(userId).toMatch(alphanumericRegex);
        expect(userId.length).toBe(10);
      }
    });

    /* Preconditions: none
       Action: Call generateUserId() multiple times
       Assertions: Generated IDs are unique (high probability)
       Requirements: user-data-isolation.0.2 */
    it('should generate unique user_ids', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add((profileManager as any).generateUserId());
      }
      // With 62^10 possible combinations, 100 IDs should all be unique
      expect(ids.size).toBe(100);
    });
  });

  describe('findOrCreateUser', () => {
    /* Preconditions: Empty users table
       Action: Call findOrCreateUser with GoogleUserInfoResponse object
       Assertions: New user created with 10-character userId, all fields populated
       Requirements: user-data-isolation.0.3, user-data-isolation.1.2 */
    it('should create new user on first login', () => {
      const googleProfile = {
        id: 'google123',
        email: 'newuser@example.com',
        verified_email: true,
        name: 'New User',
        given_name: 'New',
        family_name: 'User',
        locale: 'ru',
      };

      const user = profileManager.findOrCreateUser(googleProfile);

      expect(user.userId).toMatch(/^[A-Za-z0-9]{10}$/);
      expect(user.email).toBe('newuser@example.com');
      expect(user.name).toBe('New User');
      expect(user.googleId).toBe('google123');
      expect(user.locale).toBe('ru');
      expect(user.lastSynced).toBeGreaterThan(0);
    });

    /* Preconditions: User exists in users table
       Action: Call findOrCreateUser with same email
       Assertions: Returns existing user_id
       Requirements: user-data-isolation.0.3, user-data-isolation.1.2 */
    it('should find existing user on re-login', () => {
      const googleProfile = {
        id: 'google456',
        email: 'existing@example.com',
        verified_email: true,
        name: 'Existing User',
        given_name: 'Existing',
        family_name: 'User',
        locale: 'en',
      };

      // Create user first
      const user1 = profileManager.findOrCreateUser(googleProfile);

      // Find same user
      const user2 = profileManager.findOrCreateUser(googleProfile);

      expect(user2.userId).toBe(user1.userId);
      expect(user2.email).toBe('existing@example.com');
    });

    /* Preconditions: User exists with name 'Old Name'
       Action: Call findOrCreateUser with same email but name 'New Name'
       Assertions: Name updated in database
       Requirements: user-data-isolation.0.4, user-data-isolation.1.2 */
    it('should update user name if changed', () => {
      const oldProfile = {
        id: 'google789',
        email: 'update@example.com',
        verified_email: true,
        name: 'Old Name',
        given_name: 'Old',
        family_name: 'Name',
        locale: 'en',
      };

      // Create user with old name
      const user1 = profileManager.findOrCreateUser(oldProfile);

      // Update with new name
      const newProfile = { ...oldProfile, name: 'New Name' };
      const user2 = profileManager.findOrCreateUser(newProfile);

      expect(user2.userId).toBe(user1.userId);
      expect(user2.name).toBe('New Name');

      // Verify in database
      const db = dbManager.getDatabase();
      const dbUser = db?.prepare('SELECT name FROM users WHERE user_id = ?').get(user1.userId) as {
        name: string;
      };
      expect(dbUser.name).toBe('New Name');
    });

    /* Preconditions: User exists with googleId 'old123'
       Action: Call findOrCreateUser with same email but different googleId
       Assertions: googleId updated in database
       Requirements: user-data-isolation.0.4 */
    it('should update googleId if changed', () => {
      const oldProfile = {
        id: 'old123',
        email: 'googleid@example.com',
        verified_email: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        locale: 'en',
      };

      // Create user
      const user1 = profileManager.findOrCreateUser(oldProfile);
      expect(user1.googleId).toBe('old123');

      // Update with new googleId
      const newProfile = { ...oldProfile, id: 'new456' };
      const user2 = profileManager.findOrCreateUser(newProfile);

      expect(user2.userId).toBe(user1.userId);
      expect(user2.googleId).toBe('new456');
    });

    /* Preconditions: User exists with locale 'en'
       Action: Call findOrCreateUser with same email but locale 'ru'
       Assertions: locale updated in database
       Requirements: user-data-isolation.0.4 */
    it('should update locale if changed', () => {
      const oldProfile = {
        id: 'google111',
        email: 'locale@example.com',
        verified_email: true,
        name: 'Test User',
        given_name: 'Test',
        family_name: 'User',
        locale: 'en',
      };

      // Create user
      const user1 = profileManager.findOrCreateUser(oldProfile);
      expect(user1.locale).toBe('en');

      // Update with new locale
      const newProfile = { ...oldProfile, locale: 'ru' };
      const user2 = profileManager.findOrCreateUser(newProfile);

      expect(user2.userId).toBe(user1.userId);
      expect(user2.locale).toBe('ru');
    });

    /* Preconditions: Existing user updated, MainEventBus is mocked
       Action: Call findOrCreateUser() with changed profile fields
       Assertions: user.profile.updated contains changedFields as sorted string array
       Requirements: realtime-events.3.3.1, realtime-events.3.3.2 */
    it('should publish user.profile.updated with normalized changedFields array for existing user', () => {
      const publish = jest.fn();
      const getInstanceSpy = jest
        .spyOn(MainEventBus, 'getInstance')
        .mockReturnValue({ publish } as unknown as MainEventBus);

      const original = {
        id: 'google-1',
        email: 'event-existing@example.com',
        verified_email: true,
        name: 'Old Name',
        given_name: 'Old',
        family_name: 'Name',
        locale: 'en',
      };
      profileManager.findOrCreateUser(original);

      const updated = { ...original, name: 'New Name' };
      profileManager.findOrCreateUser(updated);

      expect(publish).toHaveBeenCalled();
      const publishedEvent = publish.mock.calls[publish.mock.calls.length - 1][0] as {
        type: string;
        toPayload: () => { id: string; changedFields?: string[] };
      };
      expect(publishedEvent.type).toBe('user.profile.updated');
      expect(publishedEvent.toPayload().changedFields).toEqual(['lastSynced', 'name']);
      getInstanceSpy.mockRestore();
    });

    /* Preconditions: New user path, MainEventBus is mocked
       Action: Call findOrCreateUser() for unknown email
       Assertions: user.profile.updated contains snapshot field list as sorted string array
       Requirements: realtime-events.3.3.1, realtime-events.3.3.2 */
    it('should publish user.profile.updated with sorted snapshot changedFields for new user', () => {
      const publish = jest.fn();
      const getInstanceSpy = jest
        .spyOn(MainEventBus, 'getInstance')
        .mockReturnValue({ publish } as unknown as MainEventBus);

      const profile = {
        id: 'google-new',
        email: 'event-new@example.com',
        verified_email: true,
        name: 'Event New User',
        given_name: 'Event',
        family_name: 'User',
        locale: 'ru',
      };

      profileManager.findOrCreateUser(profile);

      expect(publish).toHaveBeenCalled();
      const publishedEvent = publish.mock.calls[publish.mock.calls.length - 1][0] as {
        type: string;
        toPayload: () => { id: string; changedFields?: string[] };
      };
      expect(publishedEvent.type).toBe('user.profile.updated');
      expect(publishedEvent.toPayload().changedFields).toEqual([
        'email',
        'googleId',
        'lastSynced',
        'locale',
        'name',
      ]);
      getInstanceSpy.mockRestore();
    });

    /* Preconditions: normalizeChangedFields receives different shapes
       Action: Call normalizeChangedFields() with table-driven inputs
       Assertions: Returns undefined for empty input and returns unique sorted paths otherwise
       Requirements: realtime-events.3.3.2 */
    it('should normalize changed fields with dedupe and lexicographic sort', () => {
      const cases: Array<{ input: string[]; expected: string[] | undefined }> = [
        { input: [], expected: undefined },
        { input: ['name', 'name', 'locale'], expected: ['locale', 'name'] },
        {
          input: ['payload.data.text', 'payload.data.text', 'done'],
          expected: ['done', 'payload.data.text'],
        },
      ];

      for (const { input, expected } of cases) {
        expect((profileManager as any).normalizeChangedFields(input)).toEqual(expected);
      }
    });
  });

  describe('getCurrentUserId', () => {
    /* Preconditions: No profile fetched or loaded
       Action: Call getCurrentUserId()
       Assertions: Returns null
       Requirements: user-data-isolation.1.5 */
    it('should return null when no profile exists', () => {
      const userId = profileManager.getCurrentUserId();
      expect(userId).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    /* Preconditions: No profile fetched or loaded
       Action: Call getCurrentUser()
       Assertions: Returns null
       Requirements: account-profile.1.2 */
    it('should return null when no user logged in', () => {
      const user = profileManager.getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('fetchProfile', () => {
    /* Preconditions: Valid access token, fetch returns successful response from Google UserInfo API
       Action: Call fetchProfile()
       Assertions: HTTP request made to correct endpoint with Bearer token, user saved to database, returned User has correct structure
       Requirements: account-profile.1.2, account-profile.1.6 */
    it('should successfully fetch profile data from Google API', async () => {
      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockGoogleProfile,
      });

      // Call fetchProfile
      const result = await profileManager.fetchProfile();

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

      // Verify User structure
      expect(result).not.toBeNull();
      expect(result?.userId).toMatch(/^[A-Za-z0-9]{10}$/);
      expect(result?.email).toBe(mockGoogleProfile.email);
      expect(result?.name).toBe(mockGoogleProfile.name);
      expect(result?.googleId).toBe(mockGoogleProfile.id);
      expect(result?.locale).toBe(mockGoogleProfile.locale);
      expect(result?.lastSynced).toBeGreaterThan(0);
    });

    /* Preconditions: Valid access token, fetch throws network error, currentUser is cached
       Action: Call fetchProfile()
       Assertions: Error logged, cached user returned, no exception thrown
       Requirements: account-profile.1.7 */
    it('should return cached user data when API request fails', async () => {
      // First fetch to cache user
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockGoogleProfile,
      });
      await profileManager.fetchProfile();

      // Now simulate API error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call fetchProfile
      const result = await profileManager.fetchProfile();

      // Verify cached user was returned
      expect(result).not.toBeNull();
      expect(result?.email).toBe(mockGoogleProfile.email);

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: No access token available
       Action: Call fetchProfile()
       Assertions: Method returns null, fetch not called
       Requirements: account-profile.1.1 */
    it('should return null when no access token is available', async () => {
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

      consoleInfoSpy.mockRestore();
    });
  });

  describe('loadUserByEmail', () => {
    /* Preconditions: User exists in database
       Action: Call loadUserByEmail(email)
       Assertions: Returns User object with correct structure
       Requirements: account-profile.1.7 */
    it('should load user from database by email', () => {
      // First create a user
      const googleProfile = {
        id: 'google999',
        email: 'loadtest@example.com',
        verified_email: true,
        name: 'Load Test User',
        given_name: 'Load',
        family_name: 'Test',
        locale: 'en',
      };
      const createdUser = profileManager.findOrCreateUser(googleProfile);

      // Load user by email
      const loadedUser = profileManager.loadUserByEmail('loadtest@example.com');

      expect(loadedUser).not.toBeNull();
      expect(loadedUser?.userId).toBe(createdUser.userId);
      expect(loadedUser?.email).toBe('loadtest@example.com');
      expect(loadedUser?.name).toBe('Load Test User');
    });

    /* Preconditions: No user with given email exists
       Action: Call loadUserByEmail(email)
       Assertions: Returns null
       Requirements: account-profile.1.7 */
    it('should return null when no user found', () => {
      const result = profileManager.loadUserByEmail('nonexistent@example.com');
      expect(result).toBeNull();
    });
  });

  describe('updateProfileAfterTokenRefresh', () => {
    /* Preconditions: UserManager instance created
       Action: Call updateProfileAfterTokenRefresh()
       Assertions: fetchProfile() method called exactly once
       Requirements: account-profile.1.5 */
    it('should call fetchProfile() when invoked', async () => {
      // Spy on fetchProfile method
      const fetchProfileSpy = jest.spyOn(profileManager, 'fetchProfile').mockResolvedValue(null);

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call updateProfileAfterTokenRefresh
      await profileManager.updateProfileAfterTokenRefresh();

      // Verify fetchProfile was called
      expect(fetchProfileSpy).toHaveBeenCalledTimes(1);

      fetchProfileSpy.mockRestore();
      consoleInfoSpy.mockRestore();
    });
  });

  describe('getCurrentUserId after operations', () => {
    /* Preconditions: fetchProfile() successfully fetched profile
       Action: Call getCurrentUserId()
       Assertions: Returns the userId from findOrCreateUser
       Requirements: user-data-isolation.1.2, user-data-isolation.1.5 */
    it('should return current userId after fetchProfile()', async () => {
      // Mock tokens and fetch
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockGoogleProfile,
      });

      // Fetch profile
      await profileManager.fetchProfile();

      // Get current userId
      const userId = profileManager.getCurrentUserId();
      expect(userId).toMatch(/^[A-Za-z0-9]{10}$/);
    });

    /* Preconditions: clearSession() was called
       Action: Call getCurrentUserId()
       Assertions: Returns null
       Requirements: user-data-isolation.1.4, user-data-isolation.1.5 */
    it('should return null after clearSession()', async () => {
      // First set user_id by fetching profile
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockGoogleProfile,
      });

      await profileManager.fetchProfile();
      expect(profileManager.getCurrentUserId()).toMatch(/^[A-Za-z0-9]{10}$/);

      // Clear session
      profileManager.clearSession();

      // Get current userId
      const userId = profileManager.getCurrentUserId();
      expect(userId).toBeNull();
    });
  });

  describe('clearSession', () => {
    /* Preconditions: User logged in with userId cached
       Action: Call clearSession()
       Assertions: currentUserId is null, currentUser is null
       Requirements: user-data-isolation.1.4 */
    it('should clear userId and user on logout', async () => {
      // First set userId by fetching profile
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
      });
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockGoogleProfile,
      });

      await profileManager.fetchProfile();
      expect(profileManager.getCurrentUserId()).toMatch(/^[A-Za-z0-9]{10}$/);
      expect(profileManager.getCurrentUser()).not.toBeNull();

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call clearSession
      profileManager.clearSession();

      // Verify both were cleared
      expect(profileManager.getCurrentUserId()).toBeNull();
      expect(profileManager.getCurrentUser()).toBeNull();

      consoleInfoSpy.mockRestore();
    });
  });

  describe('initialize', () => {
    /* Preconditions: TokenStorageManager has valid tokens, fetch returns profile
       Action: Call initialize()
       Assertions: currentUserId is set from fetched profile
       Requirements: user-data-isolation.1.3 */
    it('should restore userId from API on app startup', async () => {
      // Create a user first
      const user = profileManager.findOrCreateUser({
        ...mockGoogleProfile,
        email: 'restored@example.com',
      });

      // Save userId to global storage (simulating previous login)
      dbManager.global.currentUser.setUserId(user.userId);

      // Call initialize
      await profileManager.initialize();

      // Verify currentUserId was set
      const userId = profileManager.getCurrentUserId();
      expect(userId).toMatch(/^[A-Za-z0-9]{10}$/);
      expect(userId).toBe(user.userId);
    });

    /* Preconditions: No tokens available
       Action: Call initialize()
       Assertions: currentUserId remains null, no error thrown
       Requirements: user-data-isolation.1.3 */
    it('should handle missing tokens gracefully', async () => {
      // Mock no tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue(null);

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call initialize (no tokens)
      await profileManager.initialize();

      // Verify currentUserId is still null
      const userId = profileManager.getCurrentUserId();
      expect(userId).toBeNull();

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: TokenStorageManager.loadTokens() throws error
       Action: Call initialize()
       Assertions: Error logged, currentUserId remains null, no exception thrown
       Requirements: user-data-isolation.1.3 */
    it('should handle load errors gracefully', async () => {
      // Mock loadTokens to throw
      (tokenStorage.loadTokens as jest.Mock).mockRejectedValue(new Error('Token storage error'));

      // Spy on console.error
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call initialize
      await profileManager.initialize();

      // Verify currentUserId is null
      const userId = profileManager.getCurrentUserId();
      expect(userId).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('fetchProfileSynchronously', () => {
    /* Preconditions: TokenStorageManager returns valid access token, fetch returns successful response
       Action: Call fetchProfileSynchronously()
       Assertions: Returns { success: true, user: User }, currentUserId cached
       Requirements: google-oauth-auth.3.6, google-oauth-auth.3.8, account-profile.1.3, user-data-isolation.1.2 */
    it('should successfully fetch and save user synchronously', async () => {
      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
      });

      // Mock successful API response
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockGoogleProfile,
      });

      // Spy on console.info
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();

      // Call fetchProfileSynchronously
      const result = await profileManager.fetchProfileSynchronously();

      // Verify success result
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user.userId).toMatch(/^[A-Za-z0-9]{10}$/);
        expect(result.user.email).toBe(mockGoogleProfile.email);
        expect(result.user.name).toBe(mockGoogleProfile.name);
        expect(result.user.googleId).toBe(mockGoogleProfile.id);
        expect(result.user.locale).toBe(mockGoogleProfile.locale);
      }

      // Verify currentUserId was cached
      expect(profileManager.getCurrentUserId()).toMatch(/^[A-Za-z0-9]{10}$/);

      consoleInfoSpy.mockRestore();
    });

    /* Preconditions: TokenStorageManager returns valid access token, fetch returns HTTP error
       Action: Call fetchProfileSynchronously()
       Assertions: TokenStorageManager.deleteTokens() called, returns { success: false, error: 'profile_fetch_failed' }
       Requirements: google-oauth-auth.3.7, account-profile.1.4 */
    it('should clear tokens and return error when API request fails', async () => {
      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
      });

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
      expect(tokenStorage.deleteTokens).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: TokenStorageManager returns null or no access token
       Action: Call fetchProfileSynchronously()
       Assertions: TokenStorageManager.deleteTokens() called, returns { success: false, error: 'profile_fetch_failed' }
       Requirements: google-oauth-auth.3.7, account-profile.1.4 */
    it('should clear tokens and return error when no access token available', async () => {
      // Mock no tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue(null);

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
      expect(tokenStorage.deleteTokens).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: TokenStorageManager returns valid access token, fetch throws network error
       Action: Call fetchProfileSynchronously()
       Assertions: TokenStorageManager.deleteTokens() called, returns { success: false, error: 'profile_fetch_failed' }
       Requirements: google-oauth-auth.3.7, account-profile.1.4 */
    it('should clear tokens and return error when network error occurs', async () => {
      // Mock valid tokens
      (tokenStorage.loadTokens as jest.Mock).mockResolvedValue({
        accessToken: 'test-access-token',
      });

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
      expect(tokenStorage.deleteTokens).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
    });
  });
});
