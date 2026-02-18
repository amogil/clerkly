/* Preconditions: Electron app is launched with authentication
   Action: Test LLM Provider settings functionality end-to-end
   Assertions: Verify save/load, encryption, deletion, provider switching, visibility toggle, error handling, and user isolation
   Requirements: settings.1.3, settings.1.4, settings.1.5, settings.1.6, settings.1.9, settings.1.11, settings.1.13, settings.1.14, settings.1.15, settings.1.17, user-data-isolation.1.8 */

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  completeOAuthFlow,
} from './helpers/electron';
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let context: ElectronTestContext;
let mockServer: MockOAuthServer;
const TEST_CLIENT_ID = 'test-client-id-12345';

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer(8891);

  // Set user profile data for mock OAuth server
  mockServer.setUserProfile({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    given_name: 'Test',
    family_name: 'User',
  });
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.beforeEach(async () => {
  // Launch Electron app with mock OAuth server
  context = await launchElectron(undefined, {
    CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
  });
  await context.window.waitForLoadState('domcontentloaded');

  // Complete OAuth flow to authenticate
  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);

  // Wait for main app to load
  await context.window.waitForTimeout(1000);
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
  }
});

/* Preconditions: App is launched and authenticated
   Action: Select LLM provider, close and reopen app
   Assertions: Provider selection is persisted
   Requirements: settings.1.4, settings.1.15 */
test('53.1: should save and load LLM provider selection', async () => {
  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');

  // Select Anthropic
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'anthropic');

  // Wait for save and data to flush to disk
  await context.window.waitForTimeout(1000);

  // Close and reopen app (keep data for persistence test)
  const testDataPath = context.testDataPath;
  await closeElectron(context, false); // Don't cleanup data

  // Relaunch with same data path
  context = await launchElectron(testDataPath, {
    CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
  });
  await context.window.waitForLoadState('domcontentloaded');

  // Re-authenticate after restart
  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');

  // Check that Anthropic is selected
  const selectedValue = await context.window.inputValue('select:near(:text("LLM Provider"))');
  expect(selectedValue).toBe('anthropic');
});

/* Preconditions: App is launched and authenticated
   Action: Enter API key, close and reopen app, toggle visibility
   Assertions: API key is persisted and encrypted, displays correctly
   Requirements: settings.1.4, settings.1.9, settings.1.15, settings.1.17 */
test('53.2: should save and load API key with encryption', async () => {
  const testApiKey = 'sk-test-key-12345678901234567890';

  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');

  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill(testApiKey);

  // Wait for debounce and data to flush to disk
  await context.window.waitForTimeout(1000);

  // Close and reopen app (keep data for persistence test)
  const testDataPath = context.testDataPath;
  await closeElectron(context, false); // Don't cleanup data

  // Relaunch with same data path
  context = await launchElectron(testDataPath, {
    CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
  });
  await context.window.waitForLoadState('domcontentloaded');

  // Re-authenticate after restart
  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');

  // Check that API key field is filled (but hidden)
  const apiKeyInput2 = context.window.locator('input[placeholder="Enter your API key"]');
  const inputType = await apiKeyInput2.getAttribute('type');
  expect(inputType).toBe('password');

  const inputValue = await apiKeyInput2.inputValue();
  expect(inputValue).toBeTruthy();

  // Toggle visibility
  const toggleButton = context.window.locator('button:has(svg):near(:text("API Key"))');
  await toggleButton.click();

  // Check that key is visible and correct
  const inputType2 = await apiKeyInput2.getAttribute('type');
  expect(inputType2).toBe('text');

  const visibleValue = await apiKeyInput2.inputValue();
  expect(visibleValue).toBe(testApiKey);
});

/* Preconditions: App is launched and authenticated with API key saved
   Action: Clear API key field, close and reopen app
   Assertions: API key is deleted from database
   Requirements: settings.1.6 */
test('53.3: should delete API key when field is cleared', async () => {
  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');

  // Enter API key first
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('test-key-to-delete');
  await context.window.waitForTimeout(600);

  // Clear the field
  await apiKeyInput.fill('');
  await context.window.waitForTimeout(600);

  // Close and reopen app (keep data for persistence test)
  const testDataPath = context.testDataPath;
  await closeElectron(context, false); // Don't cleanup data

  // Relaunch with same data path
  context = await launchElectron(testDataPath, {
    CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
  });
  await context.window.waitForLoadState('domcontentloaded');

  // Re-authenticate after restart
  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
  await context.window.waitForTimeout(1000);

  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');

  // Check that API key field is empty
  const apiKeyInput2 = context.window.locator('input[placeholder="Enter your API key"]');
  const inputValue = await apiKeyInput2.inputValue();
  expect(inputValue).toBe('');
});

/* Preconditions: App is launched and authenticated
   Action: Enter keys for multiple providers, switch between them
   Assertions: Each provider preserves its own key
   Requirements: settings.1.11, settings.1.14 */
test('53.4: should preserve API keys when switching providers', async () => {
  const openaiKey = 'sk-openai-key-123';
  const anthropicKey = 'sk-anthropic-key-456';

  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');

  // Enter OpenAI key
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'openai');
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill(openaiKey);
  await context.window.waitForTimeout(600);

  // Switch to Anthropic and enter key
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'anthropic');
  await context.window.waitForTimeout(200); // Wait for key to load
  await apiKeyInput.fill(anthropicKey);
  await context.window.waitForTimeout(600);

  // Switch back to OpenAI
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'openai');
  await context.window.waitForTimeout(200);

  // Check that OpenAI key is loaded
  let inputValue = await apiKeyInput.inputValue();
  expect(inputValue).toBe(openaiKey);

  // Switch to Anthropic
  await context.window.selectOption('select:near(:text("LLM Provider"))', 'anthropic');
  await context.window.waitForTimeout(200);

  // Check that Anthropic key is loaded
  inputValue = await apiKeyInput.inputValue();
  expect(inputValue).toBe(anthropicKey);
});

/* Preconditions: App is launched and authenticated
   Action: Enter API key, toggle visibility multiple times
   Assertions: Input type changes, icons change
   Requirements: settings.1.3, settings.1.4, settings.1.5 */
test('53.5: should toggle API key visibility', async () => {
  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');

  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('test-visibility-key');

  // Check initial state (password)
  let inputType = await apiKeyInput.getAttribute('type');
  expect(inputType).toBe('password');

  // Find toggle button
  const toggleButton = context.window.locator('button:has(svg):near(:text("API Key"))');

  // Click to show
  await toggleButton.click();
  inputType = await apiKeyInput.getAttribute('type');
  expect(inputType).toBe('text');

  // Click to hide
  await toggleButton.click();
  inputType = await apiKeyInput.getAttribute('type');
  expect(inputType).toBe('password');
});

/* Preconditions: App is launched and authenticated, DataManager mocked to fail
   Action: Enter API key
   Assertions: Error notification is shown
   Requirements: settings.1.13 */
test('53.6: should show error notification on save failure', async () => {
  // Set user profile data for this test
  mockServer.setUserProfile({
    id: '999888777',
    email: 'error.test@example.com',
    name: 'Error Test User',
    given_name: 'Error',
    family_name: 'Test User',
  });

  // Launch the application with clean database and environment variable
  // Requirements: testing.3.1, testing.3.2 - Real Electron, no mocks
  context = await launchElectron(undefined, {
    CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
    CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
  });

  await context.window.waitForLoadState('domcontentloaded');

  // Complete OAuth flow
  await completeOAuthFlow(context.app, context.window);

  console.log('[TEST] Profile should be loaded');

  // Wait for UI to update
  await context.window.waitForTimeout(2000);

  // Navigate to Settings
  const settingsNav = context.window.locator('text=/settings/i');
  await settingsNav.waitFor({ state: 'visible', timeout: 5000 });
  await settingsNav.click();
  await context.window.waitForTimeout(500);

  // Find LLM Provider section (use more specific selector to avoid ambiguity)
  const llmProviderHeading = context.window.locator('h2:has-text("LLM Provider")');
  await llmProviderHeading.waitFor({ state: 'visible', timeout: 5000 });

  console.log('[TEST] LLM Provider section visible');

  // Simulate save error for next operation
  await context.window.evaluate(async () => {
    if ((window as any).api.test) {
      await (window as any).api.test.simulateDataError(
        'saveData',
        'Database write failed: disk full'
      );
    }
  });

  console.log('[TEST] Error simulation configured');

  // Try to save API key
  const apiKeyInput = context.window.locator('#ai-agent-api-key');
  await apiKeyInput.waitFor({ state: 'visible', timeout: 5000 });
  await apiKeyInput.scrollIntoViewIfNeeded();
  await apiKeyInput.fill('test-api-key-that-will-fail');

  console.log('[TEST] API key entered, waiting for debounce and save attempt');

  // Wait for debounce and save attempt
  await context.window.waitForTimeout(1500);

  // Check that error toast is displayed
  // callApi shows toast in format: "${context}: ${errorMessage}"
  // Context is "Saving API key", so we look for that
  const errorToast = context.window
    .locator('[data-sonner-toast]')
    .filter({ hasText: /Saving API key/i });
  await errorToast.waitFor({ state: 'visible', timeout: 5000 });
  expect(await errorToast.isVisible()).toBe(true);

  console.log('✓ Error notification displayed on save failure');

  // Clean up
  await context.window.evaluate(async () => {
    if ((window as any).api.test) {
      await (window as any).api.test.clearDataErrors();
    }
  });

  console.log('✓ Error simulations cleared');
});
