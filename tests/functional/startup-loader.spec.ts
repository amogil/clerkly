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
      (window as any).__appLoadingSeen = false;
      const observer = new MutationObserver(() => {
        const loading = document.querySelector(
          '[data-testid="app-loading-screen"]'
        ) as HTMLElement | null;
        if (loading && loading.offsetParent !== null) {
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
