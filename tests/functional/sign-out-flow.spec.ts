// Requirements: google-oauth-auth.14.1, google-oauth-auth.14.2, google-oauth-auth.14.3, google-oauth-auth.14.4, google-oauth-auth.14.5, google-oauth-auth.14.6, google-oauth-auth.14.7

/**
 * Functional tests for Sign Out flow
 * Tests the complete sign out process including token revocation and UI updates
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { createMockOAuthServer, launchElectronWithMockOAuth } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let electronApp: ElectronApplication;
let appWindow: Page;
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
  // Set user profile data for each test
  mockServer.setUserProfile({
    id: '123456789',
    email: 'signout.test@example.com',
    name: 'SignOut Test User',
    given_name: 'SignOut',
    family_name: 'Test User',
  });

  const context = await launchElectronWithMockOAuth(mockServer);
  electronApp = context.app;
  appWindow = context.window;

  // Wait for app to fully initialize (IPC handlers registration)
  await expect(appWindow.locator('button:has-text("Continue with Google")')).toBeVisible({
    timeout: 5000,
  });
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
  await completeOAuthFlow(electronApp, appWindow);

  // Wait for authentication to complete and UI to update
  await expect(appWindow.locator('button:has-text("Settings")')).toBeVisible({ timeout: 5000 });

  // Reload to ensure UI is updated
  await appWindow.reload();
  await appWindow.waitForLoadState('domcontentloaded');
  await expect(appWindow.locator('button:has-text("Settings")')).toBeVisible({ timeout: 5000 });

  // Verify main app is shown (not login screen)
  const loginButton = await appWindow.locator('button:has-text("Continue with Google")').count();
  expect(loginButton).toBe(0);

  // Navigate to settings by clicking Settings button in navigation
  await appWindow.click('button:has-text("Settings")');

  // Wait for Account component to load with profile
  await expect(appWindow.locator('.sign-out-button')).toBeVisible({ timeout: 5000 });

  // Click Sign Out button using class selector
  await appWindow.click('.sign-out-button');

  // Verify Login Screen is shown
  const loginButtonAfter = await appWindow.locator('button:has-text("Continue with Google")');
  await expect(loginButtonAfter).toBeVisible();

  // Verify tokens are cleared (check through app context)
  const tokensCleared = await electronApp.evaluate(async () => {
    const { tokenStorage, isNoUserLoggedInError: noUserErrorHelper } =
      (global as any).testContext || {};
    if (!tokenStorage || !noUserErrorHelper) {
      throw new Error('Test context missing token storage or error helper');
    }
    try {
      const tokens = await tokenStorage.loadTokens();
      return tokens === null;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '';
      return noUserErrorHelper(errorMessage);
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
  await completeOAuthFlow(electronApp, appWindow);

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
  await appWindow.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('auth:logout');
  });

  // Verify tokens are cleared
  await expect
    .poll(
      async () => {
        return electronApp.evaluate(async () => {
          const { tokenStorage, isNoUserLoggedInError: noUserErrorHelper } =
            (global as any).testContext || {};
          if (!tokenStorage || !noUserErrorHelper) {
            throw new Error('Test context missing token storage or error helper');
          }
          try {
            const tokens = await tokenStorage.loadTokens();
            return tokens === null;
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '';
            return noUserErrorHelper(errorMessage);
          }
        });
      },
      { timeout: 5000 }
    )
    .toBe(true);
});

/* Preconditions: User is logged in, Google revoke endpoint fails
   Action: Call logout when revoke fails
   Assertions: Local tokens are still deleted, Login Screen is shown
   Requirements: google-oauth-auth.14.7 */
test('should handle sign out when revoke fails', async () => {
  // Setup: Complete OAuth flow to authenticate
  await completeOAuthFlow(electronApp, appWindow);

  // Mock fetch to simulate revoke failure
  await appWindow.evaluate(() => {
    const originalFetch = window.fetch;
    window.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('revoke')) {
        throw new Error('Network error');
      }
      return originalFetch(url, init);
    };
  });

  // Call logout via IPC
  const result = await appWindow.evaluate(async () => {
    return await (window as any).electron.ipcRenderer.invoke('auth:logout');
  });

  // Logout should still succeed locally
  expect(result.success).toBe(true);

  // Verify tokens are cleared despite revoke failure
  await expect
    .poll(
      async () => {
        return electronApp.evaluate(async () => {
          const { tokenStorage, isNoUserLoggedInError: noUserErrorHelper } =
            (global as any).testContext || {};
          if (!tokenStorage || !noUserErrorHelper) {
            throw new Error('Test context missing token storage or error helper');
          }
          try {
            const tokens = await tokenStorage.loadTokens();
            return tokens === null;
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '';
            return noUserErrorHelper(errorMessage);
          }
        });
      },
      { timeout: 5000 }
    )
    .toBe(true);

  // Reload to verify Login Screen is shown
  await appWindow.reload();
  await appWindow.waitForLoadState('domcontentloaded');

  const loginButton = await appWindow.locator('button:has-text("Continue with Google")');
  await expect(loginButton).toBeVisible();
});
