// Requirements: google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.3, google-oauth-auth.15.4, google-oauth-auth.15.5, google-oauth-auth.15.6, google-oauth-auth.15.7

/**
 * Functional tests for Sign Out flow
 * Tests the complete sign out process including token revocation and UI updates
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  });

  // Get the first window
  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await electronApp.close();
});

/* Preconditions: User is logged in with valid tokens
   Action: Click Sign Out button in settings
   Assertions: Login Screen is shown, tokens are cleared from database
   Requirements: google-oauth-auth.15.1, google-oauth-auth.15.2, google-oauth-auth.15.3, google-oauth-auth.15.4, google-oauth-auth.15.5, google-oauth-auth.15.6 */
test('should show login screen after sign out', async () => {
  // Setup: Create valid tokens
  await window.evaluate(async () => {
    await window.electron.ipcRenderer.invoke('test:setup-tokens', {
      accessToken: 'test_access_token',
      refreshToken: 'test_refresh_token',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });
  });

  // Reload to show main app
  await window.reload();
  await window.waitForLoadState('domcontentloaded');

  // Verify main app is shown (not login screen)
  const loginButton = await window.locator('button:has-text("Continue with Google")').count();
  expect(loginButton).toBe(0);

  // Navigate to settings
  await window.click('[data-testid="settings-button"]');
  await window.waitForTimeout(500);

  // Click Sign Out
  await window.click('button:has-text("Sign Out")');
  await window.waitForTimeout(1000);

  // Verify Login Screen is shown
  const loginButtonAfter = await window.locator('button:has-text("Continue with Google")');
  await expect(loginButtonAfter).toBeVisible();

  // Verify tokens are cleared
  const tokenStatus = await window.evaluate(async () => {
    return await window.electron.ipcRenderer.invoke('test:get-token-status');
  });
  expect(tokenStatus.hasTokens).toBe(false);
});

/* Preconditions: User is logged in with valid tokens
   Action: Call logout through IPC
   Assertions: Tokens are deleted from database
   Requirements: google-oauth-auth.15.3, google-oauth-auth.15.4 */
test('should clear tokens after sign out', async () => {
  // Setup: Create valid tokens
  await window.evaluate(async () => {
    await window.electron.ipcRenderer.invoke('test:setup-tokens', {
      accessToken: 'test_access_token_2',
      refreshToken: 'test_refresh_token_2',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });
  });

  // Verify tokens exist
  let tokenStatus = await window.evaluate(async () => {
    return await window.electron.ipcRenderer.invoke('test:get-token-status');
  });
  expect(tokenStatus.hasTokens).toBe(true);

  // Call logout
  await window.evaluate(async () => {
    await window.api.auth.logout();
  });

  await window.waitForTimeout(500);

  // Verify tokens are cleared
  tokenStatus = await window.evaluate(async () => {
    return await window.electron.ipcRenderer.invoke('test:get-token-status');
  });
  expect(tokenStatus.hasTokens).toBe(false);
});

/* Preconditions: User is logged in, Google revoke endpoint fails
   Action: Call logout when revoke fails
   Assertions: Local tokens are still deleted, Login Screen is shown
   Requirements: google-oauth-auth.15.7 */
test('should handle sign out when revoke fails', async () => {
  // Setup: Create valid tokens
  await window.evaluate(async () => {
    await window.electron.ipcRenderer.invoke('test:setup-tokens', {
      accessToken: 'test_access_token_3',
      refreshToken: 'test_refresh_token_3',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });
  });

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

  // Call logout
  const result = await window.evaluate(async () => {
    return await window.api.auth.logout();
  });

  // Logout should still succeed locally
  expect(result.success).toBe(true);

  await window.waitForTimeout(500);

  // Verify tokens are cleared despite revoke failure
  const tokenStatus = await window.evaluate(async () => {
    return await window.electron.ipcRenderer.invoke('test:get-token-status');
  });
  expect(tokenStatus.hasTokens).toBe(false);

  // Reload to verify Login Screen is shown
  await window.reload();
  await window.waitForLoadState('domcontentloaded');

  const loginButton = await window.locator('button:has-text("Continue with Google")');
  await expect(loginButton).toBeVisible();
});
