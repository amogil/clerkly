// Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4, google-oauth-auth.1.5, google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.2.4, google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.4, google-oauth-auth.3.5, google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.5.5, google-oauth-auth.5.6, google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.6.5, google-oauth-auth.7.1, google-oauth-auth.7.2, google-oauth-auth.7.3, google-oauth-auth.7.4, ui.7.1

import * as crypto from 'crypto';
import { shell } from 'electron';
import { OAuthConfig, PKCEParams, TokenResponse, TokenData, AuthStatus } from './OAuthConfig';
import { TokenStorageManager } from './TokenStorageManager';
import { handleBackgroundError } from '../ErrorHandler';
import { Logger } from '../Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * PKCE storage for temporary state during OAuth flow
 */
interface PKCEStorage {
  codeVerifier: string;
  state: string;
  timestamp: number;
}

/**
 * OAuth Client Manager
 * Manages the complete OAuth PKCE flow for Google authentication
 *
 * Token Management Strategy:
 * - Automatic token refresh: When access token expires, automatically refreshes using refresh token (ui.9.1, ui.9.2)
 * - Transparent to user: Token refresh happens in background without user interaction
 * - Profile updates: Automatically updates user profile after successful token refresh (ui.6.5)
 * - Error handling: On refresh failure (invalid_grant), clears tokens and notifies user (ui.9.3)
 * - Session preservation: Profile data persists in database even after logout/401 errors (ui.8.4)
 *
 * Authorization Error Handling:
 * - HTTP 401 errors are handled by centralized handleAPIRequest() function (ui.9.4)
 * - On 401: All tokens cleared, LoginError shown, profile data preserved (ui.9.3)
 * - Consistent handling across all API endpoints (ui.9.4)
 * - Errors logged with context for debugging (ui.9.5)
 * - User sees friendly messages without technical details (ui.9.6)
 *
 * Synchronous Profile Fetch During Authorization:
 * - After successful token exchange, profile is fetched synchronously (google-oauth-auth.3.6)
 * - UI shows loader during profile fetch (ui.6.4)
 * - On success: Dashboard is shown with profile data (google-oauth-auth.3.8)
 * - On error: Tokens are cleared and LoginError is shown (google-oauth-auth.3.7)
 * - This ensures user always has valid profile data when entering the app
 *
 * Requirements: google-oauth-auth.1, google-oauth-auth.2, google-oauth-auth.3, google-oauth-auth.5, google-oauth-auth.6, google-oauth-auth.7, ui.6.5, ui.9.1, ui.9.2, ui.9.3, ui.9.4
 */
export class OAuthClientManager {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('OAuthClientManager');
  private config: OAuthConfig;
  private tokenStorage: TokenStorageManager;
  private pkceStorage: PKCEStorage | null = null;
  private profileManager: any | null = null; // Using any to avoid circular dependency

  constructor(config: OAuthConfig, tokenStorage: TokenStorageManager) {
    this.config = config;
    this.tokenStorage = tokenStorage;
  }

  /**
   * Set profile manager for automatic profile updates
   * Requirements: ui.6.5
   * Should be called during initialization to enable automatic profile updates
   * @param profileManager UserProfileManager instance
   */
  setProfileManager(profileManager: any): void {
    this.profileManager = profileManager;
    Logger.info(
      'OAuthClientManager',
      '[OAuthClientManager] Profile manager set for automatic updates'
    );
  }

  /**
   * Generate a cryptographically random code verifier (43-128 characters)
   * Requirements: google-oauth-auth.1.1
   * @returns Random code verifier string
   */
  private generateCodeVerifier(): string {
    // Generate 32 random bytes and convert to base64url (43 characters)
    const randomBytes = crypto.randomBytes(32);
    return randomBytes.toString('base64url');
  }

  /**
   * Generate code challenge from code verifier using SHA-256
   * Requirements: google-oauth-auth.1.2
   * @param verifier Code verifier string
   * @returns SHA-256 hash of verifier in base64url format
   */
  private generateCodeChallenge(verifier: string): string {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash.toString('base64url');
  }

  /**
   * Generate a random state parameter for CSRF protection (minimum 32 characters)
   * Requirements: google-oauth-auth.1.3
   * @returns Random state string
   */
  private generateState(): string {
    // Generate 32 random bytes and convert to hex (64 characters)
    const randomBytes = crypto.randomBytes(32);
    return randomBytes.toString('hex');
  }

  /**
   * Generate complete PKCE parameters
   * Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3
   * @returns PKCE parameters object
   */
  generatePKCEParams(): PKCEParams {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const state = this.generateState();

    return {
      codeVerifier,
      codeChallenge,
      state,
    };
  }

  /**
   * Start the OAuth authorization flow
   * Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4, google-oauth-auth.1.5
   */
  async startAuthFlow(): Promise<void> {
    try {
      // Generate PKCE parameters
      const pkceParams = this.generatePKCEParams();

      // Save PKCE parameters temporarily
      this.pkceStorage = {
        codeVerifier: pkceParams.codeVerifier,
        state: pkceParams.state,
        timestamp: Date.now(),
      };

      // Build authorization URL
      const authUrl = new URL(this.config.authorizationEndpoint);
      authUrl.searchParams.set('client_id', this.config.clientId);
      authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', this.config.scopes.join(' '));
      authUrl.searchParams.set('code_challenge', pkceParams.codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', pkceParams.state);
      authUrl.searchParams.set('access_type', 'offline'); // Required for refresh token
      authUrl.searchParams.set('prompt', 'consent'); // Force consent screen to get refresh token

      // Open system browser with authorization URL
      await shell.openExternal(authUrl.toString());
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to start auth flow: ${errorMessage}`);
    }
  }

  /**
   * Handle deep link callback from OAuth provider
   * Requirements: google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.2.4, google-oauth-auth.3.6, google-oauth-auth.3.7, google-oauth-auth.3.8
   * @param url Deep link URL
   * @returns Authorization status
   */
  async handleDeepLink(url: string): Promise<AuthStatus> {
    try {
      // Parse URL
      const parsedUrl = new URL(url);
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');

      // Check for user cancellation or errors
      if (error) {
        return {
          authorized: false,
          error: error,
        };
      }

      // Validate required parameters
      if (!code || !state || code.trim() === '' || state.trim() === '') {
        return {
          authorized: false,
          error: 'invalid_request',
        };
      }

      // Validate state parameter
      if (!this.pkceStorage || state !== this.pkceStorage.state) {
        return {
          authorized: false,
          error: 'csrf_attack_detected',
        };
      }

      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code, this.pkceStorage.codeVerifier);

      // Calculate expiration timestamp
      const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

      // Create token data object (but don't save yet - need profile first)
      const tokenData: TokenData = {
        accessToken: tokenResponse.access_token,
        expiresAt,
        tokenType: tokenResponse.token_type,
      };

      // Add refresh token if present
      if (tokenResponse.refresh_token) {
        tokenData.refreshToken = tokenResponse.refresh_token;
      }

      // Requirements: google-oauth-auth.3.6, google-oauth-auth.3.7, google-oauth-auth.3.8
      // Synchronously fetch user profile BEFORE saving tokens
      // This ensures we have user email for database isolation
      if (this.profileManager) {
        Logger.info(
          'OAuthClientManager',
          '[OAuthClientManager] Fetching profile synchronously before saving tokens'
        );

        // Temporarily store tokens in memory for profile fetch
        const tempTokens = tokenData;

        // Fetch profile using temporary tokens
        const profileResult = await this.fetchProfileWithTokens(tempTokens);

        if (!profileResult.success) {
          // Requirements: google-oauth-auth.3.7 - Profile fetch failed, don't save tokens
          Logger.error(
            'OAuthClientManager',
            '[OAuthClientManager] Profile fetch failed, authorization incomplete'
          );
          // Clear PKCE storage
          this.pkceStorage = null;
          return {
            authorized: false,
            error: 'profile_fetch_failed',
          };
        }

        // Requirements: google-oauth-auth.3.8 - Profile fetched successfully
        Logger.info(
          'OAuthClientManager',
          '[OAuthClientManager] Profile fetched successfully, now saving tokens'
        );

        // Now save tokens to database (profile manager has email set)
        await this.tokenStorage.saveTokens(tokenData);
      } else {
        Logger.warn(
          'OAuthClientManager',
          '[OAuthClientManager] Profile manager not set, saving tokens without profile'
        );
        // Fallback: save tokens without profile (will fail if DataManager requires email)
        await this.tokenStorage.saveTokens(tokenData);
      }

      // Clear PKCE storage
      this.pkceStorage = null;

      return {
        authorized: true,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        authorized: false,
        error: errorMessage || 'unknown_error',
      };
    }
  }

  /**
   * Fetch user profile using provided tokens (without saving tokens to database)
   * This is used during OAuth flow to get profile before saving tokens
   * Requirements: google-oauth-auth.3.6, google-oauth-auth.3.8
   * @param tokens Temporary tokens to use for API request
   * @returns Profile fetch result
   */
  private async fetchProfileWithTokens(
    tokens: TokenData
  ): Promise<{ success: boolean; profile?: any; error?: string }> {
    try {
      Logger.info(
        'OAuthClientManager',
        '[OAuthClientManager] fetchProfileWithTokens: Starting profile fetch'
      );

      if (!this.profileManager) {
        Logger.error(
          'OAuthClientManager',
          '[OAuthClientManager] fetchProfileWithTokens: Profile manager not set'
        );
        return { success: false, error: 'Profile manager not set' };
      }

      // Fetch profile from Google UserInfo API
      // Use same URL format as UserProfileManager for consistency
      const googleApiBaseUrl = process.env.CLERKLY_GOOGLE_API_URL || 'https://www.googleapis.com';
      const userInfoUrl = process.env.CLERKLY_GOOGLE_API_URL
        ? `${googleApiBaseUrl}/oauth2/v2/userinfo` // Mock server uses /oauth2/v2/userinfo
        : `${googleApiBaseUrl}/oauth2/v2/userinfo`; // Google uses /oauth2/v2/userinfo

      Logger.info(
        'OAuthClientManager',
        `[OAuthClientManager] fetchProfileWithTokens: Fetching from: ${userInfoUrl}`
      );

      const response = await fetch(userInfoUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      if (!response.ok) {
        Logger.error(
          'OAuthClientManager',
          `fetchProfileWithTokens: UserInfo API error: ${response.status}`
        );
        return { success: false, error: `UserInfo API returned ${response.status}` };
      }

      const profileData = (await response.json()) as { email: string; [key: string]: any };
      Logger.info(
        'OAuthClientManager',
        `fetchProfileWithTokens: Profile fetched: ${profileData.email}`
      );

      // Add lastUpdated timestamp
      const profile = {
        ...profileData,
        lastUpdated: Date.now(),
      };

      // CRITICAL: Set email in ProfileManager BEFORE saving to database
      // This is required because DataManager.saveData() needs getCurrentEmail()
      Logger.info(
        'OAuthClientManager',
        '[OAuthClientManager] fetchProfileWithTokens: Setting email in ProfileManager'
      );
      (this.profileManager as any).currentUserEmail = profile.email;

      // Save profile to database
      Logger.info(
        'OAuthClientManager',
        '[OAuthClientManager] fetchProfileWithTokens: Saving profile to database'
      );
      await this.profileManager.saveProfile(profile);
      Logger.info(
        'OAuthClientManager',
        '[OAuthClientManager] fetchProfileWithTokens: Profile saved successfully'
      );

      return { success: true, profile };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(
        'OAuthClientManager',
        `fetchProfileWithTokens: Failed to fetch profile: ${errorMessage}`
      );
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Exchange authorization code for tokens
   * Requirements: google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.4, google-oauth-auth.3.5
   * @param code Authorization code
   * @param codeVerifier PKCE code verifier
   * @returns Token response from Google
   */
  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
    try {
      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string; error_description?: string };
        const errorCode = errorData.error || 'token_exchange_failed';
        const error = new Error(errorCode);
        error.name = errorCode;
        throw error;
      }

      const tokenResponse = (await response.json()) as TokenResponse;
      return tokenResponse;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage && errorMessage.includes('fetch')) {
        throw new Error('network_error');
      }
      throw error;
    }
  }

  /**
   * Get current authorization status
   * Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.5.5, google-oauth-auth.5.6
   * @returns Authorization status
   */
  async getAuthStatus(): Promise<AuthStatus> {
    try {
      // Check if tokens exist
      const tokens = await this.tokenStorage.loadTokens();
      if (!tokens) {
        return { authorized: false };
      }

      // Check if access token is expired
      const now = Date.now();
      if (tokens.expiresAt > now) {
        return { authorized: true };
      }

      // Try to refresh token
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        return { authorized: true };
      }

      return { authorized: false };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        authorized: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Refresh access token using refresh token
   * Requirements: google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.6.5, ui.6.5, ui.7.1
   * @returns True if refresh successful, false otherwise
   */
  async refreshAccessToken(): Promise<boolean> {
    try {
      const tokens = await this.tokenStorage.loadTokens();
      if (!tokens || !tokens.refreshToken) {
        return false;
      }

      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          refresh_token: tokens.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string };
        if (errorData.error === 'invalid_grant') {
          // Refresh token is invalid, clear all tokens
          await this.tokenStorage.deleteTokens();

          // Requirements: ui.7.1 - Notify user about critical error
          handleBackgroundError(
            new Error('Refresh token invalid or expired'),
            'Token Refresh (session expired)'
          );

          return false;
        }
        throw new Error(errorData.error || 'token_refresh_failed');
      }

      const tokenResponse = (await response.json()) as TokenResponse;

      // Calculate new expiration
      const expiresAt = Date.now() + tokenResponse.expires_in * 1000;

      // Update tokens
      const updatedTokens: TokenData = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || tokens.refreshToken, // Use new refresh token if provided
        expiresAt,
        tokenType: tokenResponse.token_type,
      };

      await this.tokenStorage.saveTokens(updatedTokens);

      // Requirements: ui.6.5 - Automatically update profile after token refresh
      if (this.profileManager) {
        Logger.info(
          'OAuthClientManager',
          '[OAuthClientManager] Triggering profile update after token refresh'
        );
        await this.profileManager.updateProfileAfterTokenRefresh();
      }

      return true;
    } catch (error: unknown) {
      // Requirements: ui.7.1 - Notify user about token refresh errors
      // Only notify for unexpected errors, not for invalid_grant (already handled above)
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!errorMessage.includes('invalid_grant') && !errorMessage.includes('session expired')) {
        handleBackgroundError(error, 'Token Refresh');
      }

      return false;
    }
  }

  /**
   * Logout and revoke tokens
   * Requirements: google-oauth-auth.7.1, google-oauth-auth.7.2, google-oauth-auth.7.3, google-oauth-auth.7.4
   */
  async logout(): Promise<void> {
    try {
      const tokens = await this.tokenStorage.loadTokens();

      // Try to revoke token with Google
      if (tokens) {
        try {
          await fetch(this.config.revokeEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              token: tokens.accessToken,
            }),
          });
        } catch (revokeError) {
          // Continue even if revoke fails
          this.logger.warn('Token revoke failed, continuing with local cleanup');
        }
      }

      // Always delete local tokens regardless of revoke result
      // Requirements: ui.8.4 - Only tokens are cleared, profile data is preserved
      await this.tokenStorage.deleteTokens();

      // Note: Profile data is NOT deleted - it's preserved in database for next login
      // This follows the architectural principle: database is single source of truth
      // Requirements: ui.8.4, Architectural Principles
      Logger.info(
        'OAuthClientManager',
        '[OAuthClientManager] Tokens cleared, profile data preserved in database'
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Ensure tokens are deleted even if there's an error
      await this.tokenStorage.deleteTokens();
      throw new Error(`Logout failed: ${errorMessage}`);
    }
  }
}
