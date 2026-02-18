/**
 * Functional Tests: Agent Switching
 *
 * Tests for switching between agents and loading messages.
 * Requirements: agents.3
 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  // Start mock OAuth server for all tests
  mockServer = new MockOAuthServer({
    port: 8897,
    clientId: 'test-client-id-12345',
    clientSecret: 'test-client-secret-67890',
  });
  await mockServer.start();
});

test.afterAll(async () => {
  // Stop mock OAuth server
  if (mockServer) {
    await mockServer.stop();
  }
});

test.describe('Agent Switching', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    // Set user profile data for tests
    mockServer.setUserProfile({
      id: '070FF5B782',
      email: 'switching.test@example.com',
      name: 'Switching Test User',
      given_name: 'Switching',
      family_name: 'Test User',
    });

    // Create unique temp directory for this test
    const testDataPath = path.join(
      require('os').tmpdir(),
      `clerkly-switching-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    // Launch Electron app with clean state
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

    // Complete OAuth flow to get to agents page
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 10000 });
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  /* Preconditions: User is logged in, agents page is loaded
     Action: Click on agent icon in list
     Assertions: Agent becomes active, visual indicator updates
     Requirements: agents.3.1, agents.3.3 */
  test('should switch active agent on click', async () => {
    // Create multiple agents
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();
    await window.waitForTimeout(500);
    await newChatButton.click();
    await window.waitForTimeout(500);

    // Get all agent icons
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(3, { timeout: 5000 });

    // Get first and second agent icons
    const firstIcon = agentIcons.nth(0);
    const secondIcon = agentIcons.nth(1);

    // First agent should be active initially
    await expect(firstIcon).toHaveClass(/ring-2 ring-primary/);

    // Click on second agent
    await secondIcon.click();
    await window.waitForTimeout(300);

    // Second agent should now be active
    await expect(secondIcon).toHaveClass(/ring-2 ring-primary/);
    await expect(firstIcon).not.toHaveClass(/ring-2 ring-primary/);
  });

  /* Preconditions: Multiple agents exist with messages
     Action: Switch to different agent
     Assertions: Messages for selected agent are loaded and displayed
     Requirements: agents.3.2 */
  test('should load messages for selected agent', async () => {
    // Create second agent
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();
    await window.waitForTimeout(500);

    // Send message to first agent
    const messageInput = window.locator('textarea[placeholder*="Ask"]');
    await messageInput.fill('Message for agent 1');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    // Get agent icons
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const firstIcon = agentIcons.nth(0);

    // Switch to second agent
    const secondIcon = agentIcons.nth(1);
    await secondIcon.click();
    await window.waitForTimeout(300);

    // Send message to second agent
    await messageInput.fill('Message for agent 2');
    await messageInput.press('Enter');
    await window.waitForTimeout(500);

    // Switch back to first agent
    await firstIcon.click();
    await window.waitForTimeout(300);

    // Check that first agent's message is displayed
    const messages = window.locator('[data-testid="message"]');
    const messageTexts = await messages.allTextContents();
    expect(messageTexts.some((text) => text.includes('Message for agent 1'))).toBe(true);
    expect(messageTexts.some((text) => text.includes('Message for agent 2'))).toBe(false);

    // Switch to second agent
    await secondIcon.click();
    await window.waitForTimeout(300);

    // Check that second agent's message is displayed
    const messages2 = window.locator('[data-testid="message"]');
    const messageTexts2 = await messages2.allTextContents();
    expect(messageTexts2.some((text) => text.includes('Message for agent 2'))).toBe(true);
    expect(messageTexts2.some((text) => text.includes('Message for agent 1'))).toBe(false);
  });

  /* Preconditions: Multiple agents exist
     Action: Switch between agents rapidly
     Assertions: Switching happens quickly (< 100ms per switch)
     Requirements: agents.3.4 */
  test('should switch agents quickly (< 100ms)', async () => {
    // Create multiple agents
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();
    await window.waitForTimeout(500);
    await newChatButton.click();
    await window.waitForTimeout(500);

    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(3);

    // Measure switching time
    const secondIcon = agentIcons.nth(1);

    const startTime = Date.now();
    await secondIcon.click();

    // Wait for active indicator to update
    await expect(secondIcon).toHaveClass(/ring-2 ring-primary/, { timeout: 200 });

    const switchTime = Date.now() - startTime;

    // Should be < 100ms
    expect(switchTime).toBeLessThan(100);
  });

  /* Preconditions: Agent exists
     Action: Hover over agent icon
     Assertions: Tooltip shows agent name and status
     Requirements: agents.3.5 */
  test('should show tooltip with agent info on hover', async () => {
    const agentIcon = window.locator('[data-testid^="agent-icon-"]').first();

    // Hover over icon
    await agentIcon.hover();
    await window.waitForTimeout(300);

    // Check tooltip (title attribute)
    const title = await agentIcon.getAttribute('title');
    expect(title).toBeTruthy();
    expect(title).toContain('New Agent');
    expect(title).toMatch(/New|In progress|Awaiting response|Error|Completed/);
  });
});
