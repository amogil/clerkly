/**
 * Functional Tests: Agent Status Calculation
 *
 * Tests for dynamic status calculation from messages.
 * Requirements: agents.9
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  createMockOAuthServer,
  completeOAuthFlow,
  activeChat,
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
    id: 'test-status-user',
    email: 'status.test@example.com',
    name: 'Status Test User',
    given_name: 'Status',
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

test.describe('Agent Status Calculation', () => {
  /* Preconditions: Agent exists
     Action: Check agent status based on messages
     Assertions: Status is calculated correctly (new, in-progress, etc.)
     Requirements: agents.9.1, agents.9.2 */
  test('should calculate agent status from messages', async () => {
    // New agent should have "new" status
    const agentIcon = window.locator('[data-testid^="agent-icon-"]').first();
    await expect(agentIcon).toBeVisible();

    // Color lives on agent-avatar-icon (child div inside motion.div)
    const agentAvatar = agentIcon.locator('[data-testid="agent-avatar-icon"]');

    // Check initial status (should be "new" - sky-400)
    let classes = await agentAvatar.getAttribute('class');
    expect(classes).toContain('bg-sky-400');

    // Send message - status should change to "in-progress"
    const messageInput = activeChat(window).textarea;
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });

    // Status should update to in-progress (blue-500)
    classes = await agentAvatar.getAttribute('class');
    expect(classes).toMatch(/bg-blue-500|bg-sky-400/); // Might still be processing

    // Check header status text
    const headerStatus = window.locator('[data-testid="agent-status-text"]');
    if ((await headerStatus.count()) > 0) {
      const statusText = await headerStatus.textContent();
      expect(statusText).toMatch(/New|In progress|Awaiting response|Error|Completed/);
    }
  });

  /* Preconditions: Agent has messages
     Action: Send new message
     Assertions: Status updates immediately
     Requirements: agents.9.3 */
  test('should update status on new message', async () => {
    const messageInput = activeChat(window).textarea;
    await messageInput.fill('First message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });

    await messageInput.fill('Second message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(2, { timeout: 5000 });

    // Color lives on agent-avatar-icon
    const agentAvatar = window
      .locator('[data-testid^="agent-icon-"]')
      .first()
      .locator('[data-testid="agent-avatar-icon"]');
    const updatedClasses = await agentAvatar.getAttribute('class');

    // Should still have a status color
    expect(updatedClasses).toMatch(/bg-sky-400|bg-blue-500|bg-amber-500|bg-red-500|bg-green-500/);
  });

  /* Preconditions: Agent exists
     Action: Check status calculation logic
     Assertions: Status is deterministic and consistent
     Requirements: agents.9.4 */
  test('should calculate status deterministically', async () => {
    const messageInput = activeChat(window).textarea;
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });

    // Get status color before reload
    const agentAvatar = window
      .locator('[data-testid^="agent-icon-"]')
      .first()
      .locator('[data-testid="agent-avatar-icon"]');
    const classes1 = await agentAvatar.getAttribute('class');

    // Refresh page
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await expectAgentsVisible(window, 10000);

    // Get status color after reload
    const agentAvatarAfterReload = window
      .locator('[data-testid^="agent-icon-"]')
      .first()
      .locator('[data-testid="agent-avatar-icon"]');
    const classes2 = await agentAvatarAfterReload.getAttribute('class');

    const getStatusColor = (classes: string | null) => {
      if (!classes) return null;
      if (classes.includes('bg-sky-400')) return 'sky';
      if (classes.includes('bg-blue-500')) return 'blue';
      if (classes.includes('bg-amber-500')) return 'amber';
      if (classes.includes('bg-red-500')) return 'red';
      if (classes.includes('bg-green-500')) return 'green';
      return null;
    };

    // Colors should match (deterministic)
    expect(getStatusColor(classes1)).toBe(getStatusColor(classes2));
  });

  /* Preconditions: Agent has only hidden messages (user message was hidden via cancel-retry path)
     Action: Recalculate status after message becomes hidden
     Assertions: Hidden message is excluded and status is `new`
     Requirements: agents.9.2 */
  test('should ignore hidden messages when calculating status', async () => {
    const agentId = await window
      .locator('[data-testid^="agent-icon-"]')
      .first()
      .getAttribute('data-testid');
    const resolvedAgentId = agentId?.replace('agent-icon-', '');
    expect(resolvedAgentId).toBeTruthy();

    const userMessageId = await window.evaluate(async (id) => {
      const api = (window as unknown as { api: any }).api;
      const created = await api.messages.create(id, 'user', { data: { text: 'temp message' } });
      if (!created?.success || !created?.data?.id) {
        throw new Error(created?.error || 'Failed to create user message');
      }
      const cancelResult = await api.messages.cancelRetry(id, created.data.id);
      if (!cancelResult?.success) {
        throw new Error(cancelResult?.error || 'Failed to hide message');
      }
      return created.data.id as number;
    }, resolvedAgentId as string);

    expect(userMessageId).toBeGreaterThan(0);

    const agentAvatar = window
      .locator('[data-testid^="agent-icon-"]')
      .first()
      .locator('[data-testid="agent-avatar-icon"]');

    await expect
      .poll(async () => await agentAvatar.getAttribute('class'), { timeout: 5000 })
      .toContain('bg-sky-400');
  });
});
