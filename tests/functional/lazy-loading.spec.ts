/**
 * Functional Tests: History Loading
 *
 * Tests for loading full message history on agent open.
 * Requirements: agents.13.1, agents.13.2, agents.13.8
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
  expectAgentsVisible,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let context: ElectronTestContext;
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

async function reloadAndWaitForAgents(window: Page): Promise<void> {
  await window.reload();
  await window.waitForLoadState('domcontentloaded');
  await expectAgentsVisible(window, 10000);
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
  await expectAgentsVisible(context.window, 10000);
  await expectNoToastError(context.window);
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
  }
});

test.describe('History loading on agent open', () => {
  /* Preconditions: Agent has 60 existing messages in storage
     Action: Open the agent chat after reload
     Assertions: All 60 messages are loaded
     Requirements: agents.13.1, agents.13.8 */
  test('should load all messages on agent open', async () => {
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
    await expect(messages).toHaveCount(60, { timeout: 5000 });
  });

  /* Preconditions: Agent has 30 existing messages in storage
     Action: Open the agent chat after reload
     Assertions: All 30 messages are loaded
     Requirements: agents.13.1, agents.13.8 */
  test('should load all messages when history is short', async () => {
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

    const { messages } = activeChat(context.window);
    await expect(messages).toHaveCount(30, { timeout: 5000 });
    await expectNoToastError(context.window);
  });
});
