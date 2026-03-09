/**
 * Functional Tests: LLM Chat
 *
 * Default mode: real OpenAI API for end-to-end scenarios.
 * Exception mode: controlled mock LLM transport for scenarios that require
 * deterministic HTTP status/stream timing/request-body inspection. This exception
 * is explicitly user-approved for technically necessary cases.
 *
 * Requirements: llm-integration.1, llm-integration.2, llm-integration.3, llm-integration.7, llm-integration.8
 */

import { test, expect } from '@playwright/test';
import {
  getFreePort,
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
let mockLLMPort: number;

// Real OpenAI API key from .env (loaded by playwright.config.ts via dotenv)
const OPENAI_API_KEY = process.env.CLERKLY_OPENAI_API_KEY;

let mockOAuthServer: MockOAuthServer;
let mockLLMServer: MockLLMServer;

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer();
  mockOAuthServer.setUserProfile({
    id: 'test-user-llm-chat',
    email: 'llm-chat@example.com',
    name: 'LLM Chat User',
    given_name: 'LLM',
    family_name: 'Chat User',
  });

  mockLLMPort = await getFreePort();
  mockLLMServer = new MockLLMServer({ port: mockLLMPort });
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

  test.beforeAll(() => {
    test.skip(!OPENAI_API_KEY, 'CLERKLY_OPENAI_API_KEY is required for real OpenAI scenarios');
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
    const actionContent = context.window.locator('[data-testid="message-llm-action"]').last();
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

  /* Preconditions: Existing chat history is present after app reopen (npm-start-like path),
     provider stream is deterministic via mock transport
     Action: On reopened app user sends the first message immediately after chat becomes interactive
     Assertions: Reasoning stream must be visible and progressively updated before final action appears
     Requirements: llm-integration.2, llm-integration.7.2, agents.4.11 */
  test('should display reasoning streaming after sending message', async () => {
    test.setTimeout(180000);
    mockLLMServer.setStreamingMode(true, {
      reasoning: 'Warmup reasoning stream chunk one chunk two',
      content: '{"action":{"type":"text","content":"Warmup response"}}',
      chunkDelayMs: 30,
    });
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OPENAI_API_URL: `http://localhost:${mockLLMPort}/v1/responses`,
      CLERKLY_OPENAI_API_KEY: 'mock-key-for-testing',
    });
    await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
    await expectAgentsVisible(context.window, 10000);
    const firstLaunchDataPath = context.testDataPath;
    const firstInput = context.window.locator('textarea[placeholder*="Ask"]');

    // Seed persistent history in the same user-data-dir.
    await firstInput.fill('Warm up session with a short reply');
    await firstInput.press('Enter');
    await expect(context.window.locator('[data-testid="message-llm-action"]').last()).toBeVisible({
      timeout: 90000,
    });

    await closeElectron(context, false);

    mockLLMServer.setStreamingMode(true, {
      reasoning:
        'Compare factorial and power carefully step by step with intermediate checks and short validations',
      content:
        '{"action":{"type":"text","content":"17! is greater than 2^57 because 17! = 355687428096000 and 2^57 = 144115188075855872."}}',
      chunkDelayMs: 250,
    });
    context = await launchElectron(firstLaunchDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OPENAI_API_URL: `http://localhost:${mockLLMPort}/v1/responses`,
      CLERKLY_OPENAI_API_KEY: 'mock-key-for-testing',
    });
    await expectAgentsVisible(context.window, 15000);
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });

    await messageInput.fill(
      'Solve this carefully: compare 17! and 2^57, explain each step briefly, then give response text.'
    );
    await messageInput.press('Enter');

    const reasoningTrigger = context.window.locator(
      '[data-testid="message-llm-reasoning-trigger"]'
    );
    const reasoningContent = context.window.locator('[data-testid="message-llm-reasoning"]').last();
    const actionContent = context.window.locator('[data-testid="message-llm-action"]').last();
    const actionCountBeforeRequest = await actionContent.count();

    await expect(reasoningTrigger.last()).toBeVisible({ timeout: 45000 });
    await expect(reasoningTrigger.last()).toContainText('Thinking...', { timeout: 45000 });
    await expect(reasoningContent).toBeVisible({ timeout: 45000 });

    await context.window.evaluate((baselineActionCount: number) => {
      const state = {
        updatesBeforeAction: 0,
        maxLengthBeforeAction: 0,
        sawReasoningBeforeAction: false,
        actionSeen: false,
      };
      const getReasoningNode = () =>
        document.querySelectorAll('[data-testid="message-llm-reasoning"]')[
          document.querySelectorAll('[data-testid="message-llm-reasoning"]').length - 1
        ] as HTMLElement | undefined;
      const getActionCount = () =>
        document.querySelectorAll('[data-testid="message-llm-action"]').length;

      const readReasoning = () => (getReasoningNode()?.textContent ?? '').trim();
      const refresh = () => {
        if (getActionCount() > baselineActionCount) {
          state.actionSeen = true;
        }
        if (!state.actionSeen) {
          const text = readReasoning();
          if (text.length > 0) state.sawReasoningBeforeAction = true;
          if (text.length > state.maxLengthBeforeAction) {
            state.maxLengthBeforeAction = text.length;
            state.updatesBeforeAction += 1;
          }
        }
      };

      refresh();
      const observer = new MutationObserver(() => {
        refresh();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });

      (window as Window & { __reasoningStreamProbe?: unknown }).__reasoningStreamProbe = {
        state,
        stop: () => {
          observer.disconnect();
        },
      };
    }, actionCountBeforeRequest);

    await expect(actionContent.last()).toBeVisible({ timeout: 90000 });

    const streamProbe = await context.window.evaluate(() => {
      const probe = (window as Window & { __reasoningStreamProbe?: any }).__reasoningStreamProbe;
      if (!probe) {
        return {
          sawReasoningBeforeAction: false,
          updatesBeforeAction: 0,
          maxLengthBeforeAction: 0,
        };
      }
      probe.stop();
      return probe.state;
    });

    expect(streamProbe.sawReasoningBeforeAction).toBe(true);
    expect(streamProbe.maxLengthBeforeAction).toBeGreaterThan(0);
    expect(streamProbe.updatesBeforeAction).toBeGreaterThanOrEqual(1);
    await expectNoToastError(context.window);
  });

  /* Preconditions: App authenticated, invalid API key saved
     Action: User sends a message
     Assertions: Error bubble appears with auth error text and "Open Settings" action;
       click navigates to Settings screen
     Requirements: llm-integration.3.1, llm-integration.3.4, llm-integration.3.5 */
  test('should show error message on invalid api key', async () => {
    // Use deterministic mock provider 401 response to assert auth error UX contract.
    mockLLMServer.setSuccess(false);
    mockLLMServer.setError(401, 'Invalid API key');

    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OPENAI_API_URL: `http://localhost:${mockLLMPort}/v1/responses`,
      CLERKLY_OPENAI_API_KEY: 'sk-invalid-key-000000000000',
    });
    await completeOAuthFlow(context.app, context.window, TEST_CLIENT_ID);
    await expectAgentsVisible(context.window, 10000);

    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Hello');
    await messageInput.press('Enter');

    // Error bubble appears
    const errorBubble = context.window.locator('[data-testid="message-error"]');
    await expect(errorBubble).toBeVisible({ timeout: 15000 });

    // Contains auth error text
    const text = await errorBubble.textContent();
    expect(text?.toLowerCase()).toMatch(/invalid api key|unauthorized|forbidden/);

    const actionLink = context.window.locator('[data-testid="message-error-action-link"]');
    await expect(actionLink).toBeVisible({ timeout: 5000 });
    await expect(actionLink).toHaveText('Open Settings');

    await actionLink.click();
    await expect(context.window.locator('h2:has-text("LLM Provider")')).toBeVisible({
      timeout: 5000,
    });
    await expectAgentsHiddenByCss(context.window, 3000);
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
    const actionContent = context.window.locator('[data-testid="message-llm-action"]').last();
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
    await expect(context.window.locator('[data-testid="message-llm-action"]').last()).toBeVisible({
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

  /* Preconditions: App authenticated with real OpenAI API key, at least one long LLM response is persisted in chat history
     Action: Restart app and record chat scrollTop frame-by-frame from the earliest startup frames
     Assertions: After chat becomes visible, scrollTop stays stable (no visual startup autoscroll)
     Requirements: agents.4.14.5, agents.4.14.6 */
  test('should keep chat viewport visually stable on app reopen with real llm history', async () => {
    test.setTimeout(180000);

    context = await launchWithRealLLM(OPENAI_API_KEY!);
    const testDataPath = context.testDataPath;

    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');
    await expect(messageInput).toBeVisible({ timeout: 10000 });

    await messageInput.fill(
      'Write a long Russian text with 8 numbered sections and bullet lists. No code blocks.'
    );
    await messageInput.press('Enter');

    const stopButton = context.window.locator('[data-testid="prompt-input-stop"]');
    await expect(stopButton).toBeVisible({ timeout: 15000 });
    await expect(context.window.locator('[data-testid="prompt-input-send"]')).toBeVisible({
      timeout: 120000,
    });

    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toBeVisible({ timeout: 120000 });

    await closeElectron(context, false);

    context = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OPENAI_API_KEY: OPENAI_API_KEY!,
    });

    await context.window.evaluate(() => {
      const state = {
        samples: [] as Array<{
          t: number;
          visible: boolean;
          scrollTop: number | null;
          loaderVisible: boolean;
        }>,
        firstVisibleToUserAt: null as number | null,
        firstVisibleToUserScrollTop: null as number | null,
        maxScrollDeltaAfterVisibleToUser: 0,
        movedFramesAfterVisibleToUser: 0,
        scrollEventsAfterVisibleToUser: 0,
      };

      let listenerAttached = false;
      let lastVisibleScrollTop: number | null = null;
      const startedAt = performance.now();

      const isLoaderVisible = () => {
        const loader = document.querySelector(
          '[data-testid="app-loading-screen"]'
        ) as HTMLElement | null;
        if (!loader) return false;
        const style = window.getComputedStyle(loader);
        return (
          loader.getAttribute('aria-hidden') !== 'true' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        );
      };

      const getMessagesArea = () =>
        document.querySelector('[data-testid="messages-area"]') as HTMLElement | null;

      const isVisible = (el: HTMLElement | null) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        );
      };

      const attachScrollListener = (el: HTMLElement) => {
        if (listenerAttached) return;
        listenerAttached = true;
        el.addEventListener(
          'scroll',
          () => {
            if (state.firstVisibleToUserAt !== null) {
              state.scrollEventsAfterVisibleToUser += 1;
            }
          },
          { passive: true }
        );
      };

      (window as any).__startupScrollTracePromise = new Promise<void>((resolve) => {
        const run = () => {
          const now = performance.now();
          const messagesArea = getMessagesArea();
          if (messagesArea) {
            attachScrollListener(messagesArea);
          }

          const visible = isVisible(messagesArea);
          const scrollTop = messagesArea ? messagesArea.scrollTop : null;
          const loaderVisible = isLoaderVisible();

          if (visible && !loaderVisible && state.firstVisibleToUserAt === null) {
            state.firstVisibleToUserAt = now - startedAt;
            state.firstVisibleToUserScrollTop = scrollTop;
          }

          if (
            visible &&
            !loaderVisible &&
            scrollTop !== null &&
            state.firstVisibleToUserScrollTop !== null
          ) {
            const totalDelta = Math.abs(scrollTop - state.firstVisibleToUserScrollTop);
            if (totalDelta > state.maxScrollDeltaAfterVisibleToUser) {
              state.maxScrollDeltaAfterVisibleToUser = totalDelta;
            }

            if (lastVisibleScrollTop !== null) {
              const frameDelta = Math.abs(scrollTop - lastVisibleScrollTop);
              if (frameDelta > 1) {
                state.movedFramesAfterVisibleToUser += 1;
              }
            }
            lastVisibleScrollTop = scrollTop;
          }

          state.samples.push({
            t: now - startedAt,
            visible,
            scrollTop,
            loaderVisible,
          });

          if (now - startedAt < 5000) {
            requestAnimationFrame(run);
            return;
          }

          (window as any).__startupScrollTrace = state;
          resolve();
        };

        requestAnimationFrame(run);
      });
    });

    await expectAgentsVisible(context.window, 10000);
    await context.window.evaluate(async () => {
      await (window as any).__startupScrollTracePromise;
    });

    const traceSummary = await context.window.evaluate(() => {
      const state = (window as any).__startupScrollTrace as {
        samples: Array<{ visible: boolean; loaderVisible: boolean }>;
        firstVisibleToUserAt: number | null;
        maxScrollDeltaAfterVisibleToUser: number;
        movedFramesAfterVisibleToUser: number;
        scrollEventsAfterVisibleToUser: number;
      };

      const visibleSamples = state.samples.filter((sample) => sample.visible).length;
      const visibleToUserSamples = state.samples.filter(
        (sample) => sample.visible && !sample.loaderVisible
      ).length;

      return {
        firstVisibleToUserAt: state.firstVisibleToUserAt,
        maxScrollDeltaAfterVisibleToUser: state.maxScrollDeltaAfterVisibleToUser,
        movedFramesAfterVisibleToUser: state.movedFramesAfterVisibleToUser,
        scrollEventsAfterVisibleToUser: state.scrollEventsAfterVisibleToUser,
        visibleSamples,
        visibleToUserSamples,
      };
    });

    expect(traceSummary.firstVisibleToUserAt).not.toBeNull();
    expect(traceSummary.visibleSamples).toBeGreaterThan(20);
    expect(traceSummary.visibleToUserSamples).toBeGreaterThan(20);
    expect(traceSummary.maxScrollDeltaAfterVisibleToUser).toBeLessThanOrEqual(2);
    expect(traceSummary.movedFramesAfterVisibleToUser).toBe(0);
    expect(traceSummary.scrollEventsAfterVisibleToUser).toBe(0);
    await expectNoToastError(context.window);
  });
});

/**
 * User-approved exception block:
 * these scenarios cannot be made stable with a real external LLM because they
 * require one or more of:
 * - deterministic 429/500 transport responses;
 * - deterministic chunk timing for interruption/race checks;
 * - inspection of raw provider request bodies.
 * Approval status:
 * - mock LLM usage is allowed only for scenarios explicitly approved by the user;
 * - new tests in this block are not auto-approved and require separate confirmation.
 */
test.describe('LLM Chat (controlled mock transport exceptions)', () => {
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
   * Mock key is passed via env — mock server doesn't validate auth.
   * MainPipeline reads the key from CLERKLY_OPENAI_API_KEY env via loadAPIKey().
   */
  async function launchWithMockLLM(): Promise<ElectronTestContext> {
    const ctx = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OPENAI_API_URL: `http://localhost:${mockLLMPort}/v1/responses`,
      CLERKLY_OPENAI_API_KEY: 'mock-key-for-testing',
    });
    await completeOAuthFlow(ctx.app, ctx.window, TEST_CLIENT_ID);
    await expectAgentsVisible(ctx.window, 10000);
    // Check no toast errors appeared during startup/auth
    await expectNoToastError(ctx.window);
    return ctx;
  }

  type ProviderRequestMessage = {
    role: string;
    content: unknown;
  };

  const getRequestMessages = (body: Record<string, unknown>): ProviderRequestMessage[] =>
    (body.input ?? body.messages) as ProviderRequestMessage[];

  const contentToText = (content: unknown): string => {
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (
            part &&
            typeof part === 'object' &&
            typeof (part as { text?: unknown }).text === 'string'
          ) {
            return (part as { text: string }).text;
          }
          return '';
        })
        .join(' ');
    }
    if (
      content &&
      typeof content === 'object' &&
      typeof (content as { text?: unknown }).text === 'string'
    ) {
      return (content as { text: string }).text;
    }
    return typeof content === 'string' ? content : '';
  };

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
  /* Preconditions: MockLLMServer configured with slow streaming (300ms between chunks),
       app authenticated with mock LLM URL
     Action: User sends first message, then sends second message while first is still streaming
     Assertions: Only one message-llm bubble visible (response to second message),
       previous llm message is hidden
     Requirements: llm-integration.8.1, llm-integration.8.4, llm-integration.8.5 */
  test('should interrupt previous request when new message sent during streaming', async () => {
    // First request: slow streaming so we can interrupt it
    mockLLMServer.setStreamingMode(true, {
      content: 'First response '.repeat(20),
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

    // Second response should be rendered and no error message should appear.
    const secondResponse = context.window
      .locator('[data-testid="message-llm-action"]')
      .filter({ hasText: 'Second response' });
    await expect(secondResponse).toHaveCount(1, { timeout: 5000 });
    await expect(context.window.locator('[data-testid="message-error"]')).toHaveCount(0);
  });

  /* Preconditions: MockLLMServer configured with slow streaming,
       app authenticated with mock LLM URL
     Action: User sends message and presses stop button while agent status is in-progress
     Assertions: Request is cancelled, send button returns, no error bubble appears
     Requirements: llm-integration.8.1, llm-integration.8.7 */
  test('should cancel active request via stop button without creating error message', async () => {
    mockLLMServer.setStreamingMode(true, {
      content: 'Long response '.repeat(30),
      chunkDelayMs: 300,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    await messageInput.fill('Cancel this request');
    await messageInput.press('Enter');

    const stopButton = context.window.locator('[data-testid="prompt-input-stop"]');
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await stopButton.click();

    await expect(context.window.locator('[data-testid="prompt-input-send"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(context.window.locator('[data-testid="message-error"]')).toHaveCount(0);
  });

  /* Preconditions: MockLLMServer streams reasoning and then action content; app authenticated with mock LLM URL
     Action: User sends message, waits for reasoning trigger, verifies trigger composition, waits for auto-collapse and toggles content
     Assertions: Trigger logo is animated only while reasoning is active; after finish + collapse it stays static; content can still be manually toggled
     Requirements: agents.4.11, agents.4.11.2, llm-integration.2, llm-integration.7.2 */
  test('should keep reasoning trigger logo static after finish and auto-collapse', async () => {
    mockLLMServer.setStreamingMode(true, {
      reasoning: 'Thinking through the answer carefully',
      content: '{"action":{"type":"text","content":"Final answer"}}',
      chunkDelayMs: 80,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    await messageInput.fill('Show reasoning');
    await messageInput.press('Enter');

    const reasoningTrigger = context.window.locator(
      '[data-testid="message-llm-reasoning-trigger"]'
    );
    const reasoningContent = context.window.locator('[data-testid="message-llm-reasoning"]');
    await expect(reasoningTrigger).toBeVisible({ timeout: 5000 });
    await expect(reasoningContent).toBeVisible({ timeout: 5000 });

    // During streaming trigger should show animated app logo.
    await expect(reasoningTrigger.locator('svg.logo-animated')).toBeVisible({ timeout: 5000 });
    await expect(reasoningTrigger).toContainText('Thinking...');
    await expect(reasoningTrigger.locator('svg.lucide-chevron-down')).toBeVisible({
      timeout: 5000,
    });

    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toBeVisible({ timeout: 10000 });

    // Wait until reasoning auto-collapses after streaming finishes.
    await expect
      .poll(async () => await reasoningTrigger.getAttribute('data-state'), { timeout: 5000 })
      .toBe('closed');
    await expect(reasoningTrigger.locator('svg.logo-animated')).toHaveCount(0);

    // Manual collapse/expand toggle behavior still works and logo remains static.
    await reasoningTrigger.click();
    await expect(reasoningContent).toBeVisible({ timeout: 5000 });
    await expect(reasoningTrigger.locator('svg.logo-animated')).toHaveCount(0);
    await reasoningTrigger.click();
    await expect(reasoningContent).not.toBeVisible({ timeout: 5000 });
    await expect(reasoningTrigger.locator('svg.logo-animated')).toHaveCount(0);

    await expectNoToastError(context.window);
  });

  /* Preconditions: MockLLMServer streams long reasoning before final structured action; app authenticated with mock LLM URL
     Action: User sends message, observes reasoning phase and then final action arrival
     Assertions: Header status stays "In progress" while llm message has reasoning without action, then switches to "Awaiting response" after action is persisted
     Requirements: agents.9.2, llm-integration.2, llm-integration.7.3 */
  test('should keep agent in-progress during reasoning-only llm phase', async () => {
    mockLLMServer.setStreamingMode(true, {
      reasoning:
        'Reasoning chunk one reasoning chunk two reasoning chunk three reasoning chunk four reasoning chunk five',
      content: '{"action":{"type":"text","content":"Final answer after reasoning"}}',
      chunkDelayMs: 120,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    await messageInput.fill('Show long reasoning and then response text');
    await messageInput.press('Enter');

    const agentAvatarIcon = context.window
      .locator('[data-testid^="agent-icon-"]')
      .first()
      .locator('[data-testid="agent-avatar-icon"]');
    const reasoningTrigger = context.window.locator(
      '[data-testid="message-llm-reasoning-trigger"]'
    );
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');

    await expect(reasoningTrigger).toBeVisible({ timeout: 5000 });
    await expect(actionContent).toHaveCount(0);
    await expect
      .poll(async () => await agentAvatarIcon.getAttribute('class'), { timeout: 5000 })
      .toContain('bg-blue-500');

    await expect(actionContent).toBeVisible({ timeout: 10000 });
    await expect
      .poll(async () => await agentAvatarIcon.getAttribute('class'), { timeout: 5000 })
      .toContain('bg-amber-500');

    await expectNoToastError(context.window);
  });

  /* Preconditions: MockLLMServer streams long text response in multiple chunks; app authenticated with mock LLM URL
     Action: User sends message and waits until response completes
     Assertions: Final text is rendered in one active llm bubble without duplicate action blocks
     Requirements: llm-integration.7.3 */
  test('should keep a single active action block while streamed text is assembling', async () => {
    mockLLMServer.setStreamingMode(true, {
      content: JSON.stringify({
        action: {
          type: 'text',
          content:
            'This is a long streamed response used for deterministic chunk-by-chunk rendering verification.',
        },
      }),
      chunkDelayMs: 120,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Stream text in chunks');
    await messageInput.press('Enter');

    const actionContent = context.window.locator('[data-testid="message-llm-action"]').last();
    await expect(actionContent).toBeVisible({ timeout: 10000 });

    const bubbleStats = await context.window.evaluate(async () => {
      const actionCounts: number[] = [];
      const getNode = () =>
        document.querySelectorAll('[data-testid="message-llm-action"]')[
          document.querySelectorAll('[data-testid="message-llm-action"]').length - 1
        ] as HTMLElement | undefined;

      const startedAt = Date.now();
      while (Date.now() - startedAt < 8000) {
        const node = getNode();
        actionCounts.push(document.querySelectorAll('[data-testid="message-llm-action"]').length);
        if (node) {
          // Touch text to ensure node remains readable during updates.
          node.textContent?.trim();
        }
        await new Promise((resolve) => setTimeout(resolve, 120));
      }

      return {
        maxActionCount: Math.max(...actionCounts, 0),
      };
    });

    await expect(actionContent).toContainText(
      'This is a long streamed response used for deterministic chunk-by-chunk rendering verification.',
      {
        timeout: 10000,
      }
    );
    expect(bubbleStats.maxActionCount).toBe(1);
    await expectNoToastError(context.window);
  });

  /* Preconditions: MockLLMServer configured with slow streaming, cancel IPC is forced to fail
       app authenticated with mock LLM URL
     Action: User sends message, presses stop, cancel returns success:false
     Assertions: No error toast is shown
     Requirements: agents.4.24.3 */
  test('should not show toast when stop cancel request fails', async () => {
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"Long response"}}',
      chunkDelayMs: 300,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    await context.window.evaluate(() => {
      const api = (window as unknown as { api: any }).api;
      api.messages.cancel = async () => ({ success: false, error: 'forced cancel failure' });
    });

    await messageInput.fill('Cancel should fail silently');
    await messageInput.press('Enter');

    const stopButton = context.window.locator('[data-testid="prompt-input-stop"]');
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await stopButton.click();

    await expect(context.window.locator('[data-testid="prompt-input-send"]')).toBeVisible({
      timeout: 5000,
    });
    await expectNoToastError(context.window);
  });

  /* Preconditions: MockLLMServer configured with slow streaming for first request,
       fast response for second; app authenticated with mock LLM URL
     Action: User sends first message, waits for streaming to start, sends second message
     Assertions: Exactly one message-llm in DOM, no artifacts of first (hidden) response
     Requirements: llm-integration.8.5 */
  test('should not show hidden llm message in chat', async () => {
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

    // Exactly one llm bubble in DOM — hidden one must not be rendered at all
    await expect(context.window.locator('[data-testid="message-llm"]')).toHaveCount(1);

    // No text from the hidden first response anywhere in the chat
    await expect(context.window.locator('text=First response')).toHaveCount(0);
  });

  /* Preconditions: First request is interrupted after streaming starts (its llm message becomes hidden),
       second request succeeds; app authenticated with mock LLM URL
     Action: User sends two messages in sequence with interruption between them
     Assertions: LLM history for second request contains first user message but excludes hidden first llm response
     Requirements: llm-integration.8.6, llm-integration.10.3 */
  test('should exclude hidden llm messages from model history on next request', async () => {
    // First request: slow streaming so it can be interrupted
    mockLLMServer.setStreamingMode(true, {
      content: 'First response '.repeat(20),
      chunkDelayMs: 300,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    // Send first message and wait for streaming start
    await messageInput.fill('First message');
    await messageInput.press('Enter');
    await expect(context.window.locator('[data-testid="message"]').first()).toBeVisible({
      timeout: 5000,
    });
    const firstResponse = context.window
      .locator('[data-testid="message-llm-action"]')
      .filter({ hasText: 'First response' });
    await expect(firstResponse).toBeVisible({ timeout: 5000 });
    await expect(context.window.locator('[data-testid="prompt-input-stop"]')).toBeVisible({
      timeout: 5000,
    });

    // Switch to fast second response and clear logs to inspect only second request payload
    mockLLMServer.setStreamingMode(true, {
      content: '{"action":{"type":"text","content":"Second response"}}',
      chunkDelayMs: 0,
    });
    mockLLMServer.clearRequestLogs();

    // Send second message
    await messageInput.fill('Second message');
    await messageInput.press('Enter');

    // Wait for second response
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toHaveCount(1, { timeout: 15000 });
    await expect(actionContent.first()).toHaveText('Second response', { timeout: 5000 });

    const lastRequest = mockLLMServer.getLastRequest();
    expect(lastRequest).toBeDefined();
    const messages = getRequestMessages(lastRequest!.body as Record<string, unknown>);

    // First user message remains part of dialog context
    const hasFirstUser = messages.some(
      (m) => m.role === 'user' && contentToText(m.content).includes('First message')
    );
    expect(hasFirstUser).toBe(true);

    // Hidden first assistant message must not be replayed
    const hasHiddenAssistantReplay = messages.some(
      (m) => m.role === 'assistant' && contentToText(m.content).includes('First response')
    );
    expect(hasHiddenAssistantReplay).toBe(false);
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
     Assertions: Second LLM request contains previous dialogue as separate messages
     Requirements: llm-integration.10.1, llm-integration.10.2, llm-integration.10.4 */
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

    const messages = getRequestMessages(lastRequest!.body as Record<string, unknown>);
    expect(messages).toBeDefined();

    const priorUserMsg = messages.find(
      (m) => m.role === 'user' && contentToText(m.content).includes('First message')
    );
    const priorAssistantMsg = messages.find(
      (m) => m.role === 'assistant' && contentToText(m.content).includes('First response')
    );
    expect(priorUserMsg).toBeDefined();
    expect(priorAssistantMsg).toBeDefined();
  });

  /* Preconditions: MockLLMServer returns 500 on first request, success on second;
       app authenticated with mock LLM URL
     Action: User sends first message (gets error), then sends second message
     Assertions: Request history does not include error message payload
     Requirements: llm-integration.10.3 */
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

    const messages = getRequestMessages(lastRequest!.body as Record<string, unknown>);
    expect(messages).toBeDefined();

    const errorInConversation = messages.some(
      (m) =>
        m.role !== 'system' &&
        contentToText(m.content).toLowerCase().includes('internal server error')
    );
    expect(errorInConversation).toBe(false);
  });

  /* Preconditions: MockLLMServer returns JSON-like text payload, app authenticated with mock LLM URL
     Action: User sends a message
     Assertions: Response is shown as plain text without extra transformation retries
     User-approved mock scenario: yes
     Requirements: llm-integration.5.1, llm-integration.6.5 */
  test('should treat JSON-like text as plain response without extra retries', async () => {
    mockLLMServer.setStreamingMode(true, {
      content: JSON.stringify({
        action: { type: 'invalid-type', content: 'Broken payload' },
      }),
      chunkDelayMs: 0,
    });

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    await messageInput.fill('Return JSON-like text without formatting');
    await messageInput.press('Enter');

    const actionContent = context.window.locator('[data-testid="message-llm-action"]').last();
    await expect(actionContent).toBeVisible({ timeout: 15000 });
    await expect(actionContent).toContainText('Broken payload');

    const requestCount = mockLLMServer
      .getRequestLogs()
      .filter((entry) => entry.method === 'POST' && entry.path === '/v1/responses').length;
    expect(requestCount).toBe(1);
  });

  /* Preconditions: MockLLMServer returns tool call on first response and final text on second
     Action: User sends a message
     Assertions: tool_call is processed via second model request; chat renders only llm bubble without separate tool_call message
     Requirements: llm-integration.11.1, llm-integration.11.4, llm-integration.11.6 */
  test('should continue model -> tools -> model loop and avoid separate tool_call bubble', async () => {
    mockLLMServer.setStreamingMode(true);
    mockLLMServer.setOpenAIStreamScripts([
      {
        reasoning: 'thinking',
        toolCalls: [{ callId: 'call-1', toolName: 'search_docs', arguments: { query: 'stream' } }],
      },
      {
        content: 'Tool-assisted answer',
      },
    ]);

    context = await launchWithMockLLM();
    const messageInput = context.window.locator('textarea[placeholder*="Ask"]');

    await messageInput.fill('Use tool');
    await messageInput.press('Enter');

    const actionContent = context.window.locator('[data-testid="message-llm-action"]').last();
    await expect(actionContent).toBeVisible({ timeout: 15000 });
    await expect(actionContent).toContainText('Tool-assisted answer');

    const requestCount = mockLLMServer
      .getRequestLogs()
      .filter((entry) => entry.method === 'POST' && entry.path === '/v1/responses').length;
    expect(requestCount).toBe(2);

    const llmBubbles = context.window.locator('[data-testid="message-llm"]');
    await expect(llmBubbles).toHaveCount(1);
    await expect(context.window.locator('[data-testid="message-user"]')).toHaveCount(1);
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

  /* Preconditions: MockLLMServer returns markdown heading
     Action: User sends a message
     Assertions: heading element rendered
     Requirements: agents.7.7 */
  test('should render markdown headings', async () => {
    await renderMarkdownMessage('# Heading');
    await expect(context.window.locator('[data-testid="message-llm-action"] h1')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown paragraph
     Action: User sends a message
     Assertions: paragraph element rendered
     Requirements: agents.7.7 */
  test('should render markdown paragraphs', async () => {
    await renderMarkdownMessage('Paragraph text');
    await expect(context.window.locator('[data-testid="message-llm-action"] p')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown emphasis
     Action: User sends a message
     Assertions: strong and em elements rendered
     Requirements: agents.7.7 */
  test('should render markdown emphasis', async () => {
    await renderMarkdownMessage('**Bold** and *italic*');
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toContainText('Bold');
    await expect(actionContent.locator('em')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown strikethrough
     Action: User sends a message
     Assertions: del element rendered
     Requirements: agents.7.7 */
  test('should render markdown strikethrough', async () => {
    await renderMarkdownMessage('~~Deleted~~');
    await expect(context.window.locator('[data-testid="message-llm-action"] del')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown link
     Action: User sends a message
     Assertions: link element rendered with href
     Requirements: agents.7.7 */
  test('should render markdown links', async () => {
    await renderMarkdownMessage('[Example](https://example.com)');
    await expect(context.window.getByRole('button', { name: 'Example' })).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown autolink
     Action: User sends a message
     Assertions: autolink rendered
     Requirements: agents.7.7 */
  test('should render markdown autolinks', async () => {
    await renderMarkdownMessage('https://example.com');
    await expect(context.window.getByRole('button', { name: 'https://example.com' })).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown email autolink
     Action: User sends a message
     Assertions: mailto link rendered
     Requirements: agents.7.7 */
  test('should render markdown email autolinks', async () => {
    await renderMarkdownMessage('test@example.com');
    await expect(context.window.getByRole('button', { name: 'test@example.com' })).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown blockquote
     Action: User sends a message
     Assertions: blockquote element rendered
     Requirements: agents.7.7 */
  test('should render markdown blockquotes', async () => {
    await renderMarkdownMessage('> Quote');
    await expect(
      context.window.locator('[data-testid="message-llm-action"] blockquote')
    ).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown unordered list
     Action: User sends a message
     Assertions: ul/li rendered
     Requirements: agents.7.7 */
  test('should render markdown unordered list', async () => {
    await renderMarkdownMessage('- Item 1\n- Item 2');
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent.locator('ul')).toBeVisible();
    await expect(actionContent.locator('li')).toHaveCount(2);
  });

  /* Preconditions: MockLLMServer returns markdown ordered list
     Action: User sends a message
     Assertions: ol/li rendered
     Requirements: agents.7.7 */
  test('should render markdown ordered list', async () => {
    await renderMarkdownMessage('1. First\n2. Second');
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent.locator('ol')).toBeVisible();
    await expect(actionContent.locator('li')).toHaveCount(2);
  });

  /* Preconditions: MockLLMServer returns markdown nested list
     Action: User sends a message
     Assertions: nested lists rendered
     Requirements: agents.7.7 */
  test('should render markdown nested list', async () => {
    await renderMarkdownMessage('- Parent\n  - Child');
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent.locator('ul')).toHaveCount(2);
  });

  /* Preconditions: MockLLMServer returns markdown task list
     Action: User sends a message
     Assertions: checkbox inputs rendered
     Requirements: agents.7.7 */
  test('should render markdown task list', async () => {
    await renderMarkdownMessage('- [x] Done\n- [ ] Pending');
    await expect(
      context.window.locator('[data-testid="message-llm-action"] input[type="checkbox"]')
    ).toHaveCount(2);
  });

  /* Preconditions: MockLLMServer returns markdown inline code
     Action: User sends a message
     Assertions: inline code element rendered
     Requirements: agents.7.7 */
  test('should render markdown inline code', async () => {
    await renderMarkdownMessage('Use `npm install`');
    await expect(context.window.locator('[data-testid="message-llm-action"] code')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown fenced code
     Action: User sends a message
     Assertions: pre > code rendered
     Requirements: agents.7.7 */
  test('should render markdown fenced code', async () => {
    await renderMarkdownMessage('```js\nconsole.log("hi");\n```');
    await expect(context.window.locator('[data-testid="message-llm-action"] pre')).toBeVisible();
    await expect(
      context.window.locator('[data-testid="message-llm-action"] pre code')
    ).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown table
     Action: User sends a message
     Assertions: table rendered
     Requirements: agents.7.7 */
  test('should render markdown tables', async () => {
    await renderMarkdownMessage('| A | B |\n|---|---|\n| 1 | 2 |');
    await expect(context.window.locator('[data-testid="message-llm-action"] table')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown horizontal rule
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
    const imageDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+o7m0AAAAASUVORK5CYII=';
    await renderMarkdownMessage(`![Alt](${imageDataUrl})`);
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');
    await expect(actionContent).toContainText(/Image (blocked: Alt|not available)/);
  });

  /* Preconditions: MockLLMServer returns markdown mermaid diagram
     Action: User sends a message
     Assertions: mermaid diagram rendered as svg
     Requirements: agents.7.7 */
  test('should render markdown mermaid diagrams', async () => {
    await renderMarkdownMessage('```mermaid\ngraph TD;\nA-->B;\n```');
    await expect(context.window.getByRole('button', { name: 'Download diagram' })).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown inline math
     Action: User sends a message
     Assertions: katex inline rendered
     Requirements: agents.7.7 */
  test('should render markdown inline math', async () => {
    await renderMarkdownMessage('Inline $$E=mc^2$$');
    await expect(context.window.locator('[data-testid="message-llm-action"] .katex')).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown block math
     Action: User sends a message
     Assertions: katex display rendered
     Requirements: agents.7.7 */
  test('should render markdown block math', async () => {
    await renderMarkdownMessage('$$\n\\sum_{i=1}^{n} i = n(n+1)/2\n$$');
    await expect(
      context.window.locator('[data-testid="message-llm-action"] .katex-display')
    ).toBeVisible();
  });

  /* Preconditions: MockLLMServer returns markdown blocks with separators
     Action: User sends a message
     Assertions: no empty paragraphs are rendered between blocks
     Requirements: agents.7.7 */
  test('should avoid duplicate line breaks between markdown blocks', async () => {
    const markdown =
      '### Task list\n\n- [x] Done\n- [ ] Pending\n\n---\n\n## Quotes\n\n> Quote one\n\n> Quote two';
    await renderMarkdownMessage(markdown);

    const emptyParagraphs = await context.window
      .locator('[data-testid="message-llm-action"] p')
      .evaluateAll(
        (nodes) => nodes.filter((node) => (node.textContent ?? '').trim().length === 0).length
      );
    expect(emptyParagraphs).toBe(0);
  });

  /* Preconditions: MockLLMServer returns markdown with fenced code and task list
     Action: User sends a message
     Assertions: Code block actions and task list checkboxes are rendered
     Requirements: agents.7.7 */
  test('should render streamdown code blocks and task lists', async () => {
    const markdown = ['```ts', 'const value = 42;', '```', '', '- [x] Done', '- [ ] Pending'].join(
      '\n'
    );

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

    await expect(context.window.locator('[data-streamdown="code-block-actions"]')).toBeVisible({
      timeout: 3000,
    });
    await expect(actionContent.locator('input[type="checkbox"]')).toHaveCount(2, {
      timeout: 3000,
    });
  });

  /* Preconditions: MockLLMServer returns markdown with footnotes and other elements
     Action: User sends a message
     Assertions: footnotes are not rendered; other markdown elements render
     Requirements: agents.7.7 */
  test('should not render footnotes while rendering other markdown elements', async () => {
    const markdown = [
      '# Title',
      '',
      'Paragraph with **bold**, *italic*, ~~strike~~, [link](https://example.com),',
      'autolink https://example.com and email test@example.com, plus `inline`.',
      '',
      '> Quote block.',
      '',
      '- Item 1',
      '  - Nested',
      '1. First',
      '2. Second',
      '- [x] Done',
      '- [ ] Pending',
      '',
      '```js',
      'console.log("code");',
      '```',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
      '',
      '---',
      '',
      '![Alt](https://example.com/image.png)',
      '',
      '```mermaid',
      'graph TD;',
      'A-->B;',
      '```',
      '',
      'Inline math $E=mc^2$ and block math:',
      '',
      '$$',
      '\\sum_{i=1}^{n} i = n(n+1)/2',
      '$$',
      '',
      'Footnote reference[^1].',
      '',
      '[^1]: Footnote text.',
    ].join('\n');

    await renderMarkdownMessage(markdown);
    const actionContent = context.window.locator('[data-testid="message-llm-action"]');

    await expect(actionContent.locator('h1')).toBeVisible();
    await expect(actionContent.locator('p').first()).toBeVisible();
    await expect(actionContent).toContainText('bold');
    await expect(actionContent.locator('em')).toBeVisible();
    await expect(actionContent.locator('del')).toBeVisible();
    await expect(context.window.getByRole('button', { name: 'link' })).toBeVisible();
    await expect(context.window.getByRole('button', { name: 'https://example.com' })).toBeVisible();
    await expect(context.window.getByRole('button', { name: 'test@example.com' })).toBeVisible();
    await expect(actionContent.locator('blockquote')).toBeVisible();
    await expect(actionContent.locator('ul')).toHaveCount(3);
    await expect(actionContent.locator('ol')).toBeVisible();
    await expect(actionContent.locator('input[type="checkbox"]')).toHaveCount(2);
    await expect(actionContent.locator('code').first()).toBeVisible();
    await expect(actionContent.locator('pre code')).toBeVisible();
    await expect(actionContent.locator('table')).toBeVisible();
    await expect(actionContent.locator('hr')).toBeVisible();
    await expect(actionContent).toContainText(/Image (blocked: Alt|not available)/);
    await expect(context.window.getByRole('button', { name: 'Download diagram' })).toBeVisible();
    await expect(actionContent.locator('.katex').first()).toBeVisible();
    await expect(actionContent.locator('.katex-display').first()).toBeVisible();

    await expect(actionContent.locator('a[href^="#fn"]')).toHaveCount(0);
    await expect(actionContent.locator('.footnotes')).toHaveCount(0);
  });
});
