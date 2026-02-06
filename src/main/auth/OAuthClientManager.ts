// Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4, google-oauth-auth.1.5, google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.2.4, google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.4, google-oauth-auth.3.5, google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.5.5, google-oauth-auth.5.6, google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.6.5, google-oauth-auth.7.1, google-oauth-auth.7.2, google-oauth-auth.7.3, google-oauth-auth.7.4

import * as crypto from 'crypto';
import { shell } from 'electron';
import { OAuthConfig, PKCEParams, TokenResponse, TokenData, AuthStatus } from './OAuthConfig';
import { TokenStorageManager } from './TokenStorageManager';

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
 * Requirements: google-oauth-auth.1, google-oauth-auth.2, google-oauth-auth.3, google-oauth-auth.5, google-oauth-auth.6, google-oauth-auth.7, ui.6.5
 */
export class OAuthClientManager {
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
    console.log('[OAuthClientManager] Profile manager set for automatic updates');
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
   * Requirements: google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.2.4
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

      // Save tokens
      const tokenData: TokenData = {
        accessToken: tokenResponse.access_token,
        expiresAt,
        tokenType: tokenResponse.token_type,
      };

      // Add refresh token if present
      if (tokenResponse.refresh_token) {
        tokenData.refreshToken = tokenResponse.refresh_token;
      }

      await this.tokenStorage.saveTokens(tokenData);

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
   * Requirements: google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.6.5, ui.6.5
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
        console.log('[OAuthClientManager] Triggering profile update after token refresh');
        await this.profileManager.updateProfileAfterTokenRefresh();
      }

      return true;
    } catch (error: unknown) {
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
          console.warn('Token revoke failed, continuing with local cleanup');
        }
      }

      // Always delete local tokens regardless of revoke result
      await this.tokenStorage.deleteTokens();

      // Delete user profile if profile manager is set
      // Requirements: ui.6.8
      if (this.profileManager) {
        try {
          await this.profileManager.deleteProfile();
          console.log('[OAuthClientManager] User profile deleted');
        } catch (profileError) {
          console.warn('[OAuthClientManager] Failed to delete profile:', profileError);
          // Continue even if profile deletion fails
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Ensure tokens are deleted even if there's an error
      await this.tokenStorage.deleteTokens();
      throw new Error(`Logout failed: ${errorMessage}`);
    }
  }
}
