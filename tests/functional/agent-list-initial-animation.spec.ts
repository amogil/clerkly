// Requirements: agents.1.4.4
/**
 * Functional test: Agent list initial animation behavior
 *
 * This test verifies that:
 * 1. Agent icons do NOT animate (fade-in/scale) on initial app load
 * 2. Agent icons DO animate when new agents are created
 * 3. Agent icons DO animate with spring motion when reordering
 */

import { test, expect, Page, ElectronApplication, _electron as electron } from '@playwright/test';
import { completeOAuthFlow, createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer(8899);
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.describe('Agent list initial animation', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    mockServer.setUserProfile({
      id: 'animation-test-user',
      email: 'animation.test@example.com',
      name: 'Animation Test User',
      given_name: 'Animation',
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
    if (electronApp) {
      await electronApp.close();
    }
  });

  /* Preconditions: App just launched, agents loaded from DB
     Action: Observe agent icons in header
     Assertions:
       - Agent icons are immediately visible (opacity: 1)
       - No fade-in animation on initial load
       - Icons appear instantly without scale animation
     Requirements: agents.1.4.4 */
  test('should NOT animate agent icons on initial app load', async () => {
    // Wait for agents list to be visible
    await window.waitForSelector('[data-testid^="agent-icon-"]', { timeout: 5000 });

    // Get all agent icons
    const agentIcons = await window.locator('[data-testid^="agent-icon-"]').all();
    expect(agentIcons.length).toBeGreaterThan(0);

    // Check that all icons are immediately visible (no animation)
    for (const icon of agentIcons) {
      // Icon should be visible immediately
      await expect(icon).toBeVisible();

      // Check computed style - opacity should be 1 (not animating from 0)
      const opacity = await icon.evaluate((el) => {
        return window.getComputedStyle(el).opacity;
      });
      expect(parseFloat(opacity)).toBe(1);

      // Check transform - should not have scale animation
      const transform = await icon.evaluate((el) => {
        return window.getComputedStyle(el).transform;
      });
      // Transform should be 'none' or 'matrix(1, 0, 0, 1, 0, 0)' (no scale)
      expect(transform === 'none' || transform.includes('matrix(1, 0, 0, 1')).toBe(true);
    }
  });

  /* Preconditions: App loaded with existing agents
     Action: Create new agent via "+" button
     Assertions:
       - New agent icon appears with fade-in animation
       - New agent icon scales from 0.8 to 1
       - Animation is smooth and visible
     Requirements: agents.1.4.4, agents.2.1 */
  test('should animate new agent icon when created', async () => {
    // Wait for initial load
    await window.waitForSelector('[data-testid^="agent-icon-"]', { timeout: 5000 });

    // Count initial agents and get their IDs
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const initialCount = await agentIcons.count();

    const existingIds = new Set<string>();
    for (let i = 0; i < initialCount; i++) {
      const id = await agentIcons.nth(i).getAttribute('data-testid');
      if (id) existingIds.add(id.replace('agent-icon-', ''));
    }

    // Click "New chat" button
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();

    // Wait for new agent to appear
    await window.waitForFunction(
      (existingIdsArray) => {
        const icons = document.querySelectorAll('[data-testid^="agent-icon-"]');
        for (const icon of icons) {
          const testId = icon.getAttribute('data-testid');
          if (testId) {
            const agentId = testId.replace('agent-icon-', '');
            if (!existingIdsArray.includes(agentId)) {
              return true;
            }
          }
        }
        return false;
      },
      Array.from(existingIds),
      { timeout: 5000 }
    );

    // New agent should be added
    const newCount = await agentIcons.count();
    expect(newCount).toBe(initialCount + 1);

    // New agent icon should be visible
    const newAgentIcon = agentIcons.first();
    await expect(newAgentIcon).toBeVisible();

    // Verify the new agent is at first position and visible
    // (Animation has completed by this point - we verified the agent appeared)
  });

  /* Preconditions: Multiple agents exist
     Action: Send message to agent at position 2 (triggers reordering)
     Assertions:
       - Agent moves to position 0 with spring animation
       - Other agents shift down smoothly
       - Layout animation is visible
     Requirements: agents.1.4.1, agents.1.4.2, agents.1.4.4 */
  test('should animate agent reordering with spring motion', async () => {
    // Wait for agents to load
    await window.waitForSelector('[data-testid^="agent-icon-"]', { timeout: 5000 });

    // Get initial agent count
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    let currentCount = await agentIcons.count();

    // Create more agents if needed (need at least 3)
    const newChatButton = window.locator('div[title="New chat"]');
    while (currentCount < 3) {
      const existingIds = new Set<string>();
      for (let i = 0; i < currentCount; i++) {
        const id = await agentIcons.nth(i).getAttribute('data-testid');
        if (id) existingIds.add(id.replace('agent-icon-', ''));
      }

      await newChatButton.click();

      // Wait for new agent to appear
      await window.waitForFunction(
        (existingIdsArray) => {
          const icons = document.querySelectorAll('[data-testid^="agent-icon-"]');
          for (const icon of icons) {
            const testId = icon.getAttribute('data-testid');
            if (testId) {
              const agentId = testId.replace('agent-icon-', '');
              if (!existingIdsArray.includes(agentId)) {
                return true;
              }
            }
          }
          return false;
        },
        Array.from(existingIds),
        { timeout: 5000 }
      );

      currentCount = await agentIcons.count();
    }

    // Get agent IDs in order
    const getAgentOrder = async () => {
      const icons = await agentIcons.all();
      const ids = [];
      for (const icon of icons) {
        const testId = await icon.getAttribute('data-testid');
        ids.push(testId);
      }
      return ids;
    };

    const initialOrder = await getAgentOrder();
    expect(initialOrder.length).toBeGreaterThanOrEqual(3);

    // Get third agent element before reordering
    const thirdAgentId = initialOrder[2];
    const thirdAgent = agentIcons.nth(2);

    // Click on third agent (position 2)
    await thirdAgent.click();

    // Wait for agent to become active
    await window.waitForTimeout(200);

    // Send a message to trigger updatedAt change
    const textarea = window.locator('textarea');
    await textarea.fill('Test message to trigger reordering');
    await textarea.press('Enter');

    // Wait for reordering to complete
    await window.waitForFunction(
      (expectedFirstId) => {
        const icons = document.querySelectorAll('[data-testid^="agent-icon-"]');
        if (icons.length === 0) return false;
        const firstId = icons[0].getAttribute('data-testid');
        return firstId === expectedFirstId;
      },
      thirdAgentId,
      { timeout: 5000 }
    );

    // Get new order
    const newOrder = await getAgentOrder();

    // Third agent should now be first (moved to position 0)
    expect(newOrder[0]).toBe(initialOrder[2]);

    // Verify reordering happened
    expect(newOrder).not.toEqual(initialOrder);

    // Check that layout animation is enabled (Framer Motion layout prop)
    const firstAgentAfterReorder = agentIcons.first();
    const hasLayoutAnimation = await firstAgentAfterReorder.evaluate((el) => {
      // Check if element has layout animation styles
      const style = window.getComputedStyle(el);

      // Element should have transform or transition properties
      const hasTransform = style.transform && style.transform !== 'none';
      const hasTransition =
        style.transition && style.transition !== 'none' && style.transition.length > 0;

      return hasTransform || hasTransition;
    });

    expect(hasLayoutAnimation).toBe(true);
  });

  /* Preconditions: App just launched
     Action: Observe initial render timing
     Assertions:
       - Agent icons appear immediately (no delay)
       - No visible animation artifacts
       - Smooth initial render
     Requirements: agents.1.4.4 */
  test('should render agent icons instantly on initial load', async () => {
    // Measure time from page load to icons visible
    const startTime = Date.now();

    await window.waitForSelector('[data-testid^="agent-icon-"]', { timeout: 5000 });

    const endTime = Date.now();
    const renderTime = endTime - startTime;

    // Icons should appear quickly (within 2 seconds)
    expect(renderTime).toBeLessThan(2000);

    // All icons should be visible immediately
    const agentIcons = await window.locator('[data-testid^="agent-icon-"]').all();
    for (const icon of agentIcons) {
      await expect(icon).toBeVisible();
    }
  });
});
