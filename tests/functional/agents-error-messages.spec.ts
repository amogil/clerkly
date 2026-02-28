// Requirements: agents.5.5
// tests/functional/agents-error-messages.spec.ts
// Functional tests for error messages in AllAgents view

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { createMockOAuthServer, launchElectronWithMockOAuth } from './helpers/electron';
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
    await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

    // Get current agent ID
    const archivedAgentId = await window.evaluate(async () => {
      const api = (globalThis as any).api;
      const agents = await api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ id: string }>;
        return agentList[0].id;
      }
      return null;
    });

    expect(archivedAgentId).not.toBeNull();

    // Archive the first agent
    await window.evaluate(async (id) => {
      const api = (globalThis as any).api;
      await api.agents.archive(id!);
    }, archivedAgentId);

    // Wait for auto-created agent to appear (agents.2.7, agents.2.9)
    const newChatButton = window.locator('div[title="New chat"]');
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    const baseAgentCount = await window.evaluate(async () => {
      const api = (globalThis as any).api;
      const agents = await api.agents.list();
      return agents.success && agents.data ? agents.data.length : 0;
    });
    expect(baseAgentCount).toBeGreaterThan(0);

    // Create 10 more agents to ensure +N button appears
    for (let i = 0; i < 10; i++) {
      await newChatButton.click();
      await expect
        .poll(
          async () => {
            return window.evaluate(async () => {
              const api = (globalThis as any).api;
              const agents = await api.agents.list();
              return agents.success && agents.data ? agents.data.length : 0;
            });
          },
          { timeout: 5000 }
        )
        .toBe(baseAgentCount + i + 1);
    }

    const expectedAgentIds = await window.evaluate(async () => {
      const api = (globalThis as any).api;
      const agents = await api.agents.list();
      if (agents.success && agents.data) {
        return (agents.data as Array<{ id: string }>).map((agent) => agent.id);
      }
      return [];
    });
    expect(expectedAgentIds.length).toBeGreaterThan(0);

    // Open AllAgents view
    const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
    await expect(allAgentsButton).toBeVisible({ timeout: 5000 });
    await allAgentsButton.click();

    // Verify we're in AllAgents view
    await expect(window.locator('text=All Agents')).toBeVisible({ timeout: 5000 });

    const visibleAgentIds = await window.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="agent-card-"]'))
        .map((el) => el.getAttribute('data-testid'))
        .filter((id): id is string => Boolean(id))
        .map((id) => id.replace('agent-card-', ''))
    );

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
    await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

    const firstAgentId = await window.evaluate(async () => {
      const api = (globalThis as any).api;
      const agents = await api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ id: string }>;
        return agentList[0].id;
      }
      return null;
    });

    // Add message to first agent
    await window.evaluate(async (id) => {
      const api = (globalThis as any).api;
      await api.messages.create(id!, 'user', {
        data: { text: 'First agent message' },
      });
    }, firstAgentId);

    const baseAgentCount = await window.evaluate(async () => {
      const api = (globalThis as any).api;
      const agents = await api.agents.list();
      return agents.success && agents.data ? agents.data.length : 0;
    });
    expect(baseAgentCount).toBeGreaterThan(0);

    // Create 9 more agents to ensure a larger list
    const newChatButton = window.locator('div[title="New chat"]');
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 9; i++) {
      await newChatButton.click();
      await expect
        .poll(
          async () => {
            return window.evaluate(async () => {
              const api = (globalThis as any).api;
              const agents = await api.agents.list();
              return agents.success && agents.data ? agents.data.length : 0;
            });
          },
          { timeout: 5000 }
        )
        .toBe(baseAgentCount + i + 1);
    }

    const secondAgentId = await window.evaluate(async (firstId) => {
      const api = (globalThis as any).api;
      const agents = await api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ id: string }>;
        const otherAgent = agentList.find((agent) => agent.id !== firstId);
        return otherAgent?.id ?? null;
      }
      return null;
    }, firstAgentId);
    expect(secondAgentId).toBeTruthy();

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

    const expectedOrder = await window.evaluate(async () => {
      const api = (globalThis as any).api;
      const agents = await api.agents.list();
      if (agents.success && agents.data) {
        return (agents.data as Array<{ id: string }>).map((agent) => agent.id);
      }
      return [];
    });
    expect(expectedOrder.length).toBeGreaterThan(0);

    const visibleAgentIds = await window.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="agent-card-"]'))
        .map((el) => el.getAttribute('data-testid'))
        .filter((id): id is string => Boolean(id))
        .map((id) => id.replace('agent-card-', ''))
    );

    // Verify ordering by updatedAt (most recent first)
    expect(visibleAgentIds).toEqual(expectedOrder);
  });
});
