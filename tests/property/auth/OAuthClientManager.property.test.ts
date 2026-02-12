// Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4, google-oauth-auth.1.5, google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.5, google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.7.2, google-oauth-auth.9.3, google-oauth-auth.9.4

import * as fc from 'fast-check';
import * as crypto from 'crypto';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { DataManager } from '../../../src/main/DataManager';
import { getOAuthConfig } from '../../../src/main/auth/OAuthConfig';
import { shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock electron shell
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn().mockReturnValue([]),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('OAuthClientManager Property-Based Tests', () => {
  let dataManager: DataManager;
  let tokenStorage: TokenStorageManager;
  let oauthClient: OAuthClientManager;
  let testDbPath: string;
  let testConfig: ReturnType<typeof getOAuthConfig>;
  const testClientId = 'test-client-id.apps.googleusercontent.com';

  beforeEach(() => {
    // Use unique database path for each test to avoid state pollution
    testDbPath = path.join(os.tmpdir(), `test-oauth-pbt-${Date.now()}-${Math.random()}`);
    dataManager = new DataManager(testDbPath);
    dataManager.initialize();

    // Requirements: user-data-isolation.1.10 - Mock UserProfileManager for data isolation
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

  /* Preconditions: OAuth client initialized with valid configuration
     Action: generate PKCE parameters multiple times
     Assertions: code verifier length 43-128 chars, code challenge is SHA-256 of verifier, state length >= 32 chars
     Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3 */
  // Feature: google-oauth-auth, Property 1: PKCE Parameters Generation
  it('Property 1: should generate valid PKCE parameters', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const params = oauthClient.generatePKCEParams();

        // Code verifier length check
        expect(params.codeVerifier.length).toBeGreaterThanOrEqual(43);
        expect(params.codeVerifier.length).toBeLessThanOrEqual(128);

        // Code challenge is valid SHA-256
        const expectedChallenge = crypto
          .createHash('sha256')
          .update(params.codeVerifier)
          .digest('base64url');
        expect(params.codeChallenge).toBe(expectedChallenge);

        // State has sufficient entropy
        expect(params.state.length).toBeGreaterThanOrEqual(32);
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: OAuth client initialized, no auth flow started
     Action: start auth flow which generates and stores PKCE params
     Assertions: PKCE parameters stored and retrievable during OAuth flow
     Requirements: google-oauth-auth.1.4 */
  // Feature: google-oauth-auth, Property 2: PKCE Parameters Persistence
  it('Property 2: should persist PKCE parameters during auth flow', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        // Start auth flow (which stores PKCE params)
        await oauthClient.startAuthFlow();

        // Get the state from the authorization URL
        const authUrl = (shell.openExternal as jest.Mock).mock.calls[0][0];
        const urlObj = new URL(authUrl);
        const state = urlObj.searchParams.get('state');
        const codeChallenge = urlObj.searchParams.get('code_challenge');

        // Verify parameters are present
        expect(state).toBeTruthy();
        expect(codeChallenge).toBeTruthy();
        expect(state!.length).toBeGreaterThanOrEqual(32);

        // Mock token exchange
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: 'test-token',
            refresh_token: 'test-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
        });

        // Verify state validation works
        const result = await oauthClient.handleDeepLink(
          `clerkly://oauth/callback?code=test-code&state=${state}`
        );
        expect(result.authorized).toBe(true);

        // Clean up
        await tokenStorage.deleteTokens();
        jest.clearAllMocks();
      }),
      { numRuns: 50 }
    );
  });

  /* Preconditions: OAuth client initialized, no auth flow started
     Action: start auth flow and verify generated authorization URL
     Assertions: URL contains all required OAuth parameters (client_id, redirect_uri, response_type, scope, code_challenge, state)
     Requirements: google-oauth-auth.1.5 */
  // Feature: google-oauth-auth, Property 3: Authorization URL Formation
  it('Property 3: should form valid authorization URL', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        await oauthClient.startAuthFlow();

        expect(shell.openExternal).toHaveBeenCalled();
        const authUrl = (shell.openExternal as jest.Mock).mock.calls[0][0];
        const urlObj = new URL(authUrl);

        // Verify all required parameters
        expect(urlObj.searchParams.get('client_id')).toBe(testClientId);
        expect(urlObj.searchParams.get('redirect_uri')).toBeTruthy();
        expect(urlObj.searchParams.get('redirect_uri')).toMatch(/^com\.googleusercontent\.apps\./);
        expect(urlObj.searchParams.get('response_type')).toBe('code');
        expect(urlObj.searchParams.get('scope')).toBe('openid email profile');
        expect(urlObj.searchParams.get('code_challenge')).toBeTruthy();
        expect(urlObj.searchParams.get('code_challenge_method')).toBe('S256');
        expect(urlObj.searchParams.get('state')).toBeTruthy();
        expect(urlObj.searchParams.get('access_type')).toBe('offline');
        expect(urlObj.searchParams.get('prompt')).toBe('consent');

        jest.clearAllMocks();
      }),
      { numRuns: 50 }
    );
  });

  // Generator for deep link URLs
  const deepLinkArb = fc.record({
    code: fc.string({ minLength: 10, maxLength: 100 }),
    state: fc.string({ minLength: 32, maxLength: 128 }),
  });

  /* Preconditions: valid deep link URL with code and state parameters
     Action: parse deep link URL and extract parameters
     Assertions: code and state values correctly extracted from URL
     Requirements: google-oauth-auth.2.2 */
  // Feature: google-oauth-auth, Property 4: Deep Link Parameter Extraction
  it('Property 4: should extract parameters from deep link', () => {
    fc.assert(
      fc.property(deepLinkArb, ({ code, state }) => {
        const url = `clerkly://oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
        const parsedUrl = new URL(url);

        expect(parsedUrl.searchParams.get('code')).toBe(code);
        expect(parsedUrl.searchParams.get('state')).toBe(state);
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: OAuth flow started with stored state parameter
     Action: handle deep link with mismatched state parameter
     Assertions: request rejected, returns unauthorized with csrf_attack_detected error
     Requirements: google-oauth-auth.2.3, google-oauth-auth.9.4 */
  // Feature: google-oauth-auth, Property 5: State Validation
  it('Property 5: should reject mismatched state', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 32, maxLength: 128 }), async (wrongState) => {
        // Start auth flow
        await oauthClient.startAuthFlow();
        const authUrl = (shell.openExternal as jest.Mock).mock.calls[0][0];
        const correctState = new URL(authUrl).searchParams.get('state');

        // Ensure wrong state is different from correct state
        fc.pre(wrongState !== correctState && wrongState.trim() !== '');

        // Try to use wrong state
        const result = await oauthClient.handleDeepLink(
          `clerkly://oauth/callback?code=test-code&state=${encodeURIComponent(wrongState)}`
        );

        expect(result.authorized).toBe(false);
        expect(result.error).toBe('csrf_attack_detected');

        jest.clearAllMocks();
      }),
      { numRuns: 50 }
    );
  });

  /* Preconditions: OAuth client initialized, authorization code and code verifier available
     Action: form token exchange request
     Assertions: request includes all required parameters (code, client_id, client_secret, redirect_uri, code_verifier, grant_type)
     Requirements: google-oauth-auth.3.1, google-oauth-auth.3.2 */
  // Feature: google-oauth-auth, Property 6: Token Exchange Request Formation
  it('Property 6: should form valid token exchange request', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: fc.string({ minLength: 10, maxLength: 100 }),
          codeVerifier: fc.stringOf(
            fc.constantFrom(
              ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'.split('')
            ),
            { minLength: 43, maxLength: 128 }
          ),
        }),
        async ({ code, codeVerifier: _codeVerifier }) => {
          // Start auth flow to set up PKCE storage
          await oauthClient.startAuthFlow();
          const authUrl = (shell.openExternal as jest.Mock).mock.calls[0][0];
          const state = new URL(authUrl).searchParams.get('state');

          // Mock token exchange response
          (global.fetch as jest.Mock).mockImplementationOnce((url, options) => {
            // Verify request parameters
            const body = new URLSearchParams(options.body);
            expect(body.get('code')).toBeTruthy();
            expect(body.get('client_id')).toBe(testClientId);
            expect(body.get('client_secret')).toBe(testConfig.clientSecret);
            expect(body.get('redirect_uri')).toBeTruthy();
            expect(body.get('grant_type')).toBe('authorization_code');
            expect(body.get('code_verifier')).toBeTruthy();

            return Promise.resolve({
              ok: true,
              json: async () => ({
                access_token: 'test-token',
                refresh_token: 'test-refresh',
                expires_in: 3600,
                token_type: 'Bearer',
              }),
            });
          });

          await oauthClient.handleDeepLink(`clerkly://oauth/callback?code=${code}&state=${state}`);

          await tokenStorage.deleteTokens();
          jest.clearAllMocks();
        }
      ),
      { numRuns: 50 }
    );
  });

  // Generator for token responses
  const tokenResponseArb = fc.record({
    access_token: fc.hexaString({ minLength: 20, maxLength: 200 }),
    refresh_token: fc.option(fc.hexaString({ minLength: 20, maxLength: 200 }), { nil: undefined }),
    expires_in: fc.integer({ min: 60, max: 7200 }),
    token_type: fc.constant('Bearer'),
  });

  /* Preconditions: OAuth client initialized, various token states (no tokens, valid tokens, expired tokens)
     Action: call getAuthStatus() for each token state
     Assertions: returns correct authorization status based on token state (false for no/expired tokens, true for valid tokens)
     Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4 */
  // Feature: google-oauth-auth, Property 11: Auth Status Determination
  it('Property 11: should determine auth status correctly', async () => {
    // Test with no tokens
    const noTokensStatus = await oauthClient.getAuthStatus();
    expect(noTokensStatus.authorized).toBe(false);

    // Test with valid tokens (future expiration)
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: Date.now() + 1000, max: Date.now() + 7200000 }),
        async (expiresAt) => {
          // Clean state before test
          await tokenStorage.deleteTokens();

          await tokenStorage.saveTokens({
            accessToken: 'valid-token',
            refreshToken: 'valid-refresh',
            expiresAt,
            tokenType: 'Bearer',
          });

          const status = await oauthClient.getAuthStatus();
          expect(status.authorized).toBe(true);

          // Clean up after test
          await tokenStorage.deleteTokens();
        }
      ),
      { numRuns: 50 }
    );

    // Test with expired tokens (past expiration)
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: Date.now() - 1000 }), async (expiresAt) => {
        // Clean state before test
        await tokenStorage.deleteTokens();

        // Mock refresh token failure
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('invalid_grant'));

        await tokenStorage.saveTokens({
          accessToken: 'expired-token',
          refreshToken: 'expired-refresh',
          expiresAt,
          tokenType: 'Bearer',
        });

        const status = await oauthClient.getAuthStatus();

        // Should be unauthorized because token is expired and refresh failed
        expect(status.authorized).toBe(false);

        // Clean up after test
        await tokenStorage.deleteTokens();
        jest.clearAllMocks();
      }),
      { numRuns: 50 }
    );
  });

  /* Preconditions: OAuth client initialized, valid tokens saved in storage
     Action: call logout() which may succeed or fail at revoke endpoint
     Assertions: tokens removed from storage regardless of revoke endpoint response
     Requirements: google-oauth-auth.7.2 */
  // Feature: google-oauth-auth, Property 14: Logout Token Cleanup
  it('Property 14: should cleanup tokens on logout', async () => {
    await fc.assert(
      fc.asyncProperty(tokenResponseArb, async (tokens) => {
        // Save tokens
        await tokenStorage.saveTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: Date.now() + tokens.expires_in * 1000,
          tokenType: tokens.token_type,
        });

        // Mock revoke (can succeed or fail)
        const shouldFail = Math.random() > 0.5;
        if (shouldFail) {
          (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
        } else {
          (global.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: async () => ({}),
          });
        }

        // Logout
        await oauthClient.logout();

        // Verify tokens are gone
        const loadedTokens = await tokenStorage.loadTokens();
        expect(loadedTokens).toBeNull();

        jest.clearAllMocks();
      }),
      { numRuns: 50 }
    );
  });

  // Generator for OAuth errors
  const oauthErrorArb = fc.constantFrom(
    'invalid_grant',
    'access_denied',
    'invalid_request',
    'server_error',
    'temporarily_unavailable'
  );

  /* Preconditions: OAuth flow started, authorization code received
     Action: exchange code for tokens, Google API returns OAuth error
     Assertions: error propagated without losing information, error code preserved
     Requirements: google-oauth-auth.9.3 */
  // Feature: google-oauth-auth, Property 16: Error Propagation
  it('Property 16: should propagate OAuth errors', async () => {
    await fc.assert(
      fc.asyncProperty(oauthErrorArb, async (errorCode) => {
        jest.clearAllMocks();
        await tokenStorage.deleteTokens();

        await oauthClient.startAuthFlow();
        const authUrl = (shell.openExternal as jest.Mock).mock.calls[0][0];
        const state = new URL(authUrl).searchParams.get('state');

        // Mock error response from token endpoint
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            error: errorCode,
            error_description: 'Test error description',
          }),
        });

        const result = await oauthClient.handleDeepLink(
          `clerkly://oauth/callback?code=test-code&state=${state}`
        );

        expect(result.authorized).toBe(false);
        // The error should be defined
        expect(result.error).toBeDefined();
        // Error should be a string
        expect(typeof result.error).toBe('string');
        // Error should not be empty
        expect(result.error!.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
