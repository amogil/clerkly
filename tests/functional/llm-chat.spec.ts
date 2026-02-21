/**
 * Functional Tests: LLM Chat
 *
 * End-to-end tests using real OpenAI API.
 * Requires OPENAI_API_KEY in .env file.
 *
 * Requirements: llm-integration.1, llm-integration.2, llm-integration.3, llm-integration.7
 */

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  completeOAuthFlow,
  createMockOAuthServer,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

const TEST_CLIENT_ID = 'test-client-id-12345';
const MOCK_OAUTH_PORT = 8894;

// Real OpenAI API key from .env (loaded by playwright.config.ts via dotenv)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let mockOAuthServer: MockOAuthServer;

test.beforeAll(async () => {
  if (!OPENAI_API_KEY) {
    console.warn('[llm-chat] OPENAI_API_KEY not set — skipping all tests');
  }

  mockOAuthServer = await createMockOAuthServer(MOCK_OAUTH_PORT);
  mockOAuthServer.setUserProfile({
    id: 'test-user-llm-chat',
    email: 'llm-chat@example.com',
    name: 'LLM Chat User',
    given_name: 'LLM',
    family_name: 'Chat User',
  });
});

test.afterAll(async () => {
  if (mockOAuthServer) await mockOAuthServer.stop();
});

/**
 * Launch app, authenticate, save real OpenAI API key via IPC.
 * MainPipeline reads the key from UserSettingsManager on each run().
 */
async function launchWithRealLLM(apiKey: string): Promise<ElectronTestContext> {
  const ctx = await launchElectron(undefined, {
    CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
  });

  await completeOAuthFlow(ctx.app, ctx.window, TEST_CLIENT_ID);
  await expect(ctx.window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });

  // Save API key via IPC — MainPipeline reads it via loadAPIKey() on each run()
  await ctx.window.evaluate(async (key) => {
    await (window as any).electron.ipcRenderer.invoke('settings:save-api-key', {
      provider: 'openai',
      apiKey: key,
    });
  }, apiKey);

  return ctx;
}

test.describe('LLM Chat (real OpenAI)', () => {
  let context: ElectronTestContext;

  test.beforeEach(async () => {
    if (!OPENAI_API_KEY) test.skip();
  });

  test.afterEach(async () => {
    if (context) await closeElectron(context);
  });

  /* Preconditions: App authenticated, real OpenAI API key saved, gpt-5-nano model
     Action: User sends a message
     Assertions: LLM response bubble appears with non-empty action content
     Requirements: llm-integration.1, llm-integration.7.1, llm-integration.7.3 */
  test('should show llm response after user message', async () => {
    context = await launchWithRealLLM(OPENAI_API_KEY!);

    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');
    await expect(messageInput).toBeVisible();

    await messageInput.fill('Say exactly: hello');
    await messageInput.press('Enter');

    // User message appears immediately
    await expect(context.window.locator('[data-testid="message"]').first()).toBeVisible({
      timeout: 5000,
    });

    // LLM response bubble appears (may take time for real API)
    const llmBubble = context.window.locator('[data-testid="message-llm"]');
    await expect(llmBubble).toBeVisible({ timeout: 30000 });

    // Action content is non-empty
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toBeVisible({ timeout: 30000 });
    const text = await actionContent.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  /* Preconditions: App authenticated, real OpenAI API key saved
     Action: User sends a message that triggers reasoning
     Assertions: Reasoning text appears before action content
     Requirements: llm-integration.2, llm-integration.7.2, llm-integration.7.3 */
  test('should show reasoning before answer', async () => {
    context = await launchWithRealLLM(OPENAI_API_KEY!);

    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('What is 2+2? Think step by step.');
    await messageInput.press('Enter');

    // LLM bubble appears
    const llmBubble = context.window.locator('[data-testid="message-llm"]');
    await expect(llmBubble).toBeVisible({ timeout: 30000 });

    // Reasoning appears (gpt-5-nano with reasoning_effort:low may produce reasoning)
    // We check that if reasoning is present it appears before action
    const reasoning = context.window.locator('[data-testid="message-llm-reasoning"]');
    const action = context.window.locator('[data-testid="message-llm-action"]');

    // Action must always appear
    await expect(action).toBeVisible({ timeout: 30000 });

    // If reasoning is present — it must be in the DOM before action
    const hasReasoning = await reasoning.isVisible();
    if (hasReasoning) {
      const reasoningBox = await reasoning.boundingBox();
      const actionBox = await action.boundingBox();
      // Reasoning is above action (lower y = higher on screen)
      expect(reasoningBox!.y).toBeLessThan(actionBox!.y);
    }
  });

  /* Preconditions: App authenticated, invalid API key saved
     Action: User sends a message
     Assertions: Error bubble appears with auth error text
     Requirements: llm-integration.3.1, llm-integration.3.4, llm-integration.3.5 */
  test('should show error message on invalid api key', async () => {
    context = await launchWithRealLLM('sk-invalid-key-000000000000');

    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Hello');
    await messageInput.press('Enter');

    // Error bubble appears
    const errorBubble = context.window.locator('[data-testid="message-error"]');
    await expect(errorBubble).toBeVisible({ timeout: 15000 });

    // Contains auth error text
    const text = await errorBubble.textContent();
    expect(text?.toLowerCase()).toMatch(/invalid api key|unauthorized|forbidden/);
  });
});
