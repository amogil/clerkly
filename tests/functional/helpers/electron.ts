// Requirements: testing.3.1, testing.3.2, testing.3.6

import { _electron as electron, ElectronApplication, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import { MockOAuthServer } from './mock-oauth-server';

/**
 * Find a free TCP port by binding to port 0 and letting the OS assign one.
 * Requirements: testing.3.9
 */
export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    server.on('error', reject);
  });
}

/**
 * Electron Test Helper
 *
 * Utilities for launching and interacting with Electron application in tests.
 *
 * Requirements: testing.3.1 - Use real Electron
 * Requirements: testing.3.2 - Do NOT mock Electron API
 * Requirements: testing.3.6 - Show real windows on screen
 */

export interface ElectronTestContext {
  app: ElectronApplication;
  window: Page;
  testDataPath: string;
}

/**
 * Launch Electron application for testing
 *
 * @param testDataPath - Path to temporary test data directory
 * @param env - Additional environment variables
 * @returns ElectronApplication and first window
 */
export async function launchElectron(
  testDataPath?: string,
  env?: Record<string, string>
): Promise<ElectronTestContext> {
  // Create temporary test data directory if not provided
  if (!testDataPath) {
    testDataPath = path.join(
      os.tmpdir(),
      `clerkly-functional-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );
  }

  // Ensure directory exists
  fs.mkdirSync(testDataPath, { recursive: true });

  // Path to the built Electron app
  const electronPath = require('electron') as unknown as string;
  const appPath = path.join(__dirname, '../../../dist/main/main/index.js');

  // Launch Electron
  // Requirements: testing.3.1, testing.3.2
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appPath, '--user-data-dir', testDataPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ...env, // Merge additional environment variables
    },
  });

  // Wait for the first window to open
  // Requirements: testing.3.6 - Real window will be shown
  const window = await app.firstWindow();

  // Wait for the window to be ready
  await window.waitForLoadState('domcontentloaded');

  return { app, window, testDataPath };
}

/**
 * Close Electron application and cleanup
 *
 * @param context - Electron test context
 * @param cleanup - Whether to delete test data directory (default: true)
 */
export async function closeElectron(
  context: ElectronTestContext,
  cleanup: boolean = true
): Promise<void> {
  // Close the application
  await context.app.close();

  // Cleanup test data directory
  // Requirements: testing.3.7
  if (cleanup && fs.existsSync(context.testDataPath)) {
    try {
      fs.rmSync(context.testDataPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup test data: ${error}`);
    }
  }
}

/**
 * Wait for condition with timeout
 *
 * @param condition - Function that returns true when condition is met
 * @param timeout - Timeout in milliseconds
 * @param interval - Check interval in milliseconds
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await Promise.resolve(condition());
    if (result) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Get window bounds directly from Electron
 *
 * @param app - ElectronApplication object
 * @returns Window bounds
 */
export async function getWindowBounds(app: ElectronApplication): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  return await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      return window.getBounds();
    }
    return { x: 0, y: 0, width: 800, height: 600 };
  });
}

/**
 * Check if window is maximized
 *
 * @param app - ElectronApplication object
 * @returns true if window is maximized
 */
export async function isWindowMaximized(app: ElectronApplication): Promise<boolean> {
  return await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return window ? window.isMaximized() : false;
  });
}

/**
 * Set window position
 *
 * @param app - ElectronApplication object
 * @param x - X coordinate
 * @param y - Y coordinate
 */
export async function setWindowPosition(
  app: ElectronApplication,
  x: number,
  y: number
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, { x, y }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        window.setPosition(x, y);
      }
    },
    { x, y }
  );
}

/**
 * Maximize window
 *
 * @param app - ElectronApplication object
 */
export async function maximizeWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.maximize();
    }
  });
}

/**
 * Unmaximize window
 *
 * @param app - ElectronApplication object
 */
export async function unmaximizeWindow(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.unmaximize();
    }
  });
}

/**
 * Complete OAuth flow with deep link
 * This is the recommended way to authenticate in tests
 *
 * @param electronApp - Electron application instance
 * @param window - Playwright Page object
 * @param clientId - Optional client ID (defaults to test-client-id-12345)
 * @throws Error if not in test environment
 */
export async function completeOAuthFlow(
  electronApp: ElectronApplication,
  window: Page,
  clientId: string = 'test-client-id-12345'
): Promise<void> {
  // Verify we're in test environment
  const isTest = process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === '1';
  if (!isTest) {
    throw new Error(
      'completeOAuthFlow() can only be used in test environment. Set NODE_ENV=test or PLAYWRIGHT_TEST=1'
    );
  }

  // Start OAuth flow to generate PKCE parameters
  await window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('auth:start-login');
  });

  // Wait for OAuth flow to initialize
  await window.waitForTimeout(2000);

  // Get PKCE state from OAuthClientManager
  const pkceState = await electronApp.evaluate(async () => {
    const { oauthClient } = (global as any).testContext || {};
    if (!oauthClient || !oauthClient.pkceStorage) {
      throw new Error('PKCE storage not found');
    }
    return oauthClient.pkceStorage.state;
  });

  // Generate authorization code
  const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Construct deep link URL
  const redirectUri = `com.googleusercontent.apps.${clientId}:/oauth2redirect`;
  const deepLinkUrl = `${redirectUri}?code=${authCode}&state=${pkceState}`;

  // Trigger deep link handling
  await window.evaluate(async (url) => {
    return await (window as any).electron.ipcRenderer.invoke('test:handle-deep-link', url);
  }, deepLinkUrl);

  // Wait for profile to be fetched and saved
  await window.waitForTimeout(5000);

  // Check if still on login screen, reload if needed
  const loginButton = window.locator('button:has-text("Continue with Google")');
  let hasLoginScreen = await loginButton.isVisible().catch(() => false);

  let retries = 0;
  while (hasLoginScreen && retries < 5) {
    console.log(`[TEST] Still on login screen, reloading (attempt ${retries + 1}/5)`);
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(3000);
    hasLoginScreen = await loginButton.isVisible().catch(() => false);
    retries++;
  }

  if (hasLoginScreen) {
    throw new Error('Failed to complete OAuth flow: still on login screen after 5 retries');
  }
}

/**
 * Complete OAuth flow that results in an error
 * This simulates OAuth flow that fails during profile fetch
 *
 * @param electronApp - Electron application instance
 * @param window - Playwright Page object
 * @param clientId - Optional client ID (defaults to test-client-id-12345)
 * @throws Error if not in test environment or if error screen is not shown
 */
export async function completeOAuthFlowWithError(
  electronApp: ElectronApplication,
  window: Page,
  clientId: string = 'test-client-id-12345'
): Promise<void> {
  // Verify we're in test environment
  const isTest = process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === '1';
  if (!isTest) {
    throw new Error(
      'completeOAuthFlowWithError() can only be used in test environment. Set NODE_ENV=test or PLAYWRIGHT_TEST=1'
    );
  }

  // Start OAuth flow to generate PKCE parameters
  await window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('auth:start-login');
  });

  // Wait for OAuth flow to initialize
  await window.waitForTimeout(2000);

  // Get PKCE state from OAuthClientManager
  const pkceState = await electronApp.evaluate(async () => {
    const { oauthClient } = (global as any).testContext || {};
    if (!oauthClient || !oauthClient.pkceStorage) {
      throw new Error('PKCE storage not found');
    }
    return oauthClient.pkceStorage.state;
  });

  // Generate authorization code
  const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Construct deep link URL
  const redirectUri = `com.googleusercontent.apps.${clientId}:/oauth2redirect`;
  const deepLinkUrl = `${redirectUri}?code=${authCode}&state=${pkceState}`;

  // Trigger deep link handling (this will fail during profile fetch due to mock server error)
  await window.evaluate(async (url) => {
    return await (window as any).electron.ipcRenderer.invoke('test:handle-deep-link', url);
  }, deepLinkUrl);

  // Wait for error to be processed and error screen to appear
  await window.waitForTimeout(5000);

  // Check if error screen is displayed
  const errorMessage = window.locator('text=/unable to load your google profile/i');
  const hasErrorScreen = await errorMessage.isVisible().catch(() => false);

  if (!hasErrorScreen) {
    // Try reloading to see if error screen appears
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(2000);

    const hasErrorScreenAfterReload = await errorMessage.isVisible().catch(() => false);
    if (!hasErrorScreenAfterReload) {
      throw new Error('Failed to complete OAuth flow with error: error screen not displayed');
    }
  }
}

/**
 * Clear all tokens using IPC handler
 *
 * @param window - Playwright Page object
 */
export async function clearTestTokens(window: Page): Promise<void> {
  await window.evaluate(async () => {
    await (window as any).electron.ipcRenderer.invoke('test:clear-tokens');
  });
}
/**
 * Locators scoped to the currently active (visible) AgentChat.
 *
 * Because all AgentChat components are mounted simultaneously and hidden via
 * CSS `display:none`, plain locators like `textarea[placeholder*="Ask"]` match
 * multiple elements and trigger Playwright strict-mode violations.
 *
 * Use these helpers everywhere you need to interact with the active chat.
 *
 * Requirements: agents.13.3, agents.13.5
 */
export function activeChat(window: Page) {
  // The active AgentChat is the one NOT hidden — it has no "hidden" class.
  // We scope all child locators to it so strict-mode is never violated.
  const chat = window.locator('[data-testid="agents"] > div > div:not(.hidden)').last();

  return {
    /** The visible textarea input */
    textarea: chat.locator('textarea[placeholder*="Ask"]'),
    /** The scrollable messages viewport */
    messagesArea: chat.locator('[data-testid="messages-area"]'),
    /** All message wrappers (motion.div) */
    messages: chat.locator('[data-testid="message"]'),
    /** User message bubbles */
    userMessages: chat.locator('[data-testid="message-user"]'),
    /** LLM message bubbles */
    llmMessages: chat.locator('[data-testid="message-llm"]'),
    /** Error message bubbles */
    errorMessages: chat.locator('[data-testid="message-error"]'),
  };
}

/**
 * Assert that no toast error notifications are visible on screen.
 * Fails the test with the toast message if an error toast is found.
 *
 * Sonner renders toasts inside [data-sonner-toaster]; each toast is [data-sonner-toast].
 * Error toasts carry data-type="error".
 *
 * Requirements: testing.12.1, testing.12.2, testing.12.5
 */
export async function expectNoToastError(window: Page): Promise<void> {
  const errorToast = window.locator('[data-sonner-toast][data-type="error"]');
  const count = await errorToast.count();
  if (count > 0) {
    const text = await errorToast.first().textContent();
    throw new Error(`Toast error detected: ${text?.trim()}`);
  }
}

/**
 * Create and start a MockOAuthServer on a free port chosen by the OS.
 * Pass an explicit port only when you need a fixed address (legacy usage).
 *
 * @param port - Optional port number. Omit to use a random free port.
 * @returns MockOAuthServer instance (already started)
 *
 * Requirements: testing.3.9 - Mock external services in functional tests
 */
export async function createMockOAuthServer(port?: number): Promise<MockOAuthServer> {
  const resolvedPort = port ?? (await getFreePort());
  const mockServer = new MockOAuthServer({
    port: resolvedPort,
    clientId: 'test-client-id-12345',
    clientSecret: 'test-client-secret-67890',
  });

  await mockServer.start();
  return mockServer;
}
