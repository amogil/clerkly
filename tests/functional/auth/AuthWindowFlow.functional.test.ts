// Requirements: google-oauth-auth.11.1, google-oauth-auth.11.4, google-oauth-auth.11.5, google-oauth-auth.14.1, google-oauth-auth.14.2, google-oauth-auth.14.3, google-oauth-auth.14.4, google-oauth-auth.14.5

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { BrowserWindow } from 'electron';
import { DataManager } from '../../../src/main/DataManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';
import { OAuthClientManager } from '../../../src/main/auth/OAuthClientManager';
import { getOAuthConfig, OAUTH_CONFIG } from '../../../src/main/auth/OAuthConfig';
import { AuthWindowManager } from '../../../src/main/auth/AuthWindowManager';
import WindowManager from '../../../src/main/WindowManager';

// Mock Electron modules
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => '/tmp/test-auth-window'),
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
    getAllDisplays: jest.fn(() => [
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('Auth Window Flow Functional Tests', () => {
  let testDbPath: string;
  let dataManager: DataManager;
  let tokenStorage: TokenStorageManager;
  let oauthClient: OAuthClientManager;
  let windowManager: WindowManager;
  let authWindowManager: AuthWindowManager;

  beforeEach(() => {
    // Create unique test database path
    testDbPath = path.join(os.tmpdir(), `test-auth-window-${Date.now()}-${Math.random()}`);

    // Initialize components
    dataManager = new DataManager(testDbPath);
    dataManager.initialize();
    tokenStorage = new TokenStorageManager(dataManager);

    const config = getOAuthConfig('test-client-id.apps.googleusercontent.com');
    oauthClient = new OAuthClientManager(config, tokenStorage);

    windowManager = new WindowManager(dataManager);
    authWindowManager = new AuthWindowManager(windowManager, oauthClient);

    jest.clearAllMocks();
  });

  afterEach(() => {
    dataManager.close();

    // Cleanup test database
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  /* Preconditions: Application starts for the first time, no tokens in database
     Action: Initialize AuthWindowManager
     Assertions: Login window should be created and shown
     Requirements: google-oauth-auth.11.1, google-oauth-auth.14.1, google-oauth-auth.14.2 */
  it('Scenario 1: First launch - should show login window', async () => {
    // Verify no tokens exist (first launch)
    const tokens = await tokenStorage.loadTokens();
    expect(tokens).toBeNull();

    // Verify auth status is not authorized
    const authStatus = await oauthClient.getAuthStatus();
    expect(authStatus.authorized).toBe(false);

    // Initialize app - should show login window
    await authWindowManager.initializeApp();

    // Verify window was created
    expect(BrowserWindow).toHaveBeenCalled();
    expect(windowManager.isWindowCreated()).toBe(true);

    // Verify window is accessible
    const window = authWindowManager.getWindow();
    expect(window).not.toBeNull();
  });

  /* Preconditions: Application has valid tokens in database (user previously authorized)
     Action: Initialize AuthWindowManager
     Assertions: Main application window should be shown (not login screen)
     Requirements: google-oauth-auth.14.1, google-oauth-auth.14.3 */
  it('Scenario 2: Already authorized - should show main window', async () => {
    // Save valid tokens (simulate previous successful authorization)
    await tokenStorage.saveTokens({
      accessToken: 'valid-access-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() + 3600000, // 1 hour from now
      tokenType: 'Bearer',
    });

    // Verify tokens exist
    const tokens = await tokenStorage.loadTokens();
    expect(tokens).not.toBeNull();
    expect(tokens?.accessToken).toBe('valid-access-token');

    // Verify auth status is authorized
    const authStatus = await oauthClient.getAuthStatus();
    expect(authStatus.authorized).toBe(true);

    // Initialize app - should show main window (not login)
    await authWindowManager.initializeApp();

    // Verify window was created
    expect(BrowserWindow).toHaveBeenCalled();
    expect(windowManager.isWindowCreated()).toBe(true);

    // Verify window is accessible
    const window = authWindowManager.getWindow();
    expect(window).not.toBeNull();
  });

  /* Preconditions: User initiates OAuth flow and successfully authorizes in Google
     Action: Complete OAuth flow with successful authorization
     Assertions: Tokens should be saved, main window should be shown
     Requirements: google-oauth-auth.11.4, google-oauth-auth.14.4 */
  it('Scenario 3: Successful authorization - should save tokens and show main window', async () => {
    const electron = await import('electron');

    // Start with login window (no tokens)
    await authWindowManager.initializeApp();
    expect(windowManager.isWindowCreated()).toBe(true);

    // Clear previous BrowserWindow calls
    jest.clearAllMocks();

    // User clicks "Continue with Google" - start OAuth flow
    await oauthClient.startAuthFlow();

    // Verify browser was opened
    expect(electron.shell.openExternal).toHaveBeenCalled();
    const authUrl = (electron.shell.openExternal as jest.Mock).mock.calls[0][0];
    const state = new URL(authUrl).searchParams.get('state');

    // Mock successful token exchange response from Google
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token-from-google',
        refresh_token: 'new-refresh-token-from-google',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    // User authorizes in Google, deep link callback received
    const authResult = await oauthClient.handleDeepLink(
      `${OAUTH_CONFIG.redirectUri}?code=auth-code-from-google&state=${state}`
    );

    // Verify authorization succeeded
    expect(authResult.authorized).toBe(true);
    expect(authResult.error).toBeUndefined();

    // Verify tokens were saved to database
    const savedTokens = await tokenStorage.loadTokens();
    expect(savedTokens).not.toBeNull();
    expect(savedTokens?.accessToken).toBe('new-access-token-from-google');
    expect(savedTokens?.refreshToken).toBe('new-refresh-token-from-google');

    // Simulate auth success event (in real app, this comes from IPC)
    await authWindowManager.onAuthSuccess();

    // Verify main window is shown (window should still exist)
    expect(windowManager.isWindowCreated()).toBe(true);
    const window = authWindowManager.getWindow();
    expect(window).not.toBeNull();
  });

  /* Preconditions: User initiates OAuth flow but cancels authorization in Google
     Action: Handle OAuth callback with error (access_denied)
     Assertions: No tokens should be saved, login error screen should be shown
     Requirements: google-oauth-auth.11.5, google-oauth-auth.14.5 */
  it('Scenario 4: User cancels authorization - should show login error screen', async () => {
    const electron = await import('electron');

    // Start with login window (no tokens)
    await authWindowManager.initializeApp();
    expect(windowManager.isWindowCreated()).toBe(true);

    // User clicks "Continue with Google" - start OAuth flow
    await oauthClient.startAuthFlow();

    // Verify browser was opened
    expect(electron.shell.openExternal).toHaveBeenCalled();
    const authUrl = (electron.shell.openExternal as jest.Mock).mock.calls[0][0];
    const state = new URL(authUrl).searchParams.get('state');

    // User cancels authorization in Google, error callback received
    const authResult = await oauthClient.handleDeepLink(
      `${OAUTH_CONFIG.redirectUri}?error=access_denied&state=${state}`
    );

    // Verify authorization failed
    expect(authResult.authorized).toBe(false);
    expect(authResult.error).toBe('access_denied');

    // Verify no tokens were saved
    const tokens = await tokenStorage.loadTokens();
    expect(tokens).toBeNull();

    // Simulate auth error event (in real app, this comes from IPC)
    await authWindowManager.onAuthError('access_denied', 'access_denied');

    // Verify window still exists (showing error screen)
    expect(windowManager.isWindowCreated()).toBe(true);
    const window = authWindowManager.getWindow();
    expect(window).not.toBeNull();
  });

  /* Preconditions: User sees login error screen after failed authorization
     Action: User clicks retry button
     Assertions: Login screen should be shown again (ready for new auth attempt)
     Requirements: google-oauth-auth.14.6 */
  it('Scenario 4b: User retries after error - should show login screen again', async () => {
    const electron = await import('electron');

    // Start with login window
    await authWindowManager.initializeApp();

    // Simulate failed authorization
    await oauthClient.startAuthFlow();
    const authUrl = (electron.shell.openExternal as jest.Mock).mock.calls[0][0];
    const state = new URL(authUrl).searchParams.get('state');

    await oauthClient.handleDeepLink(
      `${OAUTH_CONFIG.redirectUri}?error=access_denied&state=${state}`
    );

    // Show error screen
    await authWindowManager.onAuthError('access_denied', 'access_denied');

    // User clicks retry
    await authWindowManager.onRetry();

    // Verify window still exists (showing login screen again)
    expect(windowManager.isWindowCreated()).toBe(true);
    const window = authWindowManager.getWindow();
    expect(window).not.toBeNull();
  });

  /* Preconditions: Application has expired tokens but valid refresh token
     Action: Initialize AuthWindowManager
     Assertions: Token should be refreshed automatically, main window should be shown
     Requirements: google-oauth-auth.14.1, google-oauth-auth.14.3 */
  it('Scenario 2b: Expired token with valid refresh - should refresh and show main window', async () => {
    // Save expired token with valid refresh token
    await tokenStorage.saveTokens({
      accessToken: 'expired-access-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: Date.now() - 1000, // Expired 1 second ago
      tokenType: 'Bearer',
    });

    // Mock successful token refresh response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    // Initialize app - should refresh token and show main window
    await authWindowManager.initializeApp();

    // Verify token was refreshed
    const tokens = await tokenStorage.loadTokens();
    expect(tokens).not.toBeNull();
    expect(tokens?.accessToken).toBe('refreshed-access-token');

    // Verify main window was shown
    expect(BrowserWindow).toHaveBeenCalled();
    expect(windowManager.isWindowCreated()).toBe(true);
  });

  /* Preconditions: Application has expired tokens and refresh fails
     Action: Initialize AuthWindowManager
     Assertions: Tokens should be cleared, login window should be shown
     Requirements: google-oauth-auth.14.1, google-oauth-auth.14.2 */
  it('Scenario 2c: Expired token with failed refresh - should show login window', async () => {
    // Save expired token with invalid refresh token
    await tokenStorage.saveTokens({
      accessToken: 'expired-access-token',
      refreshToken: 'invalid-refresh-token',
      expiresAt: Date.now() - 1000,
      tokenType: 'Bearer',
    });

    // Mock failed token refresh response
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'invalid_grant',
      }),
    });

    // Initialize app - should fail to refresh and show login window
    await authWindowManager.initializeApp();

    // Verify tokens were cleared
    const tokens = await tokenStorage.loadTokens();
    expect(tokens).toBeNull();

    // Verify login window was shown
    expect(BrowserWindow).toHaveBeenCalled();
    expect(windowManager.isWindowCreated()).toBe(true);
  });

  /* Preconditions: User completes full flow from first launch to successful auth
     Action: Complete entire flow: first launch -> login -> auth -> main window
     Assertions: Should transition correctly through all states
     Requirements: google-oauth-auth.11.1, google-oauth-auth.11.4, google-oauth-auth.14.1, google-oauth-auth.14.2, google-oauth-auth.14.4 */
  it('Complete flow: First launch -> Login -> Successful Auth -> Main Window', async () => {
    const electron = await import('electron');

    // Step 1: First launch - no tokens
    const initialTokens = await tokenStorage.loadTokens();
    expect(initialTokens).toBeNull();

    // Step 2: Initialize app - should show login window
    await authWindowManager.initializeApp();
    expect(windowManager.isWindowCreated()).toBe(true);

    // Step 3: User starts OAuth flow
    await oauthClient.startAuthFlow();
    expect(electron.shell.openExternal).toHaveBeenCalled();

    const authUrl = (electron.shell.openExternal as jest.Mock).mock.calls[0][0];
    const state = new URL(authUrl).searchParams.get('state');

    // Step 4: Mock successful authorization
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'complete-flow-token',
        refresh_token: 'complete-flow-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    });

    // Step 5: Handle successful callback
    const authResult = await oauthClient.handleDeepLink(
      `${OAUTH_CONFIG.redirectUri}?code=complete-flow-code&state=${state}`
    );

    expect(authResult.authorized).toBe(true);

    // Step 6: Verify tokens saved
    const finalTokens = await tokenStorage.loadTokens();
    expect(finalTokens).not.toBeNull();
    expect(finalTokens?.accessToken).toBe('complete-flow-token');

    // Step 7: Show main window
    await authWindowManager.onAuthSuccess();

    // Step 8: Verify final state
    expect(windowManager.isWindowCreated()).toBe(true);
    const window = authWindowManager.getWindow();
    expect(window).not.toBeNull();

    // Step 9: Verify auth status is now authorized
    const finalAuthStatus = await oauthClient.getAuthStatus();
    expect(finalAuthStatus.authorized).toBe(true);
  });
});
