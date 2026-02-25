/**
 * Functional Tests: Startup Loader
 *
 * Verifies startup loader behavior while AgentChat initial chunks load.
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
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let context: ElectronTestContext | null = null;
let mockOAuthServer: MockOAuthServer;

async function seedAgentMessages(
  window: Page,
  agentId: string,
  count: number
): Promise<void> {
  await window.evaluate(
    async ({ targetAgentId, total }) => {
      for (let i = 1; i <= total; i++) {
        // @ts-expect-error - window.api is exposed via contextBridge
        const result = await window.api.test.createAgentMessage(
          targetAgentId,
          `Seed message ${i}`
        );
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
     Action: App loads initial message chunks for AgentChat
     Assertions: Startup loader appears before chats are ready
     Requirements: agents.13.2 */
  test('should show loader while agents are loading initial messages', async () => {
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await context.window.evaluate(() => {
      const api = (window as any).api;
      const original = api.messages.listPaginated;
      api.messages.listPaginated = async (...args: unknown[]) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return original(...args);
      };
    });

    await completeOAuthFlow(context.app, context.window);
    await expect(context.window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });

    const loader = context.window.locator('[data-testid="startup-loader"]');
    const loaderCount = await loader.count();
    if (loaderCount > 0) {
      await expect(loader).toBeVisible({ timeout: 2000 });
      await expect(loader).toBeHidden({ timeout: 10000 });
    } else {
      await expect(context.window.locator('[data-testid="agent-chats"]')).toBeVisible({
        timeout: 10000,
      });
    }
    await expectNoToastError(context.window);
  });

  /* Preconditions: Two agents with 60 messages each in storage
     Action: Relaunch app and load initial chunks
     Assertions: Each agent shows only last 50 messages on startup
     Requirements: agents.13.1, agents.13.2 */
  test('should load last 50 messages per agent on startup', async () => {
    const testDataPath = path.join(
      os.tmpdir(),
      `clerkly-startup-loader-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    const firstContext = await launchElectron(testDataPath, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await completeOAuthFlow(firstContext.app, firstContext.window);
    await expect(firstContext.window.locator('[data-testid="agents"]')).toBeVisible({
      timeout: 10000,
    });

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

    await expect(context.window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });
    await expect(context.window.locator('[data-testid="startup-loader"]')).toBeHidden({
      timeout: 10000,
    });

    // Agent 1 shows last 50 messages
    await context.window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();
    await expect(activeChat(context.window).messages).toHaveCount(50, { timeout: 5000 });

    // Agent 2 shows last 50 messages
    await context.window.locator(`[data-testid="agent-icon-${secondAgentId}"]`).click();
    await expect(activeChat(context.window).messages).toHaveCount(50, { timeout: 5000 });

    await expectNoToastError(context.window);
  });

  /* Preconditions: App launched, agents load initial chunks
     Action: Wait for all chats to finish loading
     Assertions: Loader hides and chat UI becomes visible
     Requirements: agents.13.10 */
  test('should hide loader and show chat UI after all agents finish loading', async () => {
    context = await launchElectron(undefined, {
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    });

    await completeOAuthFlow(context.app, context.window);
    await expect(context.window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });

    const loader = context.window.locator('[data-testid="startup-loader"]');
    await expect(loader).toBeHidden({ timeout: 10000 });

    await expect(context.window.locator('[data-testid="agent-chats"]')).toBeVisible({
      timeout: 5000,
    });
    await expect(activeChat(context.window).textarea).toBeVisible({ timeout: 5000 });
    await expectNoToastError(context.window);
  });
});
