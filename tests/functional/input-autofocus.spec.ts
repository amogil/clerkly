// Requirements: agents.4.7.1, agents.4.7.2
// Functional tests for input autofocus on agent activation

import { test, expect, ElectronApplication, Page } from '@playwright/test';
import { createMockOAuthServer, activeChat, launchElectronWithMockOAuth } from './helpers/electron';
import type { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let mockServer: MockOAuthServer;
let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  mockServer = await createMockOAuthServer();
});

test.afterAll(async () => {
  if (mockServer) {
    await mockServer.stop();
  }
});

test.beforeEach(async () => {
  // Set user profile data for tests
  mockServer.setUserProfile({
    id: '070FF5B781',
    email: 'autofocus.test@example.com',
    name: 'Autofocus Test User',
    given_name: 'Autofocus',
    family_name: 'Test User',
  });

  const context = await launchElectronWithMockOAuth(mockServer);
  electronApp = context.app;
  window = context.window;

  // Complete OAuth flow
  await completeOAuthFlow(electronApp, window);
});

test.afterEach(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

/* Preconditions: Application launched, first agent auto-created
   Action: Wait for app to load
   Assertions: Input field has focus on first load
   Requirements: agents.4.7.1, agents.4.7.2 */
test('should auto-focus input on first load', async () => {
  // Wait for agents page to load
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

  // Wait for first agent to be created and selected
  await expect(window.locator('[data-testid^="agent-icon-"]')).toHaveCount(1, { timeout: 5000 });

  // Get the textarea
  const textarea = activeChat(window).textarea;
  await expect(textarea).toBeVisible();

  // Check that textarea is focused
  await expect(textarea).toBeFocused({ timeout: 5000 });
});

/* Preconditions: Application with multiple agents
   Action: Click on different agent icon
   Assertions: Input field receives focus after agent switch
   Requirements: agents.4.7.1, agents.4.7.2 */
test('should auto-focus input when switching agents', async () => {
  // Wait for agents page to load
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

  // Create second agent
  const newAgentButton = window.locator('div[title="New chat"]');
  await expect(newAgentButton).toBeVisible({ timeout: 5000 });
  await newAgentButton.click();

  // Wait for second agent icon to appear
  const agentIcons = window.locator('[data-testid^="agent-icon-"]');
  await expect(agentIcons.nth(1)).toBeVisible({ timeout: 5000 });

  // Click on second agent (switch from first to second)
  await agentIcons.nth(1).click();

  // Wait for textarea to receive focus (useEffect has 100ms delay)
  const textarea = activeChat(window).textarea;
  await expect(textarea).toBeFocused({ timeout: 5000 });

  // Click on first agent (switch from second to first)
  await agentIcons.first().click();

  // Wait for textarea to receive focus again
  await expect(textarea).toBeFocused({ timeout: 5000 });
});

/* Preconditions: Application with agent, AllAgents page open
   Action: Click on agent in AllAgents list
   Assertions: Input field receives focus after returning to chat
   Requirements: agents.4.7.1, agents.4.7.2 */
test('should auto-focus input when returning from AllAgents', async () => {
  // Wait for agents page to load
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

  // Create additional agents to make +N button appear
  const newChatButton = window.locator('div[title="New chat"]');
  await expect(newChatButton).toBeVisible({ timeout: 5000 });

  const baseAgentCount = await window.evaluate(async () => {
    const agents = await window.api.agents.list();
    return agents.success && agents.data ? agents.data.length : 0;
  });
  expect(baseAgentCount).toBeGreaterThan(0);

  for (let i = 0; i < 9; i++) {
    await newChatButton.click();
    await expect
      .poll(
        async () => {
          return window.evaluate(async () => {
            const agents = await window.api.agents.list();
            return agents.success && agents.data ? agents.data.length : 0;
          });
        },
        { timeout: 5000 }
      )
      .toBe(baseAgentCount + i + 1);
  }

  // Send a message to create history (so agent appears in AllAgents)
  const textarea = activeChat(window).textarea;
  await textarea.fill('Test message');
  await textarea.press('Enter');

  // Wait for message to appear in active chat
  const message = activeChat(window).userMessages.filter({ hasText: 'Test message' });
  await expect(message).toHaveCount(1, { timeout: 5000 });

  // Open AllAgents page via +N button
  const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
  await expect(allAgentsButton).toBeVisible({ timeout: 5000 });
  await allAgentsButton.click();

  // Verify AllAgents page is shown
  await expect(window.locator('text=All Agents')).toBeVisible({ timeout: 5000 });

  const targetAgentId = await window.evaluate(async () => {
    const agents = await window.api.agents.list();
    if (agents.success && agents.data) {
      return (agents.data as Array<{ id: string }>)[0]?.id ?? null;
    }
    return null;
  });
  expect(targetAgentId).toBeTruthy();

  // Click on the agent in the list by ID
  const agentCard = window.locator(`[data-testid="agent-card-${targetAgentId}"]`);
  await expect(agentCard).toBeVisible({ timeout: 5000 });
  await agentCard.click();

  // Verify we're back to chat view
  await expect(window.locator('text=All Agents')).not.toBeVisible();

  // Check that textarea is focused
  await expect(textarea).toBeFocused({ timeout: 5000 });
});

/* Preconditions: Application loaded
   Action: Create new agent via "+" button
   Assertions: Input field receives focus on new agent
   Requirements: agents.4.7.1, agents.4.7.2 */
test('should auto-focus input when creating new agent', async () => {
  // Wait for agents page to load
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

  // Wait for first agent to be auto-created (New chat button appears)
  const newChatButton = window.locator('div[title="New chat"]');
  await expect(newChatButton).toBeVisible({ timeout: 5000 });

  // Create new agent
  await newChatButton.click();

  // Wait for second agent icon to appear (confirms agent was created)
  const agentIcons = window.locator('[data-testid^="agent-icon-"]');
  await expect(agentIcons.nth(1)).toBeVisible({ timeout: 5000 });

  // Check that textarea is focused
  const textarea = activeChat(window).textarea;
  await expect(textarea).toBeFocused({ timeout: 5000 });
});

/* Preconditions: Application with agent, input has focus
   Action: Type in input field
   Assertions: Focus remains on input, text is entered correctly
   Requirements: agents.4.7.1 */
test('should maintain focus while typing', async () => {
  // Wait for agents page to load
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

  const textarea = activeChat(window).textarea;
  await expect(textarea).toBeVisible();

  // Type text
  await textarea.fill('Hello world');
  await window.waitForTimeout(100);

  // Check that textarea still has focus
  const isFocused = await textarea.evaluate((el) => el === document.activeElement);
  expect(isFocused).toBe(true);

  // Check that text was entered
  const value = await textarea.inputValue();
  expect(value).toBe('Hello world');
});

/* Preconditions: Application with agent, AllAgents page NOT open
   Action: Check focus state
   Assertions: Input should not be focused when AllAgents is open
   Requirements: agents.4.7.1, agents.4.7.2 */
test('should not auto-focus when AllAgents page is open', async () => {
  // Wait for agents page to load
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

  // Create additional agents to make +N button appear
  const newChatButton = window.locator('div[title="New chat"]');
  await expect(newChatButton).toBeVisible({ timeout: 5000 });

  const baseAgentCount = await window.evaluate(async () => {
    const agents = await window.api.agents.list();
    return agents.success && agents.data ? agents.data.length : 0;
  });
  expect(baseAgentCount).toBeGreaterThan(0);

  for (let i = 0; i < 9; i++) {
    await newChatButton.click();
    await expect
      .poll(
        async () => {
          return window.evaluate(async () => {
            const agents = await window.api.agents.list();
            return agents.success && agents.data ? agents.data.length : 0;
          });
        },
        { timeout: 5000 }
      )
      .toBe(baseAgentCount + i + 1);
  }

  // Send a message first
  const textarea = activeChat(window).textarea;
  await textarea.fill('Test message');
  await textarea.press('Enter');

  // Wait for message to appear in active chat
  const message = activeChat(window).userMessages.filter({ hasText: 'Test message' });
  await expect(message).toHaveCount(1, { timeout: 5000 });

  // Open AllAgents page via +N button
  const allAgentsButton = window.locator('[data-testid="all-agents-button"]');
  await expect(allAgentsButton).toBeVisible({ timeout: 5000 });
  await allAgentsButton.click();

  // Verify AllAgents page is shown
  await expect(window.locator('text=All Agents')).toBeVisible({ timeout: 5000 });

  // Input should not be visible (AllAgents page is shown)
  await expect(textarea).not.toBeVisible();
});
