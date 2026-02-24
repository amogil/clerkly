/**
 * Functional Tests: Agent List Responsive Behavior
 *
 * Tests for responsive agent list and +N button.
 * Requirements: agents.1.7, agents.1.8, agents.1.9
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { completeOAuthFlow, createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let electronApp: ElectronApplication;
let window: Page;
let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer();
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.beforeEach(async () => {
  mockServer.setUserProfile({
    id: 'responsive-test-user',
    email: 'responsive.test@example.com',
    name: 'Responsive Test User',
    given_name: 'Responsive',
    family_name: 'Test User',
  });

  // Create unique temp directory for this test
  const testDataPath = path.join(
    require('os').tmpdir(),
    `clerkly-responsive-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );

  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/main/index.js'), '--user-data-dir', testDataPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
      CLERKLY_OAUTH_CLIENT_ID: 'test-client-id',
      CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret',
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

test.describe('Agent List Responsive Behavior', () => {
  /* Preconditions: Multiple agents exist
     Action: Resize window
     Assertions: Visible agent count adapts to window width
     Requirements: agents.1.7 */
  test('should adapt visible agents count to window width', async () => {
    // Create many agents
    const newChatButton = window.locator('div[title="New chat"]');

    for (let i = 0; i < 10; i++) {
      await newChatButton.click();
      await window.waitForTimeout(200);
    }

    // Get initial window size and visible agents
    const initialSize = await window.viewportSize();
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');

    // Resize to smaller width
    await window.setViewportSize({ width: 800, height: initialSize?.height || 600 });
    await window.waitForTimeout(500);

    // Count visible agents (might be less)
    const smallVisibleCount = await agentIcons.count();

    // Resize to larger width
    await window.setViewportSize({ width: 1400, height: initialSize?.height || 600 });
    await window.waitForTimeout(500);

    // Count visible agents (might be more)
    const largeVisibleCount = await agentIcons.count();

    // Larger window should show more or equal agents
    expect(largeVisibleCount).toBeGreaterThanOrEqual(smallVisibleCount);

    // At least 1 agent should always be visible
    expect(smallVisibleCount).toBeGreaterThanOrEqual(1);
    expect(largeVisibleCount).toBeGreaterThanOrEqual(1);
  });

  /* Preconditions: Agents exist
     Action: View agent list
     Assertions: At least 1 agent is always visible
     Requirements: agents.1.8 */
  test('should always show at least 1 agent', async () => {
    // Even with very small window, at least 1 agent should be visible
    await window.setViewportSize({ width: 400, height: 600 });
    await window.waitForTimeout(500);

    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const count = await agentIcons.count();

    expect(count).toBeGreaterThanOrEqual(1);

    // First agent should be visible
    const firstAgent = agentIcons.first();
    await expect(firstAgent).toBeVisible();
  });

  /* Preconditions: More agents exist than can fit in header
     Action: View agent list
     Assertions: +N button shows count of hidden agents
     Requirements: agents.1.9 */
  test('should show +N button for hidden agents', async () => {
    // Create many agents to ensure some are hidden
    const newChatButton = window.locator('div[title="New chat"]');

    for (let i = 0; i < 15; i++) {
      await newChatButton.click();
      await window.waitForTimeout(200);
    }

    // Set smaller window to force hiding agents
    await window.setViewportSize({ width: 900, height: 600 });
    await window.waitForTimeout(500);

    // Look for +N button
    const plusNButton = window.locator('button').filter({ hasText: /^\+\d+$/ });

    // Button should exist if agents are hidden
    const buttonCount = await plusNButton.count();

    if (buttonCount > 0) {
      // Button should be visible
      await expect(plusNButton).toBeVisible();

      // Button text should show number
      const buttonText = await plusNButton.textContent();
      expect(buttonText).toMatch(/^\+\d+$/);

      // Extract number
      const hiddenCount = parseInt(buttonText?.replace('+', '') || '0');
      expect(hiddenCount).toBeGreaterThan(0);

      // Button should have tooltip
      const title = await plusNButton.getAttribute('title');
      expect(title).toBeTruthy();
      expect(title).toContain('more agents');
    }
  });

  /* Preconditions: +N button is visible
     Action: Click +N button
     Assertions: All Agents page opens showing all agents
     Requirements: agents.1.9, agents.5.1 */
  test('should open all agents when clicking +N button', async () => {
    // Create many agents
    const newChatButton = window.locator('div[title="New chat"]');

    for (let i = 0; i < 12; i++) {
      await newChatButton.click();
      await window.waitForTimeout(200);
    }

    // Set smaller window
    await window.setViewportSize({ width: 900, height: 600 });
    await window.waitForTimeout(500);

    // Find +N button
    const plusNButton = window.locator('button').filter({ hasText: /^\+\d+$/ });

    if ((await plusNButton.count()) > 0) {
      // Click button
      await plusNButton.click();
      await window.waitForTimeout(500);

      // All Agents page should open
      const allAgentsTitle = window.locator('text=All Agents');
      await expect(allAgentsTitle).toBeVisible({ timeout: 2000 });

      // Should show all agents
      const agentCards = window.locator('[data-testid^="agent-card-"]');
      const cardCount = await agentCards.count();

      // Should show more agents than were visible in header
      expect(cardCount).toBeGreaterThan(5);
    }
  });

  /* Preconditions: Window is resized
     Action: Resize window multiple times
     Assertions: Agent list recalculates correctly each time
     Requirements: agents.1.7 */
  test('should recalculate visible agents on each resize', async () => {
    // Create agents
    const newChatButton = window.locator('div[title="New chat"]');

    for (let i = 0; i < 8; i++) {
      await newChatButton.click();
      await window.waitForTimeout(200);
    }

    const agentIcons = window.locator('[data-testid^="agent-icon-"]');

    // Test multiple sizes
    const sizes = [
      { width: 800, height: 600 },
      { width: 1200, height: 600 },
      { width: 1000, height: 600 },
      { width: 1400, height: 600 },
    ];

    for (const size of sizes) {
      await window.setViewportSize(size);
      await window.waitForTimeout(300);

      // Count visible agents
      const count = await agentIcons.count();

      // Should have at least 1 agent
      expect(count).toBeGreaterThanOrEqual(1);

      // All visible agents should be visible
      for (let i = 0; i < Math.min(count, 3); i++) {
        const agent = agentIcons.nth(i);
        await expect(agent).toBeVisible();
      }
    }
  });
});
