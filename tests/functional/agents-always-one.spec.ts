/* Preconditions: Fresh user with no agents in database
   Action: Login and navigate to agents page
   Assertions: 
   - First agent is auto-created
   - Agents page shows the agent (not "Loading..." forever)
   - Agent has default name "New Agent"
   Requirements: agents.2.7, agents.2.8, agents.2.11 */

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { createMockOAuthServer, activeChat, launchElectronWithMockOAuth } from './helpers/electron';
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

test.describe('Agents - Auto-create First Agent', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    // Set user profile data for tests
    mockServer.setUserProfile({
      id: '070FF5B780',
      email: 'agents.test@example.com',
      name: 'Agents Test User',
      given_name: 'Agents',
      family_name: 'Test User',
    });

    const context = await launchElectronWithMockOAuth(mockServer);
    electronApp = context.app;
    window = context.window;
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should auto-create first agent for new user after login', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait a bit longer for agents to be created and page to load
    await window.waitForTimeout(3000);

    // Wait for agents page to load (should NOT show "Loading..." forever)
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });

    // Verify that we're NOT stuck on "Loading..."
    const loadingText = window.locator('text=Loading...');
    await expect(loadingText).not.toBeVisible({ timeout: 5000 });

    // Verify that at least one agent exists
    // The agent should be visible in the header (avatar with letter)
    const agentAvatar = window.locator('.rounded-full.bg-sky-400').first();
    await expect(agentAvatar).toBeVisible({ timeout: 5000 });

    // Verify that the agent has the default name "New Agent"
    // This should be visible in the header title
    const agentTitle = window.locator('h3.font-semibold:has-text("New Agent")');
    await expect(agentTitle).toBeVisible({ timeout: 5000 });

    // Verify that the input field is enabled (not disabled)
    const inputField = activeChat(window).textarea;
    await expect(inputField).toBeEnabled();
  });

  test('should auto-create agent when last agent is archived', async () => {
    // First, login to create initial agent
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page and initial agent creation
    const agentsPage = window.locator('[data-testid="agents"]');
    await expect(agentsPage).toBeVisible({ timeout: 5000 });

    // Archive the agent by calling the API directly
    const result = await window.evaluate(async () => {
      // @ts-expect-error - window.api is injected by preload
      const agents = await window.api.agents.list();
      if (agents.success && agents.data && agents.data.length > 0) {
        const agentId = agents.data[0].id; // Fixed: use 'id' instead of 'agentId'
        // @ts-expect-error - window.api is injected by preload
        return await window.api.agents.archive(agentId);
      }
      return { success: false, error: 'No agents found' };
    });

    expect(result.success).toBe(true);

    // Verify that a new agent was auto-created
    // The page should still show an agent (not "Loading..." or empty state)
    // Wait for the "New chat" button to be visible (indicates UI is ready)
    const newChatButton = window.locator('[data-testid="agents"] .bg-sky-400').first();
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    // Verify that the new agent has the default name "New Agent"
    const newAgentTitle = window.locator('h3.font-semibold:has-text("New Agent")');
    await expect(newAgentTitle).toBeVisible({ timeout: 5000 });

    // Verify that the input field is still enabled
    const inputField = activeChat(window).textarea;
    await expect(inputField).toBeEnabled();
  });

  test('should never show empty state UI', async () => {
    // First, login to create initial agent
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page and initial agent creation
    const agentsPage = window.locator('[data-testid="agents"]');
    await expect(agentsPage).toBeVisible({ timeout: 5000 });

    // Verify that "No agents yet" text is NEVER visible
    const emptyStateText = window.locator('text=No agents yet');
    await expect(emptyStateText).not.toBeVisible();

    // Verify that "Create your first agent" text is NEVER visible
    const createFirstText = window.locator('text=Create your first agent');
    await expect(createFirstText).not.toBeVisible();

    // Verify that at least one agent is always visible
    const newChatButton = window.locator('[data-testid="agents"] .bg-sky-400').first();
    await expect(newChatButton).toBeVisible();
  });

  test('should never show loading state - UI always visible', async () => {
    // Requirements: agents.2.10 - UI should always show standard interface
    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    const agentsPage = window.locator('[data-testid="agents"]');
    await expect(agentsPage).toBeVisible({ timeout: 5000 });

    // Verify that "Loading..." text is NEVER visible
    const loadingText = window.locator('text=Loading...');
    await expect(loadingText).not.toBeVisible({ timeout: 5000 });

    // Verify that standard UI elements are ALWAYS present
    // 1. Agents container
    await expect(agentsPage).toBeVisible();

    // 2. New chat button
    const newChatButton = window.locator('[title="New chat"]');
    await expect(newChatButton).toBeVisible();

    // 3. Messages area (may be empty but should exist)
    const messagesArea = activeChat(window).messagesArea;
    await expect(messagesArea).toBeVisible();

    // 4. Input field
    const inputField = activeChat(window).textarea;
    await expect(inputField).toBeVisible();
    await expect(inputField).toBeEnabled();

    // 5. Send button
    const sendButton = window.locator('button:has-text("Send"), button:has(svg)').last();
    await expect(sendButton).toBeVisible();
  });
});
