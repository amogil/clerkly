// Requirements: google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.6.5

import * as fc from 'fast-check';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { DataManager } from '../../../src/main/DataManager';
import { getOAuthConfig } from '../../../src/main/auth/OAuthConfig';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock electron shell
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('Token Refresh Property-Based Tests', () => {
  let dataManager: DataManager;
  let tokenStorage: TokenStorageManager;
  let oauthClient: OAuthClientManager;
  let testDbPath: string;
  let testConfig: ReturnType<typeof getOAuthConfig>;
  const testClientId = 'test-client-id.apps.googleusercontent.com';

  beforeEach(() => {
    // Use unique database path for each test to avoid state pollution
    testDbPath = path.join(os.tmpdir(), `test-token-refresh-pbt-${Date.now()}-${Math.random()}`);
    dataManager = new DataManager(testDbPath);
    dataManager.initialize();

    // Requirements: ui.12.10 - Mock UserProfileManager for data isolation
    const mockProfileManager = {
      getCurrentEmail: jest.fn().mockReturnValue('test@example.com'),
    } as any;

    dataManager.setUserProfileManager(mockProfileManager);
    tokenStorage = new TokenStorageManager(dataManager);

    testConfig = getOAuthConfig(testClientId);
    oauthClient = new OAuthClientManager(testConfig, tokenStorage);

    jest.clearAllMocks();
  });

  afterEach(() => {
    dataManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  /* Preconditions: OAuth client configured, expired access token with valid refresh token saved in storage
     Action: call getAuthStatus() which triggers automatic token refresh
     Assertions: refresh succeeds, new access token saved, refresh token preserved, expiration time updated
     Requirements: google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3 */
  // Feature: google-oauth-auth, Property 12: Token Refresh Success
  it('Property 12: should refresh expired access token successfully', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          oldAccessToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          refreshToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          newAccessToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          expiresIn: fc.integer({ min: 60, max: 7200 }),
        }),
        async ({ oldAccessToken, refreshToken, newAccessToken, expiresIn }) => {
          // Ensure tokens are different
          fc.pre(oldAccessToken !== newAccessToken);

          // Save expired token
          await tokenStorage.saveTokens({
            accessToken: oldAccessToken,
            refreshToken: refreshToken,
            expiresAt: Date.now() - 1000, // Expired 1 second ago
            tokenType: 'Bearer',
          });

          // Mock successful refresh response
          (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              access_token: newAccessToken,
              expires_in: expiresIn,
              token_type: 'Bearer',
            }),
          });

          // Get auth status (should trigger refresh)
          const status = await oauthClient.getAuthStatus();

          // Verify refresh was successful
          expect(status.authorized).toBe(true);

          // Verify new token was saved
          const tokens = await tokenStorage.loadTokens();
          expect(tokens).not.toBeNull();
          expect(tokens!.accessToken).toBe(newAccessToken);
          expect(tokens!.refreshToken).toBe(refreshToken);
          expect(tokens!.expiresAt).toBeGreaterThan(Date.now());

          // Clean up
          await tokenStorage.deleteTokens();
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: OAuth client configured, expired access token with old refresh token saved
     Action: call getAuthStatus() which triggers refresh, server returns new refresh token
     Assertions: both access and refresh tokens updated in storage
     Requirements: google-oauth-auth.6.4 */
  // Feature: google-oauth-auth, Property 13: Token Refresh with New Refresh Token
  it('Property 13: should update both tokens when new refresh token returned', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          oldAccessToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          oldRefreshToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          newAccessToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          newRefreshToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          expiresIn: fc.integer({ min: 60, max: 7200 }),
        }),
        async ({ oldAccessToken, oldRefreshToken, newAccessToken, newRefreshToken, expiresIn }) => {
          // Ensure tokens are different
          fc.pre(oldAccessToken !== newAccessToken && oldRefreshToken !== newRefreshToken);

          // Save expired token
          await tokenStorage.saveTokens({
            accessToken: oldAccessToken,
            refreshToken: oldRefreshToken,
            expiresAt: Date.now() - 1000,
            tokenType: 'Bearer',
          });

          // Mock refresh response with new refresh token
          (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              access_token: newAccessToken,
              refresh_token: newRefreshToken,
              expires_in: expiresIn,
              token_type: 'Bearer',
            }),
          });

          // Trigger refresh
          await oauthClient.getAuthStatus();

          // Verify both tokens were updated
          const tokens = await tokenStorage.loadTokens();
          expect(tokens).not.toBeNull();
          expect(tokens!.accessToken).toBe(newAccessToken);
          expect(tokens!.refreshToken).toBe(newRefreshToken);

          // Clean up
          await tokenStorage.deleteTokens();
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: OAuth client configured, expired access token with refresh token saved
     Action: call getAuthStatus() which triggers refresh, server returns invalid_grant error
     Assertions: tokens cleared from storage, status returns unauthorized
     Requirements: google-oauth-auth.6.5 */
  // Feature: google-oauth-auth, Property 14: Token Refresh Failure Cleanup
  it('Property 14: should clear tokens on invalid_grant error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          accessToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          refreshToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
        }),
        async ({ accessToken, refreshToken }) => {
          // Save expired token
          await tokenStorage.saveTokens({
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date.now() - 1000,
            tokenType: 'Bearer',
          });

          // Mock invalid_grant error
          (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            json: async () => ({
              error: 'invalid_grant',
              error_description: 'Token has been expired or revoked',
            }),
          });

          // Trigger refresh
          const status = await oauthClient.getAuthStatus();

          // Verify unauthorized status
          expect(status.authorized).toBe(false);

          // Verify tokens were cleared
          const tokens = await tokenStorage.loadTokens();
          expect(tokens).toBeNull();

          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: google-oauth-auth, Property 15: Token Refresh Request Format
     For any token refresh request, the OAuth client must send correct parameters
     including client_secret.
     Requirements: google-oauth-auth.6.1, google-oauth-auth.6.2 */
  it('Property 15: should send correct refresh request with client_secret', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          accessToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          refreshToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
        }),
        async ({ accessToken, refreshToken }) => {
          // Save expired token
          await tokenStorage.saveTokens({
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: Date.now() - 1000,
            tokenType: 'Bearer',
          });

          // Mock fetch to capture request
          (global.fetch as jest.Mock).mockImplementationOnce((url, options) => {
            // Verify request parameters
            const body = new URLSearchParams(options.body);
            expect(body.get('refresh_token')).toBe(refreshToken);
            expect(body.get('client_id')).toBe(testClientId);
            expect(body.get('client_secret')).toBe(testConfig.clientSecret);
            expect(body.get('grant_type')).toBe('refresh_token');

            return Promise.resolve({
              ok: true,
              json: async () => ({
                access_token: 'new-token',
                expires_in: 3600,
                token_type: 'Bearer',
              }),
            });
          });

          // Trigger refresh
          await oauthClient.getAuthStatus();

          // Clean up
          await tokenStorage.deleteTokens();
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: google-oauth-auth, Property 16: Token Expiration Calculation
     For any token refresh response, the OAuth client must correctly calculate
     the expiration time based on expires_in value.
     Requirements: google-oauth-auth.6.3 */
  it('Property 16: should correctly calculate token expiration time', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          accessToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          refreshToken: fc.hexaString({ minLength: 20, maxLength: 100 }),
          expiresIn: fc.integer({ min: 60, max: 7200 }),
        }),
        async ({ accessToken, refreshToken, expiresIn }) => {
          // Save expired token
          await tokenStorage.saveTokens({
            accessToken: 'old-token',
            refreshToken: refreshToken,
            expiresAt: Date.now() - 1000,
            tokenType: 'Bearer',
          });

          const beforeRefresh = Date.now();

          // Mock refresh response
          (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              access_token: accessToken,
              expires_in: expiresIn,
              token_type: 'Bearer',
            }),
          });

          // Trigger refresh
          await oauthClient.getAuthStatus();

          const afterRefresh = Date.now();

          // Verify expiration time
          const tokens = await tokenStorage.loadTokens();
          expect(tokens).not.toBeNull();

          // expiresAt should be approximately current time + expiresIn seconds
          const expectedMin = beforeRefresh + expiresIn * 1000;
          const expectedMax = afterRefresh + expiresIn * 1000;

          expect(tokens!.expiresAt).toBeGreaterThanOrEqual(expectedMin);
          expect(tokens!.expiresAt).toBeLessThanOrEqual(expectedMax);

          // Clean up
          await tokenStorage.deleteTokens();
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });
});
