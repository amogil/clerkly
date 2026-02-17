/* Preconditions: User logged in
   Action: Create agent with old message, send new message
   Assertions: 
   - Agent's updatedAt timestamp is old initially
   - After sending new message, timestamp updates to current time
   Requirements: agents.8.1, agents.5.3, settings.2.1 */

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

test.describe('Agents - Date Update on New Message', () => {
  let electronApp: ElectronApplication;
  let window: Page;

  test.beforeEach(async () => {
    // Set user profile data for tests
    mockServer.setUserProfile({
      id: '070FF5B781',
      email: 'date.test@example.com',
      name: 'Date Test User',
      given_name: 'Date',
      family_name: 'Test User',
    });

    // Create unique temp directory for this test
    const testDataPath = path.join(
      require('os').tmpdir(),
      `clerkly-date-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
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

    // Wait for login screen
    const loginScreen = window.locator('[data-testid="login-screen"]');
    await expect(loginScreen).toBeVisible({ timeout: 10000 });

    // Complete OAuth flow
    await completeOAuthFlow(electronApp, window);

    // Wait for agents page to load
    await window.waitForSelector('[data-testid="agents"]', { timeout: 15000 });
  });

  test.afterEach(async () => {
    // Close the app
    if (electronApp) {
      await electronApp.close();
    }
  });

  /* Preconditions: Agent with message from 5 minutes ago exists
     Action: Send new message to agent via UI
     Assertions: 
     - Initial timestamp is displayed in header (old)
     - After sending message via UI, timestamp in header updates
     - New timestamp is different from old timestamp
     Requirements: agents.1.4, agents.8.1 (updatedAt updates on new message and displays in header) */
  test('should update agent timestamp when new message is sent', async () => {
    // Wait for agents page to load
    const agentsPage = window.locator('[data-testid="agents"]');
    await expect(agentsPage).toBeVisible({ timeout: 10000 });

    // Create agent with message from 5 minutes ago
    const result = await window.evaluate(async () => {
      // @ts-expect-error - window.api is exposed via contextBridge
      return await window.api.test.createAgentWithOldMessage(5);
    });
    expect(result.success).toBe(true);
    expect(result.agentId).toBeTruthy();
    const testAgentId = result.agentId;

    // Reload page to ensure agent is loaded from database
    await window.reload();
    await expect(agentsPage).toBeVisible({ timeout: 10000 });

    // Click on test agent
    const testAgentIcon = window.locator(`[data-testid="agent-icon-${testAgentId}"]`);
    await expect(testAgentIcon).toBeVisible({ timeout: 5000 });
    await testAgentIcon.click();

    // Get initial timestamp from header
    const headerTimestamp = window.locator('[data-testid="agent-header-timestamp"]');
    await expect(headerTimestamp).toBeVisible({ timeout: 5000 });
    const timestampBefore = await headerTimestamp.textContent();
    expect(timestampBefore).toBeTruthy();

    // Send new message
    const textarea = window.locator('textarea[placeholder*="Ask"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill('New message to update timestamp');
    await textarea.press('Enter');

    // Verify message appears
    const messageText = window.locator('text=New message to update timestamp');
    await expect(messageText).toBeVisible({ timeout: 5000 });

    // Wait for timestamp to update
    await window.waitForFunction(
      (initialTimestamp) => {
        const timestampElement = document.querySelector('[data-testid="agent-header-timestamp"]');
        return timestampElement && timestampElement.textContent !== initialTimestamp;
      },
      timestampBefore,
      { timeout: 3000 }
    );

    const timestampAfter = await headerTimestamp.textContent();
    expect(timestampAfter).toBeTruthy();
    expect(timestampAfter).not.toBe(timestampBefore);
  });
});
