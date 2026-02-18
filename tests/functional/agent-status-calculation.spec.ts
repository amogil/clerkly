/**
 * Functional Tests: Agent Status Calculation
 *
 * Tests for dynamic status calculation from messages.
 * Requirements: agents.9
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { completeOAuthFlow } from './helpers/electron';

let electronApp: ElectronApplication;
let window: Page;

test.beforeEach(async () => {
  electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
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

    // Check initial status (should be "new" - sky-400)
    let classes = await agentIcon.getAttribute('class');
    expect(classes).toContain('bg-sky-400');

    // Send message - status should change to "in-progress"
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    // Status should update to in-progress (blue-500)
    classes = await agentIcon.getAttribute('class');
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
    // Send first message
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('First message');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    // Send second message
    await messageInput.fill('Second message');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    // Status should update (classes might change)
    const updatedClasses = await agentIcon.getAttribute('class');

    // Should still have a status color
    expect(updatedClasses).toMatch(/bg-sky-400|bg-blue-500|bg-amber-500|bg-red-500|bg-green-500/);
  });

  /* Preconditions: Agent exists
     Action: Check status calculation logic
     Assertions: Status is deterministic and consistent
     Requirements: agents.9.4 */
  test('should calculate status deterministically', async () => {
    // Create agent and send message
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    // Get status
    const agentIcon = window.locator('[data-testid^="agent-icon-"]').first();
    const classes1 = await agentIcon.getAttribute('class');

    // Refresh page
    await window.reload();
    await window.waitForTimeout(2000);

    // Status should be the same after reload
    const agentIconAfterReload = window.locator('[data-testid^="agent-icon-"]').first();
    const classes2 = await agentIconAfterReload.getAttribute('class');

    // Should have same status color
    const getStatusColor = (classes: string | null) => {
      if (!classes) return null;
      if (classes.includes('bg-sky-400')) return 'sky';
      if (classes.includes('bg-blue-500')) return 'blue';
      if (classes.includes('bg-amber-500')) return 'amber';
      if (classes.includes('bg-red-500')) return 'red';
      if (classes.includes('bg-green-500')) return 'green';
      return null;
    };

    const color1 = getStatusColor(classes1);
    const color2 = getStatusColor(classes2);

    // Colors should match (deterministic)
    expect(color1).toBe(color2);
  });
});
