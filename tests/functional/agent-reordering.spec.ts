/* Preconditions: User logged in, multiple agents exist
   Action: Send message to agent that is not in header (lower in list)
   Assertions: 
   - Agent moves to the top of the list after message is sent
   - Agent appears in header if it wasn't visible before
   - Order is maintained by updatedAt timestamp
   Requirements: agents.1.3, agents.1.4, agents.5.7 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  closeElectron,
  createMockOAuthServer,
  activeChat,
  launchElectronWithMockOAuth,
  completeOAuthFlow,
  expectAgentsVisible,
  getAgentIdsFromHeader,
} from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';

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
  let testDataPath: string;

  test.beforeEach(async () => {
    // Set user profile data for tests
    mockServer.setUserProfile({
      id: '070FF5B782',
      email: 'reorder.test@example.com',
      name: 'Reorder Test User',
      given_name: 'Reorder',
      family_name: 'Test User',
    });

    const context = await launchElectronWithMockOAuth(mockServer);
    electronApp = context.app;
    window = context.window;
    testDataPath = context.testDataPath;

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);
  });

  test.afterEach(async () => {
    await closeElectron({ app: electronApp, window, testDataPath }, true, false);
  });

  /* Preconditions: Multiple agents created with different updatedAt times
     Action: Send message to older agent
     Assertions: Agent moves to top of list
     Requirements: agents.1.3, agents.1.4, agents.5.7 */
  test('should move agent to top of list after sending message', async () => {
    // Wait for agents page to load
    await expectAgentsVisible(window, 5000);

    // Create 3 more agents (total 4 agents)
    const newAgentButton = window.locator('div[title="New chat"]');
    await expect(newAgentButton).toBeVisible({ timeout: 3000 });
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 3000 });

    for (let i = 0; i < 3; i++) {
      await newAgentButton.click();
      await expect(agentIcons).toHaveCount(i + 2, { timeout: 3000 });
    }

    // Verify we have 4 agents
    await expect(agentIcons).toHaveCount(4, { timeout: 3000 });

    // Get the first agent ID (most recent)
    const firstAgentId = await agentIcons.first().getAttribute('data-testid');
    expect(firstAgentId).toBeTruthy();

    // Click on the last agent (oldest)
    await agentIcons.last().click();

    // Get the last agent ID before sending message
    const lastAgentId = await agentIcons.last().getAttribute('data-testid');
    expect(lastAgentId).toBeTruthy();
    expect(lastAgentId).not.toBe(firstAgentId);

    // Send a message to the last agent
    const textarea = activeChat(window).textarea;
    await expect(textarea).toBeVisible();
    await textarea.fill('Test message to update timestamp');
    await textarea.press('Enter');

    // Verify that the agent moved to the top
    await expect
      .poll(
        async () => {
          return await agentIcons.first().getAttribute('data-testid');
        },
        { timeout: 10000 }
      )
      .toBe(lastAgentId);
  });

  /* Preconditions: Many agents exist, some not visible in header
     Action: Open AllAgents, select agent from bottom, send message
     Assertions: Agent appears in header after message
     Requirements: agents.1.3, agents.1.4, agents.5.7 */
  test('should bring hidden agent to header after sending message', async () => {
    // Wait for agents page to load
    await expectAgentsVisible(window, 5000);

    // Create 9 more agents (total 10 agents, some will be hidden)
    const newAgentButton = window.locator('div[title="New chat"]');
    await expect(newAgentButton).toBeVisible({ timeout: 3000 });
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 3000 });

    for (let i = 0; i < 9; i++) {
      await newAgentButton.click();
    }
    await expect
      .poll(
        async () => {
          const visibleCount = await agentIcons.count();
          const hiddenText = await allAgentsButton.textContent();
          const hiddenCount = hiddenText ? Number(hiddenText.replace('+', '')) || 0 : 0;
          return visibleCount + hiddenCount;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThanOrEqual(10);

    // Baseline: capture currently visible header agents before selecting from AllAgents.
    const headerAgentIdsBeforeSelection = await getAgentIdsFromHeader(window);
    expect(headerAgentIdsBeforeSelection.length).toBeGreaterThan(0);

    // Open AllAgents page by clicking +N button
    await allAgentsButton.click();

    // Verify AllAgents page is shown
    await expect(window.locator('text=All Agents')).toBeVisible();

    // Get all agent cards
    const agentCards = window.locator('[data-testid^="agent-card-"]');
    const cardCount = await agentCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(10);

    // Click on the last agent card (oldest)
    const lastCard = agentCards.last();
    const lastCardId = await lastCard.getAttribute('data-testid');
    const lastAgentId = lastCardId?.replace('agent-card-', '');
    expect(lastAgentId).toBeTruthy();
    // Baseline: selected agent is hidden before send; otherwise scenario is invalid.
    expect(headerAgentIdsBeforeSelection).not.toContain(lastAgentId as string);
    await lastCard.click();

    // Verify we're back to chat view
    await expect(window.locator('text=All Agents')).not.toBeVisible({ timeout: 3000 });

    // Re-acquire active chat input after agent selection from AllAgents.
    // The previous locator can point to stale/hidden chat instance.
    const selectedAgentTextarea = activeChat(window).textarea;
    await expect(selectedAgentTextarea).toBeVisible();
    await selectedAgentTextarea.fill('Message to bring agent to top');
    await selectedAgentTextarea.press('Enter');

    // Wait until selected agent moves to the first header slot after updatedAt refresh.
    await window.waitForFunction(
      (expectedAgentId) => {
        const firstIcon = document.querySelector('[data-testid^="agent-icon-"]');
        const firstIconTestId = firstIcon?.getAttribute('data-testid');
        const firstAgentId = firstIconTestId?.replace('agent-icon-', '');
        return firstAgentId === expectedAgentId;
      },
      lastCardId?.replace('agent-card-', ''),
      { timeout: 10000 }
    );

    // The agent should now be first in the list.
    const firstIconId = await agentIcons.first().getAttribute('data-testid');

    // Extract agent ID from icon ID
    const firstAgentIdInHeader = firstIconId?.replace('agent-icon-', '');

    expect(firstAgentIdInHeader).toBe(lastAgentId);
  });

  /* Preconditions: Multiple agents with messages
     Action: Send messages to different agents in sequence
     Assertions: Order changes dynamically based on updatedAt
     Requirements: agents.1.3, agents.1.4, agents.5.7 */
  test('should maintain correct order when multiple agents are updated', async () => {
    // Wait for agents page to load
    await expectAgentsVisible(window, 5000);

    // Create 2 more agents (total 3 agents)
    const newAgentButton = window.locator('div[title="New chat"]');
    await expect(newAgentButton).toBeVisible({ timeout: 3000 });
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 3000 });

    for (let i = 0; i < 2; i++) {
      await newAgentButton.click();
      await expect(agentIcons).toHaveCount(i + 2, { timeout: 3000 });
    }

    // Get agent icons
    await expect(agentIcons).toHaveCount(3, { timeout: 3000 });

    // Get initial order
    const agent1Id = await agentIcons.nth(0).getAttribute('data-testid');
    const agent2Id = await agentIcons.nth(1).getAttribute('data-testid');
    const agent3Id = await agentIcons.nth(2).getAttribute('data-testid');

    // Send message to agent 3 (last)
    await agentIcons.nth(2).click();
    let textarea = activeChat(window).textarea;
    await expect(textarea).toBeVisible({ timeout: 3000 });
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

    await expect
      .poll(
        async () => {
          return await agentIcons.first().getAttribute('data-testid');
        },
        { timeout: 5000 }
      )
      .toBe(agent3Id);

    // Send message to agent 2 (find by ID with proper locator)
    const agent2Icon = window.locator(`[data-testid="${agent2Id}"]`);
    await expect(agent2Icon).toBeVisible({ timeout: 3000 });
    await agent2Icon.click();
    textarea = activeChat(window).textarea;
    await expect(textarea).toBeVisible({ timeout: 3000 });

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

    await expect
      .poll(
        async () => {
          return await agentIcons.first().getAttribute('data-testid');
        },
        { timeout: 5000 }
      )
      .toBe(agent2Id);

    // Send message to agent 1 (find by ID with proper locator)
    const agent1Icon = window.locator(`[data-testid="${agent1Id}"]`);
    await expect(agent1Icon).toBeVisible({ timeout: 3000 });
    await agent1Icon.click();
    textarea = activeChat(window).textarea;
    await expect(textarea).toBeVisible({ timeout: 3000 });

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

    await expect
      .poll(
        async () => {
          return await agentIcons.first().getAttribute('data-testid');
        },
        { timeout: 5000 }
      )
      .toBe(agent1Id);
  });

  /* Preconditions: Agent selected from AllAgents
     Action: Send message immediately after selection
     Assertions: Agent moves to top without delay
     Requirements: agents.1.3, agents.1.4, agents.5.7 */
  test('should reorder immediately after message from AllAgents selection', async () => {
    // Wait for agents page to load
    await expectAgentsVisible(window, 5000);

    // Create 9 more agents (total 10 agents, so +N button will appear)
    const newAgentButton = window.locator('div[title="New chat"]');
    await expect(newAgentButton).toBeVisible({ timeout: 3000 });
    const agentIcons = window.locator('[data-testid^="agent-icon-"]');
    const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
    await expect(agentIcons).toHaveCount(1, { timeout: 3000 });

    for (let i = 0; i < 9; i++) {
      await newAgentButton.click();
    }
    await expect
      .poll(
        async () => {
          const visibleCount = await agentIcons.count();
          const hiddenText = await allAgentsButton.textContent();
          const hiddenCount = hiddenText ? Number(hiddenText.replace('+', '')) || 0 : 0;
          return visibleCount + hiddenCount;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThanOrEqual(10);

    // Send message to first agent to create history
    let textarea = activeChat(window).textarea;
    await expect(textarea).toBeVisible({ timeout: 3000 });
    await textarea.fill('Initial message');
    await textarea.press('Enter');

    const headerAgentIds = await getAgentIdsFromHeader(window);
    expect(headerAgentIds.length).toBeGreaterThan(1);
    const selectedAgentId = headerAgentIds[headerAgentIds.length - 1];

    // Open AllAgents by clicking +N button
    await allAgentsButton.click();
    await expect(window.locator('text=All Agents')).toBeVisible({ timeout: 3000 });

    const selectedCard = window.locator(`[data-testid="agent-card-${selectedAgentId}"]`);
    await expect(selectedCard).toBeVisible({ timeout: 3000 });
    await selectedCard.click();
    await expect(window.locator('text=All Agents')).not.toBeVisible({ timeout: 3000 });
    await expect(window.locator(`[data-testid="agent-icon-${selectedAgentId}"]`)).toHaveClass(
      /ring-2/,
      { timeout: 5000 }
    );

    // Send message immediately
    textarea = activeChat(window).textarea;
    await expect(textarea).toBeVisible({ timeout: 3000 });
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
    const firstIconTestId = await agentIcons.first().getAttribute('data-testid');
    const firstAgentId = firstIconTestId?.replace('agent-icon-', '');
    expect(firstAgentId).toBe(selectedAgentId);
  });
});
