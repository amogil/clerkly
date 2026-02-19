import { test, expect, Page, ElectronApplication, _electron as electron } from '@playwright/test';
import path from 'path';
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

// Requirements: agents.4.3, agents.4.4, agents.4.5, agents.4.6, agents.4.7

let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer(8896);
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

    // Create unique temp directory
    const testDataPath = path.join(
      require('os').tmpdir(),
      `clerkly-textarea-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    // Launch Electron app
    electronApp = await electron.launch({
      args: [
        path.join(__dirname, '../../dist/main/main/index.js'),
        '--user-data-dir',
        testDataPath,
      ],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
        CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
        CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
      },
    });

    window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

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
     Assertions: Textarea height increases with content
     Requirements: agents.4.5 */
  test('should auto-expand height with multiline text', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    // Get initial height with short text
    await textarea.fill('Line 1');
    const initialHeight = await textarea.evaluate((el: HTMLTextAreaElement) => {
      return el.offsetHeight;
    });

    // Add more lines
    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

    // Wait for height to update
    await window.waitForTimeout(100);

    const expandedHeight = await textarea.evaluate((el: HTMLTextAreaElement) => {
      return el.offsetHeight;
    });

    // Height should increase
    expect(expandedHeight).toBeGreaterThan(initialHeight);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type many lines to exceed 50% of chat area
     Assertions: Textarea height is capped at 50% of chat area
     Requirements: agents.4.6 */
  test('should cap height at 50% of chat area', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    const messagesArea = window.locator('[data-testid="messages-area"]');

    await expect(textarea).toBeVisible();
    await expect(messagesArea).toBeVisible();

    // Get chat area height
    const chatAreaHeight = await messagesArea.evaluate((el: HTMLElement) => {
      return el.offsetHeight;
    });

    const maxAllowedHeight = chatAreaHeight * 0.5;

    // Fill with many lines to exceed max height
    const manyLines = Array(50).fill('Line').join('\n');
    await textarea.fill(manyLines);

    // Wait for height to update
    await window.waitForTimeout(200);

    const textareaHeight = await textarea.evaluate((el: HTMLTextAreaElement) => {
      return el.offsetHeight;
    });

    // Height should not exceed 50% of chat area
    expect(textareaHeight).toBeLessThanOrEqual(maxAllowedHeight + 5); // +5px tolerance
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

    // Wait for height to update
    await window.waitForTimeout(200);

    const overflowY = await textarea.evaluate((el: HTMLTextAreaElement) => {
      return getComputedStyle(el).overflowY;
    });

    // Should have scrollbar
    expect(overflowY).toBe('auto');
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type short text
     Assertions: No scrollbar (overflow-y is hidden)
     Requirements: agents.4.7 */
  test('should hide scrollbar for short content', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    // Fill with short text
    await textarea.fill('Short text');

    // Wait for height to update
    await window.waitForTimeout(100);

    const overflowY = await textarea.evaluate((el: HTMLTextAreaElement) => {
      return getComputedStyle(el).overflowY;
    });

    // Should not have scrollbar
    expect(overflowY).toBe('hidden');
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

    // Wait for message to be sent
    await window.waitForTimeout(500);

    // Textarea should be cleared
    const value = await textarea.inputValue();
    expect(value).toBe('');
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Press Shift+Enter
     Assertions: New line is added, message is NOT sent
     Requirements: agents.4.4 */
  test('should add new line on Shift+Enter', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    // Type first line
    await textarea.fill('Line 1');

    // Press Shift+Enter to add new line
    await textarea.press('Shift+Enter');

    // Type second line by appending to existing value
    await textarea.evaluate((el: HTMLTextAreaElement) => {
      el.value += 'Line 2';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Wait a bit
    await window.waitForTimeout(200);

    // Value should contain both lines
    const value = await textarea.inputValue();
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');
    expect(value).toMatch(/Line 1\s+Line 2/);
  });

  /* Preconditions: User is on agents page with textarea visible
     Action: Type text, then clear it, then type again
     Assertions: Height adjusts correctly on both operations
     Requirements: agents.4.5 */
  test('should adjust height when content is cleared', async () => {
    const textarea = window.locator('[data-testid="auto-expanding-textarea"]');
    await expect(textarea).toBeVisible();

    // Fill with multiple lines
    await textarea.fill('Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
    await window.waitForTimeout(100);

    const expandedHeight = await textarea.evaluate((el: HTMLTextAreaElement) => {
      return el.offsetHeight;
    });

    // Clear textarea
    await textarea.fill('');
    await window.waitForTimeout(100);

    const clearedHeight = await textarea.evaluate((el: HTMLTextAreaElement) => {
      return el.offsetHeight;
    });

    // Height should decrease
    expect(clearedHeight).toBeLessThan(expandedHeight);

    // Type short text again
    await textarea.fill('Short');
    await window.waitForTimeout(100);

    const shortHeight = await textarea.evaluate((el: HTMLTextAreaElement) => {
      return el.offsetHeight;
    });

    // Height should be similar to cleared height
    expect(Math.abs(shortHeight - clearedHeight)).toBeLessThan(20);
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
      await window.waitForTimeout(50);
    }

    // Should still be visible and functional
    await expect(textarea).toBeVisible();

    // Should be able to type
    await textarea.fill('Final text');
    const value = await textarea.inputValue();
    expect(value).toBe('Final text');
  });
});
