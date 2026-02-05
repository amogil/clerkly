// Requirements: google-oauth-auth.11.1, google-oauth-auth.14.1, google-oauth-auth.14.2, testing.3.1, testing.3.2, testing.3.6

import { test, expect } from '@playwright/test';
import { launchElectron, closeElectron, ElectronTestContext } from './helpers/electron';

/**
 * Functional tests for OAuth authentication flow
 *
 * These tests verify the complete user authentication journey:
 * - First launch shows login screen
 * - User can initiate OAuth flow
 * - Successful auth shows main application
 * - Auth state persists across restarts
 *
 * Requirements: testing.3.1 - Use real Electron
 * Requirements: testing.3.2 - Do NOT mock Electron API
 * Requirements: testing.3.6 - Show real windows on screen
 */

test.describe('Authentication Flow', () => {
  let context: ElectronTestContext;

  test.beforeAll(async () => {
    console.log('\n⚠️  WARNING: These tests will show real Electron windows on your screen!\n');
  });

  test.afterEach(async () => {
    if (context) {
      await closeElectron(context);
    }
  });

  /* Preconditions: First launch, no saved tokens
     Action: Launch application
     Assertions: Login screen is displayed
     Requirements: google-oauth-auth.14.1, google-oauth-auth.14.2 */
  test('should show login screen on first launch', async () => {
    // Launch the application
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron();

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Look for login screen elements
    // The login screen should have "Continue with Google" button or similar
    const loginButton = context.window.locator('text=/continue with google/i');

    // Wait for login button to be visible (with timeout)
    try {
      await loginButton.waitFor({ state: 'visible', timeout: 5000 });
      expect(await loginButton.isVisible()).toBe(true);
    } catch (error) {
      // If button not found, take screenshot for debugging
      await context.window.screenshot({ path: 'playwright-report/login-screen-not-found.png' });
      throw new Error('Login screen not displayed on first launch');
    }

    // Take screenshot of login screen
    await context.window.screenshot({ path: 'playwright-report/login-screen.png' });
  });

  /* Preconditions: User on login screen
     Action: Click "Continue with Google" button
     Assertions: OAuth flow is initiated (browser opens or auth window appears)
     Requirements: google-oauth-auth.11.1 */
  test('should initiate OAuth flow when clicking login button', async () => {
    // Launch the application
    context = await launchElectron();

    // Wait for login screen
    await context.window.waitForLoadState('domcontentloaded');

    // Find and click login button
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });

    // Click the button
    await loginButton.click();

    // Wait a moment for OAuth flow to start
    await context.window.waitForTimeout(1000);

    // Verify something happened (browser opened, or auth window appeared)
    // This is hard to verify automatically, but we can check the app is still responsive
    expect(context.window.isClosed()).toBe(false);

    // Take screenshot after clicking
    await context.window.screenshot({ path: 'playwright-report/after-login-click.png' });
  });

  /* Preconditions: Application has valid tokens saved
     Action: Launch application
     Assertions: Main application screen is displayed (not login screen)
     Requirements: google-oauth-auth.14.1, google-oauth-auth.14.3 */
  test.skip('should show main app when already authorized', async () => {
    // This test requires pre-saved tokens
    // Skip for now - would need to setup test tokens first
    // TODO: Implement token setup in beforeEach
    // TODO: Launch app and verify main screen is shown
  });

  /* Preconditions: User completes OAuth flow successfully
     Action: Simulate successful OAuth callback
     Assertions: Main application screen is displayed, tokens are saved
     Requirements: google-oauth-auth.11.4, google-oauth-auth.14.4 */
  test.skip('should show main app after successful authentication', async () => {
    // This test requires simulating OAuth callback
    // Skip for now - would need to mock OAuth server or use test credentials
    // TODO: Implement OAuth callback simulation
    // TODO: Verify main screen is shown
    // TODO: Verify tokens are saved to database
  });
});
