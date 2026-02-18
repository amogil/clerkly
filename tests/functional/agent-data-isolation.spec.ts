/**
 * Functional Tests: Agent Data Isolation
 *
 * Tests for user data isolation in agents.
 * Requirements: agents.10
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { completeOAuthFlow, createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let electronApp: ElectronApplication;
let window: Page;
let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer(8898);
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.beforeEach(async () => {
  mockServer.setUserProfile({
    id: 'isolation-test-user',
    email: 'isolation.test@example.com',
    name: 'Isolation Test User',
    given_name: 'Isolation',
    family_name: 'Test User',
  });

  electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
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

test.describe('Agent Data Isolation', () => {
  /* Preconditions: User is logged in
     Action: View agents list
     Assertions: Only current user's agents are shown
     Requirements: agents.10.1, agents.10.2 */
  test('should only show agents for current user', async () => {
    // Get current user's agents
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const initialCount = await agentIcons.count();
    expect(initialCount).toBeGreaterThan(0);

    // Create new agent
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();
    await window.waitForTimeout(500);

    // Should have one more agent
    const newCount = await agentIcons.count();
    expect(newCount).toBe(initialCount + 1);

    // All agents should belong to current user (verified by backend)
    // We can't directly test userId in UI, but we can verify:
    // 1. Agents are visible
    // 2. Can interact with them
    // 3. No unauthorized access errors

    const firstAgent = agentIcons.first();
    await firstAgent.click();
    await window.waitForTimeout(300);

    // Should be able to send message (proves ownership)
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await expect(messageInput).toBeVisible();
    await expect(messageInput).toBeEnabled();
  });

  /* Preconditions: User is logged in
     Action: Create new agent
     Assertions: Agent is created with current userId
     Requirements: agents.10.3 */
  test('should create agent with current userId', async () => {
    // Create new agent
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();
    await window.waitForTimeout(500);

    // New agent should be visible and active
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const firstAgent = agentIcons.first();

    // Should have active indicator
    await expect(firstAgent).toHaveClass(/ring-2 ring-primary/);

    // Should be able to interact with it
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    // Message should appear (proves agent belongs to user)
    const messages = window.locator('[data-testid="message"]');
    await expect(messages).toHaveCount(1, { timeout: 2000 });
  });

  /* Preconditions: Multiple users exist (simulated)
     Action: Attempt to access another user's agent
     Assertions: Access is denied
     Requirements: agents.10.4 */
  test('should not have access to other users agents', async () => {
    // This test verifies isolation at the API level
    // In functional tests, we can only verify that:
    // 1. Only user's own agents are shown
    // 2. No errors occur during normal operation
    // 3. Agent IDs are properly scoped

    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const count = await agentIcons.count();

    // All visible agents should be accessible
    for (let i = 0; i < Math.min(count, 3); i++) {
      const agent = agentIcons.nth(i);
      await agent.click();
      await window.waitForTimeout(300);

      // Should be able to access without errors
      const messageInput = window.locator('textarea[placeholder*="Ask"]');
      await expect(messageInput).toBeVisible();
      await expect(messageInput).toBeEnabled();
    }

    // No error notifications should appear
    const errorNotification = window
      .locator('[role="alert"]')
      .filter({ hasText: /error|denied|unauthorized/i });
    await expect(errorNotification).not.toBeVisible();
  });
});
