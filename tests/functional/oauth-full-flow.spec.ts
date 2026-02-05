// Requirements: google-oauth-auth.11, google-oauth-auth.14, testing.3.1, testing.3.2, testing.3.6, testing.3.8, testing.3.9

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  setupTestTokens,
  clearTestTokens,
  getTokenStatus,
} from './helpers/electron';
import { MockOAuthServer } from './helpers/mock-oauth-server';

/**
 * Full OAuth Flow Functional Tests
 *
 * These tests verify the complete OAuth authentication flow using:
 * - Real Electron application (no mocks)
 * - Mock OAuth server (mocks Google responses)
 * - Test IPC handlers (for token setup/verification)
 *
 * Requirements: testing.3.1 - Use real Electron
 * Requirements: testing.3.2 - Do NOT mock Electron API
 * Requirements: testing.3.6 - Show real windows on screen
 * Requirements: testing.3.8 - Test IPC handlers
 * Requirements: testing.3.9 - Mock external services
 */

test.describe('Full OAuth Flow', () => {
  let context: ElectronTestContext;
  let mockServer: MockOAuthServer;

  test.beforeAll(async () => {
    console.log('\n⚠️  WARNING: These tests will show real Electron windows on your screen!\n');

    // Start mock OAuth server
    mockServer = new MockOAuthServer({
      port: 8888,
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
    });

    await mockServer.start();
  });

  test.afterAll(async () => {
    // Stop mock OAuth server
    if (mockServer) {
      await mockServer.stop();
    }
  });

  test.afterEach(async () => {
    if (context) {
      await closeElectron(context);
    }
  });

  /* Preconditions: Application not running, no saved tokens
     Action: Launch application
     Assertions: Login screen is displayed, no tokens present
     Requirements: google-oauth-auth.14.1, google-oauth-auth.14.2 */
  test('should show login screen when no tokens exist', async () => {
    // Launch the application
    context = await launchElectron();

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Verify no tokens exist
    const tokenStatus = await getTokenStatus(context.window);
    expect(tokenStatus.hasTokens).toBe(false);

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/oauth-no-tokens.png' });
  });

  /* Preconditions: Application has valid tokens saved
     Action: Launch application
     Assertions: Main application screen is displayed (not login screen)
     Requirements: google-oauth-auth.14.1, google-oauth-auth.14.3 */
  test('should show main app when valid tokens exist', async () => {
    // Launch the application
    context = await launchElectron();

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Setup test tokens using IPC
    await setupTestTokens(context.window, {
      accessToken: 'test_access_token_valid',
      refreshToken: 'test_refresh_token_valid',
      expiresIn: 3600, // 1 hour
      tokenType: 'Bearer',
    });

    // Verify tokens were saved
    const tokenStatus = await getTokenStatus(context.window);
    expect(tokenStatus.hasTokens).toBe(true);

    // Reload the app to trigger auth check
    await context.window.reload();
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is NOT displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    const isLoginVisible = await loginButton.isVisible().catch(() => false);
    expect(isLoginVisible).toBe(false);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/oauth-with-tokens.png' });
  });

  /* Preconditions: Application running with login screen
     Action: Setup tokens via IPC, reload app
     Assertions: App transitions from login to main screen
     Requirements: google-oauth-auth.11.4, google-oauth-auth.14.4 */
  test('should transition from login to main app after token setup', async () => {
    // Launch the application
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    // Setup tokens via IPC (simulating successful OAuth)
    await setupTestTokens(context.window, {
      accessToken: 'test_access_token_new',
      refreshToken: 'test_refresh_token_new',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    // Verify tokens were saved
    const tokenStatus = await getTokenStatus(context.window);
    expect(tokenStatus.hasTokens).toBe(true);

    // Reload to trigger auth check
    await context.window.reload();
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is no longer visible
    const isLoginVisible = await loginButton.isVisible().catch(() => false);
    expect(isLoginVisible).toBe(false);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/oauth-transition.png' });
  });

  /* Preconditions: Application running with valid tokens
     Action: Clear tokens via IPC, reload app
     Assertions: App transitions from main screen to login
     Requirements: google-oauth-auth.7.2, google-oauth-auth.14.1 */
  test('should transition from main app to login after logout', async () => {
    // Launch the application
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Setup tokens first
    await setupTestTokens(context.window);

    // Reload to show main app
    await context.window.reload();
    await context.window.waitForLoadState('domcontentloaded');

    // Clear tokens (simulating logout)
    await clearTestTokens(context.window);

    // Verify tokens were cleared
    const tokenStatus = await getTokenStatus(context.window);
    expect(tokenStatus.hasTokens).toBe(false);

    // Reload to trigger auth check
    await context.window.reload();
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/oauth-after-logout.png' });
  });

  /* Preconditions: Application running with expired tokens
     Action: Setup expired tokens, reload app
     Assertions: Login screen is displayed (expired tokens treated as no tokens)
     Requirements: google-oauth-auth.5.3, google-oauth-auth.5.4 */
  test('should show login screen when tokens are expired', async () => {
    // Launch the application
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Setup expired tokens (negative expiresIn means already expired)
    await setupTestTokens(context.window, {
      accessToken: 'test_access_token_expired',
      refreshToken: 'test_refresh_token_expired',
      expiresIn: -3600, // Expired 1 hour ago
      tokenType: 'Bearer',
    });

    // Reload to trigger auth check
    await context.window.reload();
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is displayed (expired tokens = no auth)
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/oauth-expired-tokens.png' });
  });

  /* Preconditions: Application running, tokens exist
     Action: Verify token persistence across app restarts
     Assertions: Tokens survive app restart
     Requirements: google-oauth-auth.4.3, google-oauth-auth.14.3 */
  test('should persist tokens across app restarts', async () => {
    // First launch
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Setup tokens
    await setupTestTokens(context.window, {
      accessToken: 'test_access_token_persist',
      refreshToken: 'test_refresh_token_persist',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    // Verify tokens exist
    let tokenStatus = await getTokenStatus(context.window);
    expect(tokenStatus.hasTokens).toBe(true);

    // Close app
    const testDataPath = context.testDataPath;
    await context.app.close();

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Relaunch with same data path
    context = await launchElectron(testDataPath);
    await context.window.waitForLoadState('domcontentloaded');

    // Verify tokens still exist
    tokenStatus = await getTokenStatus(context.window);
    expect(tokenStatus.hasTokens).toBe(true);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/oauth-tokens-persisted.png' });
  });
});
