// Requirements: account-profile.1.2, account-profile.1.5, account-profile.1.6, account-profile.1.7, account-profile.1.8, error-notifications.1.1, token-management-ui.1.3, token-management-ui.1.4, user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.1, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.5

import { DataManager } from '../DataManager';
import { TokenStorageManager } from './TokenStorageManager';
import { handleBackgroundError } from '../ErrorHandler';
import { handleAPIRequest } from './APIRequestHandler';
import { SessionExpiredError } from './errors';
import { Logger } from '../Logger';
import { MainEventBus } from '../events/MainEventBus';
import { UserProfileUpdatedEvent } from '../../shared/events/types';

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
 * User record from users table
 * Requirements: user-data-isolation.1, account-profile.1.2
 */
export interface User {
  /** Internal user ID for data isolation (10-char alphanumeric) */
  user_id: string;
  /** User's display name */
  name: string | null;
  /** User's email address (unique) */
  email: string;
  /** Google user ID from OAuth */
  google_id: string | null;
  /** User's locale from Google (e.g., "en", "ru") */
  locale: string | null;
  /** Unix timestamp of last profile sync */
  last_synced: number | null;
}

/**
 * User Profile Manager
 * Manages user profile data from Google OAuth
 * Handles fetching, caching, and updating profile information
 * Requirements: account-profile.1.2, account-profile.1.5, account-profile.1.6, account-profile.1.7, account-profile.1.8, user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.1, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.5
 */
export class UserManager {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('UserManager');
  private dataManager: DataManager;
  private tokenStorage: TokenStorageManager;
  // Requirements: user-data-isolation.1.1, user-data-isolation.1.5 - Cache current user_id for data isolation
  private currentUserId: string | null = null;
  // Cache current user for quick access
  private currentUser: User | null = null;

  /**
   * Create a new UserManager
   * @param dataManager DataManager instance for local storage
   * @param tokenStorage TokenStorageManager instance for accessing tokens
   */
  constructor(dataManager: DataManager, tokenStorage: TokenStorageManager) {
    this.dataManager = dataManager;
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
    const db = this.dataManager.getDatabase();
    if (!db) {
      throw new Error('Database not initialized');
    }

    const now = Date.now();

    // Try to find existing user
    const existingUser = db
      .prepare(
        'SELECT user_id, name, email, google_id, locale, last_synced FROM users WHERE email = ?'
      )
      .get(googleProfile.email) as User | undefined;

    if (existingUser) {
      // Requirements: user-data-isolation.0.4 - Update fields if changed
      const updates: string[] = [];
      const values: (string | number | null)[] = [];

      if (googleProfile.name !== existingUser.name) {
        updates.push('name = ?');
        values.push(googleProfile.name);
      }
      if (googleProfile.id !== existingUser.google_id) {
        updates.push('google_id = ?');
        values.push(googleProfile.id);
      }
      if ((googleProfile.locale || null) !== existingUser.locale) {
        updates.push('locale = ?');
        values.push(googleProfile.locale || null);
      }
      updates.push('last_synced = ?');
      values.push(now);

      if (updates.length > 0) {
        values.push(existingUser.user_id);
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE user_id = ?`).run(...values);
        this.logger.info(`Updated user ${existingUser.user_id}`);
      }

      const updatedUser: User = {
        user_id: existingUser.user_id,
        name: googleProfile.name,
        email: googleProfile.email,
        google_id: googleProfile.id,
        locale: googleProfile.locale || null,
        last_synced: now,
      };

      // Publish user.profile.updated event
      // Requirements: realtime-events.3.3
      const eventBus = MainEventBus.getInstance();
      eventBus.publish(
        new UserProfileUpdatedEvent(updatedUser.user_id, {
          name: updatedUser.name,
          email: updatedUser.email,
          locale: updatedUser.locale,
        })
      );

      return updatedUser;
    }

    // Create new user with random user_id
    const userId = this.generateUserId();
    db.prepare(
      'INSERT INTO users (user_id, name, email, google_id, locale, last_synced) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      userId,
      googleProfile.name,
      googleProfile.email,
      googleProfile.id,
      googleProfile.locale || null,
      now
    );

    this.logger.info(`Created new user ${userId} for ${googleProfile.email}`);

    const newUser: User = {
      user_id: userId,
      name: googleProfile.name,
      email: googleProfile.email,
      google_id: googleProfile.id,
      locale: googleProfile.locale || null,
      last_synced: now,
    };

    // Publish user.profile.updated event for new user
    // Requirements: realtime-events.3.3
    const eventBus = MainEventBus.getInstance();
    eventBus.publish(
      new UserProfileUpdatedEvent(newUser.user_id, {
        name: newUser.name,
        email: newUser.email,
        locale: newUser.locale,
      })
    );

    return newUser;
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
   * Get current user
   * Returns the cached User object of the currently logged in user.
   *
   * @returns Current User or null if not logged in
   */
  getCurrentUser(): User | null {
    return this.currentUser;
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

      Logger.info('UserManager', 'Fetching profile from Google UserInfo API');

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

      // Requirements: user-data-isolation.1.2 - Find or create user and cache user_id
      const user = this.findOrCreateUser(googleProfile);
      this.currentUserId = user.user_id;
      this.currentUser = user;
      Logger.info('UserManager', `User ID set: ${user.user_id}`);

      Logger.info('UserManager', 'Profile fetched and saved successfully');
      return user;
    } catch (error) {
      // Requirements: token-management-ui.1.3 - If session expired, tokens are already cleared by handleAPIRequest
      // Return null to indicate no profile available
      if (error instanceof SessionExpiredError) {
        Logger.info('UserManager', 'Session expired, returning null');
        return null;
      }

      this.logger.error(`Failed to fetch profile: ${error}`);

      // Requirements: account-profile.1.7 - Return cached user on other errors (network, timeout, etc.)
      Logger.info('UserManager', 'Returning cached user due to API error');

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
      const db = this.dataManager.getDatabase();
      if (!db) {
        return null;
      }

      const user = db
        .prepare(
          'SELECT user_id, name, email, google_id, locale, last_synced FROM users WHERE email = ?'
        )
        .get(email) as User | undefined;

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
        const user = await this.fetchProfile();
        if (user) {
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
   * Clear session on logout
   * Requirements: user-data-isolation.1.4
   *
   * Clears the current user_id from memory.
   * Called during logout to prevent data operations.
   * User data remains in database for restoration on next login.
   */
  clearSession(): void {
    // Requirements: user-data-isolation.1.4 - Clear currentUserId on logout
    this.currentUserId = null;
    this.currentUser = null;
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
        Logger.error('UserManager', 'No access token available for synchronous fetch');
        // Clear tokens since authorization is incomplete
        await this.tokenStorage.deleteTokens();
        return { success: false, error: 'profile_fetch_failed' };
      }

      // Requirements: account-profile.1.6 - Use Google UserInfo API endpoint
      const googleApiBaseUrl = process.env.CLERKLY_GOOGLE_API_URL || 'https://www.googleapis.com';
      const userInfoUrl = process.env.CLERKLY_GOOGLE_API_URL
        ? `${googleApiBaseUrl}/userinfo`
        : `${googleApiBaseUrl}/oauth2/v1/userinfo`;

      Logger.info('UserManager', 'Fetching profile synchronously during authorization');

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

      const googleProfile = (await response.json()) as GoogleUserInfoResponse;

      // Requirements: user-data-isolation.1.2 - Find or create user and cache user_id
      const user = this.findOrCreateUser(googleProfile);
      this.currentUserId = user.user_id;
      this.currentUser = user;

      Logger.info(
        'UserProfileManager',
        `Profile fetched and saved synchronously, user_id: ${user.user_id}`
      );
      return { success: true, user };
    } catch (error) {
      Logger.error('UserManager', `Failed to fetch profile synchronously: ${error}`);

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
