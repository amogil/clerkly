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
  getAgentIdsFromApi,
  expectAgentsVisible,
  expectAgentsHiddenByCss,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { MockLLMServer } from './helpers/mock-llm-server';

const TEST_CLIENT_ID = 'test-client-id-12345';
const MOCK_OAUTH_PORT = 8894;
const MOCK_LLM_PORT = 8895;

// Real OpenAI API key from .env (loaded by playwright.config.ts via dotenv)
const OPENAI_API_KEY = process.env.CLERKLY_OPENAI_API_KEY;

let mockOAuthServer: MockOAuthServer;
let mockLLMServer: MockLLMServer;

test.beforeAll(async () => {
  if (!OPENAI_API_KEY) {
    console.warn('[llm-chat] CLERKLY_OPENAI_API_KEY not set — skipping real API tests');
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
 * Launch app, authenticate with real OpenAI API key passed via env.
 * MainPipeline reads the key from CLERKLY_OPENAI_API_KEY env via loadAPIKey().
 */
async function launchWithRealLLM(apiKey: string): Promise<ElectronTestContext> {
  const ctx = await launchElectron(undefined, {
    CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    CLERKLY_OPENAI_API_KEY: apiKey,
  });

  await completeOAuthFlow(ctx.app, ctx.window, TEST_CLIENT_ID);
  await expectAgentsVisible(ctx.window, 10000);

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

  /* Preconditions: App authenticated with real OpenAI API key, chat has scrollable content
     Action: User sends a message (smooth scroll starts), waits for LLM response
     Assertions: LLM response is fully visible in viewport after autoscroll
     Requirements: agents.4.13.1, agents.4.13.5 */
  test('should scroll to show llm response after user message', async () => {
    context = await launchWithRealLLM(OPENAI_API_KEY!);

    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');
    const messagesArea = context.window.locator('[data-testid="messages-area"]');

    // Get agent ID to pre-fill chat with scrollable content
    await expect
      .poll(async () => (await getAgentIdsFromApi(context.window)).length, { timeout: 5000 })
      .toBeGreaterThan(0);
    const firstAgentId = (await getAgentIdsFromApi(context.window))[0];
    expect(firstAgentId).toBeTruthy();

    // Pre-fill chat with messages to make it scrollable
    for (let i = 1; i <= 20; i++) {
      await context.window.evaluate(
        async ({ agentId, text }) => {
          // @ts-expect-error - window.api is exposed via contextBridge
          return await window.api.test.createAgentMessage(agentId, text);
        },
        { agentId: firstAgentId as string, text: `Pre-fill message ${i}` }
      );
    }
    await expect(context.window.locator('[data-testid="message"]')).toHaveCount(20, {
      timeout: 5000,
    });

    // Send user message — smooth scroll starts
    await messageInput.fill('Say exactly: hi');
    await messageInput.press('Enter');

    await expect(context.window.locator('[data-testid="message-user"]')).toHaveCount(1, {
      timeout: 5000,
    });

    // Wait for LLM response
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toBeVisible({ timeout: 30000 });

    // Wait for autoscroll to complete
    await context.window.waitForTimeout(1000);

    // LLM response must be fully visible in viewport
    const windowHeight = await context.window.evaluate(() => window.innerHeight);
    const box = await actionContent.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(windowHeight + 1);

    // Chat must be scrolled to bottom
    const distanceFromBottom = await messagesArea.evaluate((el) => {
      return el.scrollHeight - el.scrollTop - el.clientHeight;
    });
    expect(distanceFromBottom).toBeLessThan(50);
  });

  /* Preconditions: App authenticated with real OpenAI API key, chat pre-filled with 15 messages,
       user is at bottom
     Action: User sends a message, waits for LLM response
     Assertions: Scrollbar DOM node must NOT be removed and re-added during the send+response
       cycle — Radix remounts scrollbar when type prop changes (scroll→hover→scroll),
       causing visible flicker
     Requirements: agents.4.13.5 */
  test('should not flicker scrollbar when sending message and receiving response', async () => {
    context = await launchWithRealLLM(OPENAI_API_KEY!);

    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    // Pre-fill chat with messages to make it scrollable
    await expect
      .poll(async () => (await getAgentIdsFromApi(context.window)).length, { timeout: 5000 })
      .toBeGreaterThan(0);
    const firstAgentId = (await getAgentIdsFromApi(context.window))[0];
    for (let i = 1; i <= 15; i++) {
      await context.window.evaluate(
        async ({ agentId, text }) => {
          // @ts-expect-error - window.api is exposed via contextBridge
          return await window.api.test.createAgentMessage(agentId, text);
        },
        { agentId: firstAgentId as string, text: `Pre-fill message ${i}` }
      );
    }
    await expect(context.window.locator('[data-testid="message"]')).toHaveCount(15, {
      timeout: 5000,
    });

    // Scroll to bottom and wait to settle
    await context.window.locator('[data-testid="messages-area"]').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await context.window.waitForTimeout(500);

    // Watch for scrollbar DOM node being removed (remount = flicker)
    // Radix remounts scrollbar when type prop changes scroll→hover→scroll
    await context.window.evaluate(() => {
      (window as Window & { __scrollbarRemovals?: number }).__scrollbarRemovals = 0;

      const scrollAreaRoot = document.querySelector('[data-slot="scroll-area"]');
      if (!scrollAreaRoot) return;

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of Array.from(mutation.removedNodes)) {
            if (
              node instanceof Element &&
              (node.getAttribute('data-slot') === 'scroll-area-scrollbar' ||
                node.querySelector('[data-slot="scroll-area-scrollbar"]'))
            ) {
              (window as Window & { __scrollbarRemovals?: number }).__scrollbarRemovals! += 1;
            }
          }
        }
      });
      observer.observe(scrollAreaRoot, { childList: true, subtree: true });
      (window as Window & { __scrollbarObserver?: MutationObserver }).__scrollbarObserver =
        observer;
    });

    // Send message
    await messageInput.fill('Say exactly: ok');
    await messageInput.press('Enter');

    // Wait for LLM response
    await expect(context.window.locator('[data-testid="message-llm-action"]')).toBeVisible({
      timeout: 30000,
    });

    // Wait for post-scroll animations to settle
    await context.window.waitForTimeout(700);

    const removals = await context.window.evaluate(() => {
      (
        window as Window & { __scrollbarObserver?: MutationObserver }
      ).__scrollbarObserver?.disconnect();
      return (window as Window & { __scrollbarRemovals?: number }).__scrollbarRemovals ?? 0;
    });

    // Scrollbar must not be removed from DOM (no remount = no flicker)
    expect(removals).toBe(0);
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

  async function renderMarkdownMessage(markdown: string): Promise<void> {
    mockLLMServer.setStreamingMode(true, {
      content: JSON.stringify({ action: { type: 'text', content: markdown } }),
      chunkDelayMs: 0,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Render markdown');
    await messageInput.press('Enter');

    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toBeVisible({ timeout: 3000 });
  }

  /* Preconditions: MockLLMServer returns markdown heading
     Action: User sends a message
     Assertions: heading element rendered
     Requirements: agents.7.7 */
  test('should render markdown headings', async () => {
    await renderMarkdownMessage('# Heading');
    await expect(context.window.locator('[data-testid="message-llm-action"] h1')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown paragraphs
     Action: User sends a message
     Assertions: multiple paragraphs rendered
     Requirements: agents.7.7 */
  test('should render markdown paragraphs', async () => {
    await renderMarkdownMessage('First paragraph.\n\nSecond paragraph.');
    await expect(context.window.locator('[data-testid="message-llm-action"] p')).toHaveCount(2);
  });

  /* Preconditions: MockLLMServer returns markdown emphasis
     Action: User sends a message
     Assertions: strong/em elements rendered
     Requirements: agents.7.7 */
  test('should render markdown emphasis', async () => {
    await renderMarkdownMessage('**bold** and *italic*');
    await expect(context.window.locator('[data-testid="message-llm-action"] strong')).toBeVisible();
    await expect(context.window.locator('[data-testid="message-llm-action"] em')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown strikethrough
     Action: User sends a message
     Assertions: del element rendered
     Requirements: agents.7.7 */
  test('should render markdown strikethrough', async () => {
    await renderMarkdownMessage('~~Struck~~');
    await expect(context.window.locator('[data-testid="message-llm-action"] del')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown link
     Action: User sends a message
     Assertions: anchor rendered with href
     Requirements: agents.7.7 */
  test('should render markdown links', async () => {
    await renderMarkdownMessage('[Example](https://example.com)');
    const link = context.window
      .locator('[data-testid="message-llm-action"] a[href="https://example.com"]')
      .first();
    await expect(link).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns autolink
     Action: User sends a message
     Assertions: anchor rendered with href
     Requirements: agents.7.7 */
  test('should render markdown autolinks', async () => {
    await renderMarkdownMessage('https://example.com');
    const link = context.window
      .locator('[data-testid="message-llm-action"] a[href="https://example.com"]')
      .first();
    await expect(link).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns email autolink
     Action: User sends a message
     Assertions: mailto anchor rendered
     Requirements: agents.7.7 */
  test('should render markdown email autolinks', async () => {
    await renderMarkdownMessage('test@example.com');
    const link = context.window
      .locator('[data-testid="message-llm-action"] a[href="mailto:test@example.com"]')
      .first();
    await expect(link).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown blockquote
     Action: User sends a message
     Assertions: blockquote rendered
     Requirements: agents.7.7 */
  test('should render markdown blockquotes', async () => {
    await renderMarkdownMessage('> Quoted text');
    await expect(context.window.locator('[data-testid="message-llm-action"] blockquote')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns unordered list
     Action: User sends a message
     Assertions: ul list rendered
     Requirements: agents.7.7 */
  test('should render markdown unordered list', async () => {
    await renderMarkdownMessage('- A\n- B');
    await expect(context.window.locator('[data-testid="message-llm-action"] ul')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns ordered list
     Action: User sends a message
     Assertions: ol list rendered
     Requirements: agents.7.7 */
  test('should render markdown ordered list', async () => {
    await renderMarkdownMessage('1. One\n2. Two');
    await expect(context.window.locator('[data-testid="message-llm-action"] ol')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns nested list
     Action: User sends a message
     Assertions: nested list rendered
     Requirements: agents.7.7 */
  test('should render markdown nested list', async () => {
    await renderMarkdownMessage('- Parent\n  - Child');
    await expect(context.window.locator('[data-testid="message-llm-action"] ul ul')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns task list
     Action: User sends a message
     Assertions: checkbox inputs rendered
     Requirements: agents.7.7 */
  test('should render markdown task list', async () => {
    await renderMarkdownMessage('- [x] Done\n- [ ] Todo');
    await expect(
      context.window.locator('[data-testid="message-llm-action"] input[type="checkbox"]')
    ).toHaveCount(2);
  });

  /* Preconditions: MockLLMServer returns inline code
     Action: User sends a message
     Assertions: inline code rendered
     Requirements: agents.7.7 */
  test('should render markdown inline code', async () => {
    await renderMarkdownMessage('Use `npm install`.');
    await expect(context.window.locator('[data-testid="message-llm-action"] p code')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns fenced code block
     Action: User sends a message
     Assertions: pre > code rendered
     Requirements: agents.7.7 */
  test('should render markdown fenced code', async () => {
    await renderMarkdownMessage('```json\n{\n  "ok": true\n}\n```');
    await expect(context.window.locator('[data-testid="message-llm-action"] pre code')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown tables
     Action: User sends a message
     Assertions: table rendered
     Requirements: agents.7.7 */
  test('should render markdown tables', async () => {
    await renderMarkdownMessage('| A | B |\n|---|---|\n| 1 | 2 |');
    await expect(context.window.locator('[data-testid="message-llm-action"] table')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns horizontal rule
     Action: User sends a message
     Assertions: hr rendered
     Requirements: agents.7.7 */
  test('should render markdown horizontal rule', async () => {
    await renderMarkdownMessage('---');
    await expect(context.window.locator('[data-testid="message-llm-action"] hr')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown image
     Action: User sends a message
     Assertions: img rendered
     Requirements: agents.7.7 */
  test('should render markdown images', async () => {
    await renderMarkdownMessage(
      '![Alt text](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO3rKtkAAAAASUVORK5CYII=)'
    );
    await expect(context.window.locator('[data-testid="message-llm-action"] img')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns mermaid diagram
     Action: User sends a message
     Assertions: diagram svg rendered
     Requirements: agents.7.7 */
  test('should render markdown mermaid diagrams', async () => {
    await renderMarkdownMessage('```mermaid\ngraph TD\n  A-->B\n```');
    await expect(context.window.locator('[data-testid="message-llm-action"] svg')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns inline math
     Action: User sends a message
     Assertions: inline katex rendered
     Requirements: agents.7.7 */
  test('should render markdown inline math', async () => {
    await renderMarkdownMessage('Inline math $$E = mc^2$$.');
    await expect(context.window.locator('[data-testid="message-llm-action"] .katex')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns block math
     Action: User sends a message
     Assertions: katex display rendered
     Requirements: agents.7.7 */
  test('should render markdown block math', async () => {
    await renderMarkdownMessage('$$\nE = mc^2\n$$');
    await expect(
      context.window.locator('[data-testid="message-llm-action"] .katex-display')
    ).toBeVisible();
  });

  /**
   * Launch app authenticated, pointing OpenAI provider at MockLLMServer.
   * Mock key is passed via env — mock server doesn't validate auth.
   * MainPipeline reads the key from CLERKLY_OPENAI_API_KEY env via loadAPIKey().
   */
  async function launchWithMockLLM(): Promise<ElectronTestContext> {
    const ctx = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OPENAI_API_URL: `http://localhost:${MOCK_LLM_PORT}/v1/chat/completions`,
      CLERKLY_OPENAI_API_KEY: 'mock-key-for-testing',
    });
    await completeOAuthFlow(ctx.app, ctx.window, TEST_CLIENT_ID);
    await expectAgentsVisible(ctx.window, 10000);
    // Check no toast errors appeared during startup/auth
    await expectNoToastError(ctx.window);
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

    // Agents screen wrapper is hidden via CSS while staying in DOM
    await expectAgentsHiddenByCss(context.window, 3000);
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
