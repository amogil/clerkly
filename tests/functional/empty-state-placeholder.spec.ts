/* Preconditions: User logged in with agent that has no messages
   Action: Navigate to agents page and view agent with no messages
   Assertions: 
   - EmptyStatePlaceholder is visible when agent has no messages
   - Placeholder shows correct text and icon
   - Placeholder disappears after sending first message
   Requirements: agents.4 */

import { test, expect, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import path from 'path';
import { MockOAuthServer } from './helpers/mock-oauth-server';
import { completeOAuthFlow } from './helpers/electron';

let mockServer: MockOAuthServer;

test.beforeAll(async () => {
  // Start mock OAuth server for all tests
  mockServer = new MockOAuthServer({
    port: 8896,
    clientId: 'test-client-id-12345',
    clientSecret: 'test-client-secret-67890',
  });

  await mockServer.start();
  console.log(`[TEST] Mock OAuth server started at ${mockServer.getBaseUrl()}`);
});

test.afterAll(async () => {
  // Stop mock server after all tests
  if (mockServer) {
    await mockServer.stop();
    console.log('[TEST] Mock OAuth server stopped');
  }
});

test.describe('Agents - EmptyStatePlaceholder', () => {
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

    // Create unique temp directory for this test
    const testDataPath = path.join(
      require('os').tmpdir(),
      `clerkly-empty-state-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    // Launch Electron app with clean state (no authentication)
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
  });

  test.afterEach(async () => {
    await electronApp.close();
  });

  test('should show EmptyStatePlaceholder for new agent with no messages', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });

    // Wait a bit for auto-created agent
    await window.waitForTimeout(2000);

    // Verify EmptyStatePlaceholder is visible
    const emptyStateHeading = window.locator('text=Start a conversation');
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Verify description text is visible
    const emptyStateDescription = window.locator(
      'text=/Ask a question, give a command, or describe/'
    );
    await expect(emptyStateDescription).toBeVisible();

    // Verify icon is present (MessageSquare icon)
    const iconContainer = window.locator('.bg-primary\\/10.rounded-full');
    await expect(iconContainer).toBeVisible();
  });

  test('should show correct styling for EmptyStatePlaceholder', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });
    await window.waitForTimeout(2000);

    // Verify heading styling
    const heading = window.locator('text=Start a conversation');
    await expect(heading).toBeVisible();

    // Verify the heading is an h3 element
    const headingElement = await heading.evaluateHandle((el) => el.tagName);
    const tagName = await headingElement.jsonValue();
    expect(tagName).toBe('H3');

    // Verify icon container has correct classes
    const iconContainer = window.locator('.bg-primary\\/10.rounded-full').first();
    await expect(iconContainer).toBeVisible();
  });

  test('should hide EmptyStatePlaceholder after sending first message', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });
    await window.waitForTimeout(2000);

    // Verify EmptyStatePlaceholder is visible initially
    const emptyStateHeading = window.locator('text=Start a conversation');
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Find input field and send button
    const inputField = window.locator('textarea');
    const sendButton = window.locator('button:has-text("")').last(); // Send button with icon

    // Type a message
    await inputField.fill('Hello, this is my first message!');
    await window.waitForTimeout(500);

    // Click send button
    await sendButton.click();
    await window.waitForTimeout(1000);

    // Verify EmptyStatePlaceholder is no longer visible
    await expect(emptyStateHeading).not.toBeVisible({ timeout: 5000 });

    // Verify message is displayed
    const userMessage = window.locator('text=Hello, this is my first message!');
    await expect(userMessage).toBeVisible({ timeout: 5000 });
  });

  test('should show EmptyStatePlaceholder when creating new agent', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });
    await window.waitForTimeout(2000);

    // Verify EmptyStatePlaceholder is visible for first (auto-created) agent
    const emptyStateHeading = window.locator('text=Start a conversation');
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Click "New chat" button to create second agent
    const newChatButton = window.locator('.bg-sky-400').first();
    await newChatButton.click();
    
    // Wait for new agent to be created and UI to update
    await window.waitForTimeout(2000);

    // Verify EmptyStatePlaceholder is still visible for new agent (also has no messages)
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Verify description is visible
    const emptyStateDescription = window.locator(
      'text=/Ask a question, give a command, or describe/'
    );
    await expect(emptyStateDescription).toBeVisible();
  });

  test('should center EmptyStatePlaceholder in messages area', async () => {
    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });
    await window.waitForTimeout(2000);

    // Verify EmptyStatePlaceholder is visible
    const emptyStateHeading = window.locator('text=Start a conversation');
    await expect(emptyStateHeading).toBeVisible({ timeout: 5000 });

    // Get the parent container and verify it has centering classes
    const container = window.locator('.flex.flex-col.items-center.justify-center').first();
    await expect(container).toBeVisible();

    // Verify the container has h-full class (takes full height)
    const hasFullHeight = await container.evaluate((el) => el.classList.contains('h-full'));
    expect(hasFullHeight).toBe(true);
  });
});
