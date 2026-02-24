// Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.5, google-oauth-auth.2.2, google-oauth-auth.2.3, google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.5, google-oauth-auth.5.1, google-oauth-auth.5.2, google-oauth-auth.5.3, google-oauth-auth.5.4, google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.6.3, google-oauth-auth.6.4, google-oauth-auth.6.5, google-oauth-auth.7.1, google-oauth-auth.7.2, google-oauth-auth.9.2, database-refactoring.2

import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { UserSettingsManager } from '../../../src/main/UserSettingsManager';
import { DatabaseManager } from '../../../src/main/DatabaseManager';
import { getOAuthConfig } from '../../../src/main/auth/OAuthConfig';
import { shell } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock electron shell
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('OAuthClientManager', () => {
  let dataManager: UserSettingsManager;
  let dbManager: DatabaseManager;
  let tokenStorage: TokenStorageManager;
  let oauthClient: OAuthClientManager;
  let testDbPath: string;
  let testConfig: ReturnType<typeof getOAuthConfig>;
  let mockUserManager: jest.Mocked<any>;
  const testClientId = 'test-client-id.apps.googleusercontent.com';

  beforeEach(() => {
    // Create test database
    testDbPath = path.join(os.tmpdir(), `test-oauth-client-${Date.now()}`);

    // Ensure migrations directory exists for tests
    const migrationsPath = path.join(__dirname, '..', '..', '..', 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }

    // Requirements: user-data-isolation.1.10 - Mock UserManager for data isolation
    mockUserManager = {
      getCurrentUserId: jest.fn().mockReturnValue('test@example.com'),
    };

    // Initialize DatabaseManager first
    dbManager = new DatabaseManager();
    dbManager.initialize(testDbPath);
    dbManager.setUserManager(mockUserManager);

    // Create UserSettingsManager with DatabaseManager
    dataManager = new UserSettingsManager(dbManager);
    tokenStorage = new TokenStorageManager(dataManager);

    // Create OAuth client
    testConfig = getOAuthConfig(testClientId);
    oauthClient = new OAuthClientManager(testConfig, tokenStorage);

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    dbManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  describe('PKCE Parameter Generation', () => {
    /* Preconditions: None
       Action: Call generatePKCEParams
       Assertions: Code verifier length is between 43 and 128 characters
       Requirements: google-oauth-auth.1.1 */
    it('should generate code verifier with correct length', () => {
      const params = oauthClient.generatePKCEParams();
      expect(params.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(params.codeVerifier.length).toBeLessThanOrEqual(128);
    });

    /* Preconditions: None
       Action: Call generatePKCEParams
       Assertions: Code challenge is valid SHA-256 hash of code verifier
       Requirements: google-oauth-auth.1.2 */
    it('should generate code challenge as SHA-256 of verifier', () => {
      const params = oauthClient.generatePKCEParams();
      const expectedChallenge = crypto
        .createHash('sha256')
        .update(params.codeVerifier)
        .digest('base64url');
      expect(params.codeChallenge).toBe(expectedChallenge);
    });

    /* Preconditions: None
       Action: Call generatePKCEParams
       Assertions: State parameter has sufficient entropy (minimum 32 characters)
       Requirements: google-oauth-auth.1.3 */
    it('should generate state with sufficient entropy', () => {
      const params = oauthClient.generatePKCEParams();
      expect(params.state.length).toBeGreaterThanOrEqual(32);
    });

    /* Preconditions: None
       Action: Call generatePKCEParams multiple times
       Assertions: Each call generates unique parameters
       Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3 */
    it('should generate unique parameters on each call', () => {
      const params1 = oauthClient.generatePKCEParams();
      const params2 = oauthClient.generatePKCEParams();

      expect(params1.codeVerifier).not.toBe(params2.codeVerifier);
      expect(params1.codeChallenge).not.toBe(params2.codeChallenge);
      expect(params1.state).not.toBe(params2.state);
    });
  });

  describe('Authorization Flow', () => {
    /* Preconditions: OAuth client configured
       Action: Call startAuthFlow
       Assertions: Opens browser with authorization URL containing all required parameters (production only)
       Requirements: google-oauth-auth.1.5, google-oauth-auth.16.1 */
    it('should NOT open browser in test environment', async () => {
      await oauthClient.startAuthFlow();

      // In test environment, browser should NOT be opened
      expect(shell.openExternal).not.toHaveBeenCalled();

      // But PKCE parameters should still be generated
      expect((oauthClient as any).pkceStorage).toBeDefined();
      expect((oauthClient as any).pkceStorage.state).toBeDefined();
      expect((oauthClient as any).pkceStorage.codeVerifier).toBeDefined();
    });

    /* Preconditions: OAuth client configured, shell.openExternal throws error
       Action: Call startAuthFlow
       Assertions: Throws error with descriptive message
       Requirements: google-oauth-auth.1.5 */
    it('should handle error when opening browser fails', async () => {
      // Temporarily set NODE_ENV to production to test browser opening
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      (shell.openExternal as jest.Mock).mockRejectedValueOnce(new Error('Browser not available'));

      await expect(oauthClient.startAuthFlow()).rejects.toThrow(
        'Failed to start auth flow: Browser not available'
      );

      // Restore NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Deep Link Handling', () => {
    /* Preconditions: Valid deep link URL with code and state
       Action: Call handleDeepLink with valid URL
       Assertions: Extracts code and state parameters correctly
       Requirements: google-oauth-auth.2.2 */
    it('should extract parameters from deep link URL', async () => {
      // Start auth flow to set up PKCE storage
      await oauthClient.startAuthFlow();

      // Read state directly from pkceStorage (browser not opened in test env)
      const state = (oauthClient as any).pkceStorage.state;

      // Mock successful token exchange
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const deepLinkUrl = `clerkly://oauth/callback?code=test-code&state=${state}`;
      const result = await oauthClient.handleDeepLink(deepLinkUrl);

      expect(result.authorized).toBe(true);
    });

    /* Preconditions: Deep link with mismatched state parameter
       Action: Call handleDeepLink with invalid state
       Assertions: Rejects request and returns csrf_attack_detected error
       Requirements: google-oauth-auth.2.3, google-oauth-auth.9.4 */
    it('should reject request with mismatched state', async () => {
      await oauthClient.startAuthFlow();

      const deepLinkUrl = 'clerkly://oauth/callback?code=test-code&state=wrong-state';
      const result = await oauthClient.handleDeepLink(deepLinkUrl);

      expect(result.authorized).toBe(false);
      expect(result.error).toBe('csrf_attack_detected');
    });

    /* Preconditions: Deep link with error parameter
       Action: Call handleDeepLink with error
       Assertions: Returns error from URL
       Requirements: google-oauth-auth.2.2 */
    it('should handle error in deep link', async () => {
      const deepLinkUrl = 'clerkly://oauth/callback?error=access_denied';
      const result = await oauthClient.handleDeepLink(deepLinkUrl);

      expect(result.authorized).toBe(false);
      expect(result.error).toBe('access_denied');
    });

    /* Preconditions: Deep link with non-access_denied error parameter
       Action: Call handleDeepLink with error=server_error
       Assertions: Returns error from URL
       Requirements: google-oauth-auth.2.2 */
    it('should handle non-access_denied error in deep link', async () => {
      const deepLinkUrl = 'clerkly://oauth/callback?error=server_error';
      const result = await oauthClient.handleDeepLink(deepLinkUrl);

      expect(result.authorized).toBe(false);
      expect(result.error).toBe('server_error');
    });

    /* Preconditions: Deep link with empty code parameter
       Action: Call handleDeepLink with empty code
       Assertions: Returns invalid_request error
       Requirements: google-oauth-auth.2.2 */
    it('should reject deep link with empty code', async () => {
      await oauthClient.startAuthFlow();
      const state = (oauthClient as any).pkceStorage.state;

      const deepLinkUrl = `clerkly://oauth/callback?code=&state=${state}`;
      const result = await oauthClient.handleDeepLink(deepLinkUrl);

      expect(result.authorized).toBe(false);
      expect(result.error).toBe('invalid_request');
    });

    /* Preconditions: startAuthFlow not called, no pkceStorage
       Action: Call handleDeepLink with valid-looking code and state
       Assertions: Returns csrf_attack_detected
       Requirements: google-oauth-auth.2.3 */
    it('should reject when no auth flow was started', async () => {
      const deepLinkUrl = 'clerkly://oauth/callback?code=some-code&state=some-state';
      const result = await oauthClient.handleDeepLink(deepLinkUrl);

      expect(result.authorized).toBe(false);
      expect(result.error).toBe('csrf_attack_detected');
    });

    /* Preconditions: userManager set, UserInfo API returns 401
       Action: Call handleDeepLink with valid code+state
       Assertions: Returns profile_fetch_failed
       Requirements: google-oauth-auth.3.7 */
    it('should return profile_fetch_failed when UserInfo API returns error', async () => {
      const mockUserManager = {
        fetchProfile: jest.fn().mockResolvedValue(null),
        findOrCreateUser: jest.fn(),
        setCurrentUser: jest.fn(),
        updateProfileAfterTokenRefresh: jest.fn().mockResolvedValue(undefined),
        clearSession: jest.fn(),
      };
      oauthClient.setUserManager(mockUserManager);

      await oauthClient.startAuthFlow();
      const state = (oauthClient as any).pkceStorage.state;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });

      const deepLinkUrl = `clerkly://oauth/callback?code=test-code&state=${state}`;
      const result = await oauthClient.handleDeepLink(deepLinkUrl);

      expect(result.authorized).toBe(false);
      expect(result.error).toBe('profile_fetch_failed');
    });

    /* Preconditions: userManager set, profile has null name
       Action: Call handleDeepLink with valid code+state
       Assertions: Authorized successfully with 'User' name fallback
       Requirements: google-oauth-auth.3.8 */
    it('should use User fallback when profile name is null', async () => {
      const mockUser = { userId: 'user-123', email: 'test@example.com', name: null };
      const mockUserManager = {
        fetchProfile: jest.fn().mockResolvedValue(mockUser),
        findOrCreateUser: jest.fn().mockReturnValue(mockUser),
        setCurrentUser: jest.fn(),
        updateProfileAfterTokenRefresh: jest.fn().mockResolvedValue(undefined),
        clearSession: jest.fn(),
      };
      oauthClient.setUserManager(mockUserManager);

      await oauthClient.startAuthFlow();
      const state = (oauthClient as any).pkceStorage.state;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'user-123', email: 'test@example.com', name: null }),
      });

      const deepLinkUrl = `clerkly://oauth/callback?code=test-code&state=${state}`;
      const result = await oauthClient.handleDeepLink(deepLinkUrl);

      expect(result.authorized).toBe(true);
    });
  });

  describe('Token Exchange', () => {
    /* Preconditions: Valid authorization code and code verifier
       Action: Exchange code for tokens
       Assertions: Request includes all required parameters including client_secret
       Requirements: google-oauth-auth.3.1, google-oauth-auth.3.2 */
    it('should form token exchange request with client_secret', async () => {
      await oauthClient.startAuthFlow();

      // Read state directly from pkceStorage
      const state = (oauthClient as any).pkceStorage.state;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const deepLinkUrl = `clerkly://oauth/callback?code=test-code&state=${state}`;
      await oauthClient.handleDeepLink(deepLinkUrl);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = fetchCall.body.toString();
      expect(body).toContain('code=test-code');
      expect(body).toContain(`client_id=${testClientId}`);
      expect(body).toContain(`client_secret=${testConfig.clientSecret}`);
      expect(body).toContain('grant_type=authorization_code');
      expect(body).toContain('code_verifier=');
    });

    /* Preconditions: Successful token response from Google
       Action: Parse token response
       Assertions: Extracts all token fields correctly
       Requirements: google-oauth-auth.3.3 */
    it('should parse token response correctly', async () => {
      await oauthClient.startAuthFlow();

      // Read state directly from pkceStorage
      const state = (oauthClient as any).pkceStorage.state;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const deepLinkUrl = `clerkly://oauth/callback?code=test-code&state=${state}`;
      await oauthClient.handleDeepLink(deepLinkUrl);

      const tokens = await tokenStorage.loadTokens();
      expect(tokens).not.toBeNull();
      expect(tokens?.accessToken).toBe('test-access-token');
      expect(tokens?.refreshToken).toBe('test-refresh-token');
      expect(tokens?.tokenType).toBe('Bearer');
    });

    /* Preconditions: Token response with expires_in value
       Action: Calculate expiration timestamp
       Assertions: expiresAt equals current time plus expires_in seconds
       Requirements: google-oauth-auth.3.5 */
    it('should calculate expiration timestamp correctly', async () => {
      await oauthClient.startAuthFlow();

      // Read state directly from pkceStorage
      const state = (oauthClient as any).pkceStorage.state;

      const beforeTime = Date.now();
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const deepLinkUrl = `clerkly://oauth/callback?code=test-code&state=${state}`;
      await oauthClient.handleDeepLink(deepLinkUrl);
      const afterTime = Date.now();

      const tokens = await tokenStorage.loadTokens();
      expect(tokens).not.toBeNull();
      expect(tokens!.expiresAt).toBeGreaterThanOrEqual(beforeTime + 3600 * 1000);
      expect(tokens!.expiresAt).toBeLessThanOrEqual(afterTime + 3600 * 1000);
    });

    /* Preconditions: Network error during token exchange
       Action: Attempt token exchange with network failure
       Assertions: Returns network_error
       Requirements: google-oauth-auth.9.2 */
    it('should handle network errors during token exchange', async () => {
      await oauthClient.startAuthFlow();

      // Read state directly from pkceStorage
      const state = (oauthClient as any).pkceStorage.state;

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('fetch failed'));

      const deepLinkUrl = `clerkly://oauth/callback?code=test-code&state=${state}`;
      const result = await oauthClient.handleDeepLink(deepLinkUrl);

      expect(result.authorized).toBe(false);
      expect(result.error).toContain('network_error');
    });
  });

  describe('Authorization Status', () => {
    /* Preconditions: No tokens in storage
       Action: Call getAuthStatus
       Assertions: Returns not authorized
       Requirements: google-oauth-auth.5.1, google-oauth-auth.5.2 */
    it('should return not authorized when no tokens exist', async () => {
      const status = await oauthClient.getAuthStatus();
      expect(status.authorized).toBe(false);
    });

    /* Preconditions: Valid non-expired access token in storage
       Action: Call getAuthStatus
       Assertions: Returns authorized
       Requirements: google-oauth-auth.5.3 */
    it('should return authorized for valid non-expired token', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer',
      });

      const status = await oauthClient.getAuthStatus();
      expect(status.authorized).toBe(true);
    });

    /* Preconditions: Expired access token with valid refresh token
       Action: Call getAuthStatus
       Assertions: Attempts to refresh token
       Requirements: google-oauth-auth.5.4 */
    it('should attempt refresh for expired token', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'expired-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const status = await oauthClient.getAuthStatus();
      expect(status.authorized).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('Token Refresh', () => {
    /* Preconditions: Valid refresh token in storage
       Action: Call refreshAccessToken
       Assertions: Request includes refresh_token with client_secret
       Requirements: google-oauth-auth.6.1, google-oauth-auth.6.2 */
    it('should form refresh request with client_secret', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'old-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      await oauthClient.refreshAccessToken();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({
          method: 'POST',
        })
      );

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
      const body = fetchCall.body.toString();
      expect(body).toContain('refresh_token=test-refresh-token');
      expect(body).toContain(`client_secret=${testConfig.clientSecret}`);
      expect(body).toContain('grant_type=refresh_token');
    });

    /* Preconditions: Successful refresh response
       Action: Refresh access token
       Assertions: Updates access_token and expires_at in storage
       Requirements: google-oauth-auth.6.3 */
    it('should update access token after successful refresh', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'old-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      const result = await oauthClient.refreshAccessToken();
      expect(result).toBe(true);

      const tokens = await tokenStorage.loadTokens();
      expect(tokens?.accessToken).toBe('new-access-token');
      expect(tokens?.expiresAt).toBeGreaterThan(Date.now());
    });

    /* Preconditions: Refresh response includes new refresh token
       Action: Refresh access token
       Assertions: Updates both access_token and refresh_token
       Requirements: google-oauth-auth.6.4 */
    it('should update refresh token if provided', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      await oauthClient.refreshAccessToken();

      const tokens = await tokenStorage.loadTokens();
      expect(tokens?.refreshToken).toBe('new-refresh-token');
    });

    /* Preconditions: Profile manager is set, refresh token succeeds
       Action: Refresh access token
       Assertions: Profile manager's updateProfileAfterTokenRefresh is called
       Requirements: account-profile.1.5 */
    it('should trigger profile update after successful token refresh', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'old-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      // Create mock profile manager
      const mockUserManager = {
        fetchProfile: jest.fn().mockResolvedValue(null),
        findOrCreateUser: jest.fn(),
        setCurrentUser: jest.fn(),
        updateProfileAfterTokenRefresh: jest.fn().mockResolvedValue(undefined),
        clearSession: jest.fn(),
      };

      // Set profile manager
      oauthClient.setUserManager(mockUserManager);

      // Refresh token
      const result = await oauthClient.refreshAccessToken();

      expect(result).toBe(true);
      expect(mockUserManager.updateProfileAfterTokenRefresh).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: Profile manager is not set, refresh token succeeds
       Action: Refresh access token
       Assertions: No error thrown, refresh succeeds
       Requirements: account-profile.1.5 */
    it('should not fail when profile manager is not set', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'old-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      // Don't set profile manager
      const result = await oauthClient.refreshAccessToken();

      expect(result).toBe(true);
    });

    /* Preconditions: Refresh returns invalid_grant error
       Action: Attempt to refresh token
       Assertions: Clears all tokens and returns false
       Requirements: google-oauth-auth.6.5 */
    it('should clear tokens on invalid_grant error', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'old-access-token',
        refreshToken: 'invalid-refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
        }),
      });

      const result = await oauthClient.refreshAccessToken();
      expect(result).toBe(false);

      const tokens = await tokenStorage.loadTokens();
      expect(tokens).toBeNull();
    });

    /* Preconditions: No tokens in storage
       Action: Call refreshAccessToken
       Assertions: Returns false immediately
       Requirements: google-oauth-auth.6.1 */
    it('should return false when no tokens in storage', async () => {
      const result = await oauthClient.refreshAccessToken();
      expect(result).toBe(false);
    });

    /* Preconditions: Tokens exist but no refresh token
       Action: Call refreshAccessToken
       Assertions: Returns false
       Requirements: google-oauth-auth.6.1 */
    it('should return false when no refresh token', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'access-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      const result = await oauthClient.refreshAccessToken();
      expect(result).toBe(false);
    });

    /* Preconditions: Valid refresh token, server returns non-invalid_grant error
       Action: Call refreshAccessToken
       Assertions: Returns false
       Requirements: google-oauth-auth.6.5 */
    it('should return false on non-invalid_grant server error', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'old-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'server_error' }),
      });

      const result = await oauthClient.refreshAccessToken();
      expect(result).toBe(false);
    });

    /* Preconditions: Valid refresh token, fetch throws
       Action: Call refreshAccessToken
       Assertions: Returns false
       Requirements: google-oauth-auth.6.5 */
    it('should return false when fetch throws during refresh', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'old-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() - 1000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network failure'));

      const result = await oauthClient.refreshAccessToken();
      expect(result).toBe(false);
    });
  });

  describe('Logout', () => {
    /* Preconditions: Valid tokens in storage
       Action: Call logout
       Assertions: Sends revoke request to Google
       Requirements: google-oauth-auth.7.1 */
    it('should send revoke request to Google', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await oauthClient.logout();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/revoke',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    /* Preconditions: Valid tokens in storage, revoke request fails
       Action: Call logout
       Assertions: Deletes local tokens regardless of revoke result
       Requirements: google-oauth-auth.7.2 */
    it('should delete local tokens even if revoke fails', async () => {
      await tokenStorage.saveTokens({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await oauthClient.logout();

      const tokens = await tokenStorage.loadTokens();
      expect(tokens).toBeNull();
    });

    /* Preconditions: No tokens in storage
       Action: Call logout
       Assertions: Completes without errors
       Requirements: google-oauth-auth.7.2 */
    it('should handle logout when no tokens exist', async () => {
      await expect(oauthClient.logout()).resolves.not.toThrow();
    });

    /* Preconditions: Tokens exist, userManager set
       Action: Call logout
       Assertions: userManager.clearSession called
       Requirements: google-oauth-auth.7.3, navigation.1.4 */
    it('should call userManager.clearSession on logout', async () => {
      const mockUserManager = {
        fetchProfile: jest.fn(),
        findOrCreateUser: jest.fn(),
        setCurrentUser: jest.fn(),
        updateProfileAfterTokenRefresh: jest.fn(),
        clearSession: jest.fn(),
      };
      oauthClient.setUserManager(mockUserManager);

      await tokenStorage.saveTokens({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      await oauthClient.logout();

      expect(mockUserManager.clearSession).toHaveBeenCalled();
    });

    /* Preconditions: tokenStorage.deleteTokens throws
       Action: Call logout
       Assertions: Error rethrown
       Requirements: google-oauth-auth.7.4 */
    it('should throw when deleteTokens fails', async () => {
      jest.spyOn(tokenStorage, 'deleteTokens').mockRejectedValueOnce(new Error('Storage error'));

      await expect(oauthClient.logout()).rejects.toThrow('Logout failed: Storage error');
    });
  });

  describe('setAuthWindowManager', () => {
    /* Preconditions: None
       Action: Call setAuthWindowManager
       Assertions: No error thrown
       Requirements: google-oauth-auth.7.1 */
    it('should set auth window manager without error', () => {
      const mockAuthWindowManager = {};
      expect(() => oauthClient.setAuthWindowManager(mockAuthWindowManager)).not.toThrow();
    });
  });
});
