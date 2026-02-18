// Requirements: google-oauth-auth.14.1, google-oauth-auth.14.2, google-oauth-auth.14.3, google-oauth-auth.14.4, google-oauth-auth.14.5, google-oauth-auth.14.6, google-oauth-auth.14.7

/**
 * Functional tests for Sign Out flow
 * Tests the complete sign out process including token revocation and UI updates
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let electronApp: ElectronApplication;
let window: Page;
let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer(8893);
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.beforeEach(async () => {
  // Set user profile data for each test
  mockServer.setUserProfile({
    id: '123456789',
    email: 'signout.test@example.com',
    name: 'SignOut Test User',
    given_name: 'SignOut',
    family_name: 'Test User',
  });

  // Create unique temp directory for this test
  const testDataPath = path.join(
    require('os').tmpdir(),
    `clerkly-signout-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );

  // Launch Electron app for each test
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/main/index.js'), '--user-data-dir', testDataPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
      CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
      CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
    },
  });

  // Get the first window
  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Wait for app to fully initialize (IPC handlers registration)
  await window.waitForTimeout(2000);
});

test.afterEach(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

/* Preconditions: User is logged in with valid tokens
   Action: Click Sign Out button in settings
   Assertions: Login Screen is shown, tokens are cleared from database
   Requirements: google-oauth-auth.14.1, google-oauth-auth.14.2, google-oauth-auth.14.3, google-oauth-auth.14.4, google-oauth-auth.14.5, google-oauth-auth.14.6 */
test('should show login screen after sign out', async () => {
  // Setup: Complete OAuth flow to authenticate
  await completeOAuthFlow(electronApp, window);

  // Wait for authentication to complete and UI to update
  await window.waitForTimeout(2000);

  // Reload to ensure UI is updated
  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(1000);

  // Verify main app is shown (not login screen)
  const loginButton = await window.locator('button:has-text("Continue with Google")').count();
  expect(loginButton).toBe(0);

  // Navigate to settings by clicking Settings button in navigation
  await window.click('button:has-text("Settings")');
  await window.waitForTimeout(1000);

  // Wait for Account component to load with profile
  await window.waitForSelector('.sign-out-button', { timeout: 5000 });

  // Click Sign Out button using class selector
  await window.click('.sign-out-button');
  await window.waitForTimeout(1000);

  // Verify Login Screen is shown
  const loginButtonAfter = await window.locator('button:has-text("Continue with Google")');
  await expect(loginButtonAfter).toBeVisible();

  // Verify tokens are cleared (check through app context)
  const tokensCleared = await electronApp.evaluate(async () => {
    const { tokenStorage } = (global as any).testContext || {};
    if (!tokenStorage) {
      throw new Error('Token storage not found in test context');
    }
    try {
      const tokens = await tokenStorage.loadTokens();
      return tokens === null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      return errorMessage.includes('No user logged in');
    }
  });
  expect(tokensCleared).toBe(true);
});

/* Preconditions: User is logged in with valid tokens
   Action: Call logout through IPC
   Assertions: Tokens are deleted from database
   Requirements: google-oauth-auth.14.3, google-oauth-auth.14.4 */
test('should clear tokens after sign out', async () => {
  // Setup: Complete OAuth flow to authenticate
  await completeOAuthFlow(electronApp, window);

  // Verify tokens exist (check through app context)
  const tokensExist = await electronApp.evaluate(async () => {
    const { tokenStorage } = (global as any).testContext || {};
    if (!tokenStorage) {
      throw new Error('Token storage not found in test context');
    }
    try {
      const tokens = await tokenStorage.loadTokens();
      return tokens !== null;
    } catch (error: unknown) {
      return false;
    }
  });
  expect(tokensExist).toBe(true);

  // Call logout via IPC
  await window.evaluate(async () => {
    await window.electron.ipcRenderer.invoke('auth:logout');
  });

  await window.waitForTimeout(500);

  // Verify tokens are cleared
  const tokensCleared = await electronApp.evaluate(async () => {
    const { tokenStorage } = (global as any).testContext || {};
    if (!tokenStorage) {
      throw new Error('Token storage not found in test context');
    }
    try {
      const tokens = await tokenStorage.loadTokens();
      return tokens === null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      return errorMessage.includes('No user logged in');
    }
  });
  expect(tokensCleared).toBe(true);
});

/* Preconditions: User is logged in, Google revoke endpoint fails
   Action: Call logout when revoke fails
   Assertions: Local tokens are still deleted, Login Screen is shown
   Requirements: google-oauth-auth.14.7 */
test('should handle sign out when revoke fails', async () => {
  // Setup: Complete OAuth flow to authenticate
  await completeOAuthFlow(electronApp, window);

  // Mock fetch to simulate revoke failure
  await window.evaluate(() => {
    const originalFetch = window.fetch;
    window.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('revoke')) {
        throw new Error('Network error');
      }
      return originalFetch(url, init);
    };
  });

  // Call logout via IPC
  const result = await window.evaluate(async () => {
    return await window.electron.ipcRenderer.invoke('auth:logout');
  });

  // Logout should still succeed locally
  expect(result.success).toBe(true);

  await window.waitForTimeout(500);

  // Verify tokens are cleared despite revoke failure
  const tokensCleared = await electronApp.evaluate(async () => {
    const { tokenStorage } = (global as any).testContext || {};
    if (!tokenStorage) {
      throw new Error('Token storage not found in test context');
    }
    try {
      const tokens = await tokenStorage.loadTokens();
      return tokens === null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      return errorMessage.includes('No user logged in');
    }
  });
  expect(tokensCleared).toBe(true);

  // Reload to verify Login Screen is shown
  await window.reload();
  await window.waitForLoadState('domcontentloaded');

  const loginButton = await window.locator('button:has-text("Continue with Google")');
  await expect(loginButton).toBeVisible();
});
