/**
 * Functional Tests: Agent Scroll Position
 *
 * Tests for saving and restoring scroll position when switching between agents.
 * Requirements: agents.4.14
 */

import { test, expect, Page } from '@playwright/test';
import {
  createMockOAuthServer,
  completeOAuthFlow,
  activeChat,
  launchElectron,
  closeElectron,
  ElectronTestContext,
  expectAgentsVisible,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let context: ElectronTestContext;
let window: Page;
let mockOAuthServer: MockOAuthServer;

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
    id: 'test-scroll-user',
    email: 'scroll.test@example.com',
    name: 'Scroll Test User',
    given_name: 'Scroll',
    family_name: 'Test User',
  });

  context = await launchElectron(undefined, {
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
    CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
    CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
  });

  window = context.window;

  await completeOAuthFlow(context.app, window);
  await expectAgentsVisible(window, 10000);
});

test.afterEach(async () => {
  if (context) {
    await closeElectron(context);
  }
});

test.describe('Agent Scroll Position', () => {
  /* Preconditions: Agent has enough messages to be scrollable, user is at bottom
     Action: A new message arrives while user stays at bottom
     Assertions: Chat autoscrolls to keep the latest message visible
     Requirements: agents.4.13.1 */
  test('should autoscroll to bottom when user is at bottom and new message arrives', async () => {
    const messagesArea = activeChat(window).messagesArea;
    const messages = activeChat(window).messages;
    const scrollToBottomBtn = activeChat(window).scrollToBottomBtn;

    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });
    const agentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(agentId).toBeTruthy();

    await window.evaluate(
      async ({ targetAgentId }) => {
        for (let i = 1; i <= 20; i++) {
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
      { targetAgentId: agentId as string }
    );

    await expect(messages).toHaveCount(20, { timeout: 5000 });

    await messagesArea.hover();
    await window.mouse.wheel(0, 999999);

    // Ensure we are at bottom before new message arrives
    await expect(scrollToBottomBtn).not.toBeVisible({ timeout: 3000 });

    await window.evaluate(
      async ({ targetAgentId }) => {
        // @ts-expect-error - window.api is exposed via contextBridge
        const result = await window.api.test.createAgentMessage(
          targetAgentId,
          'New incoming message'
        );
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to create incoming message');
        }
      },
      {
        targetAgentId: agentId as string,
      }
    );

    await expect(messages).toHaveCount(21, { timeout: 5000 });

    // Autoscroll keeps us at bottom
    await expect(scrollToBottomBtn).not.toBeVisible({ timeout: 3000 });
    await expect(messages.last()).toBeInViewport({ timeout: 3000 });
  });

  /* Preconditions: Agent has enough messages to be scrollable, user scrolls up
     Action: A new message arrives while user is scrolled up
     Assertions: Chat does NOT autoscroll, scroll-to-bottom button stays visible
     Requirements: agents.4.13.2 */
  test('should NOT autoscroll when user has scrolled up', async () => {
    const messagesArea = activeChat(window).messagesArea;
    const messages = activeChat(window).messages;
    const scrollToBottomBtn = activeChat(window).scrollToBottomBtn;

    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });
    const agentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(agentId).toBeTruthy();

    await window.evaluate(
      async ({ targetAgentId }) => {
        for (let i = 1; i <= 30; i++) {
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
      { targetAgentId: agentId as string }
    );

    await expect(messages).toHaveCount(30, { timeout: 5000 });

    await messagesArea.hover();
    await window.mouse.wheel(0, -999999);

    // Ensure we are scrolled up before new message arrives
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    await window.evaluate(
      async ({ targetAgentId }) => {
        // @ts-expect-error - window.api is exposed via contextBridge
        const result = await window.api.test.createAgentMessage(
          targetAgentId,
          'New incoming message'
        );
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to create incoming message');
        }
      },
      {
        targetAgentId: agentId as string,
      }
    );

    await expect(messages).toHaveCount(31, { timeout: 5000 });

    // No autoscroll when user is scrolled up
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });
    await expect(messages.last()).not.toBeInViewport({ timeout: 3000 });
  });

  /* Preconditions: Agent-1 with 15 messages and LLM responses, scrolled up; agent-2 empty
     Action: Scroll up in agent-1, switch to agent-2, return to agent-1
     Assertions: Scroll position in agent-1 is restored
     Requirements: agents.4.14.1, agents.4.14.2, agents.4.14.3 */
  test('should save and restore scroll position when switching agents', async () => {
    const messagesArea = activeChat(window).messagesArea;
    const messages = activeChat(window).messages;

    // Wait for first agent to be auto-created
    let agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    await window.evaluate(
      async ({ targetAgentId }) => {
        for (let i = 1; i <= 30; i++) {
          // @ts-expect-error - window.api is exposed via contextBridge
          const result = await window.api.test.createAgentMessage(
            targetAgentId,
            `Agent 1 Message ${i}`
          );
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to seed message');
          }
        }
      },
      { targetAgentId: firstAgentId as string }
    );

    await expect(messages).toHaveCount(30, { timeout: 10000 });

    // Scroll to the very top — large enough value to guarantee reaching top
    await messagesArea.hover();
    await window.mouse.wheel(0, -999999);

    const scrollContainerBefore = messagesArea.locator('..');
    const scrollTopBefore = await scrollContainerBefore.evaluate((el) => el.scrollTop);

    // Create new agent (agent-2) and switch to it
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();
    await expect(window.locator('[data-testid^="agent-icon-"]')).toHaveCount(2, { timeout: 5000 });

    // Re-create locator to get fresh list
    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(2, { timeout: 5000 });

    // Switch back to agent-1 using its saved ID
    await window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();

    // Wait for agent-1 messages to load
    await expect(messages).toHaveCount(30, { timeout: 5000 });

    const scrollContainerAfter = activeChat(window).messagesArea.locator('..');
    const scrollTopAfter = await scrollContainerAfter.evaluate((el) => el.scrollTop);

    // Scroll position should be restored (within a small tolerance).
    expect(scrollTopBefore).toBeLessThan(5);
    expect(scrollTopAfter).toBeLessThan(100);
  });

  /* Preconditions: Agent with scrollable content
     Action: Scroll up, send new message
     Assertions: Scroll position is preserved, scroll-to-bottom button stays visible
     Requirements: agents.4.13.2 */
  test('should NOT force autoscroll when user sends message while scrolled up', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesArea = activeChat(window).messagesArea;
    const scrollToBottomBtn = activeChat(window).scrollToBottomBtn;

    // Send multiple messages to create scrollable content
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`Message ${i}`);
      await messageInput.press('Enter');
    }

    await expect(activeChat(window).messages).toHaveCount(15, { timeout: 5000 });

    // Scroll up via real wheel event
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);

    // Verify scrolled up — scroll-to-bottom button visible
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Send new message while scrolled up
    await messageInput.fill('New message after scroll');
    await messageInput.press('Enter');

    // Wait for message to appear
    await expect(activeChat(window).messages).toHaveCount(16, { timeout: 5000 });

    // While scrolled up, Conversation should keep position and keep the button visible.
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 5000 });
    await expect(activeChat(window).messages.last()).not.toBeInViewport({ timeout: 3000 });
  });

  /* Preconditions: Three agents with different scroll positions
     Action: Switch between all three agents
     Assertions: Each agent maintains its own scroll position
     Requirements: agents.4.14.1, agents.4.14.2, agents.4.14.3 */
  test('should maintain independent scroll positions for multiple agents', async () => {
    const messagesArea = activeChat(window).messagesArea;
    const newChatButton = window.locator('div[title="New chat"]');

    // Wait for first agent to be auto-created
    let agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    await window.evaluate(
      async ({ targetAgentId }) => {
        for (let i = 1; i <= 30; i++) {
          // @ts-expect-error - window.api is exposed via contextBridge
          const result = await window.api.test.createAgentMessage(
            targetAgentId,
            `Agent 1 Message ${i}`
          );
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to seed message');
          }
        }
      },
      { targetAgentId: firstAgentId as string }
    );
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 10000 });
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);
    const scrollTopAgent1 = await messagesArea.locator('..').evaluate((el) => el.scrollTop);

    // Create agent-2 with messages and scroll up
    await newChatButton.click();

    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(2, { timeout: 5000 });

    const allAgentIds1 = await agentIcons.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
    );
    const secondAgentId = allAgentIds1.find((id) => id && id !== firstAgentId);
    expect(secondAgentId).toBeTruthy();

    await window.evaluate(
      async ({ targetAgentId }) => {
        for (let i = 1; i <= 30; i++) {
          // @ts-expect-error - window.api is exposed via contextBridge
          const result = await window.api.test.createAgentMessage(
            targetAgentId,
            `Agent 2 Message ${i}`
          );
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to seed message');
          }
        }
      },
      { targetAgentId: secondAgentId as string }
    );
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 10000 });
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);
    const scrollTopAgent2 = await messagesArea.locator('..').evaluate((el) => el.scrollTop);

    // Create agent-3 with messages and scroll up
    await newChatButton.click();

    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(3, { timeout: 5000 });

    const allAgentIds2 = await agentIcons.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
    );
    const thirdAgentId = allAgentIds2.find(
      (id) => id && id !== firstAgentId && id !== secondAgentId
    );
    expect(thirdAgentId).toBeTruthy();

    await window.evaluate(
      async ({ targetAgentId }) => {
        for (let i = 1; i <= 30; i++) {
          // @ts-expect-error - window.api is exposed via contextBridge
          const result = await window.api.test.createAgentMessage(
            targetAgentId,
            `Agent 3 Message ${i}`
          );
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to seed message');
          }
        }
      },
      { targetAgentId: thirdAgentId as string }
    );
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 10000 });
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);
    const scrollTopAgent3 = await messagesArea.locator('..').evaluate((el) => el.scrollTop);

    // Switch to agent-1 and verify scroll position is preserved (button still visible)
    await window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 5000 });
    const scrollTopAgent1After = await activeChat(window)
      .messagesArea.locator('..')
      .evaluate((el) => el.scrollTop);
    expect(scrollTopAgent1After).toBeLessThan(scrollTopAgent1 + 100);

    // Switch to agent-2 and verify scroll position is preserved
    await window.locator(`[data-testid="agent-icon-${secondAgentId}"]`).click();
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 5000 });
    const scrollTopAgent2After = await activeChat(window)
      .messagesArea.locator('..')
      .evaluate((el) => el.scrollTop);
    expect(scrollTopAgent2After).toBeLessThan(scrollTopAgent2 + 100);

    // Switch to agent-3 and verify scroll position is preserved
    await window.locator(`[data-testid="agent-icon-${thirdAgentId}"]`).click();
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 5000 });
    const scrollTopAgent3After = await activeChat(window)
      .messagesArea.locator('..')
      .evaluate((el) => el.scrollTop);
    expect(scrollTopAgent3After).toBeLessThan(scrollTopAgent3 + 100);
  });

  /* Preconditions: New agent created with messages
     Action: Switch to agent for the first time
     Assertions: Chat scrolls to bottom automatically
     Requirements: agents.4.14.4 */
  test('should scroll to bottom on first visit to agent', async () => {
    const messagesArea = activeChat(window).messagesArea;
    const newChatButton = window.locator('div[title="New chat"]');

    // Wait for first agent to be auto-created
    let agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    await window.evaluate(
      async ({ targetAgentId }) => {
        for (let i = 1; i <= 30; i++) {
          // @ts-expect-error - window.api is exposed via contextBridge
          const result = await window.api.test.createAgentMessage(
            targetAgentId,
            `Agent 1 Message ${i}`
          );
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to seed message');
          }
        }
      },
      { targetAgentId: firstAgentId as string }
    );
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 5000 });

    // Scroll up in agent-1
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);
    const scrollTopAgent1 = await messagesArea.locator('..').evaluate((el) => el.scrollTop);

    // Create agent-2
    await newChatButton.click();

    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(2, { timeout: 5000 });

    const allAgentIds1 = await agentIcons.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
    );
    const secondAgentId = allAgentIds1.find((id) => id && id !== firstAgentId);
    expect(secondAgentId).toBeTruthy();

    await window.evaluate(
      async ({ targetAgentId }) => {
        for (let i = 1; i <= 30; i++) {
          // @ts-expect-error - window.api is exposed via contextBridge
          const result = await window.api.test.createAgentMessage(
            targetAgentId,
            `Agent 2 Message ${i}`
          );
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to seed message');
          }
        }
      },
      { targetAgentId: secondAgentId as string }
    );
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 5000 });

    await expect
      .poll(async () => {
        const { scrollTop, scrollHeight, clientHeight } = await activeChat(window)
          .messagesArea.locator('..')
          .evaluate((el) => ({
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          }));
        return scrollHeight - scrollTop - clientHeight;
      })
      .toBeLessThan(100);

    // Switch back to agent-1 (should restore saved scrolled-up position)
    await window.locator(`[data-testid="agent-icon-${firstAgentId}"]`).click();
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 5000 });

    // Agent-1 position is restored (scrolled up) — button visible
    const scrollTopAgent1After = await activeChat(window)
      .messagesArea.locator('..')
      .evaluate((el) => el.scrollTop);
    expect(scrollTopAgent1After).toBeLessThan(scrollTopAgent1 + 100);

    // Create agent-3 (new agent, first visit)
    await newChatButton.click();

    agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(3, { timeout: 5000 });

    const allAgentIds2 = await agentIcons.evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('data-testid')?.replace('agent-icon-', ''))
    );
    const thirdAgentId = allAgentIds2.find(
      (id) => id && id !== firstAgentId && id !== secondAgentId
    );
    expect(thirdAgentId).toBeTruthy();

    await window.evaluate(
      async ({ targetAgentId }) => {
        for (let i = 1; i <= 30; i++) {
          // @ts-expect-error - window.api is exposed via contextBridge
          const result = await window.api.test.createAgentMessage(
            targetAgentId,
            `Agent 3 Message ${i}`
          );
          if (!result?.success) {
            throw new Error(result?.error || 'Failed to seed message');
          }
        }
      },
      { targetAgentId: thirdAgentId as string }
    );
    await expect(activeChat(window).messages).toHaveCount(30, { timeout: 5000 });

    await expect
      .poll(async () => {
        const { scrollTop, scrollHeight, clientHeight } = await activeChat(window)
          .messagesArea.locator('..')
          .evaluate((el) => ({
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          }));
        return scrollHeight - scrollTop - clientHeight;
      })
      .toBeLessThan(100);
  });
});
