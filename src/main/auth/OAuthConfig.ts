// Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6, clerkly.3.8

import { Logger } from '../Logger';

// Requirements: clerkly.3.5, clerkly.3.7 - Create parameterized logger for OAuthConfig module
const logger = Logger.create('OAuthConfig');
const BUILD_TIME_OAUTH_CLIENT_SECRET_PLACEHOLDER = '__CLERKLY_' + 'OAUTH_CLIENT_SECRET__';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * OAuth configuration interface
 * Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
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
 * Get Google OAuth endpoints with optional override for testing
 * Requirements: google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6
 */
function getGoogleOAuthEndpoints() {
  // Use CLERKLY_GOOGLE_API_URL environment variable for testing (same as UserInfo API)
  const baseUrl = process.env.CLERKLY_GOOGLE_API_URL;

  if (baseUrl) {
    return {
      authorization: `${baseUrl}/auth`,
      token: `${baseUrl}/token`,
      revoke: `${baseUrl}/revoke`,
    };
  }

  return GOOGLE_OAUTH_ENDPOINTS;
}

/**
 * Get OAuth configuration constants
 * Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3
 */
function getOAuthConfigConstants() {
  const isTest = process.env.NODE_ENV === 'test';
  logger.info(`NODE_ENV: ${(process.env.NODE_ENV, 'isTest:', isTest)}`);

  return {
    clientId: isTest
      ? 'test-client-id-12345'
      : '100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa.apps.googleusercontent.com',
    clientSecret: isTest ? 'test-client-secret-67890' : '__CLERKLY_OAUTH_CLIENT_SECRET__',
    // iOS OAuth clients use URL scheme format
    redirectUri: isTest
      ? 'com.googleusercontent.apps.test-client-id-12345:/oauth2redirect'
      : 'com.googleusercontent.apps.100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa:/oauth2callback',
    scopes: ['openid', 'email', 'profile'],
  };
}

/**
 * OAuth configuration constants
 * Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3
 */
export const OAUTH_CONFIG = getOAuthConfigConstants();

/**
 * Get OAuth configuration
 * Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6
 */
export function getOAuthConfig(clientId?: string): OAuthConfig {
  const endpoints = getGoogleOAuthEndpoints();
  const config = getOAuthConfigConstants();

  // Allow overriding clientId and clientSecret via environment variables (for testing)
  const effectiveClientId = clientId || process.env.CLERKLY_OAUTH_CLIENT_ID || config.clientId;
  const configClientSecret =
    config.clientSecret === BUILD_TIME_OAUTH_CLIENT_SECRET_PLACEHOLDER ? '' : config.clientSecret;
  const effectiveClientSecret = process.env.CLERKLY_OAUTH_CLIENT_SECRET || configClientSecret;

  // Extract the numeric part from Client ID (remove .apps.googleusercontent.com suffix if present)
  // iOS Client ID format: 100365225505-9039l9g72mja9onmlkoupkphbns6lrg2.apps.googleusercontent.com
  // We need: com.googleusercontent.apps.100365225505-9039l9g72mja9onmlkoupkphbns6lrg2
  const clientIdWithoutSuffix = effectiveClientId.replace('.apps.googleusercontent.com', '');

  // Construct redirectUri based on clientId
  const effectiveRedirectUri = `com.googleusercontent.apps.${clientIdWithoutSuffix}:/oauth2redirect`;

  return {
    clientId: effectiveClientId,
    clientSecret: effectiveClientSecret,
    redirectUri: effectiveRedirectUri,
    authorizationEndpoint: endpoints.authorization,
    tokenEndpoint: endpoints.token,
    revokeEndpoint: endpoints.revoke,
    scopes: [...config.scopes],
  };
}
