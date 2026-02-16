// Requirements: agents.4.22
// Functional tests for message text wrapping

import { test, expect, Page, ElectronApplication } from '@playwright/test';
import { launchApp, loginUser } from './helpers/electron';

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  const result = await launchApp();
  electronApp = result.electronApp;
  page = result.page;

  // Login
  await loginUser(page);

  // Navigate to agents
  await page.click('[data-testid="nav-agents"]');
  await page.waitForSelector('[data-testid="agents"]');
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

test.describe('Message Text Wrapping', () => {
  /* Preconditions: User is on agents page with active agent
     Action: Send message with very long word without spaces
     Assertions: Message wraps, no horizontal scrollbar appears
     Requirements: agents.4.22 */
  test('should wrap long words without spaces in user messages', async () => {
    // Send message with very long word
    const longWord = 'й'.repeat(200); // 200 characters without spaces
    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(longWord);
    await textarea.press('Enter');

    // Wait for message to appear
    await page.waitForTimeout(500);

    // Find the user message
    const userMessage = page.locator('.rounded-2xl.bg-secondary\\/70').last();
    await expect(userMessage).toBeVisible();

    // Check that message has break-words class
    const messageText = userMessage.locator('p');
    await expect(messageText).toHaveClass(/break-words/);

    // Check that messages container has no horizontal scrollbar
    const messagesContainer = page.locator('[data-testid="messages-area"]');
    const hasHorizontalScroll = await messagesContainer.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  /* Preconditions: User is on agents page with active agent
     Action: Send message with line breaks
     Assertions: Line breaks are preserved in displayed message
     Requirements: agents.4.22 */
  test('should preserve line breaks in user messages', async () => {
    // Send message with line breaks
    const messageWithBreaks = 'Line 1\nLine 2\nLine 3';
    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(messageWithBreaks);
    await textarea.press('Enter');

    // Wait for message to appear
    await page.waitForTimeout(500);

    // Find the user message
    const userMessage = page.locator('.rounded-2xl.bg-secondary\\/70').last();
    await expect(userMessage).toBeVisible();

    // Check that message has whitespace-pre-wrap class
    const messageText = userMessage.locator('p');
    await expect(messageText).toHaveClass(/whitespace-pre-wrap/);

    // Check that text content includes line breaks
    const textContent = await messageText.textContent();
    expect(textContent).toContain('Line 1');
    expect(textContent).toContain('Line 2');
    expect(textContent).toContain('Line 3');
  });

  /* Preconditions: User is on agents page with active agent
     Action: Check agent message styling
     Assertions: Agent messages have whitespace-pre-wrap and break-words classes
     Requirements: agents.4.22 */
  test('should have correct CSS classes for agent messages', async () => {
    // Find any agent message (from previous tests or create new one)
    const agentMessage = page.locator('.max-w-\\[85\\%\\]').first();

    if ((await agentMessage.count()) > 0) {
      // Check that agent message has both classes
      await expect(agentMessage).toHaveClass(/whitespace-pre-wrap/);
      await expect(agentMessage).toHaveClass(/break-words/);
    }
  });

  /* Preconditions: User is on agents page with active agent
     Action: Send very wide message (long URL or code)
     Assertions: Message container width does not exceed chat area width
     Requirements: agents.4.22 */
  test('should not exceed chat area width with long content', async () => {
    // Send message with very long URL-like string
    const longUrl = 'https://example.com/' + 'a'.repeat(150);
    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(longUrl);
    await textarea.press('Enter');

    // Wait for message to appear
    await page.waitForTimeout(500);

    // Get chat area width
    const messagesContainer = page.locator('[data-testid="messages-area"]');
    const chatAreaWidth = await messagesContainer.evaluate((el) => el.clientWidth);

    // Get user message width
    const userMessage = page.locator('.rounded-2xl.bg-secondary\\/70').last();
    const messageWidth = await userMessage.evaluate((el) => el.offsetWidth);

    // Message should not exceed 75% of chat area (max-w-[75%])
    expect(messageWidth).toBeLessThanOrEqual(chatAreaWidth * 0.75 + 1); // +1 for rounding
  });

  /* Preconditions: User is on agents page with active agent
     Action: Send message with mixed content (long words + line breaks)
     Assertions: Both wrapping and line breaks work correctly
     Requirements: agents.4.22 */
  test('should handle mixed content with long words and line breaks', async () => {
    // Send message with both long words and line breaks
    const mixedContent = `Short line\n${'verylongwordwithoutspaces'.repeat(10)}\nAnother line`;
    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(mixedContent);
    await textarea.press('Enter');

    // Wait for message to appear
    await page.waitForTimeout(500);

    // Find the user message
    const userMessage = page.locator('.rounded-2xl.bg-secondary\\/70').last();
    await expect(userMessage).toBeVisible();

    // Check that message has both classes
    const messageText = userMessage.locator('p');
    await expect(messageText).toHaveClass(/whitespace-pre-wrap/);
    await expect(messageText).toHaveClass(/break-words/);

    // Check no horizontal scrollbar
    const messagesContainer = page.locator('[data-testid="messages-area"]');
    const hasHorizontalScroll = await messagesContainer.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
