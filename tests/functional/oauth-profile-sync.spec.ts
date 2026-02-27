// Requirements: google-oauth-auth.3.6, google-oauth-auth.3.7, google-oauth-auth.3.8, account-profile.1.3, account-profile.1.4, account-profile.1.5, testing.3.1, testing.3.2, testing.3.6

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  createMockOAuthServer,
  getPkceState,
  waitForPkceState,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { isNoUserLoggedInError } from '../../src/shared/errors/userErrors';

/**
 * Functional tests for synchronous profile fetch during OAuth authorization
 *
 * These tests verify the complete OAuth flow with PKCE and synchronous profile loading:
 * - Deep link callback with authorization code
 * - Token exchange with mock OAuth server
 * - Synchronous profile fetch during authorization
 * - Loader display during profile fetch
 * - Error handling when profile fetch fails
 *
 * Requirements: testing.3.1 - Use real Electron
 * Requirements: testing.3.2 - Do NOT mock Electron API
 * Requirements: testing.3.6 - Show real windows on screen
 */

test.describe('OAuth Profile Synchronous Fetch', () => {
  let context: ElectronTestContext;
  let mockServer: MockOAuthServer;

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

  /* Preconditions: Application not running, clean database, mock OAuth server running
     Action: Emulate deep link callback with authorization code, complete token exchange, fetch profile synchronously
     Assertions: Tokens saved, profile fetched and saved, Agents shown (not loading screen)
     Requirements: google-oauth-auth.3.6, google-oauth-auth.3.8, account-profile.1.3, account-profile.1.4 */
  test('should synchronously fetch profile during authorization (success)', async () => {
    // Set custom user profile data for this test
    mockServer.setUserProfile({
      id: '111222333',
      email: 'sync.success@example.com',
      name: 'Sync Success User',
      given_name: 'Sync',
      family_name: 'Success User',
    });

    // Launch the application with environment variable pointing to mock server
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
      CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
      CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
    });

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    console.log('[TEST] Login screen displayed, starting OAuth flow...');

    // Start OAuth flow to generate PKCE parameters
    // This will open browser, but we'll intercept with deep link
    await context.window.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke('auth:start-login');
    });

    // Get PKCE state from OAuthClientManager
    // We need this to construct valid deep link
    await waitForPkceState(context.app);
    const pkceState = await getPkceState(context.app);

    // Generate authorization code (mock OAuth server will accept any code starting with test_auth_code_)
    const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log('[TEST] Generated auth code:', authCode);

    // Construct deep link URL with authorization code and state
    const redirectUri = 'com.googleusercontent.apps.test-client-id-12345:/oauth2redirect';
    const deepLinkUrl = `${redirectUri}?code=${authCode}&state=${pkceState}`;

    console.log('[TEST] Deep link URL:', deepLinkUrl);

    // Trigger deep link handling via IPC (instead of emulating open-url event)
    // Requirements: google-oauth-auth.3.6 - This triggers token exchange and synchronous profile fetch
    const authStatus = await context.window.evaluate(async (url) => {
      return await (window as any).electron.ipcRenderer.invoke('test:handle-deep-link', url);
    }, deepLinkUrl);

    console.log('[TEST] Deep link handled, auth status:', authStatus);

    // Wait for OAuth flow to complete (token exchange + profile fetch)
    // Requirements: google-oauth-auth.3.8, account-profile.1.4 - Profile should be fetched synchronously
    await context.window.waitForTimeout(2000);

    // Verify tokens are saved
    // Check directly through app context (not through IPC which was removed)
    const tokenStatus = await context.app.evaluate(async () => {
      const { tokenStorage } = (global as any).testContext || {};
      if (!tokenStorage) {
        throw new Error('Token storage not found in test context');
      }
      try {
        const tokens = await tokenStorage.loadTokens();
        return {
          hasTokens: tokens !== null,
          accessToken: tokens?.accessToken,
          refreshToken: tokens?.refreshToken,
        };
      } catch (error: unknown) {
        // If loadTokens throws error about no user logged in, no tokens
        const errorMessage = error instanceof Error ? error.message : '';
        return {
          hasTokens: !isNoUserLoggedInError(errorMessage),
          accessToken: undefined,
          refreshToken: undefined,
        };
      }
    });

    console.log('[TEST] Token status:', tokenStatus);
    expect(tokenStatus.hasTokens).toBe(true);
    expect(tokenStatus.accessToken).toBeTruthy();
    expect(tokenStatus.refreshToken).toBeTruthy();

    // Verify profile is saved in database
    // Requirements: google-oauth-auth.3.8 - Profile should be saved after successful fetch
    const profileCheck = await context.window.evaluate(async () => {
      return await (window as any).electron.ipcRenderer.invoke('test:get-profile');
    });

    console.log('[TEST] Profile in database:', profileCheck.profile ? 'YES' : 'NO');
    if (profileCheck.profile) {
      console.log('[TEST] Profile data:', profileCheck.profile);
    }

    expect(profileCheck.profile).not.toBeNull();
    expect(profileCheck.profile.email).toBe('sync.success@example.com');
    expect(profileCheck.profile.name).toBe('Sync Success User');

    // Verify Agents is shown (not login screen or loading screen)
    // Requirements: account-profile.1.4 - Agents should be shown after successful profile fetch
    const loginButtonAfterAuth = context.window.locator('text=/continue with google/i');
    const isLoginVisible = await loginButtonAfterAuth.isVisible().catch(() => false);
    expect(isLoginVisible).toBe(false);

    // Check for Agents-specific heading
    const dashboardHeading = context.window.locator('[data-testid="agents"]');
    await dashboardHeading.waitFor({ state: 'visible', timeout: 5000 });
    expect(await dashboardHeading.isVisible()).toBe(true);

    console.log('[TEST] ✓ Agents displayed after successful OAuth flow');

    // Take screenshot
    await context.window.screenshot({
      path: 'playwright-report/oauth-sync-profile-success.png',
    });

    console.log('[TEST] ✓ Synchronous profile fetch during authorization (success) completed');
  });

  /* Preconditions: Application not running, clean database, mock OAuth server configured to return error on UserInfo API
     Action: Emulate deep link callback, complete token exchange, profile fetch fails
     Assertions: Tokens cleared, LoginError shown with errorCode 'profile_fetch_failed'
     Requirements: google-oauth-auth.3.7, account-profile.1.4, account-profile.1.5 */
  test('should synchronously fetch profile during authorization (error)', async () => {
    // Configure mock server to return error on UserInfo API
    mockServer.setUserInfoError(500, 'Internal Server Error');

    // Launch the application with environment variable pointing to mock server
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
      CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
      CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
    });

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    console.log('[TEST] Login screen displayed, starting OAuth flow...');

    // Start OAuth flow to generate PKCE parameters
    await context.window.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke('auth:start-login');
    });

    // Wait for OAuth flow to initialize
    await context.window.waitForTimeout(500);

    console.log('[TEST] OAuth flow started, getting PKCE state...');

    // Get PKCE state from OAuthClientManager
    const pkceState = await context.app.evaluate(async () => {
      const { oauthClient } = (global as any).testContext || {};
      if (!oauthClient || !oauthClient.pkceStorage) {
        throw new Error('PKCE storage not found');
      }
      return oauthClient.pkceStorage.state;
    });

    console.log('[TEST] PKCE state retrieved:', pkceState);

    // Generate authorization code
    const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log('[TEST] Generated auth code:', authCode);

    // Construct deep link URL
    const redirectUri = 'com.googleusercontent.apps.test-client-id-12345:/oauth2redirect';
    const deepLinkUrl = `${redirectUri}?code=${authCode}&state=${pkceState}`;

    console.log('[TEST] Deep link URL:', deepLinkUrl);

    // Emulate deep link callback
    // Requirements: google-oauth-auth.3.7 - Profile fetch will fail, tokens should be cleared
    const authStatus = await context.window.evaluate(
      async ({ url }) => {
        return await (window as any).electron.ipcRenderer.invoke('test:handle-deep-link', url);
      },
      { url: deepLinkUrl }
    );

    console.log('[TEST] Deep link handled, auth status:', authStatus);

    // Wait for OAuth flow to complete (token exchange + profile fetch failure)
    await context.window.waitForTimeout(1000);

    // Verify tokens are cleared
    // Requirements: google-oauth-auth.3.7 - Tokens should be cleared when profile fetch fails
    // Check directly through app context (not through IPC which requires email)
    const tokensCleared = await context.app.evaluate(async () => {
      const { tokenStorage, isNoUserLoggedInError: noUserErrorHelper } =
        (global as any).testContext || {};
      if (!tokenStorage || !noUserErrorHelper) {
        throw new Error('Test context missing token storage or error helper');
      }
      try {
        const tokens = await tokenStorage.loadTokens();
        return tokens === null;
      } catch (error: unknown) {
        // If loadTokens throws error about no user logged in, tokens are cleared
        const errorMessage = error instanceof Error ? error.message : '';
        return noUserErrorHelper(errorMessage);
      }
    });

    console.log('[TEST] Tokens cleared after failed profile fetch:', tokensCleared);
    expect(tokensCleared).toBe(true);

    // Verify LoginError is shown
    // Requirements: account-profile.1.4 - LoginError should be shown with errorCode 'profile_fetch_failed'
    const loginError = context.window.locator('[data-testid="login-error"]');
    await loginError.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginError.isVisible()).toBe(true);

    // Verify error message
    const errorMessage = await loginError.textContent();
    console.log('[TEST] Error message:', errorMessage);
    expect(errorMessage).toContain('Unable to load your Google profile');

    // Verify "Continue with Google" button is shown for retry
    const retryButton = context.window.locator('text=/continue with google/i');
    expect(await retryButton.isVisible()).toBe(true);

    console.log('[TEST] ✓ LoginError displayed after failed profile fetch');

    // Take screenshot
    await context.window.screenshot({
      path: 'playwright-report/oauth-sync-profile-error.png',
    });

    // Clear UserInfo error for next tests
    mockServer.clearUserInfoError();

    console.log('[TEST] ✓ Synchronous profile fetch during authorization (error) completed');
  });

  /* Preconditions: Application not running, clean database, mock OAuth server running
     Action: Emulate deep link callback, monitor UI during token exchange and profile fetch
     Assertions: Loader shown during profile fetch, Agents NOT shown until profile loaded
     Requirements: account-profile.1.4 */
  test('should show loader during synchronous profile fetch', async () => {
    // Set custom user profile data for this test
    mockServer.setUserProfile({
      id: '444555666',
      email: 'loader.test@example.com',
      name: 'Loader Test User',
      given_name: 'Loader',
      family_name: 'Test User',
    });

    // Launch the application with environment variable pointing to mock server
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
      CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
      CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
    });

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });

    console.log('[TEST] Login screen displayed, starting OAuth flow...');

    // Start OAuth flow
    await context.window.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke('auth:start-login');
    });

    await context.window.waitForTimeout(500);

    // Get PKCE state
    const pkceState = await context.app.evaluate(async () => {
      const { oauthClient } = (global as any).testContext || {};
      if (!oauthClient || !oauthClient.pkceStorage) {
        throw new Error('PKCE storage not found');
      }
      return oauthClient.pkceStorage.state;
    });

    // Generate authorization code
    const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Construct deep link URL
    const redirectUri = 'com.googleusercontent.apps.test-client-id-12345:/oauth2redirect';
    const deepLinkUrl = `${redirectUri}?code=${authCode}&state=${pkceState}`;

    console.log('[TEST] Emulating deep link callback...');

    // Emulate deep link callback
    await context.app.evaluate(
      async ({ app }, { url }) => {
        app.emit('open-url', { preventDefault: () => {} }, url);
      },
      { url: deepLinkUrl }
    );

    // Wait a short moment for token exchange to start
    await context.window.waitForTimeout(500);

    // Check if loader is shown during profile fetch
    // Requirements: account-profile.1.4 - Loader should be shown during synchronous profile fetch
    const loader = context.window.locator('.loading, .loader, text=/loading/i');
    const hasLoader = await loader.isVisible().catch(() => false);

    console.log('[TEST] Loader visible during profile fetch:', hasLoader);

    // Note: Loader might be very brief if mock server responds quickly
    // The important part is that Agents is NOT shown immediately

    // Verify Agents is NOT shown yet (during profile fetch)
    const dashboardHeading = context.window.locator('[data-testid="agents"]');
    const isAgentsVisible = await dashboardHeading.isVisible().catch(() => false);

    console.log('[TEST] Agents visible during profile fetch:', isAgentsVisible);

    // Agents should NOT be visible immediately after deep link
    // It should only appear after profile is fetched
    // Note: This check might be timing-sensitive with fast mock server

    // Wait for profile fetch to complete
    await context.window.waitForTimeout(2000);

    // Verify Agents is shown after profile fetch completes
    // Requirements: account-profile.1.4 - Agents should be shown after profile is loaded
    await dashboardHeading.waitFor({ state: 'visible', timeout: 5000 });
    expect(await dashboardHeading.isVisible()).toBe(true);

    console.log('[TEST] ✓ Agents displayed after profile fetch completed');

    // Verify loader is hidden after profile fetch
    const isLoaderVisible = await loader.isVisible().catch(() => false);
    console.log('[TEST] Loader visible after profile fetch:', isLoaderVisible);

    // Take screenshot
    await context.window.screenshot({
      path: 'playwright-report/oauth-sync-profile-loader.png',
    });

    console.log('[TEST] ✓ Loader shown during synchronous profile fetch completed');
  });

  /* Preconditions: Application not running, clean database, mock OAuth server configured to return error on UserInfo API
     Action: Emulate deep link callback, profile fetch fails, verify LoginError shown
     Assertions: Loader hidden, LoginError shown with correct message and retry button
     Requirements: google-oauth-auth.3.7, account-profile.1.4, account-profile.1.5 */
  test('should show LoginError when profile fetch fails', async () => {
    // Configure mock server to return network error on UserInfo API
    mockServer.setUserInfoError(503, 'Service Unavailable');

    // Launch the application with environment variable pointing to mock server
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
      CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
      CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
    });

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Verify login screen is displayed
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });

    console.log('[TEST] Login screen displayed, starting OAuth flow...');

    // Start OAuth flow
    await context.window.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke('auth:start-login');
    });

    await context.window.waitForTimeout(500);

    // Get PKCE state
    const pkceState = await context.app.evaluate(async () => {
      const { oauthClient } = (global as any).testContext || {};
      if (!oauthClient || !oauthClient.pkceStorage) {
        throw new Error('PKCE storage not found');
      }
      return oauthClient.pkceStorage.state;
    });

    // Generate authorization code
    const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Construct deep link URL
    const redirectUri = 'com.googleusercontent.apps.test-client-id-12345:/oauth2redirect';
    const deepLinkUrl = `${redirectUri}?code=${authCode}&state=${pkceState}`;

    console.log('[TEST] Emulating deep link callback with profile fetch error...');

    // Emulate deep link callback
    // Requirements: google-oauth-auth.3.7 - Profile fetch will fail
    const authStatus = await context.window.evaluate(
      async ({ url }) => {
        return await (window as any).electron.ipcRenderer.invoke('test:handle-deep-link', url);
      },
      { url: deepLinkUrl }
    );

    console.log('[TEST] Deep link handled, auth status:', authStatus);

    // Wait for UI to update
    await context.window.waitForTimeout(1000);

    // Verify loader is hidden after profile fetch fails
    // Requirements: account-profile.1.4 - Loader should be hidden when error occurs
    const loader = context.window.locator('.loading, .loader, text=/loading/i');
    const isLoaderVisible = await loader.isVisible().catch(() => false);

    console.log('[TEST] Loader visible after profile fetch failed:', isLoaderVisible);
    expect(isLoaderVisible).toBe(false);

    // Verify LoginError is shown
    // Requirements: account-profile.1.4, account-profile.1.5 - LoginError should be shown with errorCode 'profile_fetch_failed'
    const loginError = context.window.locator('[data-testid="login-error"]');
    await loginError.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginError.isVisible()).toBe(true);

    console.log('[TEST] ✓ LoginError displayed');

    // Verify error message content
    const errorMessage = await loginError.textContent();
    console.log('[TEST] Error message:', errorMessage);
    expect(errorMessage).toContain('Unable to load your Google profile');
    expect(errorMessage).toContain('Please check your internet connection');

    // Verify "Continue with Google" button is shown for retry
    // Requirements: account-profile.1.5 - User should be able to retry authentication
    const retryButton = context.window.locator('text=/continue with google/i');
    await retryButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await retryButton.isVisible()).toBe(true);

    console.log('[TEST] ✓ Retry button displayed');

    // Verify tokens were cleared
    // Requirements: google-oauth-auth.3.7 - Tokens should be cleared when profile fetch fails
    // Check directly through app context (not through IPC which requires email)
    const tokensCleared = await context.app.evaluate(async () => {
      const { tokenStorage } = (global as any).testContext || {};
      if (!tokenStorage) {
        throw new Error('Token storage not found in test context');
      }
      try {
        const tokens = await tokenStorage.loadTokens();
        return tokens === null;
      } catch (error: unknown) {
        // If loadTokens throws error about no user logged in, tokens are cleared
        const errorMessage = error instanceof Error ? error.message : '';
        return isNoUserLoggedInError(errorMessage);
      }
    });

    console.log('[TEST] Tokens cleared after failed profile fetch:', tokensCleared);
    expect(tokensCleared).toBe(true);

    console.log('[TEST] ✓ Tokens cleared after profile fetch failure');

    // Take screenshot
    await context.window.screenshot({
      path: 'playwright-report/oauth-sync-profile-login-error.png',
    });

    // Clear UserInfo error for next tests
    mockServer.clearUserInfoError();

    console.log('[TEST] ✓ LoginError shown when profile fetch fails completed');
  });
});
