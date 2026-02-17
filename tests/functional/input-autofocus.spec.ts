// Requirements: agents.4.7.1, agents.4.7.2
// Functional tests for input autofocus on agent activation

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let mockServer: MockOAuthServer;
let electronApp: ElectronApplication;
let window: Page;

test.beforeAll(async () => {
  // Start mock OAuth server for all tests
  mockServer = new MockOAuthServer({
    port: 8898,
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

test.beforeEach(async () => {
  // Set user profile data for tests
  mockServer.setUserProfile({
    id: '070FF5B781',
    email: 'autofocus.test@example.com',
    name: 'Autofocus Test User',
    given_name: 'Autofocus',
    family_name: 'Test User',
  });

  // Create unique temp directory for this test
  const testDataPath = path.join(
    require('os').tmpdir(),
    `clerkly-autofocus-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
  );

  // Launch Electron app with clean state
  electronApp = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/main/index.js'), '--user-data-dir', testDataPath],
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
  await window.waitForTimeout(500);

  // Get the textarea
  const textarea = window.locator('textarea[placeholder*="Ask"]');
  await expect(textarea).toBeVisible();

  // Check that textarea is focused
  const isFocused = await textarea.evaluate((el) => el === document.activeElement);
  expect(isFocused).toBe(true);
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
  const textarea = window.locator('textarea[placeholder*="Ask"]');
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

  // Send a message to create history (so agent appears in AllAgents)
  const textarea = window.locator('textarea[placeholder*="Ask"]');
  await textarea.fill('Test message');
  await textarea.press('Enter');
  await window.waitForTimeout(500);

  // Open AllAgents page
  const allAgentsButton = window.locator('button:has-text("All Agents")');
  await allAgentsButton.click();
  await window.waitForTimeout(300);

  // Verify AllAgents page is shown
  await expect(window.locator('text=All Agents')).toBeVisible();

  // Click on the agent in the list
  const agentCard = window.locator('[data-testid^="agent-card-"]').first();
  await agentCard.click();
  await window.waitForTimeout(300);

  // Verify we're back to chat view
  await expect(window.locator('text=All Agents')).not.toBeVisible();

  // Check that textarea is focused
  const isFocused = await textarea.evaluate((el) => el === document.activeElement);
  expect(isFocused).toBe(true);
});

/* Preconditions: Application loaded
   Action: Create new agent via "+" button
   Assertions: Input field receives focus on new agent
   Requirements: agents.4.7.1, agents.4.7.2 */
test('should auto-focus input when creating new agent', async () => {
  // Wait for agents page to load
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

  // Wait for first agent to be auto-created
  await window.waitForTimeout(1000);

  // Create new agent
  const newAgentButton = window.locator('button:has-text("+")').first();
  await expect(newAgentButton).toBeVisible({ timeout: 3000 });
  await newAgentButton.click();
  await window.waitForTimeout(500);

  // Check that textarea is focused
  const textarea = window.locator('textarea[placeholder*="Ask"]');
  const isFocused = await textarea.evaluate((el) => el === document.activeElement);
  expect(isFocused).toBe(true);
});

/* Preconditions: Application with agent, input has focus
   Action: Type in input field
   Assertions: Focus remains on input, text is entered correctly
   Requirements: agents.4.7.1 */
test('should maintain focus while typing', async () => {
  // Wait for agents page to load
  await expect(window.locator('[data-testid="agents"]')).toBeVisible({ timeout: 5000 });

  const textarea = window.locator('textarea[placeholder*="Ask"]');
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

  // Send a message first
  const textarea = window.locator('textarea[placeholder*="Ask"]');
  await textarea.fill('Test message');
  await textarea.press('Enter');
  await window.waitForTimeout(500);

  // Open AllAgents page
  const allAgentsButton = window.locator('button:has-text("All Agents")');
  await allAgentsButton.click();
  await window.waitForTimeout(300);

  // Verify AllAgents page is shown
  await expect(window.locator('text=All Agents')).toBeVisible();

  // Input should not be visible (AllAgents page is shown)
  await expect(textarea).not.toBeVisible();
});
