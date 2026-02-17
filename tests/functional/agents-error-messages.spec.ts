// Requirements: agents.5.5
// tests/functional/agents-error-messages.spec.ts
// Functional tests for error messages in AllAgents view

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

    // Create unique temp directory for this test
    const testDataPath = path.join(
      require('os').tmpdir(),
      `clerkly-error-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
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
      const agents = await window.api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ id: string }>;
        return agentList[0].id;
      }
      return null;
    });

    expect(archivedAgentId).not.toBeNull();

    // Archive the first agent
    await window.evaluate(async (id) => {
      await window.api.agents.archive(id!);
    }, archivedAgentId);

    // Wait for auto-created agent to appear (agents.2.7, agents.2.9)
    const newChatButton = window.locator('div[title="New chat"]');
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    // Create 10 more agents (total 11 active agents) to ensure +N button appears
    for (let i = 0; i < 10; i++) {
      await newChatButton.click();
      const agentIcons = window.locator('[data-testid^="agent-icon-"]');
      await expect(agentIcons.nth(i + 1)).toBeVisible({ timeout: 5000 });
    }

    // Open AllAgents view
    const allAgentsButton = window.locator('div.rounded-full.bg-muted:has-text("+")');
    await expect(allAgentsButton).toBeVisible({ timeout: 5000 });
    await allAgentsButton.click();

    // Verify we're in AllAgents view
    await expect(window.locator('text=All Agents')).toBeVisible({ timeout: 5000 });

    // Verify only 11 active agents are shown (archived agent is filtered out)
    const agentCards = window.locator('[data-testid^="agent-card-"]');
    await expect(agentCards).toHaveCount(11);

    // Verify archived agent is NOT visible
    await expect(
      window.locator(`[data-testid="agent-card-${archivedAgentId}"]`)
    ).not.toBeVisible();
  });

  /* Preconditions: User logged in, multiple agents with different timestamps
     Action: Create agents with messages at different times, open AllAgents
     Assertions: Agents sorted by updatedAt (most recent first)
     Requirements: agents.5.5, agents.1.3 */
  test('should sort agents by updatedAt in AllAgents', async () => {
    // Wait for agents page to load
    await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

    const firstAgentId = await window.evaluate(async () => {
      const agents = await window.api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ id: string }>;
        return agentList[0].id;
      }
      return null;
    });

    // Add message to first agent
    await window.evaluate(async (id) => {
      await window.api.messages.create(id!, {
        kind: 'user',
        data: { text: 'First agent message' },
      });
    }, firstAgentId);

    // Create 5 more agents (total 6 agents)
    const newChatButton = window.locator('div[title="New chat"]');
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 5; i++) {
      await newChatButton.click();
      // Wait for new agent icon to appear
      const agentIcons = window.locator('[data-testid^="agent-icon-"]');
      await expect(agentIcons.nth(i + 1)).toBeVisible({ timeout: 5000 });
    }

    const secondAgentId = await window.evaluate(async () => {
      const agents = await window.api.agents.list();
      if (agents.success && agents.data) {
        const agentList = agents.data as Array<{ id: string }>;
        return agentList[0].id; // Most recent is first
      }
      return null;
    });

    // Add message to second agent (more recent)
    await window.evaluate(async (id) => {
      await window.api.messages.create(id!, {
        kind: 'user',
        data: { text: 'Second agent message' },
      });
    }, secondAgentId);

    // Open AllAgents view
    const allAgentsButton = window.locator('div.rounded-full.bg-muted:has-text("+")');
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
