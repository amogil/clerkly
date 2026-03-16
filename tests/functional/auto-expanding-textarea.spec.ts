import { test, expect, Page, ElectronApplication } from '@playwright/test';
import { createMockOAuthServer, activeChat, launchElectronWithMockOAuth } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

// Requirements: agents.4.3, agents.4.4, agents.4.5, agents.4.7

let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer();
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.describe('AutoExpandingTextarea - Functional Tests', () => {
  const PROMPT_TEXTAREA_MAX_HEIGHT_PX = 160;
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    // Set user profile
    mockServer.setUserProfile({
      id: 'TEXTAREA_TEST',
      email: 'textarea.test@example.com',
      name: 'Textarea Test User',
      given_name: 'Textarea',
      family_name: 'Test',
    });

    const context = await launchElectronWithMockOAuth(mockServer);
    electronApp = context.app;
    window = context.window;

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 10000 });
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type single line of text
     Assertions: Textarea height is minimal
     Requirements: agents.4.5 */
  test('should have minimal height for single line text', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    // Clear and type short text
    await textarea.fill('Short message');

    // Get initial height
    const initialHeight = await textarea.evaluate((el: HTMLTextAreaElement) => {
      return el.offsetHeight;
    });

    // Height should be relatively small for single line
    expect(initialHeight).toBeLessThan(100);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type multiple lines of text
     Assertions: Textarea keeps multiline content and remains within the visible sizing contract
     Requirements: agents.4.5, agents.4.6 */
  test('should preserve multiline content within textarea sizing contract', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    await expect(textarea).toHaveValue('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    await expect
      .poll(async () => {
        return await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);
      })
      .toBeLessThanOrEqual(PROMPT_TEXTAREA_MAX_HEIGHT_PX + 2);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type many lines to exceed textarea max height
     Assertions: Textarea height is capped at maximum visible size
     Requirements: agents.4.5, agents.4.7 */
  test('should cap height at maximum visible size', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');

    await expect(textarea).toBeVisible();

    // Fill with many lines to exceed max height
    const manyLines = Array(50).fill('Line').join('\n');
    await textarea.fill(manyLines);
    await expect
      .poll(async () => {
        return await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);
      })
      .toBeLessThanOrEqual(PROMPT_TEXTAREA_MAX_HEIGHT_PX + 2);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type many lines to exceed max height
     Assertions: Scrollbar appears (overflow-y is auto)
     Requirements: agents.4.7 */
  test('should show scrollbar when content exceeds max height', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    // Fill with many lines
    const manyLines = Array(50).fill('Line').join('\n');
    await textarea.fill(manyLines);

    await expect
      .poll(async () => {
        return await textarea.evaluate((el: HTMLTextAreaElement) => getComputedStyle(el).overflowY);
      })
      .toBe('auto');
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type short text
     Assertions: Short content does not create actual internal overflow
     Requirements: agents.4.7 */
  test('should hide scrollbar for short content', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    await textarea.fill('Short text');

    await expect
      .poll(async () => {
        return await textarea.evaluate(
          (el: HTMLTextAreaElement) => el.scrollHeight <= el.clientHeight + 1
        );
      })
      .toBe(true);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Press Enter key without Shift
     Assertions: Message is sent, textarea is cleared
     Requirements: agents.4.3 */
  test('should send message on Enter key', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    // Type a message
    await textarea.fill('Test message');

    // Press Enter
    await textarea.press('Enter');

    // Wait for message to be sent in active chat
    const userMessage = activeChat(window).userMessages.filter({ hasText: 'Test message' });
    await expect(userMessage).toHaveCount(1, { timeout: 5000 });

    // Textarea should be cleared
    await expect(textarea).toHaveValue('', { timeout: 5000 });
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Press Shift+Enter
     Assertions: New line is added, message is NOT sent
     Requirements: agents.4.4 */
  test('should add new line on Shift+Enter', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    // Type first line and add newline without submit.
    await textarea.type('Line 1');
    await textarea.press('Shift+Enter');
    await textarea.type('Line 2');

    // Value should contain both lines
    const value = await textarea.inputValue();
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');
    expect(value).toBe('Line 1\nLine 2');
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type enough text to enable internal scrolling, then clear content and type a short value again
     Assertions: Short content again fits without actual internal overflow after clearing and retyping
     Requirements: agents.4.5, agents.4.7 */
  test('should restore short-content scrolling state after content is cleared', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    const manyLines = Array(50).fill('Line').join('\n');
    await textarea.fill(manyLines);
    await expect
      .poll(async () => {
        return await textarea.evaluate((el: HTMLTextAreaElement) => getComputedStyle(el).overflowY);
      })
      .toBe('auto');

    await textarea.fill('');
    await expect(textarea).toHaveValue('');

    await textarea.fill('Short');
    await expect(textarea).toHaveValue('Short');
    await expect
      .poll(async () => {
        return await textarea.evaluate(
          (el: HTMLTextAreaElement) => el.scrollHeight <= el.clientHeight + 1
        );
      })
      .toBe(true);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Rapidly type and delete text
     Assertions: Height updates smoothly without errors
     Requirements: agents.4.5 */
  test('should handle rapid content changes', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    // Rapidly change content
    for (let i = 0; i < 5; i++) {
      await textarea.fill(`Line ${i}\n`.repeat(i + 1));
    }

    // Should still be visible and functional
    await expect(textarea).toBeVisible();

    // Should be able to type
    await textarea.fill('Final text');
    const value = await textarea.inputValue();
    expect(value).toBe('Final text');
  });
});
