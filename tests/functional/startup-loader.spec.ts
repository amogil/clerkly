/**
 * Functional Tests: Startup Loader
 *
 * Verifies App loading screen behavior while AgentChat history loads.
 * Requirements: agents.13.2, agents.13.10
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import os from 'os';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  completeOAuthFlow,
  createMockOAuthServer,
  activeChat,
  expectNoToastError,
  expectAgentsVisible,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let context: ElectronTestContext | null = null;
let mockOAuthServer: MockOAuthServer;

async function seedAgentMessages(window: Page, agentId: string, count: number): Promise<void> {
  await window.evaluate(
    async ({ targetAgentId, total }) => {
      for (let i = 1; i <= total; i++) {
        // @ts-expect-error - window.api is exposed via contextBridge
        const result = await window.api.test.createAgentMessage(targetAgentId, `Seed message ${i}`);
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to seed message');
        }
      }
    },
    { targetAgentId: agentId, total: count }
  );
}

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer();
});

test.afterAll(async () => {
  if (mockOAuthServer) {
    await mockOAuthServer.stop();
  }
});

test.beforeEach(async () => {
  mockOAuthServer.setUserProfile({
    id: 'test-startup-loader-user',
    email: 'startup.loader@example.com',
    name: 'Startup Loader User',
    given_name: 'Startup',
    family_name: 'Loader',
  });
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
    context = null;
  }
});

test.describe('Startup loader', () => {
  /* Preconditions: App launched, user authenticates
     Action: App loads initial message history for AgentChat
     Assertions: App loading screen appears before chats are ready
     Requirements: agents.13.2 */
  test('should show loader while agents are loading initial messages', async () => {
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await context.window.evaluate(() => {
      const isLoadingVisible = () => {
        const loading = document.querySelector(
          '[data-testid="app-loading-screen"]'
        ) as HTMLElement | null;
        if (!loading) return false;
        const style = window.getComputedStyle(loading);
        return (
          loading.getAttribute('aria-hidden') !== 'true' &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        );
      };

      (window as any).__appLoadingSeen = isLoadingVisible();
      const observer = new MutationObserver(() => {
        if (isLoadingVisible()) {
          (window as any).__appLoadingSeen = true;
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      (window as any).__appLoadingObserver = observer;
    });

    await context.window.evaluate(() => {
      const api = (window as any).api;
      const original = api.messages.list;
      api.messages.list = async (...args: unknown[]) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return original(...args);
      };
    });

    await completeOAuthFlow(context.app, context.window);

    const appLoading = context.window.locator('[data-testid="app-loading-screen"]');
    await expect(appLoading).toBeHidden({ timeout: 10000 });

    await expectAgentsVisible(context.window, 10000);
    await expect
      .poll(async () => await context.window.evaluate(() => (window as any).__appLoadingSeen), {
        timeout: 10000,
      })
      .toBe(true);
    await expectNoToastError(context.window);
  });

  /* Preconditions: User already authorized, app relaunches
     Action: App loads initial message history for AgentChat
     Assertions: App loading screen appears before agents screen
     Requirements: agents.13.2 */
  test('should show loading screen on startup when already authorized', async () => {
    const testDataPath = path.join(
      os.tmpdir(),
      `clerkly-startup-loader-auth-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    const firstContext = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await completeOAuthFlow(firstContext.app, firstContext.window);
    await expectAgentsVisible(firstContext.window, 10000);

    await closeElectron(firstContext, false);

    context = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    const appLoading = context.window.locator('[data-testid="app-loading-screen"]');
    await expect(appLoading).toBeVisible({ timeout: 10000 });
    await expect(appLoading).toBeHidden({ timeout: 10000 });
    await expectAgentsVisible(context.window, 10000);
    await expectNoToastError(context.window);
  });

  /* Preconditions: User already authorized, app relaunches into waiting-for-chats
     Action: Observe UI while startup loader is visible
     Assertions: Agents screen remains mounted (no display:none/hidden), only visually masked;
                 page-level vertical scrollbar does not appear during loader
     Requirements: agents.4.14.5, agents.13.2 */
  test('should keep agents screen mounted while startup loader is visible', async () => {
    const testDataPath = path.join(
      os.tmpdir(),
      `clerkly-startup-mounted-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    const firstContext = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await completeOAuthFlow(firstContext.app, firstContext.window);
    await expectAgentsVisible(firstContext.window, 10000);
    await closeElectron(firstContext, false);

    context = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    const appLoading = context.window.locator('[data-testid="app-loading-screen"]');
    await expect(appLoading).toBeVisible({ timeout: 10000 });

    const screenState = await context.window.evaluate(() => {
      const screen = document.querySelector('[data-testid="agents-screen"]') as HTMLElement | null;
      if (!screen) return null;
      const html = document.documentElement;
      const body = document.body;
      return {
        className: screen.className,
        ariaHidden: screen.getAttribute('aria-hidden'),
        hasPageVerticalScroll:
          html.scrollHeight > html.clientHeight || body.scrollHeight > body.clientHeight,
      };
    });

    expect(screenState).not.toBeNull();
    expect(screenState!.className).not.toContain(' hidden');
    expect(screenState!.ariaHidden).toBe('true');
    expect(screenState!.hasPageVerticalScroll).toBe(false);

    await expect(appLoading).toBeHidden({ timeout: 10000 });
    await expectAgentsVisible(context.window, 10000);
    await expectNoToastError(context.window);
  });

  /* Preconditions: Two agents with 60 messages each in storage
     Action: Relaunch app and load full history
     Assertions: App loading screen shows, then each agent shows all 60 messages
     Requirements: agents.13.1, agents.13.2, agents.13.8 */
  test('should load all messages per agent on startup', async () => {
    const testDataPath = path.join(
      os.tmpdir(),
      `clerkly-startup-loader-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    const firstContext = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await completeOAuthFlow(firstContext.app, firstContext.window);
    await expectAgentsVisible(firstContext.window, 10000);

    const agentIcons = firstContext.window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    const newChatButton = firstContext.window.locator('div[title="New chat"]');
    await newChatButton.click();
    await expect(firstContext.window.locator('[data-testid^="agent-icon-"]')).toHaveCount(2, {
      timeout: 5000,
    });

    const agentIds = await firstContext.window
      .locator('[data-testid^="agent-icon-"]')
      .evaluateAll((elements) =>
        elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
      );
    const secondAgentId = agentIds.find((id) => id && id !== firstAgentId);
    expect(secondAgentId).toBeTruthy();

    await seedAgentMessages(firstContext.window, firstAgentId as string, 60);
    await seedAgentMessages(firstContext.window, secondAgentId as string, 60);

    await closeElectron(firstContext, false);

    context = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    const appLoading = context.window.locator('[data-testid="app-loading-screen"]');
    await expect(appLoading).toBeVisible({ timeout: 10000 });
    await expect(appLoading).toBeHidden({
      timeout: 10000,
    });
    await expectAgentsVisible(context.window, 10000);

    const selectAgent = async (agentId: string) => {
      const agentIcon = context.window.locator(`[data-testid="agent-icon-${agentId}"]`);
      const allAgentsButton = context.window.locator('[data-testid="all-agents-button"]');
      await expect
        .poll(async () => {
          const iconCount = await agentIcon.count();
          const buttonCount = await allAgentsButton.count();
          return iconCount + buttonCount;
        })
        .toBeGreaterThan(0);

      if ((await agentIcon.count()) > 0) {
        await agentIcon.click();
        return;
      }

      if ((await allAgentsButton.count()) > 0) {
        await allAgentsButton.click();
        await context.window.locator(`[data-testid="agent-card-${agentId}"]`).click();
        return;
      }

      await agentIcon.click();
    };

    // Agent 1 shows all 60 messages
    await selectAgent(firstAgentId);
    await expect(activeChat(context.window).messages).toHaveCount(60, { timeout: 5000 });

    // Agent 2 shows all 60 messages
    await selectAgent(secondAgentId);
    await expect(activeChat(context.window).messages).toHaveCount(60, { timeout: 5000 });

    await expectNoToastError(context.window);
  });

  /* Preconditions: Existing authorized session with chat history
     Action: Relaunch app and observe active chat scroll right after startup load
     Assertions: Active chat opens near bottom immediately without visible scrolling animation
     Requirements: agents.4.14.5 */
  test('should open active chat at bottom immediately on app restart without visual scroll', async () => {
    const firstContext = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });
    const testDataPath = firstContext.testDataPath;

    await completeOAuthFlow(firstContext.app, firstContext.window);
    await expectAgentsVisible(firstContext.window, 10000);

    const agentIcons = firstContext.window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    await seedAgentMessages(firstContext.window, firstAgentId as string, 80);
    await expect(activeChat(firstContext.window).messages).toHaveCount(80, { timeout: 10000 });

    await closeElectron(firstContext, false);

    context = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    const appLoading = context.window.locator('[data-testid="app-loading-screen"]');
    await expect(appLoading).toBeVisible({ timeout: 10000 });
    await expect(appLoading).toBeHidden({ timeout: 10000 });
    await expectAgentsVisible(context.window, 10000);
    await expect(activeChat(context.window).messages).toHaveCount(80, { timeout: 10000 });

    const scrollMetrics = await context.window.evaluate(async () => {
      const container = document.querySelector('[data-testid="messages-area"]')
        ?.parentElement as HTMLElement | null;
      if (!container) {
        return null;
      }

      const samples: Array<{ scrollTop: number; distanceFromBottom: number }> = [];
      for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        samples.push({
          scrollTop: container.scrollTop,
          distanceFromBottom: container.scrollHeight - container.scrollTop - container.clientHeight,
        });
      }

      return {
        firstDistanceFromBottom: samples[0]?.distanceFromBottom ?? Infinity,
        minScrollTop: Math.min(...samples.map((sample) => sample.scrollTop)),
        maxScrollTop: Math.max(...samples.map((sample) => sample.scrollTop)),
      };
    });

    expect(scrollMetrics).not.toBeNull();
    expect(scrollMetrics!.firstDistanceFromBottom).toBeLessThan(120);
    expect(scrollMetrics!.maxScrollTop - scrollMetrics!.minScrollTop).toBeLessThan(40);
    await expectNoToastError(context.window);
  });

  /* Preconditions: Existing authorized session with long chat history (scrollable chat)
     Action: Relaunch app and observe active chat width immediately after startup loader hides
     Assertions: Active chat content width stays stable in the first visible seconds (no startup jerk)
     Requirements: agents.4.14.5, agents.4.14.6 */
  test('should keep active chat width stable after startup with history', async () => {
    const firstContext = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });
    const testDataPath = firstContext.testDataPath;

    await completeOAuthFlow(firstContext.app, firstContext.window);
    await expectAgentsVisible(firstContext.window, 10000);

    const agentIcons = firstContext.window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    await seedAgentMessages(firstContext.window, firstAgentId as string, 100);
    await expect(activeChat(firstContext.window).messages).toHaveCount(100, { timeout: 10000 });

    await closeElectron(firstContext, false);

    context = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    const appLoading = context.window.locator('[data-testid="app-loading-screen"]');
    await expect(appLoading).toBeVisible({ timeout: 10000 });
    await expect(appLoading).toBeHidden({ timeout: 10000 });
    await expectAgentsVisible(context.window, 10000);
    await expect(activeChat(context.window).messages).toHaveCount(100, { timeout: 10000 });

    const widthStability = await context.window.evaluate(async () => {
      const target = document.querySelector('[data-testid="messages-area"]') as HTMLElement | null;
      if (!target) return null;

      let widthChanges = 0;
      let significantWidthChanges = 0;
      let maxDelta = 0;
      let lastWidth = 0;
      let initialized = false;

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const width = entry.contentRect.width;
        if (!initialized) {
          lastWidth = width;
          initialized = true;
          return;
        }
        const delta = Math.abs(width - lastWidth);
        if (delta > 0.5) {
          widthChanges += 1;
          if (delta > 4) significantWidthChanges += 1;
          if (delta > maxDelta) maxDelta = delta;
          lastWidth = width;
        }
      });

      // Observe immediately after loader disappears to catch early startup layout shifts.
      observer.observe(target);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => setTimeout(resolve, 2200));
      observer.disconnect();

      return { widthChanges, significantWidthChanges, maxDelta };
    });

    expect(widthStability).not.toBeNull();
    expect(widthStability!.significantWidthChanges).toBe(0);
    expect(widthStability!.maxDelta).toBeLessThan(2);
    await expectNoToastError(context.window);
  });

  /* Preconditions: Existing authorized session with long chat history (scrollable conversation)
     Action: Relaunch app, sample layout/scroll state frame-by-frame across loader phase and first visible frames
     Assertions: Page-level vertical scroll never appears and no frame has both page and conversation scroll contexts
     Requirements: agents.4.14.5, agents.4.14.6, agents.13.2 */
  test('should not expose transient page scroll or dual scrollbars during startup transition', async () => {
    const firstContext = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });
    const testDataPath = firstContext.testDataPath;

    await completeOAuthFlow(firstContext.app, firstContext.window);
    await expectAgentsVisible(firstContext.window, 10000);

    const agentIcons = firstContext.window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    await seedAgentMessages(firstContext.window, firstAgentId as string, 120);
    await expect(activeChat(firstContext.window).messages).toHaveCount(120, { timeout: 10000 });
    await closeElectron(firstContext, false);

    context = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await context.window.evaluate(() => {
      (window as any).__startupScrollTrace = [];
      const trace = (window as any).__startupScrollTrace as Array<{
        phase: 'loader' | 'visible';
        hasPageVerticalScroll: boolean;
        pageAllowsVerticalScroll: boolean;
        chatScrollable: boolean;
        chatAllowsVerticalScroll: boolean;
        dualScrollContext: boolean;
      }>;

      const sampleFrame = (phase: 'loader' | 'visible') => {
        const html = document.documentElement;
        const body = document.body;
        const hasPageVerticalScroll =
          html.scrollHeight > html.clientHeight || body.scrollHeight > body.clientHeight;
        const htmlOverflowY = window.getComputedStyle(html).overflowY;
        const bodyOverflowY = window.getComputedStyle(body).overflowY;
        const pageAllowsVerticalScroll = htmlOverflowY !== 'hidden' || bodyOverflowY !== 'hidden';

        const chatContainer = document.querySelector('[data-testid="messages-area"]')
          ?.parentElement as HTMLElement | null;
        const chatScrollable =
          !!chatContainer && chatContainer.scrollHeight > chatContainer.clientHeight;
        const chatOverflowY = chatContainer ? window.getComputedStyle(chatContainer).overflowY : '';
        const chatAllowsVerticalScroll = !!chatContainer && chatOverflowY !== 'hidden';

        trace.push({
          phase,
          hasPageVerticalScroll,
          pageAllowsVerticalScroll,
          chatScrollable,
          chatAllowsVerticalScroll,
          dualScrollContext:
            hasPageVerticalScroll &&
            pageAllowsVerticalScroll &&
            chatScrollable &&
            chatAllowsVerticalScroll,
        });
      };

      const recordFrames = async (phase: 'loader' | 'visible', frames: number) => {
        for (let i = 0; i < frames; i++) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          sampleFrame(phase);
        }
      };

      (window as any).__recordStartupFrames = recordFrames;
    });

    const appLoading = context.window.locator('[data-testid="app-loading-screen"]');
    await expect(appLoading).toBeVisible({ timeout: 10000 });

    await context.window.evaluate(async () => {
      await (window as any).__recordStartupFrames('loader', 45);
    });

    await expect(appLoading).toBeHidden({ timeout: 10000 });
    await expectAgentsVisible(context.window, 10000);
    await expect(activeChat(context.window).messages).toHaveCount(120, { timeout: 10000 });

    await context.window.evaluate(async () => {
      await (window as any).__recordStartupFrames('visible', 90);
    });

    const traceSummary = await context.window.evaluate(() => {
      const trace = ((window as any).__startupScrollTrace ?? []) as Array<{
        phase: 'loader' | 'visible';
        hasPageVerticalScroll: boolean;
        pageAllowsVerticalScroll: boolean;
        dualScrollContext: boolean;
      }>;

      const pageScrollFrames = trace.filter(
        (entry) => entry.hasPageVerticalScroll && entry.pageAllowsVerticalScroll
      ).length;
      const dualScrollFrames = trace.filter((entry) => entry.dualScrollContext).length;
      const loaderSamples = trace.filter((entry) => entry.phase === 'loader').length;
      const visibleSamples = trace.filter((entry) => entry.phase === 'visible').length;

      return { pageScrollFrames, dualScrollFrames, loaderSamples, visibleSamples };
    });

    expect(traceSummary.loaderSamples).toBeGreaterThanOrEqual(40);
    expect(traceSummary.visibleSamples).toBeGreaterThanOrEqual(80);
    expect(traceSummary.pageScrollFrames).toBe(0);
    expect(traceSummary.dualScrollFrames).toBe(0);
    await expectNoToastError(context.window);
  });

  /* Preconditions: Startup flow is authorized, messages:list resolves quickly,
     startup-settle callback is artificially delayed via requestAnimationFrame wrapper
     Action: Complete OAuth and wait for first messages:list completion
     Assertions: Global loader remains visible after chats are loaded and hides only after startup settlement
     Requirements: agents.13.2, agents.13.10, agents.4.14.6 */
  test('should keep loader visible until active chat startup settles even after messages are loaded', async () => {
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await context.window.evaluate(() => {
      const nativeRaf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
        nativeRaf((time) => {
          window.setTimeout(() => callback(time), 1500);
        })) as typeof window.requestAnimationFrame;
    });

    await completeOAuthFlow(context.app, context.window);

    const appLoading = context.window.locator('[data-testid="app-loading-screen"]');
    await expect(appLoading).toBeVisible({ timeout: 5000 });
    // Intentional fixed wait: verifies loader remains visible during delayed startup-settled RAF phase.
    await context.window.waitForTimeout(900);
    await expect(appLoading).toBeVisible();
    await expect(appLoading).toBeHidden({ timeout: 10000 });
    await expectAgentsVisible(context.window, 10000);
    await expectNoToastError(context.window);
  });

  /* Preconditions: App launched, agents load initial history
     Action: Wait for all chats to finish loading
     Assertions: App loading screen hides and chat UI becomes visible
     Requirements: agents.13.10 */
  test('should hide loader and show chat UI after all agents finish loading', async () => {
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await completeOAuthFlow(context.app, context.window);

    const appLoading = context.window.locator('[data-testid="app-loading-screen"]');
    await expect(appLoading).toBeHidden({ timeout: 10000 });

    await expectAgentsVisible(context.window, 10000);
    await expect(activeChat(context.window).textarea).toBeVisible({ timeout: 5000 });
    await expectNoToastError(context.window);
  });
});
