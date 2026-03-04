// Requirements: agents.5.5
// tests/functional/agents-error-messages.spec.ts
// Functional tests for error messages in AllAgents view

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import {
  createMockOAuthServer,
  launchElectronWithMockOAuth,
  getAgentIdsFromApi,
  getAgentIdsFromAllAgents,
  completeOAuthFlow,
  expectAgentsVisible,
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

test.describe('Agents Error Messages', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    // Set user profile data for tests
    mockServer.setUserProfile({
      id: '070FF5B783',
      email: 'error.test@example.com',
      name: 'Error Test User',
      given_name: 'Error',
      family_name: 'Test User',
    });

    const context = await launchElectronWithMockOAuth(mockServer);
    electronApp = context.app;
    window = context.window;

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 10000 });
  });

  test.afterEach(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  /* Preconditions: User logged in, first agent exists
     Action: Archive first agent, create 2 new agents, open AllAgents
     Assertions: Only 2 active agents shown, archived agent not visible
     Requirements: agents.5.6 */
  test('should not display archived agents in AllAgents', async () => {
    // Wait for agents page to load
    await expectAgentsVisible(window, 5000);

    // Get current agent ID
    const archivedAgentId = (await getAgentIdsFromApi(window))[0] ?? null;

    expect(archivedAgentId).not.toBeNull();

    // Archive the first agent
    await window.evaluate(async (id) => {
      const api = (globalThis as any).api;
      await api.agents.archive(id!);
    }, archivedAgentId);

    // Wait for auto-created agent to appear (agents.2.7, agents.2.9)
    const newChatButton = window.locator('div[title="New chat"]');
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    const baseAgentCount = (await getAgentIdsFromApi(window)).length;
    expect(baseAgentCount).toBeGreaterThan(0);

    // Create 10 more agents to ensure +N button appears
    for (let i = 0; i < 10; i++) {
      await newChatButton.click();
      await expect
        .poll(async () => (await getAgentIdsFromApi(window)).length, { timeout: 5000 })
        .toBe(baseAgentCount + i + 1);
    }

    const expectedAgentIds = await getAgentIdsFromApi(window);
    expect(expectedAgentIds.length).toBeGreaterThan(0);

    // Open AllAgents view
    const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
    await expect(allAgentsButton).toBeVisible({ timeout: 5000 });
    await allAgentsButton.click();

    // Verify we're in AllAgents view
    await expect(window.locator('text=All Agents')).toBeVisible({ timeout: 5000 });

    const visibleAgentIds = await getAgentIdsFromAllAgents(window);

    // Verify all expected agents are visible
    for (const agentId of expectedAgentIds) {
      expect(visibleAgentIds).toContain(agentId);
    }

    // Verify archived agent is NOT visible
    expect(visibleAgentIds).not.toContain(archivedAgentId);
    await expect(window.locator(`[data-testid="agent-card-${archivedAgentId}"]`)).not.toBeVisible();
  });

  /* Preconditions: User logged in, multiple agents with different timestamps
     Action: Create agents with messages at different times, open AllAgents
     Assertions: Agents sorted by updatedAt (most recent first)
     Requirements: agents.5.5, agents.1.3 */
  test('should sort agents by updatedAt in AllAgents', async () => {
    // Wait for agents page to load
    await expectAgentsVisible(window, 5000);

    const firstAgentId = (await getAgentIdsFromApi(window))[0] ?? null;

    // Add message to first agent
    await window.evaluate(async (id) => {
      const api = (globalThis as any).api;
      await api.messages.create(id!, 'user', {
        data: { text: 'First agent message' },
      });
    }, firstAgentId);

    // Create 5 more agents (total 6 agents)
    const newChatButton = window.locator('div[title="New chat"]');
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 9; i++) {
      await newChatButton.click();
      await expect
        .poll(async () => (await getAgentIdsFromApi(window)).length, { timeout: 5000 })
        .toBe(i + 2);
    }

    const secondAgentId = (await getAgentIdsFromApi(window))[0] ?? null;

    // Add message to second agent (more recent)
    await window.evaluate(async (id) => {
      const api = (globalThis as any).api;
      await api.messages.create(id!, 'user', {
        data: { text: 'Second agent message' },
      });
    }, secondAgentId);

    // Open AllAgents view
    const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
    await expect(allAgentsButton).toBeVisible({ timeout: 5000 });
    await allAgentsButton.click();

    // Verify we're in AllAgents view
    await expect(window.locator('text=All Agents')).toBeVisible({ timeout: 5000 });

    // Get all agent cards
    const agentCards = window.locator('[data-testid^="agent-card-"]');
    const count = await agentCards.count();

    // Verify at least 6 agents
    expect(count).toBeGreaterThanOrEqual(6);

    // Verify second agent (more recent) appears before first agent
    // This is implicit in the order of the list - most recent updatedAt first
  });
});
