/* Preconditions: Electron app is launched and authenticated, real OpenAI API key is provided via env
   Action: Run Test Connection against real OpenAI API from Settings screen
   Assertions: Success notification is shown and no error toast appears
   Requirements: settings.2.4, settings.2.5, settings.2.7, settings.2.8, testing.12.1 */

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  completeOAuthFlow,
  createMockOAuthServer,
  expectNoToastError,
  ElectronTestContext,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

const TEST_CLIENT_ID = 'test-client-id-12345';
const OPENAI_REAL_API_KEY = process.env.CLERKLY_OPENAI_API_KEY;

let context: ElectronTestContext;
let mockOAuthServer: MockOAuthServer;

test.beforeAll(async () => {
  if (!OPENAI_REAL_API_KEY) {
    throw new Error(
      '[llm-connection-real] CLERKLY_OPENAI_API_KEY is required for standard functional runs'
    );
  }

  mockOAuthServer = await createMockOAuthServer();
  mockOAuthServer.setUserProfile({
    id: 'test-user-llm-connection-real',
    email: 'llm-connection-real@example.com',
    name: 'LLM Connection Real User',
    given_name: 'LLM',
    family_name: 'Connection Real User',
  });
});

test.afterAll(async () => {
  if (mockOAuthServer) {
    await mockOAuthServer.stop();
  }
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
  }
});

test.describe('LLM Connection (real OpenAI)', () => {
  test.beforeEach(async () => {
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OPENAI_API_URL: 'https://api.openai.com/v1/responses',
      CLERKLY_OPENAI_API_KEY: '',
      CLERKLY_ANTHROPIC_API_KEY: '',
      CLERKLY_GOOGLE_API_KEY: '',
    });

    await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
    await context.window.click('text=Settings');
    await expect(context.window.getByRole('heading', { name: 'LLM Provider' })).toBeVisible({
      timeout: 10000,
    });
  });

  /* Preconditions: Settings screen opened, real OpenAI API key is available
     Action: Select OpenAI provider, enter API key, click Test Connection
     Assertions: Success toast appears and error toast is absent
     Requirements: settings.2.4, settings.2.5, settings.2.7, settings.2.8, testing.12.1 */
  test('54.real.1: should validate Test Connection against real OpenAI API', async () => {
    await context.window.selectOption('select:near(:text("LLM Provider"))', 'openai');

    const apiKeyInput = context.window.locator('input[placeholder="Enter your API key"]');
    await expect(apiKeyInput).toBeVisible({ timeout: 5000 });
    await apiKeyInput.fill(OPENAI_REAL_API_KEY!);

    const testButton = context.window.locator('button:has-text("Test Connection")');
    await expect(testButton).toBeEnabled({ timeout: 5000 });
    await testButton.click();

    const successToast = context.window
      .locator('[data-sonner-toast]')
      .filter({ hasText: /Connection successful/i });
    await expect(successToast).toBeVisible({ timeout: 20000 });

    await expectNoToastError(context.window);
  });
});
