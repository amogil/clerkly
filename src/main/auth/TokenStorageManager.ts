// Requirements: google-oauth-auth.4.1, google-oauth-auth.4.2, google-oauth-auth.4.3, google-oauth-auth.4.4, google-oauth-auth.4.5

import { UserSettingsManager } from '../UserSettingsManager';
import { TokenData } from './OAuthConfig';

/**
 * Stored tokens interface
 * Requirements: google-oauth-auth.4.1, google-oauth-auth.4.3
 */
export interface StoredTokens {
  accessToken: string;
  refreshToken?: string; // Optional: may not be present
  expiresAt: number;
  tokenType: string;
}

/**
 * Token Storage Manager
 * Manages secure storage of OAuth tokens in SQLite database
 * Requirements: google-oauth-auth.4.1, google-oauth-auth.4.2, google-oauth-auth.4.3, google-oauth-auth.4.4, google-oauth-auth.4.5
 */
export class TokenStorageManager {
  private dataManager: UserSettingsManager;
  private readonly TOKEN_KEYS = {
    ACCESS_TOKEN: 'oauth_access_token',
    REFRESH_TOKEN: 'oauth_refresh_token',
    EXPIRES_AT: 'oauth_expires_at',
    TOKEN_TYPE: 'oauth_token_type',
  } as const;

  constructor(dataManager: UserSettingsManager) {
    this.dataManager = dataManager;
  }

  /**
   * Save tokens to database
   * Requirements: google-oauth-auth.4.1
   * @param tokens Token data to save
   */
  async saveTokens(tokens: TokenData): Promise<void> {
    try {
      // Save each token field separately
      const accessResult = this.dataManager.saveData(
        this.TOKEN_KEYS.ACCESS_TOKEN,
        tokens.accessToken
      );
      if (!accessResult.success) {
        throw new Error(`Failed to save access token: ${accessResult.error}`);
      }

      // Only save refresh token if it exists
      if (tokens.refreshToken) {
        const refreshResult = this.dataManager.saveData(
          this.TOKEN_KEYS.REFRESH_TOKEN,
          tokens.refreshToken
        );
        if (!refreshResult.success) {
          throw new Error(`Failed to save refresh token: ${refreshResult.error}`);
        }
      }

      const expiresResult = this.dataManager.saveData(
        this.TOKEN_KEYS.EXPIRES_AT,
        tokens.expiresAt.toString()
      );
      if (!expiresResult.success) {
        throw new Error(`Failed to save expires_at: ${expiresResult.error}`);
      }

      const typeResult = this.dataManager.saveData(this.TOKEN_KEYS.TOKEN_TYPE, tokens.tokenType);
      if (!typeResult.success) {
        throw new Error(`Failed to save token type: ${typeResult.error}`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to save tokens: ${errorMessage}`);
    }
  }

  /**
   * Load tokens from database
   * Requirements: google-oauth-auth.4.3
   * @returns Stored tokens or null if not found
   */
  async loadTokens(): Promise<StoredTokens | null> {
    const accessResult = this.dataManager.loadData(this.TOKEN_KEYS.ACCESS_TOKEN);
    const refreshResult = this.dataManager.loadData(this.TOKEN_KEYS.REFRESH_TOKEN);
    const expiresResult = this.dataManager.loadData(this.TOKEN_KEYS.EXPIRES_AT);
    const typeResult = this.dataManager.loadData(this.TOKEN_KEYS.TOKEN_TYPE);

    // Check for database errors (not just missing keys)
    const hasError =
      (accessResult.error && accessResult.error !== 'Key not found') ||
      (refreshResult.error && refreshResult.error !== 'Key not found') ||
      (expiresResult.error && expiresResult.error !== 'Key not found') ||
      (typeResult.error && typeResult.error !== 'Key not found');

    if (hasError) {
      throw new Error(
        `Failed to load tokens: ${accessResult.error || refreshResult.error || expiresResult.error || typeResult.error}`
      );
    }

    // If essential tokens are missing, return null
    // refresh_token is optional
    if (!accessResult.success || !expiresResult.success || !typeResult.success) {
      return null;
    }

    return {
      accessToken: accessResult.data as string,
      refreshToken: refreshResult.success ? (refreshResult.data as string) : undefined,
      expiresAt: parseInt(expiresResult.data as string, 10),
      tokenType: typeResult.data as string,
    };
  }

  /**
   * Delete all tokens from database
   * Requirements: google-oauth-auth.4.4
   */
  async deleteTokens(): Promise<void> {
    try {
      // Delete all token fields
      this.dataManager.deleteData(this.TOKEN_KEYS.ACCESS_TOKEN);
      this.dataManager.deleteData(this.TOKEN_KEYS.REFRESH_TOKEN);
      this.dataManager.deleteData(this.TOKEN_KEYS.EXPIRES_AT);
      this.dataManager.deleteData(this.TOKEN_KEYS.TOKEN_TYPE);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to delete tokens: ${errorMessage}`);
    }
  }

  /**
   * Check if valid (non-expired) tokens exist
   * Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3
   * @returns True if valid tokens exist, false otherwise
   */
  async hasValidTokens(): Promise<boolean> {
    try {
      const tokens = await this.loadTokens();
      if (!tokens) {
        return false;
      }

      // Check if access token is expired
      const now = Date.now();
      return tokens.expiresAt > now;
    } catch (error: unknown) {
      // If there's an error loading tokens, consider them invalid
      return false;
    }
  }
}
