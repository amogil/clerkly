import { test, expect, Page, ElectronApplication } from '@playwright/test';
import { createMockOAuthServer, activeChat, launchElectronWithMockOAuth } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

// Requirements: agents.4.3, agents.4.4, agents.4.5, agents.4.6, agents.4.7, agents.4.7.1

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
     Action: Enter one line and then two lines of text
     Assertions: Textarea keeps the same baseline visible height and does not overflow
     Requirements: agents.4.5, agents.4.7.1 */
  test('should keep two-line baseline height before overflow threshold', async () => {
    const textarea = activeChat(window).textarea;
    await expect(textarea).toBeVisible();

    await textarea.fill('Line 1');
    const singleLineHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

    await textarea.fill('Line 1\nLine 2');
    const twoLineHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

    expect(twoLineHeight).toBe(singleLineHeight);

    await expect
      .poll(async () => {
        return await textarea.evaluate(
          (el: HTMLTextAreaElement) => el.scrollHeight <= el.clientHeight + 1
        );
      })
      .toBe(true);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Add third, fourth and fifth lines
     Assertions: Textarea grows step-by-step for each new line
     Requirements: agents.4.6 */
  test('should grow height when third fourth and fifth lines are added', async () => {
    const textarea = activeChat(window).textarea;
    await expect(textarea).toBeVisible();

    await textarea.fill('Line 1\nLine 2');
    const twoLineHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

    await textarea.fill('Line 1\nLine 2\nLine 3');
    await expect
      .poll(async () => {
        return await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);
      })
      .toBeGreaterThan(twoLineHeight);
    const threeLineHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4');
    await expect
      .poll(async () => {
        return await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);
      })
      .toBeGreaterThan(threeLineHeight);
    const fourLineHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    await expect
      .poll(async () => {
        return await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);
      })
      .toBeGreaterThan(fourLineHeight);
    const fiveLineHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

    expect(threeLineHeight).toBeGreaterThan(twoLineHeight);
    expect(fourLineHeight).toBeGreaterThan(threeLineHeight);
    expect(fiveLineHeight).toBeGreaterThan(fourLineHeight);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Add sixth line after five visible lines
     Assertions: Height stops growing and internal scroll is used
     Requirements: agents.4.7, agents.4.7.1 */
  test('should stop growing and enable internal scroll at sixth line', async () => {
    const textarea = activeChat(window).textarea;
    await expect(textarea).toBeVisible();

    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    const fiveLineHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6');
    const sixLineHeight = await textarea.evaluate((el: HTMLTextAreaElement) => el.offsetHeight);

    expect(sixLineHeight).toBe(fiveLineHeight);

    await expect
      .poll(async () => {
        return await textarea.evaluate((el: HTMLTextAreaElement) => getComputedStyle(el).overflowY);
      })
      .toBe('auto');

    await expect
      .poll(async () => {
        return await textarea.evaluate(
          (el: HTMLTextAreaElement) => el.scrollHeight > el.clientHeight
        );
      })
      .toBe(true);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type short text
     Assertions: Short content does not create actual internal overflow
     Requirements: agents.4.7.1 */
  test('should hide scrollbar for short content', async () => {
    const textarea = activeChat(window).textarea;
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
    const textarea = activeChat(window).textarea;
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
    const textarea = activeChat(window).textarea;
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
     Requirements: agents.4.5, agents.4.7, agents.4.7.1 */
  test('should restore short-content scrolling state after content is cleared', async () => {
    const textarea = activeChat(window).textarea;
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
    const textarea = activeChat(window).textarea;
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
