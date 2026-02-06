// Requirements: ui.6.1, testing.3.1, testing.3.2, testing.3.6

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  setupTestTokens,
} from './helpers/electron';
import { MockOAuthServer } from './helpers/mock-oauth-server';

/**
 * Functional tests for Account Profile component
 *
 * These tests verify the Account Block behavior:
 * - Empty state when not authenticated
 * - Profile data display after authentication
 * - Read-only fields
 * - Profile updates
 * - Logout behavior
 *
 * Requirements: testing.3.1 - Use real Electron
 * Requirements: testing.3.2 - Do NOT mock Electron API
 * Requirements: testing.3.6 - Show real windows on screen
 */

test.describe('Account Profile', () => {
  let context: ElectronTestContext;
  let mockServer: MockOAuthServer;

  test.beforeAll(async () => {
    console.log('\n⚠️  WARNING: These tests will show real Electron windows on your screen!\n');

    // Start mock OAuth server for all tests
    mockServer = new MockOAuthServer({
      port: 8889,
      clientId: 'test-client-id-12345',
      clientSecret: 'test-client-secret-67890',
    });

    await mockServer.start();
    console.log(`[TEST] Mock OAuth server started at ${mockServer.getBaseUrl()}`);

    // Set CLERKLY_GOOGLE_API_URL to point to mock server
    process.env.CLERKLY_GOOGLE_API_URL = mockServer.getBaseUrl();
    console.log(`[TEST] CLERKLY_GOOGLE_API_URL set to ${process.env.CLERKLY_GOOGLE_API_URL}`);
  });

  test.afterAll(async () => {
    // Stop mock server after all tests
    if (mockServer) {
      await mockServer.stop();
      console.log('[TEST] Mock OAuth server stopped');
    }

    // Clean up environment variable
    delete process.env.CLERKLY_GOOGLE_API_URL;
  });

  test.afterEach(async () => {
    if (context) {
      await closeElectron(context);
    }
  });

  /* Preconditions: Application not running, clean database, no tokens
     Action: Launch application
     Assertions: Login screen is displayed (user cannot access Settings without authentication)
     Requirements: ui.6.1 */
  test('should show login screen when not authenticated', async () => {
    // Launch the application with clean database
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron();

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Wait a moment for React components to render
    await context.window.waitForTimeout(1000);

    // Requirements: ui.6.1 - When user is not authenticated, app shows login screen
    // User cannot access Settings (and Account block) without authentication
    const loginButton = context.window.locator('text=/continue with google/i');
    await loginButton.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButton.isVisible()).toBe(true);

    console.log('✓ Login screen is shown (user not authenticated)');
    console.log('✓ User cannot access Settings without authentication (per ui.6.1)');

    // Take screenshot of login screen
    await context.window.screenshot({
      path: 'playwright-report/account-login-screen-unauthenticated.png',
    });
  });

  /* Preconditions: Application not running, clean database, mock OAuth server running
     Action: Complete OAuth flow, wait for profile to load, navigate to Settings, check Account block
     Assertions: Account block is populated with profile data (name, email) from mock UserInfo API
     Requirements: ui.6.2, ui.6.3 */
  test('should populate profile data after Google OAuth login', async () => {
    // Set custom user profile data for this test
    mockServer.setUserProfile({
      id: '987654321',
      email: 'oauth.test@example.com',
      name: 'OAuth Test User',
      given_name: 'OAuth',
      family_name: 'Test User',
    });

    // Launch the application with clean database and environment variable
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Setup test tokens to simulate successful OAuth
    // Requirements: ui.6.2 - Profile should load after OAuth
    // Note: CLERKLY_GOOGLE_API_URL environment variable is set in beforeAll
    // to redirect API calls to mock server
    await setupTestTokens(context.window, {
      accessToken: 'test_access_token_oauth_flow',
      refreshToken: 'test_refresh_token_oauth_flow',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    console.log('[TEST] Tokens setup, waiting for profile to load...');

    // Trigger profile fetch and auth:success event
    // This simulates what happens after successful OAuth flow
    await context.window.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke('test:trigger-auth-success');
    });

    console.log('[TEST] Auth success triggered, profile should be loaded');

    // Wait longer for profile to be fetched, saved, and UI to update
    await context.window.waitForTimeout(3000);

    // Verify profile is in database
    const profileCheck = await context.window.evaluate(async () => {
      return await (window as any).electron.ipcRenderer.invoke('test:get-profile');
    });
    console.log('[TEST] Profile in database:', profileCheck.profile ? 'YES' : 'NO');
    if (profileCheck.profile) {
      console.log('[TEST] Profile data:', profileCheck.profile);
    }

    // Navigate to Settings to see Account block
    // First check if we're on login screen or main app
    const loginButton = context.window.locator('text=/continue with google/i');
    const hasLoginScreen = await loginButton.isVisible().catch(() => false);

    console.log('[TEST] Is on login screen:', hasLoginScreen);

    if (hasLoginScreen) {
      // If still on login screen, reload to trigger auth check
      console.log('[TEST] Reloading to trigger auth check...');
      await context.window.reload();
      await context.window.waitForLoadState('domcontentloaded');
      await context.window.waitForTimeout(2000);

      // Check again
      const stillOnLogin = await loginButton.isVisible().catch(() => false);
      console.log('[TEST] Still on login screen after reload:', stillOnLogin);
    }

    // Navigate to Settings
    const settingsNav = context.window.locator('text=/settings/i');
    console.log('[TEST] Looking for Settings button...');
    const settingsVisible = await settingsNav.isVisible().catch(() => false);
    console.log('[TEST] Settings button visible:', settingsVisible);

    await settingsNav.waitFor({ state: 'visible', timeout: 5000 });
    await settingsNav.click();
    console.log('[TEST] Clicked Settings button');
    await context.window.waitForTimeout(500);

    // Find Account block by looking for the "Account" heading
    // Requirements: ui.6.2, ui.6.3
    const accountHeading = context.window.locator('text=/^Account$/i');
    console.log('[TEST] Looking for Account heading...');
    await accountHeading.waitFor({ state: 'visible', timeout: 5000 });
    expect(await accountHeading.isVisible()).toBe(true);
    console.log('[TEST] Account heading found');

    // Check if "Not signed in" is displayed
    const notSignedIn = context.window.locator('text=/Not signed in/i');
    const hasNotSignedIn = await notSignedIn.isVisible().catch(() => false);
    console.log('[TEST] "Not signed in" visible:', hasNotSignedIn);

    // Check if loading state is displayed
    const loadingText = context.window.locator('text=/Loading profile/i');
    const hasLoading = await loadingText.isVisible().catch(() => false);
    console.log('[TEST] "Loading profile" visible:', hasLoading);

    // Check if error is displayed
    const errorText = context.window.locator('.account-error');
    const hasError = await errorText.isVisible().catch(() => false);
    console.log('[TEST] Error visible:', hasError);
    if (hasError) {
      const errorMessage = await errorText.textContent();
      console.log('[TEST] Error message:', errorMessage);
    }

    // Take screenshot to see what's displayed
    await context.window.screenshot({
      path: 'playwright-report/account-profile-debug.png',
    });
    console.log('[TEST] Screenshot saved');

    // Verify profile fields are populated
    // Requirements: ui.6.3 - Display name and email fields
    const nameInput = context.window.locator('#profile-name');
    const emailInput = context.window.locator('#profile-email');

    console.log('[TEST] Looking for profile input fields...');
    // Wait for inputs to be visible
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });

    // Get input values
    const nameValue = await nameInput.inputValue();
    const emailValue = await emailInput.inputValue();

    // Verify values match mock data
    // Requirements: ui.6.2 - Profile data should match UserInfo API response
    expect(nameValue).toBe('OAuth Test User');
    expect(emailValue).toBe('oauth.test@example.com');

    console.log(`✓ Profile populated: name="${nameValue}", email="${emailValue}"`);

    // Take screenshot for debugging
    await context.window.screenshot({
      path: 'playwright-report/account-profile-populated.png',
    });

    console.log('✓ Account block populated with profile data after OAuth login');
  });

  /* Preconditions: Application running with authentication, tokens saved, profile loaded
     Action: Locate profile input fields, check readOnly attribute, attempt to edit fields
     Assertions: Both fields have readOnly attribute, values don't change on input attempt, cursor doesn't activate fields
     Requirements: ui.6.4 */
  test('should not allow editing profile fields', async () => {
    // Set custom user profile data for this test
    mockServer.setUserProfile({
      id: '123456789',
      email: 'readonly.test@example.com',
      name: 'ReadOnly Test User',
      given_name: 'ReadOnly',
      family_name: 'Test User',
    });

    // Launch the application with clean database and environment variable
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Setup test tokens to simulate successful OAuth
    // Requirements: ui.6.4 - Need authenticated state to see profile fields
    // Note: CLERKLY_GOOGLE_API_URL environment variable is set in beforeAll
    // to redirect API calls to mock server
    await setupTestTokens(context.window, {
      accessToken: 'test_access_token_readonly',
      refreshToken: 'test_refresh_token_readonly',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    console.log('[TEST] Tokens setup, waiting for profile to load...');

    // Trigger profile fetch and auth:success event
    await context.window.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke('test:trigger-auth-success');
    });

    console.log('[TEST] Auth success triggered, profile should be loaded');

    // Wait for UI to update (profile fetch + UI render)
    await context.window.waitForTimeout(3000);

    // Verify profile is in database
    const profileCheck = await context.window.evaluate(async () => {
      return await (window as any).electron.ipcRenderer.invoke('test:get-profile');
    });
    console.log('[TEST] Profile in database:', profileCheck.profile ? 'YES' : 'NO');
    if (profileCheck.profile) {
      console.log('[TEST] Profile data:', profileCheck.profile);
    }

    // Navigate to Settings to see Account block
    const loginButton = context.window.locator('text=/continue with google/i');
    const hasLoginScreen = await loginButton.isVisible().catch(() => false);

    if (hasLoginScreen) {
      // If still on login screen, reload to trigger auth check
      await context.window.reload();
      await context.window.waitForLoadState('domcontentloaded');
      await context.window.waitForTimeout(1000);
    }

    // Navigate to Settings
    const settingsNav = context.window.locator('text=/settings/i');
    await settingsNav.waitFor({ state: 'visible', timeout: 5000 });
    await settingsNav.click();
    await context.window.waitForTimeout(500);

    // Take screenshot before looking for Account block
    await context.window.screenshot({
      path: 'playwright-report/account-readonly-before-account-block.png',
    });

    // Find Account block
    const accountHeading = context.window.locator('text=/^Account$/i');
    await accountHeading.waitFor({ state: 'visible', timeout: 5000 });

    // Take screenshot after finding Account block
    await context.window.screenshot({
      path: 'playwright-report/account-readonly-account-block-found.png',
    });

    // Wait for profile to load - check if profile fields appear
    // Requirements: ui.6.4 - Profile should be loaded and displayed
    const nameInput = context.window.locator('#profile-name');

    // Wait for name input to appear (this means profile is loaded)
    try {
      await nameInput.waitFor({ state: 'visible', timeout: 10000 });
      console.log('[TEST] Profile fields are visible');
    } catch (error) {
      // If profile fields don't appear, check if loading state is shown
      const loadingText = context.window.locator('text=/Loading profile/i');
      const isLoading = await loadingText.isVisible().catch(() => false);

      if (isLoading) {
        console.log('[TEST] ERROR: Profile still loading');
        await context.window.screenshot({
          path: 'playwright-report/account-readonly-still-loading.png',
        });
        throw new Error('Profile not loaded - Account block still shows loading state');
      }

      // Re-throw if it's a different error
      throw error;
    }
    const emailInput = context.window.locator('#profile-email');

    // Wait for inputs to be visible
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });

    // Get initial values
    const initialNameValue = await nameInput.inputValue();
    const initialEmailValue = await emailInput.inputValue();

    console.log(`[TEST] Initial values: name="${initialNameValue}", email="${initialEmailValue}"`);

    // Verify both fields have readOnly attribute
    // Requirements: ui.6.4 - Fields must have readOnly attribute
    const nameReadOnly = await nameInput.getAttribute('readonly');
    const emailReadOnly = await emailInput.getAttribute('readonly');

    expect(nameReadOnly).not.toBeNull();
    expect(emailReadOnly).not.toBeNull();

    console.log('✓ Both fields have readOnly attribute');

    // Attempt to click and type in name field
    // Requirements: ui.6.4 - Fields should not allow editing
    await nameInput.click();
    await context.window.waitForTimeout(200);

    // Try to fill the field (this should not work due to readOnly)
    try {
      await nameInput.fill('Attempted Edit Name', { timeout: 1000 });
    } catch (error) {
      // Expected to fail or have no effect
      console.log('✓ Name field rejected fill attempt (expected)');
    }

    // Try to type in the field
    try {
      await nameInput.type('X', { timeout: 1000 });
    } catch (error) {
      // Expected to fail or have no effect
      console.log('✓ Name field rejected type attempt (expected)');
    }

    // Attempt to click and type in email field
    await emailInput.click();
    await context.window.waitForTimeout(200);

    // Try to fill the field
    try {
      await emailInput.fill('edited@example.com', { timeout: 1000 });
    } catch (error) {
      // Expected to fail or have no effect
      console.log('✓ Email field rejected fill attempt (expected)');
    }

    // Try to type in the field
    try {
      await emailInput.type('Y', { timeout: 1000 });
    } catch (error) {
      // Expected to fail or have no effect
      console.log('✓ Email field rejected type attempt (expected)');
    }

    // Verify values haven't changed
    // Requirements: ui.6.4 - Values must remain unchanged
    const finalNameValue = await nameInput.inputValue();
    const finalEmailValue = await emailInput.inputValue();

    expect(finalNameValue).toBe(initialNameValue);
    expect(finalEmailValue).toBe(initialEmailValue);

    console.log('✓ Field values remained unchanged after edit attempts');

    // Verify fields are not editable by checking DOM properties
    // Requirements: ui.6.4 - Fields should not activate for editing
    const nameIsEditable = await nameInput.evaluate((el: HTMLInputElement) => {
      return !el.readOnly && !el.disabled;
    });

    const emailIsEditable = await emailInput.evaluate((el: HTMLInputElement) => {
      return !el.readOnly && !el.disabled;
    });

    expect(nameIsEditable).toBe(false);
    expect(emailIsEditable).toBe(false);

    console.log('✓ Fields are not editable (readOnly property confirmed)');

    // Take screenshot for debugging
    await context.window.screenshot({
      path: 'playwright-report/account-profile-readonly.png',
    });

    console.log('✓ Profile fields are read-only and cannot be edited');
  });

  /* Preconditions: Application running with authentication, initial profile data (name: "John Doe", email: "john@example.com")
     Action: Update mock UserInfo API to return new data, trigger manual refresh via IPC, wait for UI update
     Assertions: Account block displays updated data (name: "Jane Smith", email: "jane@example.com")
     Requirements: ui.6.5 */
  test('should update profile data when changed in Google', async () => {
    // Set initial user profile data
    mockServer.setUserProfile({
      id: '111222333',
      email: 'john@example.com',
      name: 'John Doe',
      given_name: 'John',
      family_name: 'Doe',
    });

    // Launch the application with clean database and environment variable
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Setup test tokens to simulate successful OAuth
    // Requirements: ui.6.5 - Need authenticated state with profile
    await setupTestTokens(context.window, {
      accessToken: 'test_access_token_update_profile',
      refreshToken: 'test_refresh_token_update_profile',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    console.log('[TEST] Tokens setup, waiting for initial profile to load...');

    // Trigger profile fetch and auth:success event
    await context.window.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke('test:trigger-auth-success');
    });

    console.log('[TEST] Auth success triggered, initial profile should be loaded');

    // Wait for UI to update
    await context.window.waitForTimeout(2000);

    // Navigate to Settings to see Account block
    const loginButton = context.window.locator('text=/continue with google/i');
    const hasLoginScreen = await loginButton.isVisible().catch(() => false);

    if (hasLoginScreen) {
      // If still on login screen, reload to trigger auth check
      await context.window.reload();
      await context.window.waitForLoadState('domcontentloaded');
      await context.window.waitForTimeout(1000);
    }

    // Navigate to Settings
    const settingsNav = context.window.locator('text=/settings/i');
    await settingsNav.waitFor({ state: 'visible', timeout: 5000 });
    await settingsNav.click();
    await context.window.waitForTimeout(500);

    // Find Account block
    const accountHeading = context.window.locator('text=/^Account$/i');
    await accountHeading.waitFor({ state: 'visible', timeout: 5000 });

    // Wait for profile fields to appear
    const nameInput = context.window.locator('#profile-name');
    const emailInput = context.window.locator('#profile-email');

    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });

    // Verify initial profile data
    // Requirements: ui.6.5 - Check initial state before update
    const initialNameValue = await nameInput.inputValue();
    const initialEmailValue = await emailInput.inputValue();

    console.log(`[TEST] Initial profile: name="${initialNameValue}", email="${initialEmailValue}"`);

    expect(initialNameValue).toBe('John Doe');
    expect(initialEmailValue).toBe('john@example.com');

    console.log('✓ Initial profile data verified');

    // Take screenshot of initial state
    await context.window.screenshot({
      path: 'playwright-report/account-profile-before-update.png',
    });

    // Update mock UserInfo API to return new profile data
    // Requirements: ui.6.5 - Simulate profile change in Google
    mockServer.setUserProfile({
      id: '111222333', // Same ID
      email: 'jane@example.com', // Updated email
      name: 'Jane Smith', // Updated name
      given_name: 'Jane',
      family_name: 'Smith',
    });

    console.log('[TEST] Mock UserInfo API updated with new profile data');

    // Trigger manual profile refresh via IPC (Variant B)
    // Requirements: ui.6.5 - Manual refresh to trigger profile update
    const refreshResult = await context.window.evaluate(async () => {
      return await (window as any).electron.ipcRenderer.invoke('auth:refresh-profile');
    });

    console.log('[TEST] Profile refresh triggered, result:', refreshResult);

    // Wait for UI to update (profile fetch + UI render)
    // Requirements: ui.6.5 - Allow time for profile update to propagate to UI
    await context.window.waitForTimeout(2000);

    // Verify updated profile data
    // Requirements: ui.6.5 - Profile should be updated in UI
    const updatedNameValue = await nameInput.inputValue();
    const updatedEmailValue = await emailInput.inputValue();

    console.log(`[TEST] Updated profile: name="${updatedNameValue}", email="${updatedEmailValue}"`);

    // Check that data has changed to new values
    // Requirements: ui.6.5 - Verify profile update
    expect(updatedNameValue).toBe('Jane Smith');
    expect(updatedEmailValue).toBe('jane@example.com');

    // Verify that data is different from initial values
    expect(updatedNameValue).not.toBe(initialNameValue);
    expect(updatedEmailValue).not.toBe(initialEmailValue);

    console.log('✓ Profile data updated successfully');
    console.log(`✓ Name changed from "${initialNameValue}" to "${updatedNameValue}"`);
    console.log(`✓ Email changed from "${initialEmailValue}" to "${updatedEmailValue}"`);

    // Take screenshot of updated state
    await context.window.screenshot({
      path: 'playwright-report/account-profile-after-update.png',
    });

    console.log('✓ Profile updates when data changes in Google (via manual refresh)');
  });

  /* Preconditions: Application running with authentication, profile data loaded and displayed
     Action: Verify profile is displayed, save values, execute logout via IPC, wait for completion
     Assertions: Account block cleared, "Not signed in" displayed, profile fields removed, data deleted from database
     Requirements: ui.6.8 */
  /* Preconditions: Application running with authentication, profile data loaded and displayed
     Action: Verify profile is displayed, save values, execute logout via IPC, wait for completion
     Assertions: Login screen is shown, profile data deleted from database
     Requirements: ui.6.8 */
  test('should clear profile data on logout', async () => {
    // Set user profile data for this test
    mockServer.setUserProfile({
      id: '555666777',
      email: 'logout.test@example.com',
      name: 'Logout Test User',
      given_name: 'Logout',
      family_name: 'Test User',
    });

    // Launch the application with clean database and environment variable
    // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    });

    // Wait for content to load
    await context.window.waitForLoadState('domcontentloaded');

    // Setup test tokens to simulate successful OAuth
    // Requirements: ui.6.8 - Need authenticated state with profile
    await setupTestTokens(context.window, {
      accessToken: 'test_access_token_logout',
      refreshToken: 'test_refresh_token_logout',
      expiresIn: 3600,
      tokenType: 'Bearer',
    });

    console.log('[TEST] Tokens setup, waiting for profile to load...');

    // Trigger profile fetch and auth:success event
    await context.window.evaluate(async () => {
      await (window as any).electron.ipcRenderer.invoke('test:trigger-auth-success');
    });

    console.log('[TEST] Auth success triggered, profile should be loaded');

    // Wait for UI to update
    await context.window.waitForTimeout(2000);

    // Navigate to Settings to see Account block
    const loginButton = context.window.locator('text=/continue with google/i');
    const hasLoginScreen = await loginButton.isVisible().catch(() => false);

    if (hasLoginScreen) {
      // If still on login screen, reload to trigger auth check
      await context.window.reload();
      await context.window.waitForLoadState('domcontentloaded');
      await context.window.waitForTimeout(1000);
    }

    // Navigate to Settings
    const settingsNav = context.window.locator('text=/settings/i');
    await settingsNav.waitFor({ state: 'visible', timeout: 5000 });
    await settingsNav.click();
    await context.window.waitForTimeout(500);

    // Find Account block
    const accountHeading = context.window.locator('text=/^Account$/i');
    await accountHeading.waitFor({ state: 'visible', timeout: 5000 });

    // Wait for profile fields to appear
    // Requirements: ui.6.8 - Verify profile is displayed before logout
    const nameInput = context.window.locator('#profile-name');
    const emailInput = context.window.locator('#profile-email');

    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await emailInput.waitFor({ state: 'visible', timeout: 5000 });

    // Save displayed values for verification
    // Requirements: ui.6.8 - Check that profile data is present before logout
    const displayedName = await nameInput.inputValue();
    const displayedEmail = await emailInput.inputValue();

    console.log(`[TEST] Profile before logout: name="${displayedName}", email="${displayedEmail}"`);

    expect(displayedName).toBe('Logout Test User');
    expect(displayedEmail).toBe('logout.test@example.com');

    console.log('✓ Profile data is displayed before logout');

    // Take screenshot before logout
    await context.window.screenshot({
      path: 'playwright-report/account-profile-before-logout.png',
    });

    // Execute logout via IPC call (more reliable for testing)
    // Requirements: ui.6.8 - Perform logout operation
    console.log('[TEST] Executing logout...');

    const logoutResult = await context.window.evaluate(async () => {
      return await (window as any).electron.ipcRenderer.invoke('auth:logout');
    });

    console.log('[TEST] Logout result:', logoutResult);
    expect(logoutResult.success).toBe(true);

    // Wait for logout to complete and UI to update
    // Requirements: ui.6.8 - Allow time for logout operation to complete
    await context.window.waitForTimeout(2000);

    // Verify login screen is shown after logout
    // Requirements: ui.6.1, ui.6.8 - After logout, user should see login screen
    const loginButtonAfterLogout = context.window.locator('text=/continue with google/i');
    await loginButtonAfterLogout.waitFor({ state: 'visible', timeout: 5000 });
    expect(await loginButtonAfterLogout.isVisible()).toBe(true);

    console.log('✓ Login screen is shown after logout');

    // Take screenshot after logout
    await context.window.screenshot({
      path: 'playwright-report/account-profile-after-logout.png',
    });

    // Verify data is deleted from database
    // Requirements: ui.6.8 - Check that profile data is removed from storage
    const profileCheck = await context.window.evaluate(async () => {
      return await (window as any).electron.ipcRenderer.invoke('test:get-profile');
    });

    console.log('[TEST] Profile in database after logout:', profileCheck.profile ? 'YES' : 'NO');

    // Profile should be null or undefined after logout
    expect(profileCheck.profile).toBeNull();

    console.log('✓ Profile data deleted from database');
    console.log('✓ Logout completed successfully: login screen shown, profile data cleared');
  });
});
