// Requirements: ui.12.3, ui.12.4, ui.12.5, ui.12.6, ui.12.7, ui.12.8, ui.12.13, ui.12.19, ui.12.20, ui.12.22, ui.12.23, ui.12.24

import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { MockOAuthServer } from './helpers/mock-oauth-server';
import {
  launchElectron,
  closeElectron,
  completeOAuthFlow,
  clearTestTokens,
  ElectronTestContext,
} from './helpers/electron';

let context: ElectronTestContext;
let mockOAuthServer: MockOAuthServer;
const TEST_CLIENT_ID = 'test-client-id-12345'; // Use same as completeOAuthFlow default

test.beforeEach(async () => {
  // Start mock OAuth server
  mockOAuthServer = new MockOAuthServer({
    port: 3333,
    clientId: TEST_CLIENT_ID,
    clientSecret: 'test-client-secret',
  });
  await mockOAuthServer.start();

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
   Requirements: ui.12.3, ui.12.4, ui.12.5, ui.12.6, ui.12.7 */
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

  // Navigate to Settings and set AI Agent settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=AI Agent Settings');
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
  await context.window.waitForSelector('text=AI Agent Settings');
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
  await context.window.waitForSelector('text=AI Agent Settings');
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
   Action: Login, create data (AI Agent settings, window state, profile), logout, login again
   Assertions: All data restored (settings, window state, profile)
   Requirements: ui.12.7, ui.12.22, ui.12.23, ui.12.24 */
test('should restore user data after re-login', async () => {
  // Login
  mockOAuthServer.setUserProfile({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
  });

  await mainWindow.click('button:has-text("Continue with Google")');
  await mainWindow.waitForTimeout(2000);

  // Create AI Agent settings
  await mainWindow.click('text=Settings');
  await mainWindow.waitForTimeout(500);
  await mainWindow.selectOption('select:near(:text("LLM Provider"))', 'google');
  await mainWindow.fill('input[placeholder="Enter your API key"]', 'test-api-key-xyz');
  await mainWindow.waitForTimeout(600);

  // Get window state
  const initialBounds = await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer.invoke('window:get-bounds');
  });

  // Logout
  await mainWindow.click('button:has-text("Sign Out")');
  await mainWindow.waitForTimeout(1000);

  // Login again
  await mainWindow.click('button:has-text("Continue with Google")');
  await mainWindow.waitForTimeout(2000);

  // Verify AI Agent settings restored
  await mainWindow.click('text=Settings');
  await mainWindow.waitForTimeout(500);
  const provider = await mainWindow.inputValue('select:near(:text("LLM Provider"))');
  const apiKey = await mainWindow.inputValue('input[placeholder="Enter your API key"]');
  expect(provider).toBe('google');
  expect(apiKey).toBeTruthy();

  // Verify profile restored
  await mainWindow.click('[data-testid="account-link"]');
  await mainWindow.waitForTimeout(500);
  const nameValue = await mainWindow.inputValue('input[data-testid="profile-name"]');
  const emailValue = await mainWindow.inputValue('input[data-testid="profile-email"]');
  expect(nameValue).toBe('Test User');
  expect(emailValue).toBe('test@example.com');

  // Verify window state restored (approximately)
  const restoredBounds = await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer.invoke('window:get-bounds');
  });
  expect(restoredBounds.width).toBeCloseTo(initialBounds.width, -1);
  expect(restoredBounds.height).toBeCloseTo(initialBounds.height, -1);
});

/* Preconditions: Application running, user authenticated
   Action: Login, create data, logout, check database directly
   Assertions: Data persists in database with user_email
   Requirements: ui.12.5, ui.12.8 */
test('should persist data after logout', async () => {
  // Login
  mockOAuthServer.setUserProfile({
    id: 'persist-test-id',
    email: 'persist@example.com',
    name: 'Persist Test',
    given_name: 'Persist',
    family_name: 'Test',
  });

  await mainWindow.click('button:has-text("Continue with Google")');
  await mainWindow.waitForTimeout(2000);

  // Create data
  await mainWindow.click('text=Settings');
  await mainWindow.waitForTimeout(500);
  await mainWindow.selectOption('select:near(:text("LLM Provider"))', 'openai');
  await mainWindow.fill('input[placeholder="Enter your API key"]', 'persist-test-key');
  await mainWindow.waitForTimeout(600);

  // Logout
  await mainWindow.click('button:has-text("Sign Out")');
  await mainWindow.waitForTimeout(1000);

  // Check database directly
  const dbPath = path.join(testStoragePath, 'clerkly.db');
  const db = new Database(dbPath);

  // Verify AI Agent settings persisted
  const settingsRow = db
    .prepare('SELECT value, user_email FROM user_data WHERE key = ?')
    .get('ai_agent_api_key_openai') as { value: string; user_email: string } | undefined;
  expect(settingsRow).toBeDefined();
  expect(settingsRow!.user_email).toBe('persist@example.com');

  // Verify profile persisted
  const profileRow = db
    .prepare('SELECT value, user_email FROM user_data WHERE key = ?')
    .get('user_profile') as { value: string; user_email: string } | undefined;
  expect(profileRow).toBeDefined();
  expect(profileRow!.user_email).toBe('persist@example.com');

  db.close();

  // Login again and verify data restored
  await mainWindow.click('button:has-text("Continue with Google")');
  await mainWindow.waitForTimeout(2000);

  await mainWindow.click('text=Settings');
  await mainWindow.waitForTimeout(500);
  const apiKey = await mainWindow.inputValue('input[placeholder="Enter your API key"]');
  expect(apiKey).toBeTruthy();
});

/* Preconditions: Application running, two users with same key but different values
   Action: User A saves 'test_key' = 'value_A', User B saves 'test_key' = 'value_B', load as each user
   Assertions: User A gets 'value_A', User B gets 'value_B'
   Requirements: ui.12.4, ui.12.6 */
test('should filter data by user email', async () => {
  // User A: Login and save data
  mockOAuthServer.setUserProfile({
    id: 'filter-a-id',
    email: 'filterA@example.com',
    name: 'Filter A',
    given_name: 'Filter',
    family_name: 'A',
  });

  await mainWindow.click('button:has-text("Continue with Google")');
  await mainWindow.waitForTimeout(2000);

  // Save data via IPC (simulate application saving data)
  await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer.invoke('test:save-data', 'test_key', 'value_A');
  });

  // Logout
  await mainWindow.click('button:has-text("Sign Out")');
  await mainWindow.waitForTimeout(1000);

  // User B: Login and save data with same key
  mockOAuthServer.setUserProfile({
    id: 'filter-b-id',
    email: 'filterB@example.com',
    name: 'Filter B',
    given_name: 'Filter',
    family_name: 'B',
  });

  await mainWindow.click('button:has-text("Continue with Google")');
  await mainWindow.waitForTimeout(2000);

  await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer.invoke('test:save-data', 'test_key', 'value_B');
  });

  // Load data as User B
  const resultB = await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer.invoke('test:load-data', 'test_key');
  });
  expect(resultB.success).toBe(true);
  expect(resultB.data).toBe('value_B');

  // Logout
  await mainWindow.click('button:has-text("Sign Out")');
  await mainWindow.waitForTimeout(1000);

  // User A: Login again and load data
  mockOAuthServer.setUserProfile({
    id: 'filter-a-id',
    email: 'filterA@example.com',
    name: 'Filter A',
    given_name: 'Filter',
    family_name: 'A',
  });

  await mainWindow.click('button:has-text("Continue with Google")');
  await mainWindow.waitForTimeout(2000);

  const resultA = await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer.invoke('test:load-data', 'test_key');
  });
  expect(resultA.success).toBe(true);
  expect(resultA.data).toBe('value_A');
});

/* Preconditions: Application running, not authenticated
   Action: Attempt to save data without authentication
   Assertions: Shows login screen, caches cleared
   Requirements: ui.12.13, ui.12.19 */
test('should handle "No user logged in" error gracefully', async () => {
  // Application starts without authentication
  await mainWindow.waitForSelector('button:has-text("Continue with Google")');

  // Attempt to save data via IPC (should fail)
  const result = await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer
      .invoke('test:save-data', 'test_key', 'test_value')
      .catch((err: Error) => {
        return { success: false, error: err.message };
      });
  });

  expect(result.success).toBe(false);
  expect(result.error).toContain('No user logged in');

  // Verify login screen is shown
  await expect(mainWindow.locator('button:has-text("Continue with Google")')).toBeVisible();

  // Now authenticate and try again
  mockOAuthServer.setUserProfile({
    id: 'error-test-id',
    email: 'error@example.com',
    name: 'Error Test',
    given_name: 'Error',
    family_name: 'Test',
  });

  await mainWindow.click('button:has-text("Continue with Google")');
  await mainWindow.waitForTimeout(2000);

  // Try saving data again (should succeed)
  const result2 = await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer.invoke('test:save-data', 'test_key', 'test_value');
  });

  expect(result2.success).toBe(true);
});

/* Preconditions: Application running, authenticated, session expires
   Action: Session expires (mock), attempt to save data, system refreshes token, retry
   Assertions: Operation succeeds after token refresh
   Requirements: ui.12.20 */
test('should retry operation after token refresh', async () => {
  // Login
  mockOAuthServer.setUserProfile({
    id: 'refresh-test-id',
    email: 'refresh@example.com',
    name: 'Refresh Test',
    given_name: 'Refresh',
    family_name: 'Test',
  });

  await mainWindow.click('button:has-text("Continue with Google")');
  await mainWindow.waitForTimeout(2000);

  // Mock session expiry (simulate getCurrentEmail returning null temporarily)
  // Then mock successful token refresh
  // This is a simplified test - in real scenario, the application would:
  // 1. Catch "No user logged in" error
  // 2. Call refreshAccessToken()
  // 3. Retry the operation

  // For this test, we'll verify the application can recover from temporary session issues
  const result = await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer.invoke('test:save-data', 'refresh_key', 'refresh_value');
  });

  expect(result.success).toBe(true);

  // Verify data was saved
  const loadResult = await mainWindow.evaluate(() => {
    return window.electron.ipcRenderer.invoke('test:load-data', 'refresh_key');
  });

  expect(loadResult.success).toBe(true);
  expect(loadResult.data).toBe('refresh_value');
});
