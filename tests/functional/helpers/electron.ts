// Requirements: testing.3.1, testing.3.2, testing.3.6

import { _electron as electron, ElectronApplication, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

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
  const appPath = path.join(__dirname, '../../../dist/main/index.js');

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
 */
export async function closeElectron(context: ElectronTestContext): Promise<void> {
  // Close the application
  await context.app.close();

  // Cleanup test data directory
  // Requirements: testing.3.7
  if (fs.existsSync(context.testDataPath)) {
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
 * Setup test tokens using IPC handler
 *
 * @param window - Playwright Page object
 * @param tokens - Token data to setup
 */
export async function setupTestTokens(
  window: Page,
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    tokenType?: string;
  }
): Promise<void> {
  const defaultTokens = {
    accessToken: tokens?.accessToken || 'test_access_token',
    refreshToken: tokens?.refreshToken || 'test_refresh_token',
    expiresIn: tokens?.expiresIn || 3600,
    tokenType: tokens?.tokenType || 'Bearer',
  };

  await window.evaluate(async (tokens) => {
    await (window as any).electron.ipcRenderer.invoke('test:setup-tokens', tokens);
  }, defaultTokens);
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
 * Get token status using IPC handler
 *
 * @param window - Playwright Page object
 */
export async function getTokenStatus(window: Page): Promise<{
  hasTokens: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}> {
  return await window.evaluate(async () => {
    return await (window as any).electron.ipcRenderer.invoke('test:get-token-status');
  });
}
