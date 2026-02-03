// Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6

import {
  getOAuthConfig,
  GOOGLE_OAUTH_ENDPOINTS,
  OAUTH_CONFIG,
  type OAuthConfig,
} from '../../../src/main/auth/OAuthConfig';

describe('OAuthConfig', () => {
  /* Preconditions: None
     Action: Access GOOGLE_OAUTH_ENDPOINTS constant
     Assertions: All required OAuth endpoints are defined with correct URLs
     Requirements: google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6 */
  it('should have all required Google OAuth endpoints', () => {
    expect(GOOGLE_OAUTH_ENDPOINTS.authorization).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth'
    );
    expect(GOOGLE_OAUTH_ENDPOINTS.token).toBe('https://oauth2.googleapis.com/token');
    expect(GOOGLE_OAUTH_ENDPOINTS.revoke).toBe('https://oauth2.googleapis.com/revoke');
  });

  /* Preconditions: None
     Action: Access OAUTH_CONFIG constant
     Assertions: redirect_uri is in correct format "clerkly://oauth/callback"
     Requirements: google-oauth-auth.10.2 */
  it('should have correct redirect_uri format', () => {
    expect(OAUTH_CONFIG.redirectUri).toBe('clerkly://oauth/callback');
    expect(OAUTH_CONFIG.redirectUri).toMatch(/^clerkly:\/\//);
  });

  /* Preconditions: None
     Action: Access OAUTH_CONFIG.scopes
     Assertions: All required scopes (openid, email, profile) are present
     Requirements: google-oauth-auth.10.3 */
  it('should have all required scopes', () => {
    expect(OAUTH_CONFIG.scopes).toContain('openid');
    expect(OAUTH_CONFIG.scopes).toContain('email');
    expect(OAUTH_CONFIG.scopes).toContain('profile');
    expect(OAUTH_CONFIG.scopes).toHaveLength(3);
  });

  /* Preconditions: Valid client_id provided
     Action: Call getOAuthConfig with client_id
     Assertions: Returns complete OAuthConfig with all required fields
     Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6 */
  it('should return complete OAuth configuration', () => {
    const clientId = 'test-client-id.apps.googleusercontent.com';
    const config: OAuthConfig = getOAuthConfig(clientId);

    expect(config.clientId).toBe(clientId);
    expect(config.redirectUri).toBe('clerkly://oauth/callback');
    expect(config.authorizationEndpoint).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(config.tokenEndpoint).toBe('https://oauth2.googleapis.com/token');
    expect(config.revokeEndpoint).toBe('https://oauth2.googleapis.com/revoke');
    expect(config.scopes).toEqual(['openid', 'email', 'profile']);
  });

  /* Preconditions: Valid client_id provided
     Action: Call getOAuthConfig with client_id
     Assertions: All configuration fields are non-empty strings or arrays
     Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3 */
  it('should have all mandatory configuration fields', () => {
    const clientId = 'test-client-id.apps.googleusercontent.com';
    const config: OAuthConfig = getOAuthConfig(clientId);

    expect(config.clientId).toBeTruthy();
    expect(config.redirectUri).toBeTruthy();
    expect(config.authorizationEndpoint).toBeTruthy();
    expect(config.tokenEndpoint).toBeTruthy();
    expect(config.revokeEndpoint).toBeTruthy();
    expect(config.scopes).toBeTruthy();
    expect(Array.isArray(config.scopes)).toBe(true);
    expect(config.scopes.length).toBeGreaterThan(0);
  });

  /* Preconditions: Different client_id values provided
     Action: Call getOAuthConfig with different client_id values
     Assertions: Each call returns configuration with the provided client_id
     Requirements: google-oauth-auth.10.1 */
  it('should use provided client_id in configuration', () => {
    const clientId1 = 'client1.apps.googleusercontent.com';
    const clientId2 = 'client2.apps.googleusercontent.com';

    const config1 = getOAuthConfig(clientId1);
    const config2 = getOAuthConfig(clientId2);

    expect(config1.clientId).toBe(clientId1);
    expect(config2.clientId).toBe(clientId2);
    expect(config1.clientId).not.toBe(config2.clientId);
  });

  /* Preconditions: None
     Action: Access GOOGLE_OAUTH_ENDPOINTS
     Assertions: All endpoints use HTTPS protocol
     Requirements: google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6 */
  it('should use HTTPS for all endpoints', () => {
    expect(GOOGLE_OAUTH_ENDPOINTS.authorization).toMatch(/^https:\/\//);
    expect(GOOGLE_OAUTH_ENDPOINTS.token).toMatch(/^https:\/\//);
    expect(GOOGLE_OAUTH_ENDPOINTS.revoke).toMatch(/^https:\/\//);
  });

  /* Preconditions: None
     Action: Access OAUTH_CONFIG.scopes
     Assertions: Scopes array contains only valid OAuth scope strings
     Requirements: google-oauth-auth.10.3 */
  it('should have valid scope strings', () => {
    OAUTH_CONFIG.scopes.forEach((scope) => {
      expect(typeof scope).toBe('string');
      expect(scope.length).toBeGreaterThan(0);
      expect(scope).not.toContain(' ');
    });
  });
});
