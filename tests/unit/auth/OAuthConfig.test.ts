// Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2

import { getOAuthConfig, OAUTH_CONFIG } from '../../../src/main/auth/OAuthConfig';

describe('OAuthConfig', () => {
  describe('getOAuthConfig', () => {
    /* Preconditions: No client ID provided
       Action: Call getOAuthConfig without arguments
       Assertions: Returns default configuration
       Requirements: google-oauth-auth.10.1 */
    it('should return default configuration when no client ID provided', () => {
      const config = getOAuthConfig();

      expect(config.clientId).toBe(OAUTH_CONFIG.clientId);
      expect(config.clientSecret).toBe(OAUTH_CONFIG.clientSecret);
      expect(config.scopes).toEqual(OAUTH_CONFIG.scopes);
    });

    /* Preconditions: Client ID with .apps.googleusercontent.com suffix
       Action: Call getOAuthConfig with full Client ID
       Assertions: Redirect URI does not contain duplicate suffix
       Requirements: google-oauth-auth.10.2 */
    it('should remove .apps.googleusercontent.com suffix from redirect URI', () => {
      const clientIdWithSuffix = '100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa.apps.googleusercontent.com';
      const config = getOAuthConfig(clientIdWithSuffix);

      // Client ID should be preserved as-is
      expect(config.clientId).toBe(clientIdWithSuffix);

      // Redirect URI should NOT have duplicate .apps.googleusercontent.com
      expect(config.redirectUri).toBe(
        'com.googleusercontent.apps.100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa:/oauth2redirect'
      );

      // Should not contain duplicate suffix
      expect(config.redirectUri).not.toContain('.apps.googleusercontent.com.apps.googleusercontent.com');
    });

    /* Preconditions: Client ID without .apps.googleusercontent.com suffix
       Action: Call getOAuthConfig with numeric Client ID
       Assertions: Redirect URI is correctly formatted
       Requirements: google-oauth-auth.10.2 */
    it('should handle client ID without suffix correctly', () => {
      const clientIdWithoutSuffix = '100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa';
      const config = getOAuthConfig(clientIdWithoutSuffix);

      expect(config.clientId).toBe(clientIdWithoutSuffix);
      expect(config.redirectUri).toBe(
        'com.googleusercontent.apps.100365225505-a9mp4sll4948tafotr1va0fvnl5hrpoa:/oauth2redirect'
      );
    });

    /* Preconditions: Multiple client IDs with different formats
       Action: Call getOAuthConfig with various Client ID formats
       Assertions: All redirect URIs are correctly formatted without duplicates
       Requirements: google-oauth-auth.10.2 */
    it('should handle various client ID formats', () => {
      const testCases = [
        {
          input: '12345-abcde.apps.googleusercontent.com',
          expected: 'com.googleusercontent.apps.12345-abcde:/oauth2redirect',
        },
        {
          input: '12345-abcde',
          expected: 'com.googleusercontent.apps.12345-abcde:/oauth2redirect',
        },
        {
          input: 'test-client-id.apps.googleusercontent.com',
          expected: 'com.googleusercontent.apps.test-client-id:/oauth2redirect',
        },
        {
          input: 'test-client-id',
          expected: 'com.googleusercontent.apps.test-client-id:/oauth2redirect',
        },
      ];

      testCases.forEach(({ input, expected }) => {
        const config = getOAuthConfig(input);
        expect(config.redirectUri).toBe(expected);
        expect(config.redirectUri).not.toContain('.apps.googleusercontent.com.apps.googleusercontent.com');
      });
    });

    /* Preconditions: Environment variables set for testing
       Action: Call getOAuthConfig with test environment
       Assertions: Uses test configuration
       Requirements: google-oauth-auth.10.1 */
    it('should use test configuration in test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const config = getOAuthConfig();

      expect(config.clientId).toBe('test-client-id-12345');
      expect(config.clientSecret).toBe('test-client-secret-67890');
      expect(config.redirectUri).toBe('com.googleusercontent.apps.test-client-id-12345:/oauth2redirect');

      process.env.NODE_ENV = originalEnv;
    });

    /* Preconditions: Custom client ID provided
       Action: Call getOAuthConfig with custom client ID
       Assertions: Uses custom client ID but default secret
       Requirements: google-oauth-auth.10.1 */
    it('should use custom client ID when provided', () => {
      const customClientId = 'custom-client-id-67890.apps.googleusercontent.com';
      const config = getOAuthConfig(customClientId);

      expect(config.clientId).toBe(customClientId);
      expect(config.redirectUri).toBe('com.googleusercontent.apps.custom-client-id-67890:/oauth2redirect');
    });
  });
});
