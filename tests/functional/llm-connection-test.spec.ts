/* Preconditions: Electron app is launched with authentication
   Action: Test LLM connection testing functionality end-to-end
   Assertions: Verify Test Connection button behavior, success/error notifications, and all providers
   Requirements: settings.3.1, settings.3.2, settings.3.3, settings.3.4, settings.3.7, settings.3.8 */

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  completeOAuthFlow,
} from './helpers/electron';
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { MockLLMServer } from './helpers/mock-llm-server';

let context: ElectronTestContext;
let mockOAuthServer: MockOAuthServer;
let mockLLMServer: MockLLMServer;
const TEST_CLIENT_ID = 'test-client-id-12345';

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer();

  // Set user profile data for mock OAuth server
  mockOAuthServer.setUserProfile({
    id: 'test-user-llm-connection',
    email: 'llm-test@example.com',
    name: 'LLM Test User',
    given_name: 'LLM',
    family_name: 'Test User',
  });

  // Start mock LLM server
  mockLLMServer = new MockLLMServer({
    port: 8893,
  });

  await mockLLMServer.start();
});

test.afterAll(async () => {
  // Stop mock servers
  if (mockOAuthServer) {
    await mockOAuthServer.stop();
  }
  if (mockLLMServer) {
    await mockLLMServer.stop();
  }
});

test.beforeEach(async () => {
  // Clear request logs
  mockLLMServer.clearRequestLogs();
  mockLLMServer.setSuccess(true);
  mockLLMServer.setDelay(0); // Reset delay

  // Launch Electron app with mock servers
  const mockLLMBaseUrl = mockLLMServer.getBaseUrl();
  context = await launchElectron(undefined, {
    CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    CLERKLY_OPENAI_API_URL: `${mockLLMBaseUrl}/v1/responses`,
    CLERKLY_ANTHROPIC_API_URL: `${mockLLMBaseUrl}/v1/messages`,
    CLERKLY_GOOGLE_LLM_API_URL: `${mockLLMBaseUrl}/v1beta/models/gemini-3-flash:generateContent`,
    // Override any real API keys from .env so loadAPIKey() reads from DB only
    CLERKLY_OPENAI_API_KEY: '',
    CLERKLY_ANTHROPIC_API_KEY: '',
    CLERKLY_GOOGLE_API_KEY: '',
  });
  await context.window.waitForLoadState('domcontentloaded');

  // Complete OAuth flow to authenticate
  await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);

  // Wait for main app to load
  await context.window.waitForTimeout(1000);

  // Navigate to Settings
  await context.window.click('text=Settings');
  await context.window.waitForSelector('text=LLM Provider');
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
  }
});

/* Preconditions: App is launched and authenticated, API key field is empty
   Action: Check Test Connection button state
   Assertions: Button is disabled when API key is empty
   Requirements: settings.3.1 */
test('54.1: should disable Test Connection button when API key is empty', async () => {
  // Find Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');
  await testButton.waitFor({ state: 'visible', timeout: 5000 });

  // Check that button is disabled
  const isDisabled = await testButton.isDisabled();
  expect(isDisabled).toBe(true);
});

/* Preconditions: App is launched and authenticated
   Action: Enter API key and check Test Connection button state
   Assertions: Button is enabled when API key is filled
   Requirements: settings.3.1 */
test('54.2: should enable Test Connection button when API key is filled', async () => {
  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('test-api-key-12345');

  // Wait for state update
  await context.window.waitForTimeout(200);

  // Find Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');

  // Check that button is enabled
  const isDisabled = await testButton.isDisabled();
  expect(isDisabled).toBe(false);
});

/* Preconditions: App is launched and authenticated, API key is filled
   Action: Click Test Connection button
   Assertions: Request sent to correct endpoint with correct parameters
   Requirements: settings.3.2, settings.3.3, settings.3.5 */
test('54.3: should send request with correct parameters', async () => {
  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('test-api-key-12345');
  await context.window.waitForTimeout(200);

  // Click Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');
  await testButton.click();

  // Wait for request to complete
  await context.window.waitForTimeout(1000);

  // Check that request was sent to mock server with correct parameters
  const lastRequest = mockLLMServer.getLastRequest();
  expect(lastRequest).toBeDefined();
  expect(lastRequest?.path).toBe('/v1/responses');
  expect(lastRequest?.method).toBe('POST');
  expect(lastRequest?.headers.authorization).toBe('Bearer test-api-key-12345');
  expect(lastRequest?.body.model).toBe('gpt-5-nano');
  expect(lastRequest?.body.max_output_tokens).toBe(16);
  expect(lastRequest?.body.input?.[0]?.content).toContain('JSON');
});

/* Preconditions: App is launched and authenticated, valid API key is entered
   Action: Click Test Connection button with successful mock response
   Assertions: Success notification is shown
   Requirements: settings.3.4, settings.3.7 */
test('54.4: should show success notification on valid API key', async () => {
  // Wait for any initial error toasts to disappear (from loading settings)
  await context.window.waitForTimeout(2000);

  // Close any existing toasts
  const existingToasts = context.window.locator('[data-sonner-toast]');
  const count = await existingToasts.count();
  for (let i = 0; i < count; i++) {
    const closeButton = existingToasts.nth(i).locator('button[aria-label="Close toast"]');
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  }
  await context.window.waitForTimeout(500);

  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('valid-api-key-12345');
  await context.window.waitForTimeout(200);

  // Click Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');
  await testButton.click();

  // Wait for test to complete (increased timeout for mock server response)
  await context.window.waitForTimeout(3000);

  // Check that success toast is displayed
  const successToast = context.window
    .locator('[data-sonner-toast]')
    .filter({ hasText: /Connection successful/i });
  await successToast.waitFor({ state: 'visible', timeout: 5000 });
  expect(await successToast.isVisible()).toBe(true);
});

/* Preconditions: App is launched and authenticated, invalid API key is entered
   Action: Click Test Connection button with error mock response
   Assertions: Error notification is shown with appropriate message
   Requirements: settings.3.4, settings.3.8 */
test('54.5: should show error notification on invalid API key', async () => {
  // Set mock server to return error
  mockLLMServer.setSuccess(false);
  mockLLMServer.setError(401, 'Invalid API key');

  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('invalid-api-key-12345');
  await context.window.waitForTimeout(200);

  // Click Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');
  await testButton.click();

  // Wait for test to complete
  await context.window.waitForTimeout(1000);

  // Check that error toast is displayed
  const errorToast = context.window
    .locator('[data-sonner-toast]')
    .filter({ hasText: /Invalid API key/i });
  await errorToast.waitFor({ state: 'visible', timeout: 5000 });
  expect(await errorToast.isVisible()).toBe(true);
});

/* Preconditions: App is launched and authenticated
   Action: Test connection for each provider (OpenAI, Anthropic, Google)
   Assertions: Each provider sends request to correct endpoint
   Requirements: settings.3.4, settings.3.5, settings.3.7 */
test('54.6: should test connection for all providers', async () => {
  const providers = [
    { value: 'openai', name: 'OpenAI', path: '/v1/responses', model: 'gpt-5-nano' },
    { value: 'anthropic', name: 'Anthropic', path: '/v1/messages', model: 'claude-haiku-4-6' },
    {
      value: 'google',
      name: 'Google',
      path: '/v1beta/models/gemini-3-flash/generateContent',
      model: 'gemini-3-flash',
    },
  ];

  for (const provider of providers) {
    // Clear logs
    mockLLMServer.clearRequestLogs();

    // Select provider
    await context.window.selectOption('select:near(:text("LLM Provider"))', provider.value);
    await context.window.waitForTimeout(200);

    // Enter API key
    const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
    await apiKeyInput.fill(`${provider.value}-api-key-12345`);
    await context.window.waitForTimeout(200);

    // Click Test Connection button
    const testButton = context.window.locator('button:has-text("Test Connection")');
    await testButton.click();

    // Wait for test to complete
    await context.window.waitForTimeout(1000);

    // Check that request was sent to correct endpoint
    const lastRequest = mockLLMServer.getLastRequest();
    expect(lastRequest).toBeDefined();
    expect(lastRequest?.path).toContain(provider.path.split('/').slice(0, 3).join('/'));
    expect(lastRequest?.method).toBe('POST');

    // Check that success toast is displayed (use .first() to handle multiple toasts)
    const successToast = context.window
      .locator('[data-sonner-toast]')
      .filter({ hasText: /Connection successful/i })
      .first();
    await successToast.waitFor({ state: 'visible', timeout: 5000 });
    expect(await successToast.isVisible()).toBe(true);

    // Wait for toast to disappear before next iteration
    await context.window.waitForTimeout(3000);
  }
});

/* Preconditions: App is launched and authenticated, API key is filled
   Action: Click Test Connection button, verify button shows "Testing..." during request
   Assertions: Button text changes to "Testing..." and button is disabled during test
   Requirements: settings.3.2, settings.3.3 */
test('54.7: should show Testing text during connection test', async () => {
  // Set delay to make "Testing..." state visible
  mockLLMServer.setDelay(2000);

  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('test-api-key-12345');
  await context.window.waitForTimeout(200);

  // Click Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');
  await testButton.click();

  // Wait for "Testing..." button to appear
  const testingButton = context.window.locator('button:has-text("Testing...")');
  await testingButton.waitFor({ state: 'visible', timeout: 1000 });

  // Verify "Testing..." button is visible and disabled
  const isTestingVisible = await testingButton.isVisible();
  const isTestingDisabled = await testingButton.isDisabled();

  console.log('[TEST] Testing button state:', {
    visible: isTestingVisible,
    disabled: isTestingDisabled,
  });

  expect(isTestingVisible).toBe(true);
  expect(isTestingDisabled).toBe(true);

  // Wait for test to complete
  await context.window.waitForTimeout(2500);

  // Verify button returns to normal state
  const finalButton = context.window.locator('button:has-text("Test Connection")');
  await finalButton.waitFor({ state: 'visible', timeout: 2000 });
  const isFinalDisabled = await finalButton.isDisabled();
  expect(isFinalDisabled).toBe(false);

  console.log('[TEST] ✓ Button returned to normal state');

  // Reset delay for other tests
  mockLLMServer.setDelay(0);
});
