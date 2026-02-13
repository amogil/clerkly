// Requirements: account-profile.1.2, account-profile.1.5, account-profile.1.6, account-profile.1.7, account-profile.1.8, error-notifications.1.1, token-management-ui.1.3, token-management-ui.1.4, user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.1, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.5

import { DataManager } from '../DataManager';
import { OAuthClientManager } from './OAuthClientManager';
import { TokenStorageManager } from './TokenStorageManager';
import { handleBackgroundError } from '../ErrorHandler';
import { handleAPIRequest } from './APIRequestHandler';
import { Logger } from '../Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*

/**
 * User record from users table
 * Requirements: user-data-isolation.1
 */
export interface User {
  user_id: string;
  name: string | null;
  email: string;
}
/**
 * User profile data from Google OAuth
 * Requirements: account-profile.1.2, account-profile.1.3
 */
export interface UserProfile {
  /**
   * Google user ID
   */
  id: string;

  /**
   * User email address
   */
  email: string;

  /**
   * Email verification status from Google
   */
  verified_email: boolean;

  /**
   * Full name of the user
   */
  name: string;

  /**
   * First name (given name)
   */
  given_name: string;

  /**
   * Last name (family name)
   */
  family_name: string;

  /**
   * User locale (e.g., "en", "ru")
   */
  locale: string;

  /**
   * Optional URL to user's profile picture
   */
  picture?: string;

  /**
   * Unix timestamp of last profile update
   * Used to track when the profile data was last fetched from Google
   */
  lastUpdated: number;
}

/**
 * User Profile Manager
 * Manages user profile data from Google OAuth
 * Handles fetching, caching, and updating profile information
 * Requirements: account-profile.1.2, account-profile.1.5, account-profile.1.6, account-profile.1.7, account-profile.1.8, user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.1, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.5
 */
export class UserProfileManager {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('UserProfileManager');
  private dataManager: DataManager;
  private oauthClient: OAuthClientManager;
  private tokenStorage: TokenStorageManager;
  private readonly profileKey = 'user_profile';
  // Requirements: user-data-isolation.1.1, user-data-isolation.1.5 - Cache current user_id for data isolation
  private currentUserId: string | null = null;
  // Flag to prevent profile loading after logout
  private isLoggedOut: boolean = false;

  /**
   * Create a new UserProfileManager
   * @param dataManager DataManager instance for local storage
   * @param oauthClient OAuthClientManager instance for authentication
   * @param tokenStorage TokenStorageManager instance for accessing tokens
   */
  constructor(
    dataManager: DataManager,
    oauthClient: OAuthClientManager,
    tokenStorage: TokenStorageManager
  ) {
    this.dataManager = dataManager;
    this.oauthClient = oauthClient;
    this.tokenStorage = tokenStorage;
  }

  /**
   * Generate random 10-character alphanumeric user_id
   * Requirements: user-data-isolation.0.2, user-data-isolation.1.1
   *
   * Algorithm:
   * 1. Define character set: A-Z, a-z, 0-9 (62 characters)
   * 2. Generate 10-character string by picking random characters
   * 3. Return result
   *
   * @returns 10-character alphanumeric string
   */
  private generateUserId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Find or create user by email
   * Requirements: user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.2
   *
   * Algorithm:
   * 1. Search for user by email in users table
   * 2. If found: update name if changed, return existing user_id
   * 3. If not found: generate random user_id, create record, return new user_id
   *
   * @param email User email from Google OAuth profile
   * @param name User name from Google OAuth profile (can be null)
   * @returns User record with user_id, name, and email
   */
  findOrCreateUser(email: string, name: string | null): User {
    const db = this.dataManager.getDatabase();
    if (!db) {
      throw new Error('Database not initialized');
    }

    // Try to find existing user
    const existingUser = db
      .prepare('SELECT user_id, name, email FROM users WHERE email = ?')
      .get(email) as User | undefined;

    if (existingUser) {
      // Requirements: user-data-isolation.0.4 - Update name if changed
      if (name !== null && existingUser.name !== name) {
        db.prepare('UPDATE users SET name = ? WHERE user_id = ?').run(name, existingUser.user_id);
        this.logger.info(`Updated name for user ${existingUser.user_id}`);
        return { ...existingUser, name };
      }
      this.logger.info(`Found existing user ${existingUser.user_id}`);
      return existingUser;
    }

    // Create new user with random user_id
    const userId = this.generateUserId();
    db.prepare('INSERT INTO users (user_id, name, email) VALUES (?, ?, ?)').run(
      userId,
      name,
      email
    );

    this.logger.info(`Created new user ${userId} for ${email}`);
    return { user_id: userId, name, email };
  }

  /**
   * Get current user ID
   * Requirements: user-data-isolation.1.5
   *
   * Returns the cached user_id of the currently logged in user.
   * Used by DataManager to filter data by user_id.
   *
   * @returns Current user_id or null if not logged in
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Fetch user profile from Google UserInfo API
   * Requirements: account-profile.1.2, account-profile.1.6, error-notifications.1.1, token-management-ui.1.3, token-management-ui.1.4, user-data-isolation.1.2
   *
   * Fetches fresh profile data from Google's UserInfo API endpoint.
   * On success, saves the profile to local storage and caches user_id.
   * On error, returns cached profile data (graceful error handling).
   * Uses centralized API request handler for automatic HTTP 401 detection.
   *
   * @returns User profile data or null if not authenticated
   */
  async fetchProfile(): Promise<UserProfile | null> {
    try {
      // Get access token from token storage
      const tokens = await this.tokenStorage.loadTokens();
      if (!tokens || !tokens.accessToken) {
        this.logger.info('No access token available');
        return null;
      }

      // Requirements: account-profile.1.6 - Use Google UserInfo API endpoint
      // Use CLERKLY_GOOGLE_API_URL environment variable for testing, default to production
      const googleApiBaseUrl = process.env.CLERKLY_GOOGLE_API_URL || 'https://www.googleapis.com';
      const userInfoUrl = process.env.CLERKLY_GOOGLE_API_URL
        ? `${googleApiBaseUrl}/userinfo` // Mock server uses /userinfo
        : `${googleApiBaseUrl}/oauth2/v1/userinfo`; // Google uses /oauth2/v1/userinfo

      Logger.info('UserProfileManager', 'Fetching profile from Google UserInfo API');
      Logger.info('UserProfileManager', `About to call handleAPIRequest with URL: ${userInfoUrl}`);

      // Requirements: token-management-ui.1.3, token-management-ui.1.4 - Use centralized handler for automatic 401 detection
      const response = await handleAPIRequest(
        userInfoUrl,
        {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
          },
        },
        this.tokenStorage,
        'UserInfo API'
      );

      if (!response.ok) {
        throw new Error(`UserInfo API error: ${response.status} ${response.statusText}`);
      }

      const profileData = (await response.json()) as Omit<UserProfile, 'lastUpdated'>;
      const profile: UserProfile = {
        ...profileData,
        lastUpdated: Date.now(),
      };

      // Requirements: user-data-isolation.1.2 - Find or create user and cache user_id
      const user = this.findOrCreateUser(profile.email, profile.name);
      this.currentUserId = user.user_id;
      this.isLoggedOut = false; // Reset logout flag on successful login
      Logger.info('UserProfileManager', `User ID set: ${user.user_id}`);

      // Requirements: account-profile.1.2 - Save to local storage
      await this.saveProfile(profile);

      Logger.info('UserProfileManager', 'Profile fetched and saved successfully');
      return profile;
    } catch (error) {
      // Requirements: token-management-ui.1.3 - If it's a 401 error, tokens are already cleared by handleAPIRequest
      // Just return null to indicate no profile available
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Authorization failed') || errorMessage.includes('401')) {
        Logger.info('UserProfileManager', 'Session expired (401), returning null');
        return null;
      }

      this.logger.error(`Failed to fetch profile: ${error}`);

      // Requirements: account-profile.1.7 - Return cached profile on other errors (network, timeout, etc.)
      Logger.info('UserProfileManager', 'Returning cached profile due to API error');
      const cachedProfile = await this.loadProfile();

      // Requirements: error-notifications.1.1, error-notifications.1.4 - Notify user about the error
      handleBackgroundError(error, 'Profile Loading');

      return cachedProfile;
    }
  }

  /**
   * Save user profile to local storage
   * Requirements: account-profile.1.2
   *
   * Saves the profile data to DataManager with key 'user_profile'.
   * Throws error if save operation fails.
   *
   * @param profile User profile data to save
   */
  async saveProfile(profile: UserProfile): Promise<void> {
    try {
      const result = this.dataManager.saveData(this.profileKey, profile);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save profile');
      }
      this.logger.info('Profile saved to local storage');
    } catch (error) {
      this.logger.error(`Failed to save profile: ${error}`);
      throw error;
    }
  }

  /**
   * Load user profile from local storage
   * Requirements: account-profile.1.7
   *
   * Loads cached profile data from DataManager.
   * Note: currentUserId must be set before calling this method.
   * Returns null if no profile data exists or on error.
   *
   * @returns User profile data or null if not found
   */
  async loadProfile(): Promise<UserProfile | null> {
    try {
      const result = this.dataManager.loadData(this.profileKey);
      if (result.success && result.data) {
        const profile = result.data as UserProfile;
        this.logger.info('Profile loaded from local storage');
        return profile;
      }
      this.logger.info('No profile found in local storage');
      return null;
    } catch (error) {
      this.logger.error(`Failed to load profile: ${error}`);
      return null;
    }
  }

  /**
   * Initialize profile on app startup
   * Requirements: user-data-isolation.1.3
   *
   * Attempts to restore user session on app startup.
   * If valid tokens exist, fetches profile from Google API to restore currentUserId.
   * This ensures that data isolation works immediately after app restart
   * without requiring the user to log in again.
   * Called during app initialization in main process.
   */
  async initialize(): Promise<void> {
    try {
      // Check if we have valid tokens
      const tokens = await this.tokenStorage.loadTokens();
      if (tokens && tokens.accessToken) {
        // Fetch profile from API to restore currentUserId
        const profile = await this.fetchProfile();
        if (profile) {
          // currentUserId is already set by fetchProfile() via findOrCreateUser()
          this.logger.info(`User ID cached from stored profile: ${this.currentUserId}`);
        }
      } else {
        this.logger.info('No tokens available, user not logged in');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize: ${error}`);
    }
  }

  /**
   * Load user profile by email (for testing purposes)
   * Requirements: testing.3.1, testing.3.2
   *
   * Loads profile data directly from database by email without requiring currentUserId.
   * This method bypasses the normal data isolation check and should ONLY be used in tests.
   * Used to verify that profile data is preserved in database after logout.
   *
   * @param email User email to load profile for
   * @returns User profile data or null if not found
   */
  async loadProfileByEmail(email: string): Promise<UserProfile | null> {
    try {
      // Find user by email to get user_id
      const user = this.findOrCreateUser(email, null);

      // Temporarily set currentUserId to allow DataManager to load data
      const originalUserId = this.currentUserId;
      this.currentUserId = user.user_id;

      const result = this.dataManager.loadData(this.profileKey);

      // Restore original user_id
      this.currentUserId = originalUserId;

      if (result.success && result.data) {
        const profile = result.data as UserProfile;
        this.logger.info(`Profile loaded by email for testing: ${email}`);
        return profile;
      }

      this.logger.info(`No profile found for email: ${email}`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to load profile by email: ${error}`);
      return null;
    }
  }

  /**
   * Clear user profile from local storage
   * Requirements: account-profile.1.8, user-data-isolation.1.4
   *
   * Deletes profile data from DataManager and clears cached user_id.
   * Called during logout to remove all user data.
   * Throws error if delete operation fails.
   */
  async clearProfile(): Promise<void> {
    try {
      const result = this.dataManager.deleteData(this.profileKey);
      if (!result.success) {
        throw new Error(result.error || 'Failed to clear profile');
      }

      // Requirements: user-data-isolation.1.4 - Clear cached user_id
      this.currentUserId = null;

      this.logger.info('Profile cleared from local storage');
    } catch (error) {
      this.logger.error(`Failed to clear profile: ${error}`);
      throw error;
    }
  }

  /**
   * Clear session on logout
   * Requirements: user-data-isolation.1.4
   *
   * Clears the current user_id from memory and sets logout flag.
   * Called during logout to prevent data operations while preserving profile in database.
   * Profile data remains in database for restoration on next login.
   */
  clearSession(): void {
    // Requirements: user-data-isolation.1.4 - Clear currentUserId on logout
    this.currentUserId = null;
    this.isLoggedOut = true;
    this.logger.info('User session cleared (user_id cleared from memory)');
  }

  /**
   * Update profile after token refresh
   * Requirements: account-profile.1.5, user-data-isolation.1.2
   *
   * Called automatically by OAuthClientManager after successful token refresh.
   * Fetches fresh profile data from Google API to keep profile up-to-date.
   * This ensures profile data is refreshed every hour (when tokens are refreshed).
   * Also updates cached user_id if profile changed.
   */
  async updateProfileAfterTokenRefresh(): Promise<void> {
    this.logger.info('Updating profile after token refresh');
    await this.fetchProfile();
  }

  /**
   * Delete profile data from DataManager
   * Alias for clearProfile() for consistency with other delete methods
   * Requirements: account-profile.1.8
   */
  async deleteProfile(): Promise<void> {
    return await this.clearProfile();
  }

  /**
   * Fetch user profile synchronously during authorization
   * Requirements: google-oauth-auth.3.6, google-oauth-auth.3.7, google-oauth-auth.3.8, account-profile.1.3, account-profile.1.4, account-profile.1.5, user-data-isolation.1.2
   *
   * This method is called synchronously during the OAuth authorization flow,
   * after tokens have been successfully exchanged. It ensures that the user's
   * profile is loaded before showing the Dashboard.
   *
   * On success:
   * - Saves profile to database
   * - Caches user_id for data isolation
   * - Returns { success: true, profile: UserProfile }
   *
   * On error:
   * - Clears all tokens (authorization is considered failed)
   * - Returns { success: false, error: 'profile_fetch_failed' }
   * - Does NOT throw exceptions (graceful error handling)
   *
   * This is a blocking operation - the UI will show a loader until it completes.
   *
   * @returns Result object with success status, profile data, or error code
   */
  async fetchProfileSynchronously(): Promise<
    { success: true; profile: UserProfile } | { success: false; error: string }
  > {
    try {
      // Get access token from token storage
      const tokens = await this.tokenStorage.loadTokens();
      if (!tokens || !tokens.accessToken) {
        Logger.error('UserProfileManager', 'No access token available for synchronous fetch');
        // Clear tokens since authorization is incomplete
        await this.tokenStorage.deleteTokens();
        return { success: false, error: 'profile_fetch_failed' };
      }

      // Requirements: account-profile.1.6 - Use Google UserInfo API endpoint
      const googleApiBaseUrl = process.env.CLERKLY_GOOGLE_API_URL || 'https://www.googleapis.com';
      const userInfoUrl = process.env.CLERKLY_GOOGLE_API_URL
        ? `${googleApiBaseUrl}/userinfo`
        : `${googleApiBaseUrl}/oauth2/v1/userinfo`;

      Logger.info('UserProfileManager', 'Fetching profile synchronously during authorization');

      // Make API request (with timeout to prevent blocking indefinitely)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(userInfoUrl, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        Logger.error(
          'UserProfileManager',
          `UserInfo API error during sync fetch: ${response.status}`
        );
        // Requirements: google-oauth-auth.3.7 - Clear tokens on profile fetch failure
        await this.tokenStorage.deleteTokens();
        return { success: false, error: 'profile_fetch_failed' };
      }

      const profileData = (await response.json()) as Omit<UserProfile, 'lastUpdated'>;
      const profile: UserProfile = {
        ...profileData,
        lastUpdated: Date.now(),
      };

      // Requirements: user-data-isolation.1.2 - Find or create user and cache user_id
      const user = this.findOrCreateUser(profile.email, profile.name);
      this.currentUserId = user.user_id;
      this.isLoggedOut = false; // Reset logout flag on successful login

      // Requirements: google-oauth-auth.3.6, google-oauth-auth.3.8 - Save profile to database
      await this.saveProfile(profile);

      Logger.info(
        'UserProfileManager',
        `Profile fetched and saved synchronously, user_id: ${user.user_id}`
      );
      return { success: true, profile };
    } catch (error) {
      Logger.error('UserProfileManager', `Failed to fetch profile synchronously: ${error}`);

      // Requirements: google-oauth-auth.3.7 - Clear tokens on any error
      try {
        await this.tokenStorage.deleteTokens();
      } catch (clearError) {
        Logger.error(
          'UserProfileManager',
          `Failed to clear tokens after profile error: ${clearError}`
        );
      }

      return { success: false, error: 'profile_fetch_failed' };
    }
  }
}
