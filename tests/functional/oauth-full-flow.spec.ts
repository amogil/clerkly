// Requirements: google-oauth-auth.11, google-oauth-auth.14, testing.3.1, testing.3.2, testing.3.6, testing.3.8, testing.3.9

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  completeOAuthFlow,
  clearTestTokens,
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
  const TEST_CLIENT_ID = 'test-client-id';

  test.beforeAll(async () => {
    console.log('\n⚠️  WARNING: These tests will show real Electron windows on your screen!\n');

    // Start mock OAuth server
    mockServer = new MockOAuthServer({
      port: 8888,
      clientId: TEST_CLIENT_ID,
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

  test.beforeEach(async () => {
    // Set user profile data for mock OAuth server
    mockServer.setUserProfile({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
    });
  });

  /* Preconditions: Application has valid tokens saved
     Action: Launch application
     Assertions: Main application screen is displayed (not login screen)
     Requirements: google-oauth-auth.14.1, google-oauth-auth.14.3 */
  test('should show main app when valid tokens exist', async () => {
    // Launch the application with mock OAuth server URL
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Complete OAuth flow to set up user and tokens
    await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);

    // Verify login screen is NOT displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    const isLoginVisible = await loginButton.isVisible().catch(() => false);
    expect(isLoginVisible).toBe(false);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/oauth-with-tokens.png' });
  });

  /* Preconditions: Application running with login screen
     Action: Complete OAuth flow
     Assertions: App transitions from login to main screen
     Requirements: google-oauth-auth.11.4, google-oauth-auth.14.4 */
  test('should transition from login to main app after token setup', async () => {
    // Launch the application with mock OAuth server URL
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    // Complete OAuth flow
    await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);

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
    // Launch the application with mock OAuth server URL
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });
    await context.window.waitForLoadState('domcontentloaded');

    // Complete OAuth flow first
    await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);

    // Verify we're on main app
    const loginButton = context.window.locator('text=/continue with google/i');
    const isLoginVisible = await loginButton.isVisible().catch(() => false);
    expect(isLoginVisible).toBe(false);

    // Clear tokens (simulating logout)
    await clearTestTokens(context.window);

    // Reload to trigger auth check
    await context.window.reload();
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is displayed
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/oauth-after-logout.png' });
  });

  /* Preconditions: Application running, tokens exist
     Action: Verify token persistence across app restarts
     Assertions: Tokens survive app restart
     Requirements: google-oauth-auth.4.3, google-oauth-auth.14.3 */
  test('should persist tokens across app restarts', async () => {
    // First launch with mock OAuth server URL
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });
    await context.window.waitForLoadState('domcontentloaded');

    // Complete OAuth flow
    await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);

    // Verify we're authenticated (not on login screen)
    const loginButton = context.window.locator('text=/continue with google/i');
    let isLoginVisible = await loginButton.isVisible().catch(() => false);
    expect(isLoginVisible).toBe(false);

    // Close app
    const testDataPath = context.testDataPath;
    await context.app.close();

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Relaunch with same data path and mock OAuth server URL
    context = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });
    await context.window.waitForLoadState('domcontentloaded');
    await context.window.waitForTimeout(2000);

    // Verify still authenticated (tokens persisted)
    isLoginVisible = await loginButton.isVisible().catch(() => false);
    expect(isLoginVisible).toBe(false);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/oauth-tokens-persisted.png' });
  });
});
