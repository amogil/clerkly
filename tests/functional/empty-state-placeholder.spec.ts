/* Preconditions: User logged in with agent that has no messages
   Action: Navigate to agents page and view agent with no messages
   Assertions: 
   - AgentWelcome is visible when agent has no messages
   - Placeholder shows animated logo, heading, description, and 4 prompt buttons
   - Prompt buttons send message when clicked
   - Placeholder disappears after sending first message
   Requirements: agents.4.14-4.18 */

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

test.describe('Agents - AgentWelcome', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    // Set user profile data for tests
    mockServer.setUserProfile({
      id: '070FF5B781',
      email: 'empty.state.test@example.com',
      name: 'Empty State Test User',
      given_name: 'Empty',
      family_name: 'State Test User',
    });

    const context = await launchElectronWithMockOAuth(mockServer);
    electronApp = context.app;
    window = context.window;
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should show AgentWelcome for new agent with no messages', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });

    // Verify AgentWelcome is visible with new design
    const emptyStateHeading = activeChat(window).messagesArea.locator(
      'text=Assign a task to the agent'
    );
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Verify description text is visible
    const emptyStateDescription = activeChat(window).messagesArea.locator(
      'text=Transcribes meetings, extracts tasks, creates Jira tickets'
    );
    await expect(emptyStateDescription).toBeVisible();

    // Verify animated logo is present
    const logo = activeChat(window).messagesArea.locator('svg.logo-animated');
    await expect(logo).toBeVisible();

    // Verify 4 prompt buttons are visible
    const promptButtons = activeChat(window).messagesArea.locator('button:has-text("Transcribe")');
    await expect(promptButtons).toBeVisible();
  });

  test('should show correct styling for AgentWelcome', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });

    // Verify heading styling
    const heading = activeChat(window).messagesArea.locator('text=Assign a task to the agent');
    await expect(heading).toBeVisible();

    // Verify the heading is an h2 element
    const headingElement = await heading.evaluateHandle((el) => el.tagName);
    const tagName = await headingElement.jsonValue();
    expect(tagName).toBe('H2');

    // Verify prompt buttons have correct styling
    const promptButton = activeChat(window)
      .messagesArea.locator('button')
      .filter({ hasText: 'Transcribe' })
      .first();
    await expect(promptButton).toBeVisible();

    // Verify button has rounded-xl class
    const hasRoundedXl = await promptButton.evaluate((el) => el.classList.contains('rounded-xl'));
    expect(hasRoundedXl).toBe(true);
  });

  test('should hide AgentWelcome after sending first message', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });

    // Verify AgentWelcome is visible initially
    const emptyStateHeading = activeChat(window).messagesArea.locator(
      'text=Assign a task to the agent'
    );
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Find input field and send message
    const inputField = activeChat(window).textarea;

    // Type a message
    await inputField.fill('Hello, this is my first message!');
    await inputField.press('Enter');

    // First check if message is displayed
    const userMessage = activeChat(window).userMessages.filter({
      hasText: 'Hello, this is my first message!',
    });
    await expect(userMessage).toHaveCount(1, { timeout: 10000 });

    // Then verify AgentWelcome is no longer visible
    await expect(emptyStateHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('should show AgentWelcome when creating new agent', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });

    // Verify AgentWelcome is visible for first (auto-created) agent
    const emptyStateHeading = activeChat(window).messagesArea.locator(
      'text=Assign a task to the agent'
    );
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Click "New chat" button to create second agent
    const newChatButton = window.locator('div[title="New chat"]');
    await newChatButton.click();

    // Wait for new agent to be created and UI to update
    await expect(window.locator('[data-testid^="agent-icon-"]')).toHaveCount(2, { timeout: 5000 });

    // Verify AgentWelcome is still visible for new agent (also has no messages)
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Verify description is visible
    const emptyStateDescription = activeChat(window).messagesArea.locator(
      'text=Transcribes meetings, extracts tasks, creates Jira tickets'
    );
    await expect(emptyStateDescription).toBeVisible();
  });

  test('should center AgentWelcome in messages area', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });

    // Verify AgentWelcome is visible
    const emptyStateHeading = activeChat(window).messagesArea.locator(
      'text=Assign a task to the agent'
    );
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Get the parent container and verify it has centering classes
    const container = activeChat(window)
      .messagesArea.locator('.flex.flex-col.items-center.justify-center')
      .first();
    await expect(container).toBeVisible();

    // Verify the container has space-y-8 class (spacing between elements)
    const hasSpacing = await container.evaluate((el) => el.classList.contains('space-y-8'));
    expect(hasSpacing).toBe(true);
  });

  test('should show 4 prompt suggestion buttons', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });

    // Verify all 4 prompt buttons are visible
    const transcribeButton = activeChat(window).messagesArea.locator(
      'button:has-text("Transcribe my latest meeting")'
    );
    await expect(transcribeButton).toBeVisible();

    const extractButton = activeChat(window).messagesArea.locator(
      'button:has-text("Extract action items from today\'s standup")'
    );
    await expect(extractButton).toBeVisible();

    const jiraButton = activeChat(window).messagesArea.locator(
      'button:has-text("Create Jira tickets from meeting notes")'
    );
    await expect(jiraButton).toBeVisible();

    const summaryButton = activeChat(window).messagesArea.locator(
      'button:has-text("Send summary to the team")'
    );
    await expect(summaryButton).toBeVisible();
  });

  test('should send message when clicking prompt button', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });

    // Verify AgentWelcome is visible
    const emptyStateHeading = activeChat(window).messagesArea.locator(
      'text=Assign a task to the agent'
    );
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Click on first prompt button
    const transcribeButton = activeChat(window).messagesArea.locator(
      'button:has-text("Transcribe my latest meeting")'
    );
    await transcribeButton.click();

    // Verify message is displayed (AgentWelcome should disappear)
    const userMessage = activeChat(window).userMessages.filter({
      hasText: 'Transcribe my latest meeting',
    });
    await expect(userMessage).toHaveCount(1, { timeout: 5000 });
  });
});
