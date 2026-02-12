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
import { MockOAuthServer } from './helpers/mock-oauth-server';

let context: ElectronTestContext;
let mockServer: MockOAuthServer;
const TEST_CLIENT_ID = 'test-client-id-12345';

test.beforeAll(async () => {
  // Start mock OAuth server
  mockServer = new MockOAuthServer({
    port: 8892,
    clientId: TEST_CLIENT_ID,
    clientSecret: 'test-client-secret-67890',
  });

  await mockServer.start();

  // Set user profile data for mock OAuth server
  mockServer.setUserProfile({
    id: 'test-user-llm-connection',
    email: 'llm-test@example.com',
    name: 'LLM Test User',
    given_name: 'LLM',
    family_name: 'Test User',
  });
});

test.afterAll(async () => {
  // Stop mock OAuth server
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
   Assertions: Button shows "Testing..." during test and is disabled
   Requirements: settings.3.2, settings.3.3 */
test('54.3: should show "Testing..." during connection test', async () => {
  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('test-api-key-12345');
  await context.window.waitForTimeout(200);

  // Mock fetch to delay response
  await context.window.evaluate(() => {
    const originalFetch = window.fetch;
    (window as any).fetch = async (...args: any[]) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return originalFetch(...args);
    };
  });

  // Click Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');
  await testButton.click();

  // Check that button shows "Testing..." and is disabled
  await context.window.waitForTimeout(100);
  const buttonText = await testButton.textContent();
  expect(buttonText).toContain('Testing');

  const isDisabled = await testButton.isDisabled();
  expect(isDisabled).toBe(true);

  // Wait for test to complete
  await context.window.waitForTimeout(1500);
});

/* Preconditions: App is launched and authenticated, valid API key is entered
   Action: Click Test Connection button with mocked successful response
   Assertions: Success notification is shown
   Requirements: settings.3.4, settings.3.7 */
test('54.4: should show success notification on valid API key', async () => {
  // Mock successful API response
  await context.window.evaluate(() => {
    (window as any).fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'test' } }] }),
      };
    };
  });

  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('valid-api-key-12345');
  await context.window.waitForTimeout(200);

  // Click Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');
  await testButton.click();

  // Wait for test to complete
  await context.window.waitForTimeout(500);

  // Check that success toast is displayed
  const successToast = context.window
    .locator('[data-sonner-toast]')
    .filter({ hasText: /Connection successful/i });
  await successToast.waitFor({ state: 'visible', timeout: 5000 });
  expect(await successToast.isVisible()).toBe(true);
});

/* Preconditions: App is launched and authenticated, invalid API key is entered
   Action: Click Test Connection button with mocked error response
   Assertions: Error notification is shown with appropriate message
   Requirements: settings.3.4, settings.3.8 */
test('54.5: should show error notification on invalid API key', async () => {
  // Mock 401 error response
  await context.window.evaluate(() => {
    (window as any).fetch = async () => {
      return {
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } }),
      };
    };
  });

  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('invalid-api-key-12345');
  await context.window.waitForTimeout(200);

  // Click Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');
  await testButton.click();

  // Wait for test to complete
  await context.window.waitForTimeout(500);

  // Check that error toast is displayed
  const errorToast = context.window
    .locator('[data-sonner-toast]')
    .filter({ hasText: /Invalid API key/i });
  await errorToast.waitFor({ state: 'visible', timeout: 5000 });
  expect(await errorToast.isVisible()).toBe(true);
});

/* Preconditions: App is launched and authenticated
   Action: Test connection for each provider (OpenAI, Anthropic, Google)
   Assertions: Each provider can be tested successfully
   Requirements: settings.3.4, settings.3.7 */
test('54.6: should test connection for all providers', async () => {
  const providers = [
    { value: 'openai', name: 'OpenAI' },
    { value: 'anthropic', name: 'Anthropic' },
    { value: 'google', name: 'Google' },
  ];

  // Mock successful API response for all providers
  await context.window.evaluate(() => {
    (window as any).fetch = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'test' } }] }),
      };
    };
  });

  for (const provider of providers) {
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
    await context.window.waitForTimeout(500);

    // Check that success toast is displayed
    const successToast = context.window
      .locator('[data-sonner-toast]')
      .filter({ hasText: /Connection successful/i });
    await successToast.waitFor({ state: 'visible', timeout: 5000 });
    expect(await successToast.isVisible()).toBe(true);

    // Wait for toast to disappear before next iteration
    await context.window.waitForTimeout(1000);
  }
});

/* Preconditions: App is launched and authenticated, API key is filled
   Action: Click Test Connection button, check button state during test
   Assertions: Button is disabled and shows "Testing..." during test
   Requirements: settings.3.2, settings.3.3 */
test('54.7: should disable button during connection test', async () => {
  // Mock delayed API response
  await context.window.evaluate(() => {
    (window as any).fetch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'test' } }] }),
      };
    };
  });

  // Enter API key
  const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
  await apiKeyInput.fill('test-api-key-12345');
  await context.window.waitForTimeout(200);

  // Click Test Connection button
  const testButton = context.window.locator('button:has-text("Test Connection")');
  await testButton.click();

  // Check button state during test
  await context.window.waitForTimeout(100);

  // Button should be disabled
  const isDisabled = await testButton.isDisabled();
  expect(isDisabled).toBe(true);

  // Button should show "Testing..."
  const buttonText = await testButton.textContent();
  expect(buttonText).toContain('Testing');

  // Wait for test to complete
  await context.window.waitForTimeout(2500);

  // Button should be enabled again
  const isDisabledAfter = await testButton.isDisabled();
  expect(isDisabledAfter).toBe(false);

  // Button should show "Test Connection" again
  const buttonTextAfter = await testButton.textContent();
  expect(buttonTextAfter).toContain('Test Connection');
});
