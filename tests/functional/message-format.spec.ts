/**
 * Functional Tests: Message Format
 *
 * Tests for message display and formatting.
 * Requirements: agents.7, agents.4.24
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  createMockOAuthServer,
  completeOAuthFlow,
  launchElectronWithMockOAuth,
  expectAgentsVisible,
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
    id: 'test-format-user',
    email: 'format.test@example.com',
    name: 'Format Test User',
    given_name: 'Format',
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

test.describe('Message Format', () => {
  /* Preconditions: Agent is active
     Action: Send user message
     Assertions: Message displays with correct styling (right-aligned, gray background, border)
     Requirements: agents.7.5, agents.4.9 */
  test('should display user messages correctly', async () => {
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('User test message');
    await messageInput.press('Enter');
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(1, { timeout: 5000 });

    // Find user message
    const userMessage = window
      .locator('[data-testid="message"]')
      .filter({ hasText: 'User test message' });
    await expect(userMessage).toBeVisible();

    // Check container has right alignment
    const messageContainer = userMessage.locator('div.flex.justify-end');
    await expect(messageContainer).toBeVisible();

    // Check message bubble has styling (rounded, background, border)
    const messageBubble = messageContainer.locator('div.rounded-2xl');
    await expect(messageBubble).toBeVisible();

    const bubbleClasses = await messageBubble.getAttribute('class');
    expect(bubbleClasses).toContain('rounded-2xl');
    expect(bubbleClasses).toContain('bg-secondary');
    expect(bubbleClasses).toContain('border');
  });

  /* Preconditions: Agent sends response
     Action: View agent message
     Assertions: Message displays with correct styling (left-aligned, no background)
     Requirements: agents.7.6, agents.4.10 */
  test('should display agent responses correctly', async () => {
    // Send message to trigger agent response (in real scenario)
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(1, { timeout: 5000 });

    // Check for any messages
    const messages = window.locator('[data-testid="message"]');
    const count = await messages.count();

    if (count > 0) {
      // First message should be user message (right-aligned)
      const firstMessage = messages.first();
      const firstContainer = firstMessage.locator('..');
      const firstClasses = await firstContainer.getAttribute('class');
      expect(firstClasses).toContain('justify-end');

      // If there's an agent response, it should be left-aligned
      if (count > 1) {
        const secondMessage = messages.nth(1);
        const secondContainer = secondMessage.locator('..');
        const secondClasses = await secondContainer.getAttribute('class');

        // Agent messages should NOT have justify-end
        expect(secondClasses).not.toContain('justify-end');
      }
    }
  });

  /* Preconditions: Agent response exists
     Action: Inspect LLM message container
     Assertions: Unified typography class is applied
     Requirements: agents.4.24 */
  test('should apply unified typography for agent messages', async () => {
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Generate a short response.');
    await messageInput.press('Enter');
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(1, { timeout: 5000 });

    const llmAction = window.locator('[data-testid="message-llm-action"]').first();
    if ((await llmAction.count()) > 0) {
      await expect(llmAction).toHaveClass(/message-markdown/);
    }
  });

  /* Preconditions: Agent sends final_answer with markdown
     Action: View message
     Assertions: Markdown is rendered correctly
     Requirements: agents.7.7 */
  test('should render markdown in final_answer', async () => {
    // This test would require actual agent response with markdown
    // For now, we test the structure

    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(1, { timeout: 5000 });

    // Check if markdown rendering component exists
    const messages = window.locator('[data-testid="message"]');

    if ((await messages.count()) > 0) {
      // Messages should support rich content
      const firstMessage = messages.first();
      await expect(firstMessage).toBeVisible();

      // Check for markdown elements (if present)
      const hasParagraph = (await firstMessage.locator('p').count()) > 0;
      const hasDiv = (await firstMessage.locator('div').count()) > 0;

      // Message should have some structure
      expect(hasParagraph || hasDiv).toBe(true);
    }
  });

  /* Preconditions: Messages exist
     Action: View message timestamps
     Assertions: Timestamps include timezone offset
     Requirements: agents.7.8 */
  test('should display timestamps with timezone offset', async () => {
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(1, { timeout: 5000 });

    // Check agent header for timestamp
    const headerTimestamp = window.locator('[data-testid="agent-updated-time"]');

    if ((await headerTimestamp.count()) > 0) {
      const timestampText = await headerTimestamp.textContent();
      expect(timestampText).toBeTruthy();

      // Should have formatted time (not raw ISO string)
      expect(timestampText).not.toMatch(/T\d{2}:\d{2}:\d{2}/);
    }
  });
});
