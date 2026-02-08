// Requirements: ui.6.2, ui.6.5, ui.6.6, ui.6.7, ui.6.8, ui.7.1, ui.9.3, ui.9.4, ui.12.14, ui.12.15, ui.12.16, ui.12.17, ui.12.18

import { DataManager } from '../DataManager';
import { OAuthClientManager } from './OAuthClientManager';
import { TokenStorageManager } from './TokenStorageManager';
import { handleBackgroundError } from '../ErrorHandler';
import { handleAPIRequest } from './APIRequestHandler';

/**
 * User profile data from Google OAuth
 * Requirements: ui.6.2, ui.6.3
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
 * Requirements: ui.6.2, ui.6.5, ui.6.6, ui.6.7, ui.6.8, ui.12.14, ui.12.15, ui.12.16, ui.12.17, ui.12.18
 */
export class UserProfileManager {
  private dataManager: DataManager;
  private oauthClient: OAuthClientManager;
  private tokenStorage: TokenStorageManager;
  private readonly profileKey = 'user_profile';
  // Requirements: ui.12.14 - Cache current user email for data isolation
  private currentUserEmail: string | null = null;

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
   * Get current user email
   * Requirements: ui.12.10
   *
   * Returns the cached email of the currently logged in user.
   * Used by DataManager to filter data by user_email.
   *
   * @returns Current user email or null if not logged in
   */
  getCurrentEmail(): string | null {
    return this.currentUserEmail;
  }

  /**
   * Fetch user profile from Google UserInfo API
   * Requirements: ui.6.2, ui.6.6, ui.7.1, ui.9.3, ui.9.4, ui.12.15
   *
   * Fetches fresh profile data from Google's UserInfo API endpoint.
   * On success, saves the profile to local storage and caches email.
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
        console.log('[UserProfileManager] No access token available');
        return null;
      }

      // Requirements: ui.6.6 - Use Google UserInfo API endpoint
      // Use CLERKLY_GOOGLE_API_URL environment variable for testing, default to production
      const googleApiBaseUrl = process.env.CLERKLY_GOOGLE_API_URL || 'https://www.googleapis.com';
      const userInfoUrl = process.env.CLERKLY_GOOGLE_API_URL
        ? `${googleApiBaseUrl}/userinfo` // Mock server uses /userinfo
        : `${googleApiBaseUrl}/oauth2/v1/userinfo`; // Google uses /oauth2/v1/userinfo

      console.log('[UserProfileManager] Fetching profile from Google UserInfo API');
      console.log('[UserProfileManager] About to call handleAPIRequest with URL:', userInfoUrl);

      // Requirements: ui.9.3, ui.9.4 - Use centralized handler for automatic 401 detection
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

      // Requirements: ui.6.2 - Save to local storage
      await this.saveProfile(profile);

      // Requirements: ui.12.15 - Cache email in memory for data isolation
      this.currentUserEmail = profile.email;

      console.log('[UserProfileManager] Profile fetched and saved successfully');
      return profile;
    } catch (error) {
      // Requirements: ui.9.3 - If it's a 401 error, tokens are already cleared by handleAPIRequest
      // Just return null to indicate no profile available
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Authorization failed') || errorMessage.includes('401')) {
        console.log('[UserProfileManager] Session expired (401), returning null');
        return null;
      }

      console.error('[UserProfileManager] Failed to fetch profile:', error);

      // Requirements: ui.6.7 - Return cached profile on other errors (network, timeout, etc.)
      console.log('[UserProfileManager] Returning cached profile due to API error');
      const cachedProfile = await this.loadProfile();

      // Requirements: ui.7.1 - Notify user about the error
      if (cachedProfile) {
        // Graceful degradation: show warning that using cached data
        handleBackgroundError(error, 'Profile Fetch (using cached data)');
      } else {
        // Critical error: no cached data available
        handleBackgroundError(error, 'Profile Fetch (no cached data available)');
      }

      return cachedProfile;
    }
  }

  /**
   * Save user profile to local storage
   * Requirements: ui.6.2
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
      console.log('[UserProfileManager] Profile saved to local storage');
    } catch (error) {
      console.error('[UserProfileManager] Failed to save profile:', error);
      throw error;
    }
  }

  /**
   * Load user profile from local storage
   * Requirements: ui.6.7, ui.12.17
   *
   * Loads cached profile data from DataManager.
   * Sets currentUserEmail from loaded profile for data isolation.
   * Returns null if no profile data exists or on error.
   *
   * @returns User profile data or null if not found
   */
  async loadProfile(): Promise<UserProfile | null> {
    try {
      const result = this.dataManager.loadData(this.profileKey);
      if (result.success && result.data) {
        const profile = result.data as UserProfile;

        // Requirements: ui.12.17 - Set currentUserEmail from loaded profile
        this.currentUserEmail = profile.email;

        console.log('[UserProfileManager] Profile loaded from local storage');
        return profile;
      }
      console.log('[UserProfileManager] No profile found in local storage');
      return null;
    } catch (error) {
      console.error('[UserProfileManager] Failed to load profile:', error);
      return null;
    }
  }

  /**
   * Clear user profile from local storage
   * Requirements: ui.6.8, ui.12.18
   *
   * Deletes profile data from DataManager and clears cached email.
   * Called during logout to remove all user data.
   * Throws error if delete operation fails.
   */
  async clearProfile(): Promise<void> {
    try {
      const result = this.dataManager.deleteData(this.profileKey);
      if (!result.success) {
        throw new Error(result.error || 'Failed to clear profile');
      }

      // Requirements: ui.12.18 - Clear cached email
      this.currentUserEmail = null;

      console.log('[UserProfileManager] Profile cleared from local storage');
    } catch (error) {
      console.error('[UserProfileManager] Failed to clear profile:', error);
      throw error;
    }
  }

  /**
   * Update profile after token refresh
   * Requirements: ui.6.5, ui.12.16
   *
   * Called automatically by OAuthClientManager after successful token refresh.
   * Fetches fresh profile data from Google API to keep profile up-to-date.
   * This ensures profile data is refreshed every hour (when tokens are refreshed).
   * Also updates cached email if profile changed.
   */
  async updateProfileAfterTokenRefresh(): Promise<void> {
    console.log('[UserProfileManager] Updating profile after token refresh');
    await this.fetchProfile();
  }

  /**
   * Delete profile data from DataManager
   * Alias for clearProfile() for consistency with other delete methods
   * Requirements: ui.6.8
   */
  async deleteProfile(): Promise<void> {
    return await this.clearProfile();
  }

  /**
   * Fetch user profile synchronously during authorization
   * Requirements: google-oauth-auth.3.6, google-oauth-auth.3.7, google-oauth-auth.3.8, ui.6.3, ui.6.4, ui.6.5
   *
   * This method is called synchronously during the OAuth authorization flow,
   * after tokens have been successfully exchanged. It ensures that the user's
   * profile is loaded before showing the Dashboard.
   *
   * On success:
   * - Saves profile to database
   * - Caches email for data isolation
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
        console.error('[UserProfileManager] No access token available for synchronous fetch');
        // Clear tokens since authorization is incomplete
        await this.tokenStorage.deleteTokens();
        return { success: false, error: 'profile_fetch_failed' };
      }

      // Requirements: ui.6.6 - Use Google UserInfo API endpoint
      const googleApiBaseUrl = process.env.CLERKLY_GOOGLE_API_URL || 'https://www.googleapis.com';
      const userInfoUrl = process.env.CLERKLY_GOOGLE_API_URL
        ? `${googleApiBaseUrl}/userinfo`
        : `${googleApiBaseUrl}/oauth2/v1/userinfo`;

      console.log('[UserProfileManager] Fetching profile synchronously during authorization');

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
        console.error(
          `[UserProfileManager] UserInfo API error during sync fetch: ${response.status}`
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

      // Requirements: google-oauth-auth.3.6, google-oauth-auth.3.8 - Save profile to database
      await this.saveProfile(profile);

      // Requirements: ui.12.15 - Cache email in memory for data isolation
      this.currentUserEmail = profile.email;

      console.log('[UserProfileManager] Profile fetched and saved synchronously');
      return { success: true, profile };
    } catch (error) {
      console.error('[UserProfileManager] Failed to fetch profile synchronously:', error);

      // Requirements: google-oauth-auth.3.7 - Clear tokens on any error
      try {
        await this.tokenStorage.deleteTokens();
      } catch (clearError) {
        console.error(
          '[UserProfileManager] Failed to clear tokens after profile error:',
          clearError
        );
      }

      return { success: false, error: 'profile_fetch_failed' };
    }
  }
}
