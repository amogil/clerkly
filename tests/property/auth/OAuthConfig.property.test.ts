// Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6

import * as fc from 'fast-check';
import { getOAuthConfig } from '../../../src/main/auth/OAuthConfig';

describe('OAuthConfig Property-Based Tests', () => {
  /**
   * Property 19: OAuth Configuration Consistency
   * For any client ID, the OAuth configuration must return consistent values
   * with all required fields properly set.
   * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6**
   */
  describe('Property 19: OAuth Configuration Consistency', () => {
    /* Preconditions: Any valid client ID provided
       Action: Get OAuth configuration with client ID
       Assertions: Configuration contains all required fields with correct values
       Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6 */
    it('should return consistent configuration for any client ID', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 200 }), (clientId) => {
          const config = getOAuthConfig(clientId);

          // Property: Configuration has all required fields
          expect(config).toHaveProperty('clientId');
          expect(config).toHaveProperty('redirectUri');
          expect(config).toHaveProperty('scopes');
          expect(config).toHaveProperty('authorizationEndpoint');
          expect(config).toHaveProperty('tokenEndpoint');
          expect(config).toHaveProperty('revokeEndpoint');

          // Property: Client ID is preserved
          expect(config.clientId).toBe(clientId);

          // Property: Redirect URI is in reverse client ID format (google-oauth-auth.10.2)
          expect(config.redirectUri).toMatch(/^com\.googleusercontent\.apps\./);
          expect(config.redirectUri).toContain(':/oauth2redirect');

          // Property: Scopes are correct (google-oauth-auth.10.3)
          expect(config.scopes).toEqual(['openid', 'email', 'profile']);

          // Property: Authorization endpoint is correct (google-oauth-auth.10.4)
          expect(config.authorizationEndpoint).toBe('https://accounts.google.com/o/oauth2/v2/auth');

          // Property: Token endpoint is correct (google-oauth-auth.10.5)
          expect(config.tokenEndpoint).toBe('https://oauth2.googleapis.com/token');

          // Property: Revoke endpoint is correct (google-oauth-auth.10.6)
          expect(config.revokeEndpoint).toBe('https://oauth2.googleapis.com/revoke');
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Multiple calls with same client ID
       Action: Get configuration multiple times
       Assertions: Returns identical configuration each time
       Requirements: google-oauth-auth.10.1 */
    it('should return identical configuration for same client ID', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 200 }), (clientId) => {
          const config1 = getOAuthConfig(clientId);
          const config2 = getOAuthConfig(clientId);
          const config3 = getOAuthConfig(clientId);

          // Property: All configurations are identical
          expect(config1).toEqual(config2);
          expect(config2).toEqual(config3);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Different client IDs provided
       Action: Get configuration for different client IDs
       Assertions: Only client ID differs, all other fields are identical
       Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2, google-oauth-auth.10.3, google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6 */
    it('should have consistent endpoints and scopes regardless of client ID', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 200 }),
          fc.string({ minLength: 10, maxLength: 200 }),
          (clientId1, clientId2) => {
            fc.pre(clientId1 !== clientId2);

            const config1 = getOAuthConfig(clientId1);
            const config2 = getOAuthConfig(clientId2);

            // Property: Client IDs are different
            expect(config1.clientId).not.toBe(config2.clientId);

            // Property: All other fields are identical
            expect(config1.redirectUri).toBe(config2.redirectUri);
            expect(config1.scopes).toEqual(config2.scopes);
            expect(config1.authorizationEndpoint).toBe(config2.authorizationEndpoint);
            expect(config1.tokenEndpoint).toBe(config2.tokenEndpoint);
            expect(config1.revokeEndpoint).toBe(config2.revokeEndpoint);
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Any client ID
       Action: Get configuration, verify redirect URI format
       Assertions: Redirect URI is valid custom protocol URL
       Requirements: google-oauth-auth.10.2 */
    it('should have valid redirect URI format', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 200 }), (clientId) => {
          const config = getOAuthConfig(clientId);

          // Property: Redirect URI is in reverse client ID format
          expect(config.redirectUri).toMatch(/^com\.googleusercontent\.apps\./);
          expect(config.redirectUri).toContain(':/oauth2redirect');

          // Property: Redirect URI is valid URL
          expect(() => new URL(config.redirectUri)).not.toThrow();
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Any client ID
       Action: Get configuration, verify scopes
       Assertions: Scopes array contains exactly required scopes
       Requirements: google-oauth-auth.10.3 */
    it('should have correct scopes array', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 200 }), (clientId) => {
          const config = getOAuthConfig(clientId);

          // Property: Scopes is an array
          expect(Array.isArray(config.scopes)).toBe(true);

          // Property: Scopes has exactly 3 elements
          expect(config.scopes).toHaveLength(3);

          // Property: Scopes contains required values
          expect(config.scopes).toContain('openid');
          expect(config.scopes).toContain('email');
          expect(config.scopes).toContain('profile');

          // Property: Scopes are in correct order
          expect(config.scopes).toEqual(['openid', 'email', 'profile']);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Any client ID
       Action: Get configuration, verify all endpoints are HTTPS
       Assertions: All endpoint URLs use HTTPS protocol
       Requirements: google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6 */
    it('should have HTTPS endpoints', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 200 }), (clientId) => {
          const config = getOAuthConfig(clientId);

          // Property: Authorization endpoint is HTTPS
          expect(config.authorizationEndpoint).toMatch(/^https:\/\//);
          expect(new URL(config.authorizationEndpoint).protocol).toBe('https:');

          // Property: Token endpoint is HTTPS
          expect(config.tokenEndpoint).toMatch(/^https:\/\//);
          expect(new URL(config.tokenEndpoint).protocol).toBe('https:');

          // Property: Revoke endpoint is HTTPS
          expect(config.revokeEndpoint).toMatch(/^https:\/\//);
          expect(new URL(config.revokeEndpoint).protocol).toBe('https:');
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Any client ID
       Action: Get configuration, verify endpoints are Google domains
       Assertions: All endpoints point to Google OAuth servers
       Requirements: google-oauth-auth.10.4, google-oauth-auth.10.5, google-oauth-auth.10.6 */
    it('should have Google OAuth endpoints', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 200 }), (clientId) => {
          const config = getOAuthConfig(clientId);

          // Property: Authorization endpoint is Google domain
          const authUrl = new URL(config.authorizationEndpoint);
          expect(authUrl.hostname).toBe('accounts.google.com');
          expect(authUrl.pathname).toBe('/o/oauth2/v2/auth');

          // Property: Token endpoint is Google domain
          const tokenUrl = new URL(config.tokenEndpoint);
          expect(tokenUrl.hostname).toBe('oauth2.googleapis.com');
          expect(tokenUrl.pathname).toBe('/token');

          // Property: Revoke endpoint is Google domain
          const revokeUrl = new URL(config.revokeEndpoint);
          expect(revokeUrl.hostname).toBe('oauth2.googleapis.com');
          expect(revokeUrl.pathname).toBe('/revoke');
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Empty or whitespace client ID
       Action: Get configuration with invalid client ID
       Assertions: Configuration uses default client ID for empty/falsy values
       Requirements: google-oauth-auth.10.1 */
    it('should handle edge case client IDs', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.constant('   '),
            fc.constant('\t\n'),
            fc.string({ minLength: 1, maxLength: 5 })
          ),
          (clientId) => {
            const config = getOAuthConfig(clientId);

            // Property: Configuration is still valid
            expect(config).toBeDefined();

            // Empty or falsy strings (including whitespace-only) should use default client ID
            // because getOAuthConfig uses || operator which treats empty string as falsy
            // Non-empty strings (even whitespace) should be used as-is
            if (!clientId) {
              expect(config.clientId).toBe(OAUTH_CONFIG.clientId);
            } else {
              expect(config.clientId).toBe(clientId);
            }

            expect(config.redirectUri).toMatch(/^com\.googleusercontent\.apps\./);
            expect(config.redirectUri).toContain(':/oauth2redirect');
            expect(config.scopes).toEqual(['openid', 'email', 'profile']);
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Very long client ID
       Action: Get configuration with long client ID
       Assertions: Configuration handles long client IDs correctly
       Requirements: google-oauth-auth.10.1 */
    it('should handle very long client IDs', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 200, maxLength: 1000 }), (clientId) => {
          const config = getOAuthConfig(clientId);

          // Property: Long client ID is preserved
          expect(config.clientId).toBe(clientId);
          expect(config.clientId.length).toBeGreaterThanOrEqual(200);

          // Property: Other fields are unaffected
          expect(config.redirectUri).toMatch(/^com\.googleusercontent\.apps\./);
          expect(config.redirectUri).toContain(':/oauth2redirect');
          expect(config.scopes).toEqual(['openid', 'email', 'profile']);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Client ID with special characters
       Action: Get configuration with special characters in client ID
       Assertions: Configuration preserves special characters
       Requirements: google-oauth-auth.10.1 */
    it('should handle client IDs with special characters', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 10, maxLength: 200 }), (baseId) => {
          const specialChars = ['-', '_', '.', '@', '!', '#', '$', '%'];
          const clientId = baseId + specialChars.join('');

          const config = getOAuthConfig(clientId);

          // Property: Special characters are preserved
          expect(config.clientId).toBe(clientId);
          expect(config.clientId).toContain('-');
          expect(config.clientId).toContain('_');
          expect(config.clientId).toContain('.');
        }),
        { numRuns: 100 }
      );
    });
  });
});
