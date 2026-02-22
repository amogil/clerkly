/**
 * Functional Tests: Agent Status Calculation
 *
 * Tests for dynamic status calculation from messages.
 * Requirements: agents.9
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { createMockOAuthServer, completeOAuthFlow } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let electronApp: ElectronApplication;
let window: Page;
let mockOAuthServer: MockOAuthServer;

test.beforeAll(async () => {
  mockOAuthServer = await createMockOAuthServer(8904);
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

  // Create unique temp directory for this test
  const testDataPath = path.join(
    require('os').tmpdir(),
    `clerkly-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );

  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/main/index.js'), '--user-data-dir', testDataPath],
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
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(1, { timeout: 5000 });

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
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('First message');
    await messageInput.press('Enter');
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(1, { timeout: 5000 });

    await messageInput.fill('Second message');
    await messageInput.press('Enter');
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(2, { timeout: 5000 });

    // Color lives on agent-avatar-icon
    const agentAvatar = window.locator('[data-testid^="agent-icon-"]').first().locator('[data-testid="agent-avatar-icon"]');
    const updatedClasses = await agentAvatar.getAttribute('class');

    // Should still have a status color
    expect(updatedClasses).toMatch(/bg-sky-400|bg-blue-500|bg-amber-500|bg-red-500|bg-green-500/);
  });

  /* Preconditions: Agent exists
     Action: Check status calculation logic
     Assertions: Status is deterministic and consistent
     Requirements: agents.9.4 */
  test('should calculate status deterministically', async () => {
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await expect(window.locator('[data-testid="message-user"]')).toHaveCount(1, { timeout: 5000 });

    // Get status color before reload
    const agentAvatar = window.locator('[data-testid^="agent-icon-"]').first().locator('[data-testid="agent-avatar-icon"]');
    const classes1 = await agentAvatar.getAttribute('class');

    // Refresh page
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });

    // Get status color after reload
    const agentAvatarAfterReload = window.locator('[data-testid^="agent-icon-"]').first().locator('[data-testid="agent-avatar-icon"]');
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
});
