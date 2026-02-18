// Requirements: user-data-isolation.0.3, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.1.4, user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.4.1, user-data-isolation.4.4

import { test, expect } from '@playwright/test';
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import {
  launchElectron,
  closeElectron,
  completeOAuthFlow,
  clearTestTokens,
  ElectronTestContext,
  getWindowBounds,
} from './helpers/electron';

let context: ElectronTestContext;
let mockOAuthServer: MockOAuthServer;
const TEST_CLIENT_ID = 'test-client-id-12345'; // Use same as completeOAuthFlow default
const TEST_CLIENT_SECRET = 'test-client-secret-67890'; // Use same as OAuthConfig

test.beforeEach(async () => {
  mockOAuthServer = await createMockOAuthServer(3333);

  // Launch Electron app with mock OAuth server
  context = await launchElectron(undefined, {
    CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
  });
  await context.window.waitForLoadState('domcontentloaded');
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
  }

  if (mockOAuthServer) {
    await mockOAuthServer.stop();
  }
});

/* Preconditions: Application running, two different users
   Action: Login as User A, create data, logout, login as User B, create data, logout, login as User A
   Assertions: User A sees only their data, User B sees only their data, data persists after logout
   Requirements: user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.4.4 */
test('should isolate data between different users', async () => {
  // User A: Login and create data
  mockOAuthServer.setUserProfile({
    id: 'user-a-id',
    email: 'userA@example.com',
    name: 'User A',
    given_name: 'User',
    family_name: 'A',
  });

  // Complete OAuth flow for User A
  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Navigate to Settings and set LLM Provider settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);

  // Select OpenAI and enter API key for User A
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'openai');
  await context.window.fill('input[placeholder="Enter your API key"]', 'user-a-api-key-12345');
  await context.window.waitForTimeout(600); // Wait for debounce

  // Logout User A - clear tokens and restart
  await clearTestTokens(context.window);
  const testDataPath = context.testDataPath;
  await closeElectron(context, false); // Keep data

  // Relaunch app
  context = await launchElectron(testDataPath, {
    CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
  });
  await context.window.waitForLoadState('domcontentloaded');

  // User B: Login and create data
  mockOAuthServer.setUserProfile({
    id: 'user-b-id',
    email: 'userB@example.com',
    name: 'User B',
    given_name: 'User',
    family_name: 'B',
  });

  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);

  // Verify User B sees empty settings (not User A's data)
  const providerValue = await context.window.inputValue('select:near(:text("LLM Provider"))');
  const apiKeyValue = await context.window.inputValue('input[placeholder="Enter your API key"]');
  expect(providerValue).toBe('openai'); // Default value
  expect(apiKeyValue).toBe(''); // Empty, not User A's key

  // Select Anthropic and enter API key for User B
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'anthropic');
  await context.window.fill('input[placeholder="Enter your API key"]', 'user-b-api-key-67890');
  await context.window.waitForTimeout(600);

  // Logout User B - clear tokens and restart
  await clearTestTokens(context.window);
  await closeElectron(context, false); // Keep data

  // Relaunch app
  context = await launchElectron(testDataPath, {
    CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
  });
  await context.window.waitForLoadState('domcontentloaded');

  // User A: Login again and verify data restored
  mockOAuthServer.setUserProfile({
    id: 'user-a-id',
    email: 'userA@example.com',
    name: 'User A',
    given_name: 'User',
    family_name: 'A',
  });

  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);

  // Verify User A's data restored
  const restoredProvider = await context.window.inputValue('select:near(:text("LLM Provider"))');
  const restoredApiKey = await context.window.inputValue('input[placeholder="Enter your API key"]');
  expect(restoredProvider).toBe('openai');
  expect(restoredApiKey).toBeTruthy(); // Should have User A's key

  // Verify User B's data NOT visible
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'anthropic');
  await context.window.waitForTimeout(500);
  const anthropicKey = await context.window.inputValue('input[placeholder="Enter your API key"]');
  expect(anthropicKey).toBe(''); // Empty, not User B's key
});

/* Preconditions: Application running, user authenticated
   Action: Login, create data (LLM Provider settings, window state, profile), logout, login again
   Assertions: All data restored (settings, window state, profile)
   Requirements: user-data-isolation.0.3, user-data-isolation.1.3 */
test('should restore user data after re-login', async () => {
  // Login
  mockOAuthServer.setUserProfile({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
  });

  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Create LLM Provider settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'google');
  await context.window.fill('input[placeholder="Enter your API key"]', 'test-api-key-xyz');
  await context.window.waitForTimeout(600);

  // Get window state
  const initialBounds = await getWindowBounds(context.app);

  // Logout
  await context.window.click('button:has-text("Sign out")');
  await context.window.waitForTimeout(1000);

  // Login again
  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Verify LLM Provider settings restored
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);
  const provider = await context.window.inputValue('select:near(:text("LLM Provider"))');
  const apiKey = await context.window.inputValue('input[placeholder="Enter your API key"]');
  expect(provider).toBe('google');
  expect(apiKey).toBeTruthy();

  // Verify profile restored (Account section is on Settings page)
  const nameValue = await context.window.inputValue('input:near(:text("Full Name"))');
  const emailValue = await context.window.inputValue('input:near(:text("Email"))');
  expect(nameValue).toBe('Test User');
  expect(emailValue).toBe('test@example.com');

  // Verify window state restored (approximately)
  const restoredBounds = await getWindowBounds(context.app);
  expect(restoredBounds.width).toBeCloseTo(initialBounds.width, -1);
  expect(restoredBounds.height).toBeCloseTo(initialBounds.height, -1);
});

/* Preconditions: Application running, user authenticated
   Action: Login, create data, logout, check database directly
   Assertions: Data persists in database with user_id
   Requirements: user-data-isolation.1.4, user-data-isolation.2.4 */
test('should persist data after logout', async () => {
  // Login
  mockOAuthServer.setUserProfile({
    id: 'persist-test-id',
    email: 'persist@example.com',
    name: 'Persist Test',
    given_name: 'Persist',
    family_name: 'Test',
  });

  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Create data
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'openai');
  await context.window.fill('input[placeholder="Enter your API key"]', 'persist-test-key');
  await context.window.waitForTimeout(600);

  // Logout
  await context.window.click('button:has-text("Sign out")');
  await context.window.waitForTimeout(1000);

  // Login again and verify data restored (this verifies data persisted after logout)
  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);
  const apiKey = await context.window.inputValue('input[placeholder="Enter your API key"]');
  expect(apiKey).toBeTruthy();

  // Verify profile also persisted
  const nameValue = await context.window.inputValue('input:near(:text("Full Name"))');
  const emailValue = await context.window.inputValue('input:near(:text("Email"))');
  expect(nameValue).toBe('Persist Test');
  expect(emailValue).toBe('persist@example.com');
});

/* Preconditions: Application running, two users with same key but different values
   Action: User A saves 'test_key' = 'value_A', User B saves 'test_key' = 'value_B', load as each user
   Assertions: User A gets 'value_A', User B gets 'value_B'
   Requirements: user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.4.4 */
test('should filter data by user_id', async () => {
  // User A: Login and save data
  mockOAuthServer.setUserProfile({
    id: 'filter-a-id',
    email: 'filterA@example.com',
    name: 'Filter A',
    given_name: 'Filter',
    family_name: 'A',
  });

  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Save data - use LLM Provider settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'openai');
  await context.window.fill('input[placeholder="Enter your API key"]', 'user-a-key-123');
  await context.window.waitForTimeout(600);

  // Logout
  await context.window.click('button:has-text("Sign out")');
  await context.window.waitForTimeout(1000);

  // User B: Login and save data with different provider
  mockOAuthServer.setUserProfile({
    id: 'filter-b-id',
    email: 'filterB@example.com',
    name: 'Filter B',
    given_name: 'Filter',
    family_name: 'B',
  });

  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'anthropic');
  await context.window.fill('input[placeholder="Enter your API key"]', 'user-b-key-456');
  await context.window.waitForTimeout(600);

  // Load data as User B - verify User B sees their own data
  const providerB = await context.window.inputValue('select:near(:text("LLM Provider"))');
  const apiKeyB = await context.window.inputValue('input[placeholder="Enter your API key"]');
  expect(providerB).toBe('anthropic');
  expect(apiKeyB).toBe('user-b-key-456');

  // Logout
  await context.window.click('button:has-text("Sign out")');
  await context.window.waitForTimeout(1000);

  // User A: Login again and load data
  mockOAuthServer.setUserProfile({
    id: 'filter-a-id',
    email: 'filterA@example.com',
    name: 'Filter A',
    given_name: 'Filter',
    family_name: 'A',
  });

  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);

  // Verify User A sees their own data (not User B's)
  const providerA = await context.window.inputValue('select:near(:text("LLM Provider"))');
  const apiKeyA = await context.window.inputValue('input[placeholder="Enter your API key"]');
  expect(providerA).toBe('openai');
  expect(apiKeyA).toBe('user-a-key-123');
});

/* Preconditions: Application running, not authenticated
   Action: Attempt to save data without authentication
   Assertions: Shows login screen, caches cleared
   Requirements: user-data-isolation.3.2, user-data-isolation.4.1 */
test('should handle "No user logged in" error gracefully', async () => {
  // Close the authenticated context from beforeEach
  await closeElectron(context);

  // 1) Launch app WITHOUT authentication
  context = await launchElectron(undefined, {
    CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
  });
  await context.window.waitForLoadState('domcontentloaded');
  await context.window.waitForSelector('button:has-text("Continue with Google")');

  // 2) Authenticate
  mockOAuthServer.setUserProfile({
    id: 'error-test-id',
    email: 'error@example.com',
    name: 'Error Test',
    given_name: 'Error',
    family_name: 'Test',
  });

  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // 3) Sign out
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
  await context.window.waitForTimeout(500);
  await context.window.click('button:has-text("Sign out")');

  // Wait for sign out to complete and login screen to appear
  await context.window.waitForSelector('button:has-text("Continue with Google")', {
    timeout: 5000,
  });
  await context.window.waitForTimeout(2000); // Additional wait for cleanup

  // 4) Try to save data via IPC (should fail - no user logged in)
  const result = await context.window.evaluate(() => {
    return window.electron.ipcRenderer
      .invoke('test:save-data', 'test_key', 'test_value')
      .catch((err: Error) => {
        return { success: false, error: err.message };
      });
  });

  expect(result.success).toBe(false);
  expect(result.error).toContain('No user logged in');

  // 5) Verify interface doesn't show error (error is only logged)
  // Login screen should still be visible without error notifications
  await expect(context.window.locator('button:has-text("Continue with Google")')).toBeVisible();
});

/* Preconditions: Application running, authenticated, token expires
   Action: Token expires, attempt to refresh profile (API request), system refreshes token automatically, operation succeeds
   Assertions: Profile refresh succeeds after automatic token refresh, /userinfo uses refreshed token
   Requirements: user-data-isolation.4.2 */
test('should retry operation after token refresh', async () => {
  // 1) Login
  mockOAuthServer.setUserProfile({
    id: 'refresh-test-id',
    email: 'refresh@example.com',
    name: 'Refresh Test',
    given_name: 'Refresh',
    family_name: 'Test',
  });

  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // 2) Get initial access token
  const initialTokensResult = await context.window.evaluate(() => {
    return (window as any).electron.ipcRenderer.invoke('test:get-tokens');
  });

  expect(initialTokensResult.success).toBe(true);
  const initialAccessToken = initialTokensResult.tokens.accessToken;
  console.log('[TEST] Initial access token:', initialAccessToken);

  // 3) Reset mock server tracking
  mockOAuthServer.resetLastUserInfoAccessToken();

  // 4) Expire the token to simulate token expiration
  const expireResult = await context.window.evaluate(() => {
    return (window as any).electron.ipcRenderer.invoke('test:expire-token');
  });

  expect(expireResult.success).toBe(true);

  // 5) Try to refresh profile - this makes an API request to Google UserInfo API
  // System should automatically detect expired token, refresh it, and retry the request
  const refreshResult = await context.window.evaluate(() => {
    return (window as any).electron.ipcRenderer.invoke('auth:refresh-user');
  });

  // 6) Verify profile refresh succeeded (token was automatically refreshed)
  expect(refreshResult.success).toBe(true);
  expect(refreshResult.user).toBeTruthy();
  expect(refreshResult.user.email).toBe('refresh@example.com');

  // 7) Get new access token after refresh
  const newTokensResult = await context.window.evaluate(() => {
    return (window as any).electron.ipcRenderer.invoke('test:get-tokens');
  });

  expect(newTokensResult.success).toBe(true);
  const newAccessToken = newTokensResult.tokens.accessToken;
  console.log('[TEST] New access token:', newAccessToken);

  // 8) Verify token changed
  expect(newAccessToken).not.toBe(initialAccessToken);
  expect(newAccessToken).toContain('refreshed'); // Refreshed tokens have 'refreshed' in them

  // 9) Verify /userinfo request used the refreshed token
  const lastUserInfoToken = mockOAuthServer.getLastUserInfoAccessToken();
  console.log('[TEST] Last UserInfo access token:', lastUserInfoToken);
  expect(lastUserInfoToken).toBe(newAccessToken);
});
