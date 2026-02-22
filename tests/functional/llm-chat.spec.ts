/**
 * Functional Tests: LLM Chat
 *
 * End-to-end tests using real OpenAI API and MockLLMServer.
 * Requires OPENAI_API_KEY in .env file for real API tests.
 *
 * Requirements: llm-integration.1, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8
 */

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  completeOAuthFlow,
  createMockOAuthServer,
  expectNoToastError,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { MockLLMServer } from './helpers/mock-llm-server';

const TEST_CLIENT_ID = 'test-client-id-12345';
const MOCK_OAUTH_PORT = 8894;
const MOCK_LLM_PORT = 8895;

// Real OpenAI API key from .env (loaded by playwright.config.ts via dotenv)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

let mockOAuthServer: MockOAuthServer;
let mockLLMServer: MockLLMServer;

test.beforeAll(async () => {
  if (!OPENAI_API_KEY) {
    console.warn('[llm-chat] OPENAI_API_KEY not set — skipping real API tests');
  }

  mockOAuthServer = await createMockOAuthServer(MOCK_OAUTH_PORT);
  mockOAuthServer.setUserProfile({
    id: 'test-user-llm-chat',
    email: 'llm-chat@example.com',
    name: 'LLM Chat User',
    given_name: 'LLM',
    family_name: 'Chat User',
  });

  mockLLMServer = new MockLLMServer({ port: MOCK_LLM_PORT });
  await mockLLMServer.start();
});

test.afterAll(async () => {
  if (mockOAuthServer) await mockOAuthServer.stop();
  if (mockLLMServer) await mockLLMServer.stop();
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
    await (window as any).api.settings.saveAPIKey('openai', key);
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

test.describe('LLM Chat (mock server)', () => {
  let context: ElectronTestContext;

  test.afterEach(async () => {
    if (context) await closeElectron(context);
    mockLLMServer.setStreamingMode(false);
    mockLLMServer.setRateLimitMode(false);
    mockLLMServer.setSuccess(true);
    mockLLMServer.clearRequestLogs();
  });

  /**
   * Launch app authenticated, pointing OpenAI provider at MockLLMServer.
   * Mock key is accepted because mock server doesn't validate auth.
   */
  async function launchWithMockLLM(): Promise<ElectronTestContext> {
    const ctx = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OPENAI_API_URL: `http://localhost:${MOCK_LLM_PORT}/v1/chat/completions`,
    });
    await completeOAuthFlow(ctx.app, ctx.window, TEST_CLIENT_ID);
    await expect(ctx.window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });
    // Check no toast errors appeared during startup/auth
    await expectNoToastError(ctx.window);
    // Save a mock API key — mock server doesn't validate it
    await ctx.window.evaluate(async () => {
      await (window as any).api.settings.saveAPIKey('openai', 'mock-key-for-testing');
    });
    return ctx;
  }

  /* Preconditions: MockLLMServer configured with slow streaming (300ms between chunks),
       app authenticated with mock LLM URL
     Action: User sends first message, then sends second message while first is still streaming
     Assertions: Only one message-llm bubble visible (response to second message),
       interrupted llm message is hidden
     Requirements: llm-integration.8.1, llm-integration.8.4, llm-integration.8.5 */
  test('should interrupt previous request when new message sent during streaming', async () => {
    // First request: slow streaming so we can interrupt it
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"First response"}}',
      chunkDelayMs: 300,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    // Send first message
    await messageInput.fill('First message');
    await messageInput.press('Enter');

    // Wait for first user message to appear
    await expect(context.window.locator('[data-testid="message"]').first()).toBeVisible({
      timeout: 5000,
    });

    // Wait briefly for streaming to start (first chunk arrives)
    await context.window.waitForTimeout(500);

    // Switch mock to fast response for second request
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"Second response"}}',
      chunkDelayMs: 0,
    });

    // Send second message while first is still streaming
    await messageInput.fill('Second message');
    await messageInput.press('Enter');

    // Wait for the LLM response to the second message
    const llmBubble = context.window.locator('[data-testid="message-llm"]');
    await expect(llmBubble).toBeVisible({ timeout: 3000 });

    // Only one llm bubble should be visible (interrupted one is hidden)
    const llmBubbles = context.window.locator('[data-testid="message-llm"]');
    await expect(llmBubbles).toHaveCount(1, { timeout: 3000 });

    // The visible response should be for the second message
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toBeVisible({ timeout: 3000 });
    const text = await actionContent.textContent();
    expect(text?.trim()).toBe('Second response');
  });

  /* Preconditions: MockLLMServer configured with slow streaming for first request,
       fast response for second; app authenticated with mock LLM URL
     Action: User sends first message, waits for streaming to start, sends second message
     Assertions: Exactly one message-llm in DOM, no artifacts of first (interrupted) response
     Requirements: llm-integration.8.5 */
  test('should not show interrupted llm message in chat', async () => {
    // First request: slow streaming
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"First response"}}',
      chunkDelayMs: 300,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    // Send first message
    await messageInput.fill('First message');
    await messageInput.press('Enter');

    // Wait for first user message to appear
    await expect(context.window.locator('[data-testid="message"]').first()).toBeVisible({
      timeout: 5000,
    });

    // Wait for streaming to start
    await context.window.waitForTimeout(500);

    // Switch mock to fast response for second request
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"Second response"}}',
      chunkDelayMs: 0,
    });

    // Send second message while first is still streaming
    await messageInput.fill('Second message');
    await messageInput.press('Enter');

    // Wait for second response to appear
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toBeVisible({ timeout: 15000 });
    await expect(actionContent).toHaveText('Second response', { timeout: 5000 });

    // Exactly one llm bubble in DOM — interrupted one must not be rendered at all
    await expect(context.window.locator('[data-testid="message-llm"]')).toHaveCount(1);

    // No text from the interrupted first response anywhere in the chat
    await expect(context.window.locator('text=First response')).toHaveCount(0);
  });

  /* Preconditions: MockLLMServer configured to return HTTP 500,
       app authenticated with mock LLM URL
     Action: User sends a message
     Assertions: message-error bubble appears with provider unavailable text
     Requirements: llm-integration.3.1, llm-integration.3.5 */
  test('should show provider error message on 500', async () => {
    mockLLMServer.setSuccess(false);
    mockLLMServer.setError(500, 'Internal Server Error');

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    await messageInput.fill('Hello');
    await messageInput.press('Enter');

    const errorBubble = context.window.locator('[data-testid="message-error"]');
    await expect(errorBubble).toBeVisible({ timeout: 15000 });

    const text = await errorBubble.textContent();
    expect(text?.toLowerCase()).toMatch(/unavailable|try again/);
  });

  /* Preconditions: MockLLMServer returns 500 on first request, success on second;
       app authenticated with mock LLM URL
     Action: User sends first message (gets error), then sends second message
     Assertions: error bubble disappears, llm response appears
     Requirements: llm-integration.3.8 */
  test('should hide error bubble when user sends next message', async () => {
    // First request fails
    mockLLMServer.setSuccess(false);
    mockLLMServer.setError(500, 'Internal Server Error');

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    // Send first message — expect error
    await messageInput.fill('First message');
    await messageInput.press('Enter');

    const errorBubble = context.window.locator('[data-testid="message-error"]');
    await expect(errorBubble).toBeVisible({ timeout: 15000 });

    // Switch mock to success for second request
    mockLLMServer.setSuccess(true);
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"Success response"}}',
      chunkDelayMs: 0,
    });

    // Send second message
    await messageInput.fill('Second message');
    await messageInput.press('Enter');

    // Error bubble should disappear
    await expect(errorBubble).toHaveCount(0, { timeout: 10000 });

    // LLM response should appear
    await expect(context.window.locator('[data-testid="message-llm"]')).toBeVisible({
      timeout: 10000,
    });
  });

  /* Preconditions: MockLLMServer configured for success, app authenticated with mock LLM URL
     Action: User sends two messages sequentially, waiting for LLM response after each
     Assertions: Second LLM request body contains both previous messages (user + assistant roles)
     Requirements: llm-integration.3.9 */
  test('should send full conversation history to llm on second message', async () => {
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"First response"}}',
      chunkDelayMs: 0,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    // Send first message and wait for LLM response
    await messageInput.fill('First message');
    await messageInput.press('Enter');

    const allActionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(allActionContent.first()).toBeVisible({ timeout: 15000 });
    await expect(allActionContent.first()).toHaveText('First response', { timeout: 5000 });

    // Switch mock to second response
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"Second response"}}',
      chunkDelayMs: 0,
    });
    mockLLMServer.clearRequestLogs();

    // Send second message
    await messageInput.fill('Second message');
    await messageInput.press('Enter');

    // Wait for second LLM response
    await expect(allActionContent).toHaveCount(2, { timeout: 15000 });
    await expect(allActionContent.last()).toHaveText('Second response', { timeout: 5000 });

    // Inspect the request body sent to LLM for the second message
    const lastRequest = mockLLMServer.getLastRequest();
    expect(lastRequest).toBeDefined();

    const messages: Array<{ role: string; content: string }> = lastRequest!.body.messages;
    expect(messages).toBeDefined();

    // Must contain role:user with first message text
    const userMsg = messages.find((m) => m.role === 'user' && m.content === 'First message');
    expect(userMsg).toBeDefined();

    // Must contain role:assistant with first response content
    const assistantMsg = messages.find(
      (m) => m.role === 'assistant' && m.content === 'First response'
    );
    expect(assistantMsg).toBeDefined();

    // user message must come before assistant message
    const userIdx = messages.indexOf(userMsg!);
    const assistantIdx = messages.indexOf(assistantMsg!);
    expect(userIdx).toBeLessThan(assistantIdx);
  });

  /* Preconditions: MockLLMServer returns 500 on first request, success on second;
       app authenticated with mock LLM URL
     Action: User sends first message (gets error), then sends second message
     Assertions: Second LLM request body does not contain role:system with [error] content
     Requirements: llm-integration.3.9 */
  test('should exclude error messages from llm history', async () => {
    // First request fails
    mockLLMServer.setSuccess(false);
    mockLLMServer.setError(500, 'Internal Server Error');

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    // Send first message — expect error bubble
    await messageInput.fill('First message');
    await messageInput.press('Enter');

    const errorBubble = context.window.locator('[data-testid="message-error"]');
    await expect(errorBubble).toBeVisible({ timeout: 15000 });

    // Switch mock to success for second request
    mockLLMServer.setSuccess(true);
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"Success response"}}',
      chunkDelayMs: 0,
    });
    mockLLMServer.clearRequestLogs();

    // Send second message
    await messageInput.fill('Second message');
    await messageInput.press('Enter');

    // Wait for LLM response
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toBeVisible({ timeout: 15000 });
    await expect(actionContent).toHaveText('Success response', { timeout: 5000 });

    // Inspect the request body sent to LLM for the second message
    const lastRequest = mockLLMServer.getLastRequest();
    expect(lastRequest).toBeDefined();

    const messages: Array<{ role: string; content: string }> = lastRequest!.body.messages;
    expect(messages).toBeDefined();

    // Must NOT contain any role:system message with [error] content
    const errorSystemMsg = messages.find(
      (m) => m.role === 'system' && m.content.includes('[error]')
    );
    expect(errorSystemMsg).toBeUndefined();
  });

  /* Preconditions: MockLLMServer returns 429 with retry-after=3 on first request,
       then success on second; app authenticated with mock LLM URL
     Action: User sends a message, rate limit banner appears, countdown completes
     Assertions: Rate limit banner visible with countdown, auto-retries, LLM response appears
     Requirements: llm-integration.3.7.1, llm-integration.3.7.2, llm-integration.3.7.3 */
  test('should show rate limit banner with countdown and auto-retry', async () => {
    // First request: rate limit with 3 second retry-after
    mockLLMServer.setRateLimitMode(true, 3);

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    await messageInput.fill('Hello');
    await messageInput.press('Enter');

    // Rate limit banner should appear
    const banner = context.window.locator('[data-testid="rate-limit-banner"]');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Banner should contain countdown text
    const bannerText = await banner.textContent();
    expect(bannerText).toMatch(/Rate limit exceeded/);
    expect(bannerText).toMatch(/Retrying in \d+ second/);

    // Cancel button should be visible
    await expect(context.window.locator('[data-testid="rate-limit-cancel"]')).toBeVisible();

    // Switch mock to success for the retry
    mockLLMServer.setRateLimitMode(false);
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"Retry response"}}',
      chunkDelayMs: 0,
    });

    // Wait for auto-retry (countdown ~3 seconds + buffer)
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toBeVisible({ timeout: 15000 });
    await expect(actionContent).toHaveText('Retry response', { timeout: 5000 });

    // Banner should be gone after successful retry
    await expect(banner).toHaveCount(0, { timeout: 5000 });
  });

  /* Preconditions: MockLLMServer returns 401 (auth error); app authenticated with mock LLM URL
     Action: User sends a message, error bubble appears with action_link
     Assertions: "Open Settings" button visible in error bubble, click navigates to Settings screen
     Requirements: llm-integration.3.4.1 */
  test('should show action_link in auth error bubble and navigate to settings on click', async () => {
    mockLLMServer.setSuccess(false);
    mockLLMServer.setError(401, 'Invalid API key. Please check your key and try again.');

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    await messageInput.fill('Hello');
    await messageInput.press('Enter');

    // Error bubble appears
    const errorBubble = context.window.locator('[data-testid="message-error"]');
    await expect(errorBubble).toBeVisible({ timeout: 15000 });

    // action_link button is visible with correct label
    const actionLink = context.window.locator('[data-testid="message-error-action-link"]');
    await expect(actionLink).toBeVisible({ timeout: 5000 });
    await expect(actionLink).toHaveText('Open Settings');

    // Click the action link — should navigate to Settings
    await actionLink.click();

    // Settings screen is shown (contains "LLM Provider" heading)
    await expect(context.window.locator('h2:has-text("LLM Provider")')).toBeVisible({
      timeout: 5000,
    });

    // Agents screen is no longer visible
    await expect(context.window.locator('[data-testid="agents"]')).toHaveCount(0, {
      timeout: 3000,
    });
  });

  /* Preconditions: MockLLMServer returns 429; app authenticated with mock LLM URL
     Action: User sends a message, rate limit banner appears, user clicks Cancel
     Assertions: Banner disappears, user message removed from chat
     Requirements: llm-integration.3.7.4 */
  test('should cancel rate limit retry and hide user message', async () => {
    mockLLMServer.setRateLimitMode(true, 30);

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('[data-testid="auto-expanding-textarea"]').first();

    await messageInput.fill('Hello cancel');
    await messageInput.press('Enter');

    // Rate limit banner should appear
    const banner = context.window.locator('[data-testid="rate-limit-banner"]');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // User message should be visible in chat
    const userMessages = context.window.locator('[data-testid="message-user"]');
    await expect(userMessages).toHaveCount(1, { timeout: 5000 });

    // Click Cancel
    await context.window.locator('[data-testid="rate-limit-cancel"]').click();

    // Banner should disappear
    await expect(banner).toHaveCount(0, { timeout: 5000 });

    // User message should be removed from chat (hidden=true)
    await expect(userMessages).toHaveCount(0, { timeout: 5000 });
  });
});
