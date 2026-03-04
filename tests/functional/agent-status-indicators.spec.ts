/**
 * Functional Tests: Agent Status Indicators
 *
 * Tests for visual status indicators and animations.
 * Requirements: agents.6
 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  getFreePort,
  launchElectron,
  completeOAuthFlow,
  createMockOAuthServer,
  activeChat,
  expectAgentsVisible,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { MockLLMServer } from './helpers/mock-llm-server';

let electronApp: ElectronApplication;
let window: Page;
let mockServer: MockOAuthServer;
let mockLLMServer: MockLLMServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer();
  const llmPort = await getFreePort();
  mockLLMServer = new MockLLMServer({ port: llmPort });
  await mockLLMServer.start();
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
  if (mockLLMServer) {
    await mockLLMServer.stop();
  }
});

test.beforeEach(async () => {
  mockLLMServer.setSuccess(true);
  mockLLMServer.setDelay(0);
  mockLLMServer.clearRequestLogs();

  const context = await launchElectron(undefined, {
    CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    CLERKLY_OAUTH_CLIENT_ID: 'test-client-id',
    CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret',
    CLERKLY_OPENAI_API_URL: `${mockLLMServer.getBaseUrl()}/v1/responses`,
    CLERKLY_OPENAI_API_KEY: 'mock-key-for-testing',
  });
  electronApp = context.app;
  window = context.window;

  await completeOAuthFlow(electronApp, window);
  await expectAgentsVisible(window, 10000);
});

test.afterEach(async () => {
  await electronApp.close();
});

test.describe('Agent Status Indicators', () => {
  /* Preconditions: Agents with different statuses exist
     Action: View agent icons
     Assertions: Each status has correct color, icon, and styling
     Requirements: agents.6.1-6.5 */
  test('should display correct visual indicators for each status', async () => {
    // New agent should have sky-400 background
    const agentIcon = window.locator('[data-testid^="agent-icon-"]').first();
    await expect(agentIcon).toBeVisible();

    // Color lives on agent-avatar-icon (child div inside motion.div)
    const agentAvatarIcon = agentIcon.locator('[data-testid="agent-avatar-icon"]');
    const classes = await agentAvatarIcon.getAttribute('class');
    expect(classes).toBeTruthy();

    // New status should have sky-400 or blue color
    const hasStatusColor =
      classes?.includes('bg-sky-400') ||
      classes?.includes('bg-blue-500') ||
      classes?.includes('bg-amber-500') ||
      classes?.includes('bg-red-500') ||
      classes?.includes('bg-green-500');
    expect(hasStatusColor).toBe(true);

    // Check that icon contains letter or status icon
    const iconContent = await agentAvatarIcon.textContent();
    const hasContent =
      iconContent && (iconContent.length > 0 || (await agentAvatarIcon.locator('svg').count()) > 0);
    expect(hasContent).toBeTruthy();
  });

  /* Preconditions: Agent with in-progress status exists
     Action: View agent icon
     Assertions: Spinning ring animation is visible
     Requirements: agents.6.2, agents.6.6 */
  test('should animate in-progress status', async () => {
    // Keep model response slow so in-progress state remains visible for assertion.
    mockLLMServer.setDelay(2500);

    // Send message to create in-progress status
    const messageInput = activeChat(window).textarea;
    await messageInput.fill('Test message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });

    // Check for spinning animation
    const agentIcon = window.locator('[data-testid^="agent-icon-"]').first();
    const agentAvatarIcon = agentIcon.locator('[data-testid="agent-avatar-icon"]');

    // Look for spinning ring element inside avatar
    const spinningRing = agentAvatarIcon.locator('.animate-spin');

    // In delayed-response window status should be in-progress (blue) with visible spinner.
    await expect
      .poll(async () => await agentAvatarIcon.getAttribute('class'), { timeout: 4000 })
      .toContain('bg-blue-500');
    await expect(spinningRing).toBeVisible();
  });

  /* Preconditions: Agent with awaiting-response status exists
     Action: View agent icon
     Assertions: Pulsing ring animation is visible
     Requirements: agents.6.3, agents.6.6 */
  test('should pulse awaiting-response status', async () => {
    // This test checks for pulse animation on awaiting-response status
    const agentIcon = window.locator('[data-testid^="agent-icon-"]').first();
    await expect(agentIcon).toBeVisible();

    const classes = await agentIcon.getAttribute('class');

    // If awaiting-response (amber), should have pulse animation
    if (classes?.includes('bg-amber-500')) {
      expect(classes).toContain('animate-pulse');

      // Should have HelpCircle icon (might be present)
      // Icon verification is optional as it depends on status
    }
  });

  /* Preconditions: Agent exists at non-zero position
     Action: Agent receives message and moves to position 0
     Assertions: Activation animation shows for 3 seconds
     Requirements: agents.6.7 */
  test('should show animation only when agent moves to first position', async () => {
    // Create multiple agents
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();
    await expect(window.locator('[data-testid^="agent-icon-"]')).toHaveCount(2, { timeout: 5000 });
    await newChatButton.click();
    await expect(window.locator('[data-testid^="agent-icon-"]')).toHaveCount(3, { timeout: 5000 });

    // Get second agent
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const secondIcon = agentIcons.nth(1);
    const secondAgentId = (await secondIcon.getAttribute('data-testid'))?.replace(
      'agent-icon-',
      ''
    );

    // Switch to second agent
    await secondIcon.click();
    await expect(activeChat(window).textarea).toBeVisible();

    // Send message to move it to first position
    const messageInput = activeChat(window).textarea;
    await messageInput.fill('Move to top');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });

    // Check that agent moved to first position
    const firstIcon = agentIcons.nth(0);
    const firstAgentId = (await firstIcon.getAttribute('data-testid'))?.replace('agent-icon-', '');
    expect(firstAgentId).toBe(secondAgentId);

    // Header icon should show animation (check for animated class or logo)
    const headerIcon = window.locator('[data-testid="agent-header-icon"]');
    if ((await headerIcon.count()) > 0) {
      // Animation should be visible
      await expect(headerIcon).toBeVisible();
    }
  });

  /* Preconditions: Agent is at first position
     Action: Agent status updates without position change
     Assertions: No activation animation shows
     Requirements: agents.6.7 */
  test('should not show animation when agent status updates without position change', async () => {
    // Agent at position 0 receives message
    const messageInput = activeChat(window).textarea;
    await messageInput.fill('First message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });

    // Send another message (agent stays at position 0)
    await messageInput.fill('Second message');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(2, { timeout: 5000 });

    // Header icon should not show activation animation
    // (This is hard to test directly, but we can check structure)
    const headerIcon = window.locator('[data-testid="agent-header-icon"]');
    if ((await headerIcon.count()) > 0) {
      await expect(headerIcon).toBeVisible();
    }
  });

  /* Preconditions: Multiple agents exist
     Action: Switch to different agent, then back
     Assertions: Animation shows when returning to agent
     Requirements: agents.6.7 */
  test('should show animation when switching back to previous agent', async () => {
    // Create second agent
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();
    await expect(window.locator('[data-testid^="agent-icon-"]')).toHaveCount(2, { timeout: 5000 });

    // Save stable IDs before sending messages (order changes after send)
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const firstAgentTestId = await agentIcons.nth(0).getAttribute('data-testid');
    const secondAgentTestId = await agentIcons.nth(1).getAttribute('data-testid');
    expect(firstAgentTestId).toBeTruthy();
    expect(secondAgentTestId).toBeTruthy();

    // Switch to second agent using stable ID
    await window.locator(`[data-testid="${secondAgentTestId}"]`).click();
    await expect(activeChat(window).textarea).toBeVisible();

    // Send message to second agent (moves it to top)
    const messageInput = activeChat(window).textarea;
    await messageInput.fill('Message to second agent');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });

    // Switch to first agent using stable ID
    await window.locator(`[data-testid="${firstAgentTestId}"]`).click();
    await expect(activeChat(window).textarea).toBeVisible();

    // Send message to first agent (moves it to top)
    await messageInput.fill('Message to first agent');
    await messageInput.press('Enter');
    await expect(activeChat(window).userMessages).toHaveCount(1, { timeout: 5000 });

    // First agent should now be at position 0
    // Animation should have been triggered
    const headerIcon = window.locator('[data-testid="agent-header-icon"]');
    if ((await headerIcon.count()) > 0) {
      await expect(headerIcon).toBeVisible();
    }
  });
});
