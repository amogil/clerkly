// Requirements: agents.4.22
// Functional tests for message text wrapping

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { createMockOAuthServer, launchElectronWithMockOAuth } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let mockServer: MockOAuthServer;
let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer();

  // Set user profile
  mockServer.setUserProfile({
    id: 'TEXT_WRAP_USER',
    email: 'textwrap.test@example.com',
    name: 'Text Wrap Test User',
    given_name: 'Text',
    family_name: 'Wrap',
  });

  const context = await launchElectronWithMockOAuth(mockServer);
  electronApp = context.app;
  page = context.window;

  // Complete OAuth flow to login
  await completeOAuthFlow(electronApp, page);

  // Wait for agents page to load (automatic redirect after OAuth)
  await expect(page.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
  if (mockServer) {
    await mockServer.stop();
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
    const textarea = page.locator('textarea[placeholder*="Ask"]');
    await textarea.fill(longWord);
    await textarea.press('Enter');

    // Wait for message to appear
    await expect(page.locator('.rounded-2xl.bg-secondary\\/70').last()).toBeVisible({
      timeout: 5000,
    });

    // Find the user message
    const userMessage = page.locator('.rounded-2xl.bg-secondary\\/70').last();

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
    const textarea = page.locator('textarea[placeholder*="Ask"]');
    await textarea.fill(messageWithBreaks);
    await textarea.press('Enter');

    // Wait for message to appear
    await expect(page.locator('.rounded-2xl.bg-secondary\\/70').last()).toBeVisible({
      timeout: 5000,
    });

    // Find the user message
    const userMessage = page.locator('.rounded-2xl.bg-secondary\\/70').last();

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
     Assertions: Agent messages have whitespace-pre-wrap and break-words classes, full width
     Requirements: agents.4.22 */
  test('should have correct CSS classes for agent messages', async () => {
    // Find any agent message by testid
    const agentMessage = page.locator('[data-testid="message-llm-action"]').first();

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

    // Message should fill the chat area width (no max-w constraint)
    expect(messageWidth).toBeLessThanOrEqual(chatAreaWidth + 1); // +1 for rounding
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

  /* Preconditions: User is on agents page with active agent
     Action: Send message with multiple consecutive line breaks
     Assertions: All line breaks are preserved, creating empty lines
     Requirements: agents.4.22 */
  test('should preserve multiple consecutive line breaks', async () => {
    // Send message with multiple line breaks
    const messageWithMultipleBreaks = 'Line 1\n\n\nLine 2 after 3 breaks\n\nLine 3 after 2 breaks';
    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(messageWithMultipleBreaks);
    await textarea.press('Enter');

    // Wait for message to appear
    await page.waitForTimeout(500);

    // Find the user message
    const userMessage = page.locator('.rounded-2xl.bg-secondary\\/70').last();
    await expect(userMessage).toBeVisible();

    // Check that message has whitespace-pre-wrap class
    const messageText = userMessage.locator('p');
    await expect(messageText).toHaveClass(/whitespace-pre-wrap/);

    // Verify text content preserves structure
    const textContent = await messageText.textContent();
    expect(textContent).toBe(messageWithMultipleBreaks);
  });

  /* Preconditions: User is on agents page with active agent
     Action: Send very long message with normal text (with spaces)
     Assertions: Text wraps naturally, no horizontal scrollbar
     Requirements: agents.4.22 */
  test('should wrap long text with spaces naturally', async () => {
    // Send message with long text with spaces
    const longText =
      'This is a very long message with many words that should wrap naturally. '.repeat(20);
    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(longText);
    await textarea.press('Enter');

    // Wait for message to appear
    await page.waitForTimeout(500);

    // Find the user message
    const userMessage = page.locator('.rounded-2xl.bg-secondary\\/70').last();
    await expect(userMessage).toBeVisible();

    // Check no horizontal scrollbar
    const messagesContainer = page.locator('[data-testid="messages-area"]');
    const hasHorizontalScroll = await messagesContainer.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Check that message width doesn't exceed chat area width (no max-w constraint)
    const chatAreaWidth = await messagesContainer.evaluate((el) => el.clientWidth);
    const messageWidth = await userMessage.evaluate((el) => (el as HTMLElement).offsetWidth);
    expect(messageWidth).toBeLessThanOrEqual(chatAreaWidth + 1);
  });

  /* Preconditions: User is on agents page with active agent
     Action: Send message with code-like content (long lines with special chars)
     Assertions: Content wraps, no horizontal scrollbar
     Requirements: agents.4.22 */
  test('should wrap code-like content without horizontal scroll', async () => {
    // Send message with code-like content
    const codeContent = `function veryLongFunctionNameThatShouldWrap() {\n  const veryLongVariableNameWithoutSpaces = "verylongstringwithoutanyspacesorbreaks".repeat(10);\n  return veryLongVariableNameWithoutSpaces;\n}`;
    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(codeContent);
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

  /* Preconditions: User is on agents page with active agent
     Action: Send message with internal whitespace (spaces and line breaks)
     Assertions: Internal whitespace is preserved, leading/trailing whitespace is trimmed
     Requirements: agents.4.22 */
  test('should preserve internal whitespace and trim leading/trailing', async () => {
    // Send message with internal spaces and line breaks
    // Leading/trailing spaces should be trimmed, but internal preserved
    const messageWithSpaces = '   Line 1 with  spaces\nLine 2  has   spaces\n   Line 3   ';
    const expectedText = 'Line 1 with  spaces\nLine 2  has   spaces\n   Line 3';

    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(messageWithSpaces);
    await textarea.press('Enter');

    // Wait for message to appear
    await page.waitForTimeout(500);

    // Find the user message
    const userMessage = page.locator('.rounded-2xl.bg-secondary\\/70').last();
    await expect(userMessage).toBeVisible();

    // Check that message has whitespace-pre-wrap class
    const messageText = userMessage.locator('p');
    await expect(messageText).toHaveClass(/whitespace-pre-wrap/);

    // Verify internal whitespace is preserved, leading/trailing trimmed
    const textContent = await messageText.textContent();
    expect(textContent).toBe(expectedText);
  });

  /* Preconditions: User is on agents page with active agent
     Action: Resize window and check messages still wrap correctly
     Assertions: Messages adapt to new width, no horizontal scrollbar
     Requirements: agents.4.22 */
  test('should maintain text wrapping after window resize', async () => {
    // Send a long message
    const longMessage = 'verylongword'.repeat(20);
    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(longMessage);
    await textarea.press('Enter');

    // Wait for message to appear
    await page.waitForTimeout(500);

    // Check no horizontal scrollbar at current size
    const messagesContainer = page.locator('[data-testid="messages-area"]');
    let hasHorizontalScroll = await messagesContainer.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Resize window to smaller width
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(300);

    // Check still no horizontal scrollbar
    hasHorizontalScroll = await messagesContainer.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    // Resize back to larger width
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);

    // Check still no horizontal scrollbar
    hasHorizontalScroll = await messagesContainer.evaluate((el) => {
      return el.scrollWidth > el.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  /* Preconditions: User is on agents page with active agent
     Action: Send message with emoji and special Unicode characters
     Assertions: Characters display correctly, text wraps properly
     Requirements: agents.4.22 */
  test('should handle emoji and Unicode characters correctly', async () => {
    // Send message with emoji and Unicode
    const messageWithEmoji =
      '🎉 Celebration! 🎊\n日本語テキスト\n🚀 Very long emoji string: ' + '🔥'.repeat(50);
    const textarea = page.locator('textarea[placeholder*="Ask, reply"]');
    await textarea.fill(messageWithEmoji);
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
