/**
 * Functional Tests: Lazy Loading
 *
 * Tests for loading recent messages and paginating older history on scroll.
 * Requirements: agents.13.1, agents.13.2, agents.13.4
 */

import { test, expect, Page } from '@playwright/test';
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

let context: ElectronTestContext;
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

async function reloadAndWaitForAgents(window: Page): Promise<void> {
  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });
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
    id: 'test-lazy-loading-user',
    email: 'lazy.loading@example.com',
    name: 'Lazy Loading User',
    given_name: 'Lazy',
    family_name: 'Loading',
  });

  context = await launchElectron(undefined, {
    CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
  });

  await completeOAuthFlow(context.app, context.window);
  await expect(context.window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });
  await expectNoToastError(context.window);
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
  }
});

test.describe('Lazy loading chat history', () => {
  /* Preconditions: Agent has 60 existing messages in storage
     Action: Open the agent chat after reload
     Assertions: Only the last 50 messages are loaded initially
     Requirements: agents.13.1 */
  test('should load last 50 messages on agent open', async () => {
    const agentIcons = context.window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });
    const agentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(agentId).toBeTruthy();

    await seedAgentMessages(context.window, agentId as string, 60);
    await reloadAndWaitForAgents(context.window);
    await expectNoToastError(context.window);

    const messages = activeChat(context.window).messages;
    await expect(messages).toHaveCount(50, { timeout: 5000 });
  });

  /* Preconditions: Agent has 60 existing messages in storage
     Action: Scroll to the top of the messages list
     Assertions: Older messages are loaded and total count becomes 60
     Requirements: agents.13.2, agents.13.4 */
  test('should load more messages on scroll to top', async () => {
    const agentIcons = context.window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });
    const agentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(agentId).toBeTruthy();

    await seedAgentMessages(context.window, agentId as string, 60);
    await reloadAndWaitForAgents(context.window);
    await expectNoToastError(context.window);

    const { messagesArea, messages } = activeChat(context.window);
    await expect(messages).toHaveCount(50, { timeout: 5000 });

    await messagesArea.hover();
    await context.window.mouse.wheel(0, -999999);

    await expect(messages).toHaveCount(60, { timeout: 5000 });
    await expectNoToastError(context.window);
  });

  /* Preconditions: Agent has 30 existing messages in storage
     Action: Scroll to the top of the messages list
     Assertions: No additional messages are loaded (count remains 30)
     Requirements: agents.13.2 */
  test('should not trigger load more when all messages loaded', async () => {
    const agentIcons = context.window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });
    const agentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(agentId).toBeTruthy();

    await seedAgentMessages(context.window, agentId as string, 30);
    await reloadAndWaitForAgents(context.window);
    await expectNoToastError(context.window);

    const { messagesArea, messages } = activeChat(context.window);
    await expect(messages).toHaveCount(30, { timeout: 5000 });

    await messagesArea.hover();
    await context.window.mouse.wheel(0, -999999);

    await expect(messages).toHaveCount(30, { timeout: 3000 });
    await expectNoToastError(context.window);
  });
});
