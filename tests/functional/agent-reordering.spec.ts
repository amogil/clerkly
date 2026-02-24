/* Preconditions: User logged in, multiple agents exist
   Action: Send message to agent that is not in header (lower in list)
   Assertions: 
   - Agent moves to the top of the list after message is sent
   - Agent appears in header if it wasn't visible before
   - Order is maintained by updatedAt timestamp
   Requirements: agents.1.3, agents.1.4, agents.5.7 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { createMockOAuthServer } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer();
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.describe('Agent Reordering', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    // Set user profile data for tests
    mockServer.setUserProfile({
      id: '070FF5B782',
      email: 'reorder.test@example.com',
      name: 'Reorder Test User',
      given_name: 'Reorder',
      family_name: 'Test User',
    });

    // Create unique temp directory for this test
    const testDataPath = path.join(
      require('os').tmpdir(),
      `clerkly-reorder-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
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

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  /* Preconditions: Multiple agents created with different updatedAt times
     Action: Send message to older agent
     Assertions: Agent moves to top of list
     Requirements: agents.1.3, agents.1.4, agents.5.7 */
  test('should move agent to top of list after sending message', async () => {
    // Wait for agents page to load
    await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

    // Wait for first agent to be auto-created
    await window.waitForTimeout(1000);

    // Create 3 more agents (total 4 agents)
    const newAgentButton = window.locator('div[title="New chat"]');
    await expect(newAgentButton).toBeVisible({ timeout: 3000 });

    for (let i = 0; i < 3; i++) {
      await newAgentButton.click();
      await window.waitForTimeout(500);
    }

    // Verify we have 4 agents
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(4, { timeout: 3000 });

    // Get the first agent ID (most recent)
    const firstAgentId = await agentIcons.first().getAttribute('data-testid');
    expect(firstAgentId).toBeTruthy();

    // Click on the last agent (oldest)
    await agentIcons.last().click();
    await window.waitForTimeout(300);

    // Get the last agent ID before sending message
    const lastAgentId = await agentIcons.last().getAttribute('data-testid');
    expect(lastAgentId).toBeTruthy();
    expect(lastAgentId).not.toBe(firstAgentId);

    // Send a message to the last agent
    const textarea = window.locator('textarea[placeholder*="Ask"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Test message to update timestamp');
    await textarea.press('Enter');
    await window.waitForTimeout(1000);

    // Verify that the agent moved to the top
    const newFirstAgentId = await agentIcons.first().getAttribute('data-testid');
    expect(newFirstAgentId).toBe(lastAgentId);
  });

  /* Preconditions: Many agents exist, some not visible in header
     Action: Open AllAgents, select agent from bottom, send message
     Assertions: Agent appears in header after message
     Requirements: agents.1.3, agents.1.4, agents.5.7 */
  test('should bring hidden agent to header after sending message', async () => {
    // Wait for agents page to load
    await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

    // Wait for first agent to be auto-created
    await window.waitForTimeout(1000);

    // Create 9 more agents (total 10 agents, some will be hidden)
    const newAgentButton = window.locator('div[title="New chat"]');
    await expect(newAgentButton).toBeVisible({ timeout: 3000 });

    for (let i = 0; i < 9; i++) {
      await newAgentButton.click();
      await window.waitForTimeout(300);
    }

    // Send a message to the first agent to ensure it has history
    const textarea = window.locator('textarea[placeholder*="Ask"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Initial message');
    await textarea.press('Enter');
    await window.waitForTimeout(500);

    // Open AllAgents page by clicking +N button
    const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
    await allAgentsButton.click();
    await window.waitForTimeout(500);

    // Verify AllAgents page is shown
    await expect(window.locator('text=All Agents')).toBeVisible();

    // Get all agent cards
    const agentCards = window.locator('[data-testid^="agent-card-"]');
    const cardCount = await agentCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(10);

    // Click on the last agent card (oldest)
    const lastCard = agentCards.last();
    const lastCardId = await lastCard.getAttribute('data-testid');
    await lastCard.click();
    await window.waitForTimeout(500);

    // Verify we're back to chat view
    await expect(window.locator('text=All Agents')).not.toBeVisible();

    // Send a message to this agent
    await expect(textarea).toBeVisible();
    await textarea.fill('Message to bring agent to top');
    await textarea.press('Enter');
    await window.waitForTimeout(1000);

    // Get agent icons in header
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');

    // The agent should now be first in the list
    const firstIconId = await agentIcons.first().getAttribute('data-testid');

    // Extract agent ID from card and icon IDs
    const lastAgentId = lastCardId?.replace('agent-card-', '');
    const firstAgentIdInHeader = firstIconId?.replace('agent-icon-', '');

    expect(firstAgentIdInHeader).toBe(lastAgentId);
  });

  /* Preconditions: Multiple agents with messages
     Action: Send messages to different agents in sequence
     Assertions: Order changes dynamically based on updatedAt
     Requirements: agents.1.3, agents.1.4, agents.5.7 */
  test('should maintain correct order when multiple agents are updated', async () => {
    // Wait for agents page to load
    await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

    // Wait for first agent to be auto-created
    await window.waitForTimeout(1000);

    // Create 2 more agents (total 3 agents)
    const newAgentButton = window.locator('div[title="New chat"]');
    await expect(newAgentButton).toBeVisible({ timeout: 3000 });

    for (let i = 0; i < 2; i++) {
      await newAgentButton.click();
      await window.waitForTimeout(500);
    }

    // Get agent icons
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(3, { timeout: 3000 });

    // Get initial order
    const agent1Id = await agentIcons.nth(0).getAttribute('data-testid');
    const agent2Id = await agentIcons.nth(1).getAttribute('data-testid');
    const agent3Id = await agentIcons.nth(2).getAttribute('data-testid');

    // Send message to agent 3 (last)
    await agentIcons.nth(2).click();
    await window.waitForTimeout(300);

    const textarea = window.locator('textarea[placeholder*="Ask"]');
    await textarea.fill('Message to agent 3');
    await textarea.press('Enter');

    // Wait for agent 3 to move to first position
    await window.waitForFunction(
      (expectedId) => {
        const firstIcon = document.querySelector('[data-testid^="agent-icon-"]');
        return firstIcon && firstIcon.getAttribute('data-testid') === expectedId;
      },
      agent3Id,
      { timeout: 5000 }
    );

    // Agent 3 should now be first
    let currentFirstId = await agentIcons.first().getAttribute('data-testid');
    expect(currentFirstId).toBe(agent3Id);

    // Wait for UI to fully stabilize and animations to complete
    await window.waitForTimeout(1000);

    // Send message to agent 2 (find by ID with proper locator)
    const agent2Icon = window.locator(`[data-testid="${agent2Id}"]`);
    await expect(agent2Icon).toBeVisible({ timeout: 3000 });
    await agent2Icon.click();
    await window.waitForTimeout(500);

    await textarea.fill('Message to agent 2');
    await textarea.press('Enter');

    // Wait for agent 2 to move to first position (longer timeout)
    await window.waitForFunction(
      (expectedId) => {
        const firstIcon = document.querySelector('[data-testid^="agent-icon-"]');
        return firstIcon && firstIcon.getAttribute('data-testid') === expectedId;
      },
      agent2Id,
      { timeout: 10000 }
    );

    // Agent 2 should now be first
    currentFirstId = await agentIcons.first().getAttribute('data-testid');
    expect(currentFirstId).toBe(agent2Id);

    // Wait for UI to fully stabilize and animations to complete
    await window.waitForTimeout(1000);

    // Send message to agent 1 (find by ID with proper locator)
    const agent1Icon = window.locator(`[data-testid="${agent1Id}"]`);
    await expect(agent1Icon).toBeVisible({ timeout: 3000 });
    await agent1Icon.click();
    await window.waitForTimeout(500);

    await textarea.fill('Message to agent 1');
    await textarea.press('Enter');

    // Wait for agent 1 to move to first position (longer timeout)
    await window.waitForFunction(
      (expectedId) => {
        const firstIcon = document.querySelector('[data-testid^="agent-icon-"]');
        return firstIcon && firstIcon.getAttribute('data-testid') === expectedId;
      },
      agent1Id,
      { timeout: 10000 }
    );

    // Agent 1 should now be first
    currentFirstId = await agentIcons.first().getAttribute('data-testid');
    expect(currentFirstId).toBe(agent1Id);
  });

  /* Preconditions: Agent selected from AllAgents
     Action: Send message immediately after selection
     Assertions: Agent moves to top without delay
     Requirements: agents.1.3, agents.1.4, agents.5.7 */
  test('should reorder immediately after message from AllAgents selection', async () => {
    // Wait for agents page to load
    await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

    // Wait for first agent to be auto-created
    await window.waitForTimeout(1000);

    // Create 9 more agents (total 10 agents, so +N button will appear)
    const newAgentButton = window.locator('div[title="New chat"]');
    await expect(newAgentButton).toBeVisible({ timeout: 3000 });

    for (let i = 0; i < 9; i++) {
      await newAgentButton.click();
      await window.waitForTimeout(300);
    }

    // Send message to first agent to create history
    const textarea = window.locator('textarea[placeholder*="Ask"]');
    await textarea.fill('Initial message');
    await textarea.press('Enter');
    await window.waitForTimeout(500);

    // Open AllAgents by clicking +N button
    const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
    await allAgentsButton.click();
    await window.waitForTimeout(500);

    // Get ID of last agent card in AllAgents (oldest agent)
    const agentCards = window.locator('[data-testid^="agent-card-"]');
    const lastCard = agentCards.last();
    const lastCardTestId = await lastCard.getAttribute('data-testid');
    // Extract agentId from "agent-card-{agentId}"
    const selectedAgentId = lastCardTestId?.replace('agent-card-', '') || '';
    console.log('[TEST] Selected agent from AllAgents:', selectedAgentId);

    // Click on last agent card
    await lastCard.click();
    await window.waitForTimeout(500);

    // Send message immediately
    await textarea.fill('Quick message after selection');
    await textarea.press('Enter');

    // Wait for agent to move to first position in header (longer timeout)
    await window.waitForFunction(
      (expectedAgentId) => {
        const firstIcon = document.querySelector('[data-testid^="agent-icon-"]');
        const firstIconTestId = firstIcon?.getAttribute('data-testid');
        // firstIconTestId is "agent-icon-{agentId}", extract agentId
        const firstAgentId = firstIconTestId?.replace('agent-icon-', '');
        return firstAgentId === expectedAgentId;
      },
      selectedAgentId,
      { timeout: 10000 }
    );

    // Verify agent is now first
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const firstIconTestId = await agentIcons.first().getAttribute('data-testid');
    const firstAgentId = firstIconTestId?.replace('agent-icon-', '');
    expect(firstAgentId).toBe(selectedAgentId);
  });
});
