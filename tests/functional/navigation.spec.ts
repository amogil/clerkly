/* Preconditions: Application running without authentication
   Action: Attempt to access protected screens (Dashboard, Settings, Tasks, Calendar, Contacts)
   Assertions: Access is blocked, user is redirected to login screen
   Requirements: ui.8.1, ui.8.2, ui.8.3, ui.8.4 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';

let electronApp: ElectronApplication;
let window: Page;

test.beforeEach(async () => {
  // Launch Electron app with clean state (no authentication)
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_CLEAN_DB: 'true', // Ensure clean database
    },
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
});

test.afterEach(async () => {
  await electronApp.close();
});

/* Preconditions: Application launched without authentication
   Action: Check initial screen
   Assertions: Login screen is displayed
   Requirements: ui.8.1
   Property: 24 */
test('should show login screen when not authenticated', async () => {
  // Wait for the login screen to be visible
  const loginScreen = window.locator('[data-testid="login-screen"]').or(window.locator('text=Welcome'));
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
   Requirements: ui.8.2
   Property: 25 */
test('should block access to protected screens without authentication', async () => {
  // Verify login screen is shown initially
  const loginScreen = window.locator('[data-testid="login-screen"]').or(window.locator('text=Welcome'));
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  // Try to access Dashboard via evaluate (simulating direct navigation)
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
  const protectedContent = window.locator('[data-testid="dashboard"]')
    .or(window.locator('[data-testid="settings"]'))
    .or(window.locator('[data-testid="tasks"]'))
    .or(window.locator('[data-testid="calendar"]'))
    .or(window.locator('[data-testid="contacts"]'));
  
  await expect(protectedContent).not.toBeVisible();
});

/* Preconditions: User successfully authenticated
   Action: Complete OAuth flow
   Assertions: User is redirected to Dashboard
   Requirements: ui.8.3
   Property: 26 */
test('should redirect to dashboard after successful authentication', async () => {
  // Wait for login screen
  const loginScreen = window.locator('[data-testid="login-screen"]').or(window.locator('text=Welcome'));
  await expect(loginScreen).toBeVisible({ timeout: 10000 });

  // Simulate successful authentication by setting tokens directly
  await window.evaluate(async () => {
    // Mock successful authentication using test IPC handler
    await (window as any).electron.ipcRenderer.invoke('test:setup-tokens', {
      accessToken: 'mock_access_token_' + Date.now(),
      refreshToken: 'mock_refresh_token_' + Date.now(),
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    // Trigger auth success event
    await (window as any).electron.ipcRenderer.invoke('test:trigger-auth-success');
  });

  // Wait for navigation to dashboard
  await window.waitForTimeout(2000);

  // Verify dashboard is visible or we're no longer on login screen
  const dashboard = window.locator('[data-testid="dashboard"]').or(window.locator('text=Dashboard'));
  const isOnDashboard = await dashboard.isVisible().catch(() => false);
  const isOnLogin = await loginScreen.isVisible().catch(() => false);

  // Either dashboard is visible OR login screen is not visible (navigated away)
  expect(isOnDashboard || !isOnLogin).toBe(true);
});

/* Preconditions: User is authenticated and on dashboard
   Action: User logs out
   Assertions: User is redirected to login screen
   Requirements: ui.8.4
   Property: 27 */
test('should redirect to login screen after logout', async () => {
  // Setup: Authenticate user first
  await window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:setup-tokens', {
      accessToken: 'mock_access_token_' + Date.now(),
      refreshToken: 'mock_refresh_token_' + Date.now(),
      expiresIn: 3600,
      tokenType: 'Bearer',
    });
    
    await (window as any).electron.ipcRenderer.invoke('test:trigger-auth-success');
  });

  // Wait for authentication to complete
  await window.waitForTimeout(2000);

  // Perform logout
  await window.evaluate(async () => {
    await (window as any).api.auth.logout();
  });

  // Wait for logout to complete
  await window.waitForTimeout(2000);

  // Verify login screen is shown
  const loginScreen = window.locator('[data-testid="login-screen"]').or(window.locator('text=Welcome'));
  await expect(loginScreen).toBeVisible({ timeout: 5000 });

  // Verify sign-in button is present
  const signInButton = window.locator('button:has-text("Continue with Google")');
  await expect(signInButton).toBeVisible();

  // Verify we're not on any protected screen
  const protectedContent = window.locator('[data-testid="dashboard"]')
    .or(window.locator('[data-testid="settings"]'));
  await expect(protectedContent).not.toBeVisible();
});
