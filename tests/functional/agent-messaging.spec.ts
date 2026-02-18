/**
 * Functional Tests: Agent Messaging
 *
 * Tests for sending messages and basic chat functionality.
 * Requirements: agents.4
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { createMockOAuthServer, completeOAuthFlow } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let electronApp: ElectronApplication;
let window: Page;
let mockOAuthServer: MockOAuthServer;

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer(8898);
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

  electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      CLERKLY_GOOGLE_API_URL: mockOAuthServer.getBaseUrl(),
      CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
      CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
    },
  });

  window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');

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
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await expect(messageInput).toBeVisible();

    // Type message
    await messageInput.fill('Test message');

    // Press Enter
    await messageInput.press('Enter');

    // Check message appears in chat
    const messages = window.locator('[data-testid="message"]');
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
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await expect(messageInput).toBeVisible();

    // Type first line
    await messageInput.fill('Line 1');

    // Press Shift+Enter
    await messageInput.press('Shift+Enter');
    await window.waitForTimeout(100);

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
    const messages = window.locator('[data-testid="message"]');
    await expect(messages).toHaveCount(0);
  });

  /* Preconditions: Agent has multiple messages
     Action: View messages list
     Assertions: Messages are displayed in chronological order (oldest first)
     Requirements: agents.4.8 */
  test('should display messages in chronological order', async () => {
    const messageInput = window.locator('textarea[placeholder*="Ask"]');

    // Send multiple messages
    await messageInput.fill('First message');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    await messageInput.fill('Second message');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    await messageInput.fill('Third message');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    // Get all messages
    const messages = window.locator('[data-testid="message"]');
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
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    const messagesContainer = window.locator('[data-testid="messages-container"]');

    // Send many messages to create scroll
    for (let i = 1; i <= 10; i++) {
      await messageInput.fill(`Message ${i}`);
      await messageInput.press('Enter');
      await window.waitForTimeout(300);
    }

    // Check that last message is visible (scrolled into view)
    const lastMessage = window.locator('[data-testid="message"]').last();
    await expect(lastMessage).toBeVisible();

    const lastMessageText = await lastMessage.textContent();
    expect(lastMessageText).toContain('Message 10');

    // Check scroll position is at bottom
    const scrollTop = await messagesContainer.evaluate((el) => el.scrollTop);
    const scrollHeight = await messagesContainer.evaluate((el) => el.scrollHeight);
    const clientHeight = await messagesContainer.evaluate((el) => el.clientHeight);

    // Should be scrolled to bottom (within 50px tolerance)
    expect(scrollTop + clientHeight).toBeGreaterThan(scrollHeight - 50);
  });
});
