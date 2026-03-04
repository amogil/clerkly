// Requirements: google-oauth-auth.1, google-oauth-auth.2, google-oauth-auth.3, testing.3.1, testing.3.2, testing.3.6, testing.3.8, testing.3.9

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  clearTestTokens,
  completeOAuthFlow,
  expectAgentsVisible,
} from './helpers/electron';
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

/**
 * Complete OAuth Flow Functional Tests
 *
 * These tests verify the COMPLETE OAuth authentication flow including:
 * - Authorization code generation
 * - Deep link handling
 * - Code exchange for tokens (via Mock OAuth Server)
 * - Token storage
 *
 * Requirements: testing.3.1 - Use real Electron
 * Requirements: testing.3.2 - Do NOT mock Electron API
 * Requirements: testing.3.6 - Show real windows on screen
 * Requirements: testing.3.8 - Test IPC handlers
 * Requirements: testing.3.9 - Mock external services (Google OAuth)
 */

test.describe('Complete OAuth Flow', () => {
  let context: ElectronTestContext;
  let mockServer: MockOAuthServer;
  const TEST_CLIENT_ID = 'test-client-id-12345';

  test.beforeAll(async () => {
    mockServer = await createMockOAuthServer();
  });

  test.afterAll(async () => {
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

  /* Preconditions: Application not running, mock OAuth server running
     Action: Complete full OAuth flow from login button to token storage
     Assertions: Authorization code is generated, exchanged for tokens, tokens are stored
     Requirements: google-oauth-auth.1.1, google-oauth-auth.1.2, google-oauth-auth.1.3, google-oauth-auth.1.4, google-oauth-auth.1.5 */
  test('should complete full OAuth flow with authorization code exchange', async () => {
    // Launch the application with mock OAuth server URL
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
      CLERKLY_OAUTH_CLIENT_ID: TEST_CLIENT_ID,
      CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
    });
    await context.window.waitForLoadState('domcontentloaded');

    // Clear any existing tokens
    await clearTestTokens(context.window);

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    // Complete OAuth flow using the standard helper (handles PKCE state correctly)
    // Requirements: google-oauth-auth.2.3
    await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);

    // Verify app transitioned to agents screen
    await expectAgentsVisible(context.window, 10000);

    expect(context.window.isClosed()).toBe(false);

    // Take screenshot
    await context.window.screenshot({
      path: 'playwright-report/oauth-complete-flow.png',
    });
  });

  /* Preconditions: Mock OAuth server running, tokens available
     Action: Simulate complete OAuth flow with token setup
     Assertions: Tokens are stored and app transitions to authorized state
     Requirements: google-oauth-auth.3.1, google-oauth-auth.3.2, google-oauth-auth.3.3, google-oauth-auth.3.5 */
  test('should simulate token exchange and storage', async () => {
    // Launch the application with mock OAuth server URL
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });
    await context.window.waitForLoadState('domcontentloaded');

    // Clear any existing tokens
    await clearTestTokens(context.window);

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    // Complete OAuth flow
    await completeOAuthFlow(context.app, context.window);

    // Verify we're on the main app (not login screen)
    const isOnLogin = await loginButton.isVisible().catch(() => false);
    expect(isOnLogin).toBe(false);

    console.log('[TEST] Tokens successfully stored after exchange');

    // Reload to verify tokens persist
    await context.window.reload();
    await context.window.waitForLoadState('domcontentloaded');
    await context.window.waitForSelector('[data-testid="login-screen"], [data-testid="agents"]', {
      timeout: 10000,
    });

    // Verify still authenticated (not on login screen)
    const stillOnLogin = await loginButton.isVisible().catch(() => false);
    expect(stillOnLogin).toBe(false);

    // Take screenshot
    await context.window.screenshot({
      path: 'playwright-report/oauth-tokens-stored.png',
    });
  });

  /* Preconditions: Application running
     Action: Verify error handling for invalid OAuth responses
     Assertions: App handles errors gracefully
     Requirements: google-oauth-auth.3.4 */
  test('should handle OAuth errors gracefully', async () => {
    // Launch the application with mock OAuth server URL
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });
    await context.window.waitForLoadState('domcontentloaded');

    // Clear any existing tokens
    await clearTestTokens(context.window);

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });

    // Simulate OAuth error by sending deep link with error parameter
    const errorDeepLink = `com.googleusercontent.apps.${TEST_CLIENT_ID}:/oauth2redirect?error=access_denied&error_description=User%20denied%20access`;

    await context.app.evaluate(
      async ({ app }, { url }) => {
        app.emit('open-url', { preventDefault: () => {} }, url);
      },
      { url: errorDeepLink }
    );

    // Wait for error handling — app stays on login screen
    await expect(context.window.locator('[data-testid="login-screen"]')).toBeVisible({
      timeout: 10000,
    });

    // Verify app is still responsive
    expect(context.window.isClosed()).toBe(false);

    // Verify error panel is shown
    await expect(context.window.locator('[data-testid="login-error"]')).toBeVisible();

    // Verify still on login screen (not authenticated)
    const stillOnLogin = await context.window
      .locator('button:has-text("Continue with Google")')
      .isVisible();
    expect(stillOnLogin).toBe(true);

    console.log('[TEST] OAuth error handled gracefully');

    // Take screenshot
    await context.window.screenshot({
      path: 'playwright-report/oauth-error-handled.png',
    });
  });
});
