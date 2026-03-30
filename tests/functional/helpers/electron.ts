// Requirements: testing.3.1, testing.3.2, testing.3.6

import { expect } from '@playwright/test';
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
 * Read PKCE state from OAuthClientManager in test context.
 * Requirements: testing.3.1
 */
export async function getPkceState(electronApp: ElectronApplication): Promise<string> {
  return electronApp.evaluate(async () => {
    const { oauthClient } = (global as any).testContext || {};
    if (!oauthClient || !oauthClient.pkceStorage?.state) {
      throw new Error('PKCE storage not found');
    }
    return oauthClient.pkceStorage.state as string;
  });
}

/**
 * Wait until PKCE state is available in test context.
 * Requirements: testing.3.1
 */
export async function waitForPkceState(
  electronApp: ElectronApplication,
  timeoutMs = 5000
): Promise<void> {
  await waitFor(async () => {
    try {
      const state = await getPkceState(electronApp);
      return typeof state === 'string' && state.length > 0;
    } catch {
      return false;
    }
  }, timeoutMs);
}

async function isLoginScreenVisible(window: Page): Promise<boolean> {
  if (window.isClosed()) return false;
  const loginButton = window.locator('button:has-text("Continue with Google")');
  return loginButton.isVisible().catch(() => false);
}

async function isAgentsScreenVisible(window: Page): Promise<boolean> {
  if (window.isClosed()) return false;
  return window
    .locator('[data-testid="agents"]')
    .isVisible()
    .catch(() => false);
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

  const sanitizedEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => key !== 'ELECTRON_RUN_AS_NODE' && value !== undefined
    )
  ) as Record<string, string>;

  // Launch Electron
  // Requirements: testing.3.1, testing.3.2
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appPath, '--user-data-dir', testDataPath],
    env: {
      ...sanitizedEnv,
      NODE_ENV: 'test',
      ...env, // Merge additional environment variables
    },
  });

  // Wait for the first window to open.
  // If firstWindow() or waitForLoadState() times out (flaky CI), kill the
  // Electron process so it does not leak and cause worker teardown timeouts.
  // Requirements: testing.3.6 - Real window will be shown
  let window: Page;
  try {
    window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
  } catch (error) {
    try {
      const proc = app.process();
      if (proc && !proc.killed) {
        proc.kill('SIGKILL');
      }
    } catch {
      // Ignore kill errors — process may have already exited.
    }
    throw error;
  }

  return { app, window, testDataPath };
}

/**
 * Launch Electron with Mock OAuth environment variables
 *
 * @param mockServer - Mock OAuth server instance
 * @param envOverrides - Additional environment variables or overrides
 */
export async function launchElectronWithMockOAuth(
  mockServer: MockOAuthServer,
  envOverrides: Record<string, string> = {},
  testDataPath?: string
): Promise<ElectronTestContext> {
  return launchElectron(testDataPath, {
    CLERKLY_GOOGLE_API_URL: mockServer.getBaseUrl(),
    CLERKLY_OAUTH_CLIENT_ID: 'test-client-id-12345',
    CLERKLY_OAUTH_CLIENT_SECRET: 'test-client-secret-67890',
    ...envOverrides,
  });
}

/**
 * Close Electron application and cleanup
 *
 * @param context - Electron test context
 * @param cleanup - Whether to delete test data directory (default: true)
 */
export async function closeElectron(
  context: ElectronTestContext,
  cleanup: boolean = true,
  checkToastErrors: boolean = true
): Promise<void> {
  let toastError: Error | null = null;
  let closeError: Error | null = null;

  // Requirements: testing.12.1, testing.12.2, testing.12.5
  // Enforce global toast-error check by default for functional tests.
  if (checkToastErrors && !context.window.isClosed()) {
    try {
      await expectNoToastError(context.window);
    } catch (error) {
      toastError = error as Error;
    }
  }

  // Close the application even when toast assertion fails.
  // Guard close with timeout to avoid afterEach hook hangs in CI.
  const closeTimeoutMs = 10000;
  try {
    await Promise.race([
      context.app.close(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timed out closing Electron app after ${closeTimeoutMs}ms`)),
          closeTimeoutMs
        )
      ),
    ]);
  } catch (error) {
    closeError = error as Error;

    // Fallback: force-kill Electron process if graceful close hangs.
    try {
      const processRef = context.app.process();
      if (processRef && !processRef.killed) {
        processRef.kill('SIGKILL');
      }
    } catch {
      // Ignore force-kill errors; continue cleanup and surface toast failures first.
    }
  }

  // Cleanup test data directory
  // Requirements: testing.3.7
  if (cleanup && fs.existsSync(context.testDataPath)) {
    try {
      fs.rmSync(context.testDataPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup test data: ${error}`);
    }
  }

  if (toastError) {
    throw toastError;
  }

  if (closeError) {
    console.warn(`[TEST] closeElectron fallback used: ${closeError.message}`);
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
    return { x: 0, y: 0, width: 900, height: 800 };
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

  await waitForPkceState(electronApp);

  // Get PKCE state from OAuthClientManager
  const pkceState = await getPkceState(electronApp);

  // Generate authorization code
  const authCode = `test_auth_code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Construct deep link URL
  const redirectUri = `com.googleusercontent.apps.${clientId}:/oauth2redirect`;
  const deepLinkUrl = `${redirectUri}?code=${authCode}&state=${pkceState}`;

  // Trigger deep link handling
  await window.evaluate(async (url) => {
    return await (window as any).electron.ipcRenderer.invoke('test:handle-deep-link', url);
  }, deepLinkUrl);

  // Wait until auth flow leaves login screen or reaches agents screen.
  await waitFor(async () => {
    if (window.isClosed()) return false;
    const [loginVisible, agentsVisible] = await Promise.all([
      isLoginScreenVisible(window),
      isAgentsScreenVisible(window),
    ]);
    return agentsVisible || !loginVisible;
  }, 15000);

  // Check if still on login screen, reload if needed
  const loginButton = window.locator('button:has-text("Continue with Google")');
  let hasLoginScreen = await loginButton.isVisible().catch(() => false);

  let retries = 0;
  while (hasLoginScreen && retries < 5) {
    console.log(`[TEST] Still on login screen, reloading (attempt ${retries + 1}/5)`);
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await waitFor(async () => !(await isLoginScreenVisible(window)), 5000).catch(() => {
      // Continue retry loop if login still visible after timeout.
    });
    hasLoginScreen = await loginButton.isVisible().catch(() => false);
    retries++;
  }

  if (hasLoginScreen) {
    throw new Error('Failed to complete OAuth flow: still on login screen after 5 retries');
  }

  // Requirements: testing.12.1, testing.12.2, testing.12.5
  // OAuth is a key action; assert that it did not produce unexpected error toasts.
  await expectNoToastError(window);
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

  await waitForPkceState(electronApp);

  // Get PKCE state from OAuthClientManager
  const pkceState = await getPkceState(electronApp);

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
  const errorMessage = window.locator('text=/unable to load your google profile/i');
  await waitFor(async () => errorMessage.isVisible().catch(() => false), 15000);

  // Check if error screen is displayed
  const hasErrorScreen = await errorMessage.isVisible().catch(() => false);

  if (!hasErrorScreen) {
    // Try reloading to see if error screen appears
    await window.reload();
    await window.waitForLoadState('domcontentloaded');
    await waitFor(async () => errorMessage.isVisible().catch(() => false), 5000).catch(() => {
      // Fall through to explicit final assertion below.
    });

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
  // Inactive chats are kept mounted and include "pointer-events-none".
  // Scope to the interactive chat root only.
  const chat = window.locator('[data-testid="agent-chat-root"]:not(.pointer-events-none)');

  return {
    /** The visible textarea input */
    textarea: chat.locator('textarea[placeholder*="Ask"]'),
    /** The scrollable messages viewport */
    messagesArea: chat.locator('[data-testid="messages-area"]'),
    /** All message wrappers (motion.div) */
    messages: chat.locator('[data-testid="message"]'),
    /** User message bubbles */
    userMessages: chat.locator('[data-testid="message-user"]'),
    /** Assistant response bubbles (excludes Final Answer blocks) */
    llmMessages: chat.locator('.message-llm-response'),
    /** Assistant response content blocks (primary model text stream/result) */
    llmResponseActions: chat.locator('.message-llm-action-response'),
    /** Final Answer blocks */
    completedMessages: chat.locator('[data-testid="message-final-answer-block"]'),
    /** Final Answer checklist items */
    completedActions: chat.locator('[data-testid="message-final-answer-item"]'),
    /** Error message bubbles */
    errorMessages: chat.locator('[data-testid="message-error"]'),
    /** Scroll-to-bottom button (scoped to active chat to avoid strict-mode violations) */
    scrollToBottomBtn: chat.locator('[data-testid="scroll-to-bottom"]'),
  };
}

/**
 * Read agent IDs from the API (ordered by updatedAt DESC).
 */
// Requirements: testing.10
export async function getAgentIdsFromApi(window: Page): Promise<string[]> {
  return window.evaluate(async () => {
    const api = (globalThis as any).api;
    const agents = await api.agents.list();
    if (agents.success && agents.data) {
      return (agents.data as Array<{ id: string }>).map((agent) => agent.id);
    }
    return [];
  });
}

/**
 * Read agent IDs from the header icons list (ordered by DOM).
 */
// Requirements: testing.10
export async function getAgentIdsFromHeader(window: Page): Promise<string[]> {
  return window.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="agent-icon-"]'))
      .map((el) => el.getAttribute('data-testid'))
      .filter((id): id is string => Boolean(id))
      .map((id) => id.replace('agent-icon-', ''))
  );
}

/**
 * Read agent IDs from the AllAgents list (ordered by DOM).
 */
// Requirements: testing.10
export async function getAgentIdsFromAllAgents(window: Page): Promise<string[]> {
  return window.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="agent-card-"]'))
      .map((el) => el.getAttribute('data-testid'))
      .filter((id): id is string => Boolean(id))
      .map((id) => id.replace('agent-card-', ''))
  );
}

/**
 * Agents screen root locator.
 */
// Requirements: testing.10
export function agentsScreen(window: Page) {
  return window.locator('[data-testid="agents"]');
}

/**
 * Expect Agents screen to be visible.
 */
// Requirements: testing.10
export async function expectAgentsVisible(window: Page, timeout = 10000): Promise<void> {
  await expect(agentsScreen(window)).toBeVisible({ timeout });
}

/**
 * Expect Agents screen wrapper to be hidden via CSS (opacity-0).
 */
// Requirements: testing.10
export async function expectAgentsHiddenByCss(window: Page, timeout = 3000): Promise<void> {
  const agentsWrapper = agentsScreen(window).locator('..');
  await expect(agentsWrapper).toHaveClass(/opacity-0/, { timeout });
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
 * Kill Electron application via SIGKILL (simulates hard crash).
 * Does NOT clean up testDataPath — the DB must be preserved for relaunch.
 * Returns the testDataPath so it can be reused in a subsequent launchElectron call.
 *
 * Requirements: llm-integration.11.6.3, llm-integration.11.6.4
 */
export async function killElectron(context: ElectronTestContext): Promise<string> {
  const proc = context.app.process();
  const pid = proc.pid;

  if (!pid) {
    throw new Error('killElectron: Electron process has no PID');
  }

  // Send SIGKILL to the Electron process
  process.kill(pid, 'SIGKILL');

  // Wait for the process to exit (poll killed flag)
  await waitFor(
    () => {
      try {
        // process.kill(pid, 0) throws if PID no longer exists
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    },
    10000,
    100
  );

  return context.testDataPath;
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
