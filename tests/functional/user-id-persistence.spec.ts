/* Preconditions: Application with userId persistence enabled
   Action: Test userId persistence across app restarts and logout
   Assertions: userId is saved to DB, restored on restart, cleared on logout
   Requirements: user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.1.6 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let electronApp: ElectronApplication;
let window: Page;
let mockServer: MockOAuthServer;
let testDataPath: string;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer(8892);
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.beforeEach(async () => {
  // Set user profile data for tests
  mockServer.setUserProfile({
    id: 'persistence-user-123',
    email: 'persistence.test@example.com',
    name: 'Persistence Test User',
    given_name: 'Persistence',
    family_name: 'Test User',
  });

  // Create unique temp directory for this test
  testDataPath = path.join(
    require('os').tmpdir(),
    `clerkly-persistence-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );
});

test.afterEach(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

/* Preconditions: User completes OAuth flow and gets authenticated
   Action: Close app, reopen app
   Assertions: User is automatically logged in (userId restored from DB)
   Requirements: user-data-isolation.1.3, user-data-isolation.1.6
   Property: 26 */
test('should persist userId between app restarts', async () => {
  // Launch app first time
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

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Complete OAuth flow
  await completeOAuthFlow(electronApp, window);

  // Wait for Agents screen to be visible (user is authenticated)
  const agentsScreen = window.locator('[data-testid="agents-screen"]');
  await expect(agentsScreen).toBeVisible({ timeout: 10000 });

  // Close app
  await electronApp.close();

  // Wait a bit to ensure app is fully closed
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Reopen app with same data directory
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

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // User should be automatically logged in (Agents screen visible)
  const agentsScreenAfterRestart = window.locator('[data-testid="agents-screen"]');
  await expect(agentsScreenAfterRestart).toBeVisible({ timeout: 10000 });

  // Login screen should NOT be visible
  const loginScreen = window.locator('[data-testid="login-screen"]');
  await expect(loginScreen).not.toBeVisible();
});

/* Preconditions: User is authenticated with userId saved in DB
   Action: User logs out
   Assertions: userId is cleared from DB, login screen is shown
   Requirements: user-data-isolation.1.4
   Property: 27 */
test('should clear userId on logout', async () => {
  // Launch app and authenticate
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

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Complete OAuth flow
  await completeOAuthFlow(electronApp, window);

  // Wait for Agents screen
  const agentsScreen = window.locator('[data-testid="agents-screen"]');
  await expect(agentsScreen).toBeVisible({ timeout: 10000 });

  // Navigate to Settings
  const settingsButton = window.locator('button:has-text("Settings")');
  await settingsButton.click();

  // Wait for Settings screen to load
  await window.waitForTimeout(1000);

  // Click logout button (sign-out-button class)
  const logoutButton = window.locator('.sign-out-button');
  await logoutButton.click();

  // Wait for login screen to appear
  const loginScreen = window.locator('[data-testid="login-screen"]');
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  // Close and reopen app to verify userId was cleared
  await electronApp.close();
  await new Promise((resolve) => setTimeout(resolve, 1000));

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

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Should still show login screen (userId was cleared)
  const loginScreenAfterRestart = window.locator('[data-testid="login-screen"]');
  await expect(loginScreenAfterRestart).toBeVisible({ timeout: 10000 });
});

/* Preconditions: Database has userId saved, but user doesn't exist in users table
   Action: Launch app
   Assertions: userId is cleared, login screen is shown
   Requirements: user-data-isolation.1.3
   Property: 28 */
test('should show Login if userId not found in users table', async () => {
  // This test requires manual database manipulation which is complex in functional tests
  // Instead, we'll test the behavior through a different scenario:
  // 1. Authenticate user
  // 2. Manually corrupt the database by deleting user record (via test IPC)
  // 3. Restart app
  // 4. Verify login screen is shown

  // Launch app and authenticate
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

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Complete OAuth flow
  await completeOAuthFlow(electronApp, window);

  // Wait for Agents screen
  const agentsScreen = window.locator('[data-testid="agents-screen"]');
  await expect(agentsScreen).toBeVisible({ timeout: 10000 });

  // Delete user from database (but keep userId in global storage)
  // This simulates corrupted state where userId exists but user doesn't
  await window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:delete-current-user');
  });

  // Close and reopen app
  await electronApp.close();
  await new Promise((resolve) => setTimeout(resolve, 1000));

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

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  // Should show login screen (user not found, userId cleared)
  const loginScreen = window.locator('[data-testid="login-screen"]');
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  // Agents screen should NOT be visible
  const agentsScreenAfterRestart = window.locator('[data-testid="agents-screen"]');
  await expect(agentsScreenAfterRestart).not.toBeVisible();
});
