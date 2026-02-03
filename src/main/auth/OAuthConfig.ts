// Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6

/**
 * OAuth configuration interface
 * Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3
 */
export interface OAuthConfig {
  clientId: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revokeEndpoint: string;
  scopes: string[];
}

/**
 * PKCE parameters interface
 * Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3
 */
export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

/**
 * Token response from Google OAuth API
 * Requirements: google-oauth-auth.3.3
 */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string; // Optional: may not be returned on refresh
  expires_in: number;
  token_type: string;
  scope?: string;
}

/**
 * Stored token data
 * Requirements: google-oauth-auth.4.1, google-oauth-auth.4.3
 */
export interface TokenData {
  accessToken: string;
  refreshToken?: string; // Optional: may not be present on refresh
  expiresAt: number; // Unix timestamp
  tokenType: string;
}

/**
 * Authorization status
 * Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2
 */
export interface AuthStatus {
  authorized: boolean;
  error?: string;
}

/**
 * Google OAuth endpoints
 * Requirements: google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6
 */
export const GOOGLE_OAUTH_ENDPOINTS = {
  authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
} as const;

/**
 * OAuth configuration constants
 * Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3
 */
export const OAUTH_CONFIG = {
  clientId: '100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa.apps.googleusercontent.com', // Replace with your actual Google OAuth Client ID
  redirectUri: 'clerkly://oauth/callback',
  scopes: ['openid', 'email', 'profile'],
} as const;

/**
 * Get OAuth configuration
 * Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6
 */
export function getOAuthConfig(clientId?: string): OAuthConfig {
  return {
    clientId: clientId || OAUTH_CONFIG.clientId,
    redirectUri: OAUTH_CONFIG.redirectUri,
    authorizationEndpoint: GOOGLE_OAUTH_ENDPOINTS.authorization,
    tokenEndpoint: GOOGLE_OAUTH_ENDPOINTS.token,
    revokeEndpoint: GOOGLE_OAUTH_ENDPOINTS.revoke,
    scopes: [...OAUTH_CONFIG.scopes],
  };
}
