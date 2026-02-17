// Requirements: account-profile.1.2, account-profile.1.3, account-profile.1.5, account-profile.1.6, account-profile.1.7, account-profile.1.8, error-notifications.1.1, token-management-ui.1.3, token-management-ui.1.4, user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.1, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.5

import { DatabaseManager } from '../DatabaseManager';
import { TokenStorageManager } from './TokenStorageManager';
import { handleBackgroundError } from '../ErrorHandler';
import { handleAPIRequest } from './APIRequestHandler';
import { SessionExpiredError } from './errors';
import { Logger } from '../Logger';
import { MainEventBus } from '../events/MainEventBus';
import { UserProfileUpdatedEvent } from '../../shared/events/types';
import { User } from '../db/schema';

// Re-export User for backward compatibility
export type { User };

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*

/**
 * Raw response from Google UserInfo API
 */
interface GoogleUserInfoResponse {
  id: string;
  email: string;
  verified_email?: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  locale?: string;
}

/**
 * User Profile Manager
 * Manages user profile data from Google OAuth
 * Handles fetching, caching, and updating profile information
 * Requirements: account-profile.1.2, account-profile.1.3, account-profile.1.5, account-profile.1.6, account-profile.1.7, account-profile.1.8, user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.1, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.5
 */
export class UserManager {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('UserManager');
  private dbManager: DatabaseManager;
  private tokenStorage: TokenStorageManager;
  // Requirements: user-data-isolation.1.5 - Cache user_id with lazy loading from DB
  // undefined = not loaded yet, null = no user, string = userId
  private userIdCache: string | null | undefined = undefined;
  // Cache current user for quick access
  private currentUser: User | null = null;

  /**
   * Create a new UserManager
   * @param dbManager DatabaseManager instance for database access
   * @param tokenStorage TokenStorageManager instance for accessing tokens
   * Requirements: account-profile.1.3
   */
  constructor(dbManager: DatabaseManager, tokenStorage: TokenStorageManager) {
    this.dbManager = dbManager;
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
   * 2. If found: update fields if changed, return existing user
   * 3. If not found: generate random user_id, create record, return new user
   *
   * @param googleProfile Raw profile data from Google UserInfo API
   * @returns User record with all fields
   */
  findOrCreateUser(googleProfile: GoogleUserInfoResponse): User {
    const now = Date.now();

    // Try to find existing user
    const existingUser = this.dbManager.users.findByEmail(googleProfile.email);

    if (existingUser) {
      // Requirements: user-data-isolation.0.4 - Update fields if changed
      const updates: Partial<Pick<User, 'name' | 'googleId' | 'locale' | 'lastSynced'>> = {
        lastSynced: now,
      };

      if (googleProfile.name !== existingUser.name) {
        updates.name = googleProfile.name;
      }
      if (googleProfile.id !== existingUser.googleId) {
        updates.googleId = googleProfile.id;
      }
      if ((googleProfile.locale || null) !== existingUser.locale) {
        updates.locale = googleProfile.locale || null;
      }

      this.dbManager.users.update(existingUser.userId, updates);
      this.logger.info(`Updated user ${existingUser.userId}`);

      const updatedUser: User = {
        userId: existingUser.userId,
        name: googleProfile.name,
        email: googleProfile.email,
        googleId: googleProfile.id,
        locale: googleProfile.locale || null,
        lastSynced: now,
      };

      // Publish user.profile.updated event
      // Requirements: realtime-events.3.3
      const eventBus = MainEventBus.getInstance();
      eventBus.publish(
        new UserProfileUpdatedEvent(updatedUser.userId, {
          name: updatedUser.name,
          email: updatedUser.email,
          locale: updatedUser.locale,
        })
      );

      return updatedUser;
    }

    // Create new user
    const newUser = this.dbManager.users.findOrCreate(googleProfile.email, googleProfile.name);

    // Update additional fields
    this.dbManager.users.update(newUser.userId, {
      googleId: googleProfile.id,
      locale: googleProfile.locale || null,
      lastSynced: now,
    });

    this.logger.info(`Created new user ${newUser.userId} for ${googleProfile.email}`);

    const completeUser: User = {
      userId: newUser.userId,
      name: googleProfile.name,
      email: googleProfile.email,
      googleId: googleProfile.id,
      locale: googleProfile.locale || null,
      lastSynced: now,
    };

    // Publish user.profile.updated event for new user
    // Requirements: realtime-events.3.3
    const eventBus = MainEventBus.getInstance();
    eventBus.publish(
      new UserProfileUpdatedEvent(completeUser.userId, {
        name: completeUser.name,
        email: completeUser.email,
        locale: completeUser.locale,
      })
    );

    return completeUser;
  }

  /**
   * Get current user ID with caching
   * Requirements: user-data-isolation.1.5
   *
   * Returns the user_id of the currently logged in user.
   * First call loads from DB, subsequent calls return cached value.
   * Used by DatabaseManager to filter data by user_id.
   *
   * @returns Current user_id or null if not logged in
   */
  getCurrentUserId(): string | null {
    if (this.userIdCache === undefined) {
      // First call - load from DB
      this.userIdCache = this.dbManager.global.currentUser.getUserId();
    }
    return this.userIdCache;
  }

  /**
   * Get current user
   * Returns the cached User object of the currently logged in user.
   *
   * @returns Current User or null if not logged in
   */
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * Set current user and persist userId
   * Requirements: user-data-isolation.1.2, user-data-isolation.1.6
   * @param user User to set as current
   */
  setCurrentUser(user: User): void {
    // Save userId to global storage
    this.dbManager.global.currentUser.setUserId(user.userId);
    // Update cache
    this.userIdCache = user.userId;
    this.currentUser = user;
    this.logger.info(`Current user set to ${user.userId}`);
  }

  /**
   * Fetch user profile from Google UserInfo API
   * Requirements: account-profile.1.2, account-profile.1.6, error-notifications.1.1, token-management-ui.1.3, token-management-ui.1.4, user-data-isolation.1.2
   *
   * Fetches fresh profile data from Google's UserInfo API endpoint.
   * On success, saves the user to database and caches user_id.
   * On error, returns cached user data (graceful error handling).
   * Uses centralized API request handler for automatic HTTP 401 detection.
   *
   * @returns User data or null if not authenticated
   */
  async fetchProfile(): Promise<User | null> {
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

      this.logger.info('Fetching profile from Google UserInfo API');

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

      const googleProfile = (await response.json()) as GoogleUserInfoResponse;

      // Requirements: user-data-isolation.1.2 - Find or create user and save user_id
      const user = this.findOrCreateUser(googleProfile);
      this.setCurrentUser(user);

      this.logger.info(`Profile fetched successfully for user ${user.userId}`);
      return user;
    } catch (error) {
      // Requirements: token-management-ui.1.3 - If session expired, tokens are already cleared by handleAPIRequest
      // Return null to indicate no profile available
      if (error instanceof SessionExpiredError) {
        this.logger.info('Session expired, returning null');
        return null;
      }

      this.logger.error(`Failed to fetch profile: ${error}`);

      // Requirements: account-profile.1.7 - Return cached user on other errors (network, timeout, etc.)
      this.logger.info('Returning cached user due to API error');

      // Requirements: error-notifications.1.1, error-notifications.1.4 - Notify user about the error
      handleBackgroundError(error, 'Profile Loading');

      return this.currentUser;
    }
  }

  /**
   * Load user from database by email
   * Requirements: account-profile.1.7
   *
   * Loads user data from users table.
   * Returns null if no user exists or on error.
   *
   * @param email User email to load
   * @returns User data or null if not found
   */
  loadUserByEmail(email: string): User | null {
    try {
      const user = this.dbManager.users.findByEmail(email);
      if (user) {
        this.logger.info(`User loaded from database: ${email}`);
        return user;
      }

      this.logger.info(`No user found for email: ${email}`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to load user: ${error}`);
      return null;
    }
  }

  /**
   * Initialize on app startup - restore session from DB
   * Requirements: user-data-isolation.1.3
   *
   * Attempts to restore user session on app startup.
   * Loads saved userId from global storage and restores user from users table.
   * This ensures that data isolation works immediately after app restart
   * without requiring the user to log in again.
   * Called during app initialization in main process.
   */
  async initialize(): Promise<void> {
    const savedUserId = this.dbManager.global.currentUser.getUserId();

    if (!savedUserId) {
      this.logger.info('No saved user_id, user not logged in');
      return;
    }

    // Cache the userId
    this.userIdCache = savedUserId;

    // Load user from users table
    const user = this.dbManager.users.findById(savedUserId);

    if (!user) {
      this.logger.warn(`User not found for saved user_id: ${savedUserId}`);
      this.dbManager.global.currentUser.clearUserId();
      this.userIdCache = null;
      return;
    }

    this.currentUser = user;
    this.logger.info(`User restored: ${user.email}`);
  }

  /**
   * Clear session on logout
   * Requirements: user-data-isolation.1.4
   *
   * Clears the current user_id from memory and database.
   * Called during logout to prevent data operations.
   * User data remains in database for restoration on next login.
   */
  clearSession(): void {
    // Clear from DB
    this.dbManager.global.currentUser.clearUserId();
    // Clear cache
    this.userIdCache = null;
    this.currentUser = null;
    this.logger.info('User session cleared');
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
   * Fetch user profile synchronously during authorization
   * Requirements: google-oauth-auth.3.6, google-oauth-auth.3.7, google-oauth-auth.3.8, account-profile.1.3, account-profile.1.4, account-profile.1.5, user-data-isolation.1.2
   *
   * This method is called synchronously during the OAuth authorization flow,
   * after tokens have been successfully exchanged. It ensures that the user's
   * profile is loaded before showing the Dashboard.
   *
   * On success:
   * - Saves user to database
   * - Caches user_id for data isolation
   * - Returns { success: true, user: User }
   *
   * On error:
   * - Clears all tokens (authorization is considered failed)
   * - Returns { success: false, error: 'profile_fetch_failed' }
   * - Does NOT throw exceptions (graceful error handling)
   *
   * This is a blocking operation - the UI will show a loader until it completes.
   *
   * @returns Result object with success status, user data, or error code
   */
  async fetchProfileSynchronously(): Promise<
    { success: true; user: User } | { success: false; error: string }
  > {
    try {
      // Get access token from token storage
      const tokens = await this.tokenStorage.loadTokens();
      if (!tokens || !tokens.accessToken) {
        this.logger.error('No access token available for synchronous fetch');
        // Clear tokens since authorization is incomplete
        await this.tokenStorage.deleteTokens();
        return { success: false, error: 'profile_fetch_failed' };
      }

      // Requirements: account-profile.1.6 - Use Google UserInfo API endpoint
      const googleApiBaseUrl = process.env.CLERKLY_GOOGLE_API_URL || 'https://www.googleapis.com';
      const userInfoUrl = process.env.CLERKLY_GOOGLE_API_URL
        ? `${googleApiBaseUrl}/userinfo`
        : `${googleApiBaseUrl}/oauth2/v1/userinfo`;

      this.logger.info('Fetching profile synchronously during authorization');

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
        this.logger.error(`UserInfo API error during sync fetch: ${response.status}`);
        // Requirements: google-oauth-auth.3.7 - Clear tokens on profile fetch failure
        await this.tokenStorage.deleteTokens();
        return { success: false, error: 'profile_fetch_failed' };
      }

      const googleProfile = (await response.json()) as GoogleUserInfoResponse;

      // Requirements: user-data-isolation.1.2 - Find or create user and save user_id
      const user = this.findOrCreateUser(googleProfile);
      this.setCurrentUser(user);

      this.logger.info(`Profile fetched synchronously for user ${user.userId}`);
      return { success: true, user };
    } catch (error) {
      this.logger.error(`Failed to fetch profile synchronously: ${error}`);

      // Requirements: google-oauth-auth.3.7 - Clear tokens on any error
      try {
        await this.tokenStorage.deleteTokens();
      } catch (clearError) {
        this.logger.error(`Failed to clear tokens after profile error: ${clearError}`);
      }

      return { success: false, error: 'profile_fetch_failed' };
    }
  }
}
