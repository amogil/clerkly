/* Preconditions: User is logged in and on Agents page
   Action: Check header layout and space distribution
   Assertions: Left and right sections each occupy 50% of header width
   Requirements: agents.8.1, agents.8.2, agents.8.3 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { createMockOAuthServer, launchElectronWithMockOAuth } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

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

test.describe('Header Layout', () => {
  test.beforeEach(async () => {
    // Set user profile data for tests
    mockServer.setUserProfile({
      id: '123456789',
      email: 'header.test@example.com',
      name: 'Header Test User',
      given_name: 'Header',
      family_name: 'Test User',
    });

    const context = await launchElectronWithMockOAuth(mockServer);
    electronApp = context.app;
    window = context.window;

    // Complete OAuth flow to get to Agents page
    await completeOAuthFlow(electronApp, window);
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  /* Preconditions: User is on Agents page with default window size
     Action: Measure header sections width
     Assertions: Left section (active agent info) is 50% of header, right section (agent list) is 50% of header
     Requirements: agents.8.1, agents.8.2 */
  test('should split header into 50% left (active agent info) and 50% right (agent list)', async () => {
    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 10000 });

    // Get header element
    const header = window.locator('[data-testid="agent-header"]').first();
    await expect(header).toBeVisible();

    // Get header width
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    const headerWidth = headerBox!.width;

    // Get left section (active agent info) - first child div
    const leftSection = window.locator('[data-testid="agent-header-left"]');
    const leftBox = await leftSection.boundingBox();
    expect(leftBox).not.toBeNull();
    const leftWidth = leftBox!.width;

    // Get right section (agent list) - second child div with ref={chatListRef}
    const rightSection = window.locator('[data-testid="agent-header-right"]');
    const rightBox = await rightSection.boundingBox();
    expect(rightBox).not.toBeNull();
    const rightWidth = rightBox!.width;

    // Both sections have flex-1, so they split available space equally
    // Available space = headerWidth - gap (24px)
    const gap = 24;
    const expectedSectionWidth = (headerWidth - gap) / 2;

    // Allow 30px tolerance for content-based sizing
    expect(leftWidth).toBeGreaterThanOrEqual(expectedSectionWidth - 30);
    expect(leftWidth).toBeLessThanOrEqual(expectedSectionWidth + 30);

    expect(rightWidth).toBeGreaterThanOrEqual(expectedSectionWidth - 30);
    expect(rightWidth).toBeLessThanOrEqual(expectedSectionWidth + 30);

    // Verify sections are approximately equal
    expect(Math.abs(leftWidth - rightWidth)).toBeLessThanOrEqual(4);
  });

  /* Preconditions: User is on Agents page
     Action: Resize window to different widths and measure header sections
     Assertions: Left and right sections maintain 50%/50% split at all window sizes
     Requirements: agents.8.1, agents.8.2, agents.1.7 */
  test('should maintain 50%/50% split when window is resized', async () => {
    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 10000 });

    const header = window.locator('[data-testid="agent-header"]').first();
    const leftSection = window.locator('[data-testid="agent-header-left"]');
    const rightSection = window.locator('[data-testid="agent-header-right"]');

    // Test at different window widths
    const widths = [1024, 1280, 1440, 1920];

    for (const width of widths) {
      await window.setViewportSize({ width, height: 768 });

      const headerBox = await header.boundingBox();
      expect(headerBox).not.toBeNull();
      const headerWidth = headerBox!.width;

      const leftBox = await leftSection.boundingBox();
      const rightBox = await rightSection.boundingBox();

      expect(leftBox).not.toBeNull();
      expect(rightBox).not.toBeNull();

      const leftWidth = leftBox!.width;
      const rightWidth = rightBox!.width;

      // Both sections have flex-1, so they split available space equally
      // Available space = headerWidth - gap (24px)
      const gap = 24;
      const expectedSectionWidth = (headerWidth - gap) / 2;

      // Allow 30px tolerance for content-based sizing
      expect(leftWidth).toBeGreaterThanOrEqual(expectedSectionWidth - 30);
      expect(leftWidth).toBeLessThanOrEqual(expectedSectionWidth + 30);

      expect(rightWidth).toBeGreaterThanOrEqual(expectedSectionWidth - 30);
      expect(rightWidth).toBeLessThanOrEqual(expectedSectionWidth + 30);
    }
  });

  /* Preconditions: User is on Agents page with agent having very long name
     Action: Check that long agent name doesn't affect 50%/50% split
     Assertions: Left section truncates name but maintains 50% width, right section still has 50% width
     Requirements: agents.8.1, agents.8.2 */
  test('should maintain 50%/50% split with long agent name', async () => {
    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 10000 });

    // Create agent with very long name
    const longName =
      'This is a very long agent name that should be truncated to fit within the allocated space';

    // Update agent name via IPC
    await window.evaluate(async (name) => {
      const result = await window.api.agents.list();
      const agents = Array.isArray(result)
        ? result
        : result && typeof result === 'object' && 'data' in result
          ? (result.data as Array<{ id?: string; agentId?: string }>)
          : [];
      if (agents.length > 0) {
        const id = agents[0].agentId ?? agents[0].id;
        if (id) {
          await window.api.agents.update(id, { name });
        }
      }
    }, longName);

    await expect
      .poll(
        async () =>
          await window.evaluate(async (name) => {
            const result = await window.api.agents.list();
            const agents = Array.isArray(result)
              ? result
              : result && typeof result === 'object' && 'data' in result
                ? (result.data as Array<{ name?: string | null }>)
                : [];
            return agents.some((agent) => agent.name === name);
          }, longName),
        { timeout: 5000 }
      )
      .toBe(true);

    const header = window.locator('[data-testid="agent-header"]').first();
    const leftSection = window.locator('[data-testid="agent-header-left"]');
    const rightSection = window.locator('[data-testid="agent-header-right"]');

    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    const headerWidth = headerBox!.width;

    const leftBox = await leftSection.boundingBox();
    const rightBox = await rightSection.boundingBox();

    expect(leftBox).not.toBeNull();
    expect(rightBox).not.toBeNull();

    const leftWidth = leftBox!.width;
    const rightWidth = rightBox!.width;

    // Both sections have flex-1, so they split available space equally
    // Available space = headerWidth - gap (24px)
    const gap = 24;
    const expectedSectionWidth = (headerWidth - gap) / 2;

    // Allow 30px tolerance for content-based sizing
    expect(leftWidth).toBeGreaterThanOrEqual(expectedSectionWidth - 30);
    expect(leftWidth).toBeLessThanOrEqual(expectedSectionWidth + 30);

    expect(rightWidth).toBeGreaterThanOrEqual(expectedSectionWidth - 30);
    expect(rightWidth).toBeLessThanOrEqual(expectedSectionWidth + 30);
  });

  /* Preconditions: User is on Agents page
     Action: Check header height
     Assertions: Header has height of 64px (h-16)
     Requirements: agents.8.3 */
  test('should have header height of 64px', async () => {
    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 10000 });

    const header = window.locator('[data-testid="agent-header"]').first();
    await expect(header).toBeVisible();

    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();
    const headerHeight = headerBox!.height;

    // h-16 = 64px
    expect(headerHeight).toBe(64);
  });

  /* Preconditions: User is on Agents page with multiple agents
     Action: Check that agent list has space to expand within its 50% section
     Assertions: Agent list container has 50% width and can display multiple agents, list expands to fill available width
     Requirements: agents.8.2, agents.1.7 */
  test('should allow agent list to expand within 50% section', async () => {
    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 10000 });

    // Create multiple agents to test expansion
    for (let i = 0; i < 10; i++) {
      await window.evaluate(async () => {
        await window.api.agents.create();
      });
    }

    await expect
      .poll(
        async () => {
          const count = await window.locator('[data-testid^="agent-icon-"]').count();
          const plusCount = await window.locator('[data-testid="all-agents-button"]').count();
          return count > 1 || plusCount > 0;
        },
        { timeout: 5000 }
      )
      .toBe(true);

    const header = window.locator('[data-testid="agent-header"]').first();
    const rightSection = window.locator('[data-testid="agent-header-right"]');

    const headerBox = await header.boundingBox();
    const rightBox = await rightSection.boundingBox();

    expect(headerBox).not.toBeNull();
    expect(rightBox).not.toBeNull();

    const headerWidth = headerBox!.width;
    const rightWidth = rightBox!.width;

    // Right section has flex-1, so it gets 50% of available space
    // Available space = headerWidth - gap (24px)
    const gap = 24;
    const expectedSectionWidth = (headerWidth - gap) / 2;

    // Allow 30px tolerance for content-based sizing
    expect(rightWidth).toBeGreaterThanOrEqual(expectedSectionWidth - 30);
    expect(rightWidth).toBeLessThanOrEqual(expectedSectionWidth + 30);

    // Verify agent list has multiple agents visible or +N button
    const agentIcons = rightSection
      .locator('[title]')
      .filter({ hasNot: window.locator('text=New chat') });
    const agentCount = await agentIcons.count();

    // Should have at least 1 agent icon visible
    expect(agentCount).toBeGreaterThan(0);

    // Check if +N button exists (means some agents are hidden)
    const plusButton = rightSection.locator('text=/^\\+\\d+$/');
    const hasPlusButton = (await plusButton.count()) > 0;

    // Either we have multiple visible agents or a +N button
    expect(agentCount > 1 || hasPlusButton).toBe(true);
  });
});
