/**
 * Functional Tests: Agent Messaging
 *
 * Tests for sending messages and basic chat functionality.
 * Requirements: agents.4
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  createMockOAuthServer,
  completeOAuthFlow,
  activeChat,
  launchElectronWithMockOAuth,
  expectAgentsVisible,
  expectNoToastError,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let electronApp: ElectronApplication;
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
    id: 'test-messaging-user',
    email: 'messaging.test@example.com',
    name: 'Messaging Test User',
    given_name: 'Messaging',
    family_name: 'Test User',
  });

  const context = await launchElectronWithMockOAuth(mockOAuthServer);
  electronApp = context.app;
  window = context.window;

  await completeOAuthFlow(electronApp, window);
  await expectAgentsVisible(window, 10000);
});

test.afterEach(async () => {
  await electronApp.close();
});

test.describe('Agent Messaging', () => {
  /* Preconditions: Agent is active, send mode is visible
     Action: Keep input empty, then type prompt text
     Assertions: Send button is disabled for empty input and enabled for non-empty input
     Requirements: agents.4.2.2 */
  test('should enable send button only when input has text', async () => {
    const messageInput = activeChat(window).textarea;
    const sendButton = window.locator('[data-testid="prompt-input-send"]');

    await expect(messageInput).toBeVisible();
    await expect(sendButton).toBeDisabled();

    await messageInput.fill('hello');
    await expect(sendButton).toBeEnabled();

    await messageInput.fill('   ');
    await expect(sendButton).toBeDisabled();
  });

  /* Preconditions: Last visible message is llm(done=false), so agent is in-progress and stop mode is visible
     Action: Change input text between empty and non-empty values
     Assertions: Stop button remains enabled regardless of input content
     Requirements: agents.4.2.1 */
  test('should keep stop button enabled regardless of input text in in-progress status', async () => {
    const firstAgentDataTestId = await window
      .locator('[data-testid^="agent-icon-"]')
      .first()
      .getAttribute('data-testid');
    const activeAgentId = firstAgentDataTestId?.replace('agent-icon-', '');
    expect(activeAgentId).toBeTruthy();

    await window.evaluate(async (agentId) => {
      const api = (window as unknown as { api: any }).api;
      const result = await api.messages.create(agentId, 'llm', {
        data: { reasoning: { text: 'streaming...' } },
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to create in-progress llm message');
      }
    }, activeAgentId as string);

    const stopButton = window.locator('[data-testid="prompt-input-stop"]');
    const messageInput = activeChat(window).textarea;

    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await expect(stopButton).toBeEnabled();

    await messageInput.fill('');
    await expect(stopButton).toBeEnabled();

    await messageInput.fill('hello');
    await expect(stopButton).toBeEnabled();
  });

  /* Preconditions: Agent has stale in-progress UI state (llm done=false) without an active main-process pipeline
     Action: User presses stop button
     Assertions: Existing user/llm messages remain visible; stop acts as no-op
     Requirements: llm-integration.8.1, llm-integration.8.7 */
  test('should not hide existing messages when stop is pressed without active pipeline', async () => {
    const setupResult = await window.evaluate(async () => {
      const api = (window as unknown as { api: any }).api;
      const created = await api.test.createAgentWithOldMessage(3);
      if (!created?.success || !created.agentId) {
        throw new Error(created?.error || 'Failed to create agent with old message');
      }

      const llmCreated = await api.messages.create(created.agentId, 'llm', {
        data: { reasoning: { text: 'orphan reasoning stream' } },
      });
      if (!llmCreated?.success) {
        throw new Error(llmCreated?.error || 'Failed to create stale in-progress llm message');
      }

      return { agentId: created.agentId };
    });

    await window.locator(`[data-testid="agent-icon-${setupResult.agentId}"]`).click();

    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });
    await expect(activeChat(window).llmMessages).toHaveCount(1, { timeout: 5000 });

    const stopButton = window.locator('[data-testid="prompt-input-stop"]');
    await expect(stopButton).toBeVisible({ timeout: 5000 });
    await stopButton.click();

    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });
    await expect(activeChat(window).llmMessages).toHaveCount(1, { timeout: 5000 });
    await expect(window.locator('[data-testid="prompt-input-send"]')).toBeVisible({
      timeout: 5000,
    });
    await expectNoToastError(window);
  });

  /* Preconditions: Agent is active, input field is visible
     Action: Type message and press Enter
     Assertions: Message is sent and appears in chat
     Requirements: agents.4.3 */
  test('should send message on Enter key', async () => {
    const messageInput = activeChat(window).textarea;
    await expect(messageInput).toBeVisible();

    // Type message
    await messageInput.fill('Test message');

    // Press Enter
    await messageInput.press('Enter');

    // Check user message appears in chat (LLM response/error is out of scope for this test)
    const messages = activeChat(window).userMessages;
    await expect(messages.first()).toBeVisible({ timeout: 2000 });
    await expect(messages).toHaveCount(1);

    // Verify message text
    await expect(messages.first()).toContainText('Test message');
  });

  /* Preconditions: Historical llm message is persisted in canonical format (data.text, no data.action)
     Action: Insert llm message via test API and open active chat
     Assertions: Assistant message is rendered from data.text
     Requirements: llm-integration.6.6.1 */
  test('should render historical llm message from canonical data.text', async () => {
    const firstAgentDataTestId = await window
      .locator('[data-testid^="agent-icon-"]')
      .first()
      .getAttribute('data-testid');
    const activeAgentId = firstAgentDataTestId?.replace('agent-icon-', '');
    expect(activeAgentId).toBeTruthy();

    const result = await window.evaluate(async (agentId) => {
      const api = (window as unknown as { api: any }).api;
      return await api.test.createAgentMessage(agentId, 'Historical canonical response');
    }, activeAgentId as string);

    expect(result.success).toBe(true);

    const llmAction = window
      .locator('[data-testid="message-llm-action"]')
      .filter({ hasText: 'Historical canonical response' });
    await expect(llmAction).toHaveCount(1, { timeout: 5000 });
    await expectNoToastError(window);
  });

  /* Preconditions: Agent is active, input field is visible
     Action: Type message and press Shift+Enter
     Assertions: New line is added, message is not sent
     Requirements: agents.4.4 */
  test('should add new line on Shift+Enter', async () => {
    const messageInput = activeChat(window).textarea;
    await expect(messageInput).toBeVisible();

    // Type first line
    await messageInput.fill('Line 1');

    // Press Shift+Enter
    await messageInput.press('Shift+Enter');

    // Type second line
    await messageInput.press('L');
    await messageInput.press('i');
    await messageInput.press('n');
    await messageInput.press('e');
    await messageInput.press(' ');
    await messageInput.press('2');

    // Check value contains newline
    const value = await messageInput.inputValue();
    expect(value).toContain('\n');
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');

    // No messages should be sent yet
    const messages = activeChat(window).messages;
    await expect(messages).toHaveCount(0);
  });

  /* Preconditions: Agent has multiple messages
     Action: View messages list
     Assertions: Messages are displayed in chronological order (oldest first)
     Requirements: agents.4.8 */
  test('should display messages in chronological order', async () => {
    const messageInput = activeChat(window).textarea;

    // Send multiple messages
    await messageInput.fill('First message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });

    await messageInput.fill('Second message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(2, { timeout: 5000 });

    await messageInput.fill('Third message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(3, { timeout: 5000 });

    // Get user messages only (LLM responses/errors are out of scope for chronological order test)
    const messages = activeChat(window).userMessages;
    await expect(messages).toHaveCount(3, { timeout: 2000 });

    // Check order
    const firstMessage = await messages.nth(0).textContent();
    const secondMessage = await messages.nth(1).textContent();
    const thirdMessage = await messages.nth(2).textContent();

    expect(firstMessage).toContain('First message');
    expect(secondMessage).toContain('Second message');
    expect(thirdMessage).toContain('Third message');
  });

  /* Preconditions: Agent has messages
     Action: Send new message
     Assertions: Chat scrolls to show the new message
     Requirements: agents.4.13 */
  test('should autoscroll to last message', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesContainer = activeChat(window).messagesArea;

    // Send many messages to create scroll
    for (let i = 1; i <= 10; i++) {
      await messageInput.fill(`Message ${i}`);
      await messageInput.press('Enter');
      await expect(activeChat(window).userMessages).toHaveCount(i, { timeout: 5000 });
    }

    // Check that last user message is visible (scrolled into view)
    const lastMessage = activeChat(window).userMessages.last();
    await expect(lastMessage).toBeVisible();

    const lastMessageText = await lastMessage.textContent();
    expect(lastMessageText).toContain('Message 10');

    // Wait for scroll to complete
    await window.waitForFunction(
      () => {
        const container = document.querySelector('[data-testid="messages-area"]');
        if (!container) return false;
        return Math.abs(container.scrollHeight - container.scrollTop - container.clientHeight) < 50;
      },
      { timeout: 5000 }
    );

    // Check scroll position is at bottom
    const scrollTop = await messagesContainer.evaluate((el) => el.scrollTop);
    const scrollHeight = await messagesContainer.evaluate((el) => el.scrollHeight);
    const clientHeight = await messagesContainer.evaluate((el) => el.clientHeight);

    // Should be scrolled to bottom (within 50px tolerance)
    expect(scrollTop + clientHeight).toBeGreaterThan(scrollHeight - 50);
  });

  /* Preconditions: Agent has many messages, user is at bottom of chat
     Action: Simulate new message arriving
     Assertions: Chat autoscrolls to show new message
     Requirements: agents.4.13.1, agents.4.13.2 */
  test('should autoscroll when new message arrives and user is at bottom', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesArea = activeChat(window).messagesArea;

    // Send messages to create content
    for (let i = 1; i <= 10; i++) {
      await messageInput.fill(`Message ${i}`);
      await messageInput.press('Enter');
      await expect(activeChat(window).userMessages).toHaveCount(i, { timeout: 5000 });
    }

    await expect(activeChat(window).userMessages).toHaveCount(10, { timeout: 5000 });

    // Ensure user is at bottom
    await window.waitForFunction(
      () => {
        const container = document.querySelector('[data-testid="messages-area"]');
        if (!container) return false;
        const distanceFromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight;
        return distanceFromBottom < container.clientHeight / 3;
      },
      { timeout: 5000 }
    );

    // Get initial scroll position
    const initialScrollTop = await messagesArea.evaluate((el) => el.scrollTop);

    // Send another message (simulating new message arrival)
    await messageInput.fill('New message while at bottom');
    await messageInput.press('Enter');

    await expect(activeChat(window).userMessages).toHaveCount(11, { timeout: 5000 });

    // Wait for autoscroll
    await window.waitForFunction(
      () => {
        const container = document.querySelector('[data-testid="messages-area"]');
        if (!container) return false;
        return container.scrollHeight - container.scrollTop - container.clientHeight < 50;
      },
      { timeout: 5000 }
    );

    // Check that scroll position changed (autoscrolled)
    const finalScrollTop = await messagesArea.evaluate((el) => el.scrollTop);
    expect(finalScrollTop).toBeGreaterThanOrEqual(initialScrollTop);

    // Check we're still at bottom
    const distanceFromBottom = await messagesArea.evaluate((el) => {
      return el.scrollHeight - el.scrollTop - el.clientHeight;
    });
    expect(distanceFromBottom).toBeLessThan(50);
  });

  /* Preconditions: Agent has many messages, user scrolled up
     Action: New message arrives while user is scrolled up
     Assertions: Chat does NOT autoscroll (preserves user's position)
     Requirements: agents.4.13.2 */
  test('should NOT autoscroll when user is scrolled up', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesArea = activeChat(window).messagesArea;
    // ConversationScrollButton appears when user is NOT at bottom

    // Send many messages to create scrollable content
    for (let i = 1; i <= 20; i++) {
      await messageInput.fill(`Message ${i}`);
      await messageInput.press('Enter');
      await expect(activeChat(window).userMessages).toHaveCount(i, { timeout: 5000 });
    }

    await expect(activeChat(window).userMessages).toHaveCount(20, {
      timeout: 10000,
    });

    // Scroll up via real wheel event — use-stick-to-bottom tracks this correctly
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);

    // Verify user is NOT at bottom — scroll-to-bottom button should be visible
    const scrollToBottomBtn = window.locator('[data-testid="scroll-to-bottom"]');
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Send new message — should NOT autoscroll since user scrolled up
    await messageInput.fill('New message while scrolled up');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(21, { timeout: 5000 });

    // Wait for any potential autoscroll to settle
    await window.waitForFunction(
      () => document.querySelector('[data-testid="scroll-to-bottom"]') !== null,
      { timeout: 3000 }
    );

    // Scroll-to-bottom button should still be visible (no autoscroll happened)
    await expect(scrollToBottomBtn).toBeVisible();
  });

  /* Preconditions: User at bottom of chat
     Action: Agent sends response
     Assertions: Chat autoscrolls to show agent response
     Requirements: agents.4.13.1, agents.4.13.2 */
  test('should autoscroll when agent responds and user is at bottom', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesArea = activeChat(window).messagesArea;

    // Wait for first agent to be auto-created
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    // Send user message
    await messageInput.fill('User message');
    await messageInput.press('Enter');

    // Wait for user message to appear and capture baseline count.
    await expect(activeChat(window).userMessages.last()).toContainText('User message', {
      timeout: 5000,
    });
    const messagesBeforeAgentResponse = await activeChat(window).messages.count();

    // Verify user is at bottom
    const isAtBottom = await messagesArea.evaluate((el) => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      return distanceFromBottom < el.clientHeight / 3;
    });
    expect(isAtBottom).toBe(true);

    // Create agent message using test API
    const result = await window.evaluate(async (agentId) => {
      // @ts-expect-error - window.api is exposed via contextBridge
      return await window.api.test.createAgentMessage(agentId, 'Agent response message');
    }, firstAgentId as string);
    expect(result.success).toBe(true);

    // Wait for agent response to append at least one new message
    await window.waitForFunction(
      (beforeCount) =>
        document.querySelectorAll(
          '[data-testid="agent-chat-root"]:not(.pointer-events-none) [data-testid="message"]'
        ).length > beforeCount,
      messagesBeforeAgentResponse,
      { timeout: 5000 }
    );

    // Verify chat autoscrolled to bottom — scroll-to-bottom button should NOT be visible
    const scrollToBottomBtn = window.locator('[data-testid="scroll-to-bottom"]');
    await expect(scrollToBottomBtn).not.toBeVisible({ timeout: 5000 });

    // Verify chat autoscrolled to bottom
    const distanceFromBottom = await messagesArea.evaluate((el) => {
      return el.scrollHeight - el.scrollTop - el.clientHeight;
    });
    expect(distanceFromBottom).toBeLessThan(50);
  });

  /* Preconditions: User scrolled up in chat
     Action: Agent sends response
     Assertions: Chat does NOT autoscroll, position preserved
     Requirements: agents.4.13.2 */
  test('should NOT autoscroll when agent responds and user scrolled up', async () => {
    const messageInput = activeChat(window).textarea;
    const messagesArea = activeChat(window).messagesArea;

    // Wait for first agent to be auto-created
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 5000 });

    // Save first agent ID
    const firstAgentId = (await agentIcons.first().getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );
    expect(firstAgentId).toBeTruthy();

    // Send many messages to create scrollable content
    for (let i = 1; i <= 15; i++) {
      await messageInput.fill(`User message ${i}`);
      await messageInput.press('Enter');
      await expect(activeChat(window).userMessages).toHaveCount(i, { timeout: 5000 });
    }

    await expect(activeChat(window).userMessages).toHaveCount(15, { timeout: 10000 });

    // Scroll up via real wheel event — use-stick-to-bottom tracks this correctly
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);

    // Verify user is NOT at bottom — scroll-to-bottom button should be visible
    const scrollToBottomBtn = window.locator('[data-testid="scroll-to-bottom"]');
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    const messagesBeforeAgentResponse = await activeChat(window).messages.count();

    // Create agent message using test API
    const result = await window.evaluate(async (agentId) => {
      // @ts-expect-error - window.api is exposed via contextBridge
      return await window.api.test.createAgentMessage(
        agentId,
        'Agent response while user scrolled up'
      );
    }, firstAgentId as string);
    expect(result.success).toBe(true);

    // Wait for at least one new message to appear
    await window.waitForFunction(
      (beforeCount) =>
        document.querySelectorAll(
          '[data-testid="agent-chat-root"]:not(.pointer-events-none) [data-testid="message"]'
        ).length > beforeCount,
      messagesBeforeAgentResponse,
      { timeout: 5000 }
    );

    // Wait to ensure no autoscroll happens — button should remain visible
    await window.waitForFunction(
      () => document.querySelector('[data-testid="scroll-to-bottom"]') !== null,
      { timeout: 3000 }
    );

    // Scroll-to-bottom button should still be visible (no autoscroll happened)
    await expect(scrollToBottomBtn).toBeVisible();
  });
});
