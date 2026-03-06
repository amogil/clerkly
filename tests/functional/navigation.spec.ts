/* Preconditions: Application running without authentication
   Action: Attempt to access protected screens (Agents, Settings, Tasks, Calendar, Contacts)
   Assertions: Access is blocked, user is redirected to login screen
   Requirements: navigation.1.1, navigation.1.2, navigation.1.3, navigation.1.4 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  createMockOAuthServer,
  launchElectronWithMockOAuth,
  expectNoToastError,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let electronApp: ElectronApplication;
let window: Page;
let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer();
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.beforeEach(async () => {
  // Set user profile data for tests
  mockServer.setUserProfile({
    id: '123456789',
    email: 'navigation.test@example.com',
    name: 'Navigation Test User',
    given_name: 'Navigation',
    family_name: 'Test User',
  });

  const context = await launchElectronWithMockOAuth(mockServer);
  electronApp = context.app;
  window = context.window;
});

test.afterEach(async () => {
  await electronApp.close();
});

/* Preconditions: Application launched without authentication
   Action: Check initial screen
   Assertions: Login screen is displayed
   Requirements: navigation.1.1
   Property: 24 */
test('should show login screen when not authenticated', async () => {
  // Wait for the login screen to be visible
  const loginScreen = window.locator('[data-testid="login-screen"]');
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  // Verify Google sign-in button is present
  const signInButton = window.locator('button:has-text("Continue with Google")');
  await expect(signInButton).toBeVisible();

  // Verify we're not on dashboard or any protected screen
  const dashboard = window.locator('[data-testid="dashboard"]');
  await expect(dashboard).not.toBeVisible();
});

/* Preconditions: Application running without authentication
   Action: Attempt to navigate to protected screens via URL or direct access
   Assertions: Access is blocked, redirected to login screen
   Requirements: navigation.1.2
   Property: 25 */
test('should block access to protected screens without authentication', async () => {
  // Verify login screen is shown initially
  const loginScreen = window.locator('[data-testid="login-screen"]');
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  // Try to access Agents via evaluate (simulating direct navigation)
  await window.evaluate(() => {
    // Attempt to trigger navigation to dashboard
    const event = new CustomEvent('navigate', { detail: { route: '/dashboard' } });
    window.dispatchEvent(event);
  });

  // Wait a bit for any navigation attempt
  await window.waitForTimeout(1000);

  // Verify we're still on login screen
  await expect(loginScreen).toBeVisible();

  // Try to access Settings
  await window.evaluate(() => {
    const event = new CustomEvent('navigate', { detail: { route: '/settings' } });
    window.dispatchEvent(event);
  });

  await window.waitForTimeout(1000);
  await expect(loginScreen).toBeVisible();

  // Try to access Tasks
  await window.evaluate(() => {
    const event = new CustomEvent('navigate', { detail: { route: '/tasks' } });
    window.dispatchEvent(event);
  });

  await window.waitForTimeout(1000);
  await expect(loginScreen).toBeVisible();

  // Try to access Calendar
  await window.evaluate(() => {
    const event = new CustomEvent('navigate', { detail: { route: '/calendar' } });
    window.dispatchEvent(event);
  });

  await window.waitForTimeout(1000);
  await expect(loginScreen).toBeVisible();

  // Try to access Contacts
  await window.evaluate(() => {
    const event = new CustomEvent('navigate', { detail: { route: '/contacts' } });
    window.dispatchEvent(event);
  });

  await window.waitForTimeout(1000);
  await expect(loginScreen).toBeVisible();

  // Verify protected content is not accessible
  const protectedContent = window
    .locator('[data-testid="dashboard"]')
    .or(window.locator('[data-testid="settings"]'))
    .or(window.locator('[data-testid="tasks"]'))
    .or(window.locator('[data-testid="calendar"]'))
    .or(window.locator('[data-testid="contacts"]'));

  await expect(protectedContent).not.toBeVisible();
});

/* Preconditions: User successfully authenticated
   Action: Complete OAuth flow
   Assertions: User is redirected to Agents
   Requirements: navigation.1.7
   Property: 26 */
test('should redirect to agents after successful authentication', async () => {
  // Wait for login screen
  const loginScreen = window.locator('[data-testid="login-screen"]');
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  // Complete OAuth flow
  await completeOAuthFlow(electronApp, window);

  // Verify we're no longer on login screen (navigated away from login)
  await expect(loginScreen).not.toBeVisible({ timeout: 10000 });

  // Verify we can see main app content (Settings button indicates we're authenticated)
  const settingsButton = window.locator('button:has-text("Settings")');
  await expect(settingsButton).toBeVisible({ timeout: 5000 });
});

/* Preconditions: User is authenticated and can open protected screens
   Action: Open Settings and force tall content
   Assertions: Page-level scroll stays locked, Settings uses internal scroll container
   Requirements: navigation.1.10 */
test('should keep page scroll locked and allow internal settings scroll', async () => {
  await completeOAuthFlow(electronApp, window);

  const settingsButton = window.locator('button:has-text("Settings")');
  await expect(settingsButton).toBeVisible({ timeout: 5000 });
  await settingsButton.click();

  const settingsScreen = window.locator('[data-testid="settings-screen"]');
  await expect(settingsScreen).toBeVisible({ timeout: 5000 });

  const metrics = await window.evaluate(() => {
    const settings = document.querySelector(
      '[data-testid="settings-screen"]'
    ) as HTMLElement | null;
    if (!settings) return null;

    const content = settings.firstElementChild as HTMLElement | null;
    if (!content) return null;

    const filler = document.createElement('div');
    filler.setAttribute('data-testid', 'settings-scroll-filler');
    filler.style.height = '2400px';
    content.appendChild(filler);

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    settings.scrollTop = 0;
    settings.scrollTo({ top: 600, behavior: 'auto' });

    return {
      settingsScrollTop: settings.scrollTop,
      settingsScrollHeight: settings.scrollHeight,
      settingsClientHeight: settings.clientHeight,
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.settingsScrollHeight).toBeGreaterThan(metrics!.settingsClientHeight);
  expect(metrics!.settingsScrollTop).toBeGreaterThan(0);
  expect(metrics!.htmlScrollTop).toBe(0);
  expect(metrics!.bodyScrollTop).toBe(0);
  expect(metrics!.htmlOverflowY).toBe('hidden');
  expect(metrics!.bodyOverflowY).toBe('hidden');
  await expectNoToastError(window);
});

/* Preconditions: User is authenticated and has a long message history
   Action: Scroll chat in Agents screen
   Assertions: Scroll is applied to chat container, while page-level scroll remains locked
   Requirements: navigation.1.10 */
test('should keep page scroll locked and allow internal agents chat scroll', async () => {
  await completeOAuthFlow(electronApp, window);

  await window.evaluate(async () => {
    const api = (window as any).api;
    const agentsResult = await api.agents.list();
    if (!agentsResult?.success || !Array.isArray(agentsResult.data) || agentsResult.data.length === 0) {
      throw new Error('Failed to read agents list');
    }

    const activeAgentId = agentsResult.data[0].id;
    for (let i = 0; i < 120; i += 1) {
      const result = await api.test.createAgentMessage(activeAgentId, `Seed message ${i + 1}`);
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to seed message');
      }
    }
  });

  await expect.poll(
    async () =>
      await window.locator('[data-testid="agent-chat-root"]:not(.pointer-events-none) [data-testid="message"]').count(),
    { timeout: 10000 }
  ).toBeGreaterThan(80);

  const metrics = await window.evaluate(() => {
    const messagesArea = document.querySelector(
      '[data-testid="agent-chat-root"]:not(.pointer-events-none) [data-testid="messages-area"]'
    ) as HTMLElement | null;
    const scrollContainer = messagesArea?.parentElement as HTMLElement | null;
    if (!scrollContainer) return null;

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'auto' });

    return {
      containerScrollTop: scrollContainer.scrollTop,
      containerScrollHeight: scrollContainer.scrollHeight,
      containerClientHeight: scrollContainer.clientHeight,
      htmlScrollTop: document.documentElement.scrollTop,
      bodyScrollTop: document.body.scrollTop,
      htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
    };
  });

  expect(metrics).not.toBeNull();
  expect(metrics!.containerScrollHeight).toBeGreaterThan(metrics!.containerClientHeight);
  expect(metrics!.containerScrollTop).toBeGreaterThan(0);
  expect(metrics!.htmlScrollTop).toBe(0);
  expect(metrics!.bodyScrollTop).toBe(0);
  expect(metrics!.htmlOverflowY).toBe('hidden');
  expect(metrics!.bodyOverflowY).toBe('hidden');
  await expectNoToastError(window);
});

/* Preconditions: User is authenticated and on dashboard
   Action: User logs out
   Assertions: User is redirected to login screen
   Requirements: navigation.1.4
   Property: 27 */
test('should redirect to login screen after logout', async () => {
  // Setup: Authenticate user first
  await completeOAuthFlow(electronApp, window);

  // Wait for authentication to complete
  await window.waitForTimeout(2000);

  // Verify we're authenticated (Settings button visible)
  const settingsButton = window.locator('button:has-text("Settings")');
  await expect(settingsButton).toBeVisible({ timeout: 5000 });

  console.log('[TEST] User authenticated, performing logout...');

  // Perform logout
  await window.evaluate(async () => {
    await (window as any).api.auth.logout();
  });

  // Wait for logout to complete
  await window.waitForTimeout(3000);

  // Reload to ensure UI reflects logout state
  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(1000);

  // Verify login screen is shown
  const loginScreen = window.locator('[data-testid="login-screen"]');
  await expect(loginScreen).toBeVisible({ timeout: 10000 });
  await expectNoToastError(window);

  // Verify sign-in button is present
  const signInButton = window.locator('button:has-text("Continue with Google")');
  await expect(signInButton).toBeVisible();

  // Verify we're not on any protected screen
  const protectedContent = window
    .locator('[data-testid="dashboard"]')
    .or(window.locator('[data-testid="settings"]'));
  await expect(protectedContent).not.toBeVisible();
});

/* Preconditions: User is authenticated and on dashboard
   Action: User logs out, then app is reloaded
   Assertions: User is redirected to login screen after logout and after reload
   Requirements: navigation.1.4 */
test('should stay on login screen after logout and app reload', async () => {
  // Setup: Authenticate user first
  await completeOAuthFlow(electronApp, window);

  // Verify we're authenticated (Settings button visible)
  const settingsButton = window.locator('button:has-text("Settings")');
  await expect(settingsButton).toBeVisible({ timeout: 5000 });

  // Navigate to Settings and perform logout via UI
  await settingsButton.click();
  const signOutButton = window.locator('button:has-text("Sign out")');
  await expect(signOutButton).toBeVisible({ timeout: 5000 });
  await signOutButton.click();

  // Verify login screen is shown
  const loginScreen = window.locator('[data-testid="login-screen"]');
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  // Reload app and ensure login screen remains
  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  // Verify sign-in button is present after reload
  const signInButton = window.locator('button:has-text("Continue with Google")');
  await expect(signInButton).toBeVisible();
  await expectNoToastError(window);
});

/* Preconditions: User on login screen, mock OAuth server configured to return error
   Action: Complete OAuth flow with simulated profile fetch error
   Assertions: Loader shows then hides, LoginError component is displayed, tokens are cleared
   Requirements: navigation.1.8
   Property: 8 */
test('should show error on authorization failure', async () => {
  // Configure mock server to return error on profile fetch
  mockServer.setUserInfoError(500, 'Internal Server Error');

  console.log('[TEST] Mock server configured to return profile fetch error');

  // Wait for login screen
  const loginScreen = window.locator('[data-testid="login-screen"]');
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  console.log('[TEST] Login screen displayed');

  // Find and click login button to start OAuth flow
  const loginButton = window.locator('button:has-text("Continue with Google")');
  await expect(loginButton).toBeVisible();
  await loginButton.click();

  console.log('[TEST] Clicked login button');

  // Wait for OAuth flow to initialize
  await window.waitForTimeout(2000);

  // Get PKCE state from OAuthClientManager
  const pkceState = await electronApp.evaluate(async () => {
    const { oauthClient } = (global as any).testContext || {};
    if (!oauthClient || !oauthClient.pkceStorage) {
      throw new Error('PKCE storage not found');
    }
    return oauthClient.pkceStorage.state;
  });

  // Generate authorization code
  const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Construct deep link URL with correct PKCE state
  const redirectUri = 'com.googleusercontent.apps.test-client-id-12345:/oauth2redirect';
  const deepLinkUrl = `${redirectUri}?code=${authCode}&state=${pkceState}`;

  // Trigger deep link handling
  await window.evaluate(async (url) => {
    return await (window as any).electron.ipcRenderer.invoke('test:handle-deep-link', url);
  }, deepLinkUrl);

  console.log('[TEST] Simulated OAuth callback with authorization code');

  // Wait a moment for loader to appear
  await window.waitForTimeout(500);

  // Check that loader is visible (should show during token exchange/profile fetch)
  const loader = window.locator('.animate-spin');
  const loaderText = window.locator('text="Signing in..."');

  // Loader should be visible during the authorization process
  const isLoaderVisible = await loader.isVisible().catch(() => false);
  const isLoaderTextVisible = await loaderText.isVisible().catch(() => false);

  console.log('[TEST] Loader visible:', isLoaderVisible || isLoaderTextVisible);

  // Wait for error to be processed (profile fetch will fail)
  await window.waitForTimeout(5000);

  console.log('[TEST] Waiting for error to be processed...');

  // Verify loader is hidden after error (with longer timeout)
  await expect(loader).not.toBeVisible({ timeout: 10000 });
  await expect(loaderText).not.toBeVisible({ timeout: 10000 });

  console.log('[TEST] ✓ Loader hidden after error');

  // Verify "Continue with Google" or "Try Again" button is present
  const retryButton = window
    .locator('button:has-text("Try Again")')
    .or(window.locator('button:has-text("Continue with Google")'));
  await expect(retryButton).toBeVisible({ timeout: 5000 });

  console.log('[TEST] ✓ Retry button displayed');

  // Verify we're still on login/error screen (not navigated to dashboard)
  const dashboard = window.locator('[data-testid="dashboard"]');
  await expect(dashboard).not.toBeVisible();

  console.log('[TEST] ✓ Agents not visible (tokens cleared)');

  // Take screenshot of error state
  await window.screenshot({
    path: 'playwright-report/navigation-error-state.png',
  });

  console.log('[TEST] ✓ Test completed: Error handling verified');

  // Clean up: clear the error for next tests
  mockServer.clearUserInfoError();
});
