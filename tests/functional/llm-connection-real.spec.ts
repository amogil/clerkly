/* Preconditions: Electron app is launched and authenticated, real OpenAI API key is provided via env
   Action: Run Test Connection against real OpenAI API from Settings screen
   Assertions: Success notification is shown and no error toast appears
   Requirements: settings.3.4, settings.3.5, settings.3.7, settings.3.8, testing.12.1 */

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
const RUN_REAL_OPENAI_CONNECTION_TEST = process.env.CLERKLY_RUN_REAL_OPENAI_CONNECTION_TEST === '1';

let context: ElectronTestContext;
let mockOAuthServer: MockOAuthServer;

test.beforeAll(async () => {
  if (!RUN_REAL_OPENAI_CONNECTION_TEST || !OPENAI_REAL_API_KEY) {
    console.warn(
      '[llm-connection-real] set CLERKLY_RUN_REAL_OPENAI_CONNECTION_TEST=1 and CLERKLY_OPENAI_API_KEY to run real API test'
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
    if (!RUN_REAL_OPENAI_CONNECTION_TEST || !OPENAI_REAL_API_KEY) {
      test.skip();
    }

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
     Requirements: settings.3.4, settings.3.5, settings.3.7, settings.3.8, testing.12.1 */
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
