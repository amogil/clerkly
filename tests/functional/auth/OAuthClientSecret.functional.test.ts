// Requirements: google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.6.1, google-oauth-auth.6.2, google-oauth-auth.10.1, google-oauth-auth.10.2

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DataManager } from '../../../src/main/DataManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { getOAuthConfig, OAUTH_CONFIG } from '../../../src/main/auth/OAuthConfig';

// Mock Electron modules
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/test-oauth'),
    setAsDefaultProtocolClient: jest.fn(),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn(() => Promise.resolve()),
    loadURL: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    once: jest.fn(),
    webContents: {
      send: jest.fn(),
      on: jest.fn(),
    },
    isMinimized: jest.fn(() => false),
    restore: jest.fn(),
    focus: jest.fn(),
    show: jest.fn(),
    close: jest.fn(),
    isDestroyed: jest.fn(() => false),
    getBounds: jest.fn(() => ({ x: 100, y: 100, width: 1200, height: 800 })),
    setBounds: jest.fn(),
    isMaximized: jest.fn(() => false),
    maximize: jest.fn(),
    unmaximize: jest.fn(),
  })),
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(() => Promise.resolve()),
  },
  screen: {
    getPrimaryDisplay: jest.fn(() => ({
      workAreaSize: { width: 1920, height: 1080 },
    })),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('OAuth Client Secret Functional Tests', () => {
  let testDbPath: string;
  let dataManager: DataManager;
  let tokenStorage: TokenStorageManager;
  let oauthClient: OAuthClientManager;
  const testConfig = getOAuthConfig('test-client-id.apps.googleusercontent.com');

  beforeEach(() => {
    // Create unique test database path
    testDbPath = path.join(os.tmpdir(), `test-oauth-secret-${Date.now()}-${Math.random()}`);

    // Initialize components
    dataManager = new DataManager(testDbPath);
    dataManager.initialize();
    tokenStorage = new TokenStorageManager(dataManager);
    oauthClient = new OAuthClientManager(testConfig, tokenStorage);

    jest.clearAllMocks();
  });

  afterEach(() => {
    dataManager.close();

    // Cleanup test database
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  /* Preconditions: OAuth flow initiated, authorization code received
     Action: Exchange authorization code for tokens
     Assertions: Request MUST include client_secret parameter
     Requirements: google-oauth-auth.3.1, google-oauth-auth.3.2 */
  it('should include client_secret in token exchange request', async () => {
    // Start auth flow
    await oauthClient.startAuthFlow();

    const electron = await import('electron');
    const authUrl = (electron.shell.openExternal as jest.Mock).mock.calls[0][0];
    const state = new URL(authUrl).searchParams.get('state');

    // Mock token exchange response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    // Handle deep link callback
    await oauthClient.handleDeepLink(
      `${OAUTH_CONFIG.redirectUri}?code=test-auth-code&state=${state}`
    );

    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
    );

    // Verify request body includes client_secret
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = fetchCall.body.toString();
    expect(body).toContain('client_secret=');
    expect(body).toContain(testConfig.clientSecret);
    expect(body).toContain('code=test-auth-code');
    expect(body).toContain('grant_type=authorization_code');
  });

  /* Preconditions: Access token expired, refresh token available
     Action: Refresh access token
     Assertions: Request MUST include client_secret parameter
     Requirements: google-oauth-auth.6.1, google-oauth-auth.6.2 */
  it('should include client_secret in token refresh request', async () => {
    // Save expired token
    await tokenStorage.saveTokens({
      accessToken: 'expired-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() - 1000,
      tokenType: 'Bearer',
    });

    // Mock refresh response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    // Trigger refresh
    await oauthClient.refreshAccessToken();

    // Verify fetch was called
    expect(global.fetch).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
      })
    );

    // Verify request body includes client_secret
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = fetchCall.body.toString();
    expect(body).toContain('client_secret=');
    expect(body).toContain(testConfig.clientSecret);
    expect(body).toContain('refresh_token=valid-refresh-token');
    expect(body).toContain('grant_type=refresh_token');
  });

  /* Preconditions: OAuth configuration loaded
     Action: Check OAuth configuration
     Assertions: Configuration MUST include client_secret
     Requirements: google-oauth-auth.10.1 */
  it('should have client_secret in OAuth configuration', () => {
    expect(testConfig.clientSecret).toBeDefined();
    expect(testConfig.clientSecret).toBeTruthy();
    expect(typeof testConfig.clientSecret).toBe('string');
    expect(testConfig.clientSecret.length).toBeGreaterThan(0);
  });

  /* Preconditions: OAuth configuration loaded
     Action: Check redirect URI format
     Assertions: Redirect URI MUST use reverse client ID format
     Requirements: google-oauth-auth.10.2 */
  it('should use reverse client ID format for redirect URI', () => {
    expect(testConfig.redirectUri).toMatch(/^com\.googleusercontent\.apps\./);
    expect(testConfig.redirectUri).toContain(':/oauth2redirect');
    expect(testConfig.redirectUri).not.toContain('clerkly://');
  });

  /* Preconditions: OAuth configuration loaded
     Action: Verify OAUTH_CONFIG constant
     Assertions: OAUTH_CONFIG MUST have client_secret and correct redirect URI
     Requirements: google-oauth-auth.10.1, google-oauth-auth.10.2 */
  it('should have client_secret and correct redirect URI in OAUTH_CONFIG', () => {
    expect(OAUTH_CONFIG.clientSecret).toBeDefined();
    expect(OAUTH_CONFIG.clientSecret).toBeTruthy();
    expect(OAUTH_CONFIG.redirectUri).toMatch(/^com\.googleusercontent\.apps\./);
    expect(OAUTH_CONFIG.redirectUri).toContain(':/oauth2redirect');
  });

  /* Preconditions: OAuth flow initiated
     Action: Start auth flow and check authorization URL
     Assertions: Authorization URL MUST include access_type=offline and prompt=consent
     Requirements: google-oauth-auth.10.7 */
  it('should include access_type=offline and prompt=consent in authorization URL', async () => {
    const electron = await import('electron');

    // Start auth flow
    await oauthClient.startAuthFlow();

    // Verify browser was opened with correct URL
    expect(electron.shell.openExternal).toHaveBeenCalled();

    const authUrl = (electron.shell.openExternal as jest.Mock).mock.calls[0][0];
    expect(authUrl).toContain('access_type=offline');
    expect(authUrl).toContain('prompt=consent');
  });

  /* Preconditions: OAuth flow completes successfully with client_secret
     Action: Complete full OAuth flow from start to token storage
     Assertions: Tokens should be saved correctly
     Requirements: google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.4.1 */
  it('should complete full OAuth flow with client_secret', async () => {
    const electron = await import('electron');

    // Start auth flow
    await oauthClient.startAuthFlow();

    const authUrl = (electron.shell.openExternal as jest.Mock).mock.calls[0][0];
    const state = new URL(authUrl).searchParams.get('state');

    // Mock token exchange response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'full-flow-access-token',
        refresh_token: 'full-flow-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    // Handle deep link callback
    const result = await oauthClient.handleDeepLink(
      `${OAUTH_CONFIG.redirectUri}?code=full-flow-code&state=${state}`
    );

    // Verify authorization succeeded
    expect(result.authorized).toBe(true);

    // Verify client_secret was included in request
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
    const body = fetchCall.body.toString();
    expect(body).toContain('client_secret=');

    // Verify tokens were saved
    const tokens = await tokenStorage.loadTokens();
    expect(tokens).not.toBeNull();
    expect(tokens?.accessToken).toBe('full-flow-access-token');
    expect(tokens?.refreshToken).toBe('full-flow-refresh-token');
  });

  /* Preconditions: Token exchange fails due to missing client_secret
     Action: Attempt token exchange without client_secret (simulated)
     Assertions: Should handle error gracefully
     Requirements: google-oauth-auth.3.2, google-oauth-auth.9.3 */
  it('should handle token exchange error when client_secret is invalid', async () => {
    // Start auth flow
    await oauthClient.startAuthFlow();

    const electron = await import('electron');
    const authUrl = (electron.shell.openExternal as jest.Mock).mock.calls[0][0];
    const state = new URL(authUrl).searchParams.get('state');

    // Mock error response (invalid client_secret)
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'invalid_client',
        error_description: 'The OAuth client was not found.',
      }),
    });

    // Handle deep link callback
    const result = await oauthClient.handleDeepLink(
      `${OAUTH_CONFIG.redirectUri}?code=test-code&state=${state}`
    );

    // Verify error was handled
    expect(result.authorized).toBe(false);
    expect(result.error).toBeDefined();

    // Verify no tokens were saved
    const tokens = await tokenStorage.loadTokens();
    expect(tokens).toBeNull();
  });
});
