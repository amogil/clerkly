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
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });
});

test.afterEach(async () => {
  await electronApp.close();
});

test.describe('Agent Messaging', () => {
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

    // Wait for message to appear
    await expect(activeChat(window).messages).toHaveCount(1, { timeout: 5000 });

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

    // Wait for agent message to appear
    await expect(activeChat(window).messages).toHaveCount(2, { timeout: 5000 });

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
      await expect(activeChat(window).messages).toHaveCount(i, { timeout: 5000 });
    }

    await expect(activeChat(window).messages).toHaveCount(15, { timeout: 10000 });

    // Scroll up via real wheel event — use-stick-to-bottom tracks this correctly
    await messagesArea.hover();
    await window.mouse.wheel(0, -2000);

    // Verify user is NOT at bottom — scroll-to-bottom button should be visible
    const scrollToBottomBtn = window.locator('[data-testid="scroll-to-bottom"]');
    await expect(scrollToBottomBtn).toBeVisible({ timeout: 3000 });

    // Create agent message using test API
    const result = await window.evaluate(async (agentId) => {
      // @ts-expect-error - window.api is exposed via contextBridge
      return await window.api.test.createAgentMessage(
        agentId,
        'Agent response while user scrolled up'
      );
    }, firstAgentId as string);
    expect(result.success).toBe(true);

    // Wait for agent message to appear
    await expect(activeChat(window).messages).toHaveCount(16, { timeout: 5000 });

    // Wait to ensure no autoscroll happens — button should remain visible
    await window.waitForFunction(
      () => document.querySelector('[data-testid="scroll-to-bottom"]') !== null,
      { timeout: 3000 }
    );

    // Scroll-to-bottom button should still be visible (no autoscroll happened)
    await expect(scrollToBottomBtn).toBeVisible();
  });
});
