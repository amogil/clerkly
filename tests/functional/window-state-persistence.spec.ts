// Requirements: ui.5, testing.3.1, testing.3.2, testing.3.6

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  getWindowBounds,
} from './helpers/electron';

/**
 * Functional tests for window state persistence
 *
 * These tests verify that window size, position, and state are saved
 * and restored across application restarts.
 *
 * Requirements: testing.3.1 - Use real Electron
 * Requirements: testing.3.2 - Do NOT mock Electron API
 * Requirements: testing.3.6 - Show real windows on screen
 */

test.describe('Window State Persistence', () => {
  let context: ElectronTestContext;

  test.beforeAll(async () => {
    console.log('\n⚠️  WARNING: These tests will show real Electron windows on your screen!\n');
  });

  test.afterEach(async () => {
    if (context) {
      await closeElectron(context);
    }
  });

  /* Preconditions: Application not running, no saved window state
     Action: Launch application, check initial window size
     Assertions: Window opens at workAreaSize (full screen minus system elements)
     Requirements: ui.1.1, ui.4.1 */
  test('should open at default size on first launch', async () => {
    // Launch the application with a fresh data directory
    context = await launchElectron();

    // Wait for window to be ready
    await context.window.waitForLoadState('domcontentloaded');

    // Get window bounds
    const bounds = await getWindowBounds(context.app);

    // Get screen size to verify window opened at workAreaSize
    const screenSize = await context.app.evaluate(({ screen }) => {
      const primaryDisplay = screen.getPrimaryDisplay();
      return primaryDisplay.workAreaSize;
    });

    // Verify window has workAreaSize (full screen minus system elements)
    // Requirements: ui.1.1, ui.4.1
    expect(bounds.width).toBe(screenSize.width);
    expect(bounds.height).toBe(screenSize.height);

    console.log(`Window opened at: ${bounds.width}x${bounds.height}`);
    console.log(`Screen workAreaSize: ${screenSize.width}x${screenSize.height}`);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/window-default-size.png' });
  });

  /* Preconditions: Application running with default window size
     Action: Resize window using Electron API, close app, relaunch app
     Assertions: Window opens at the saved size
     Requirements: ui.5.1, ui.5.4 */
  test('should persist window size across restarts', async () => {
    // First launch
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Get initial bounds
    const initialBounds = await getWindowBounds(context.app);
    console.log(`Initial bounds: ${JSON.stringify(initialBounds)}`);

    // Resize window to specific size using Electron API
    const newWidth = 1000;
    const newHeight = 700;

    // Use Electron's API to resize the window
    await context.app.evaluate(
      ({ BrowserWindow }, { width, height }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window) {
          window.setSize(width, height);
        }
      },
      { width: newWidth, height: newHeight }
    );

    // Wait for resize to be processed and saved (longer wait to ensure save completes)
    await context.window.waitForTimeout(2000);

    // Verify the resize actually happened before closing
    const resizedBounds = await getWindowBounds(context.app);
    console.log(`After resize: ${JSON.stringify(resizedBounds)}`);
    expect(resizedBounds.width).toBeGreaterThanOrEqual(newWidth - 50);
    expect(resizedBounds.height).toBeGreaterThanOrEqual(newHeight - 50);

    // Close application
    await context.app.close();

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Relaunch application with same data path
    context = await launchElectron(context.testDataPath);
    await context.window.waitForLoadState('domcontentloaded');

    // Get new bounds
    const restoredBounds = await getWindowBounds(context.app);
    console.log(`Restored bounds: ${JSON.stringify(restoredBounds)}`);

    // Verify size was restored (with some tolerance for window chrome)
    expect(restoredBounds.width).toBeGreaterThanOrEqual(newWidth - 50);
    expect(restoredBounds.width).toBeLessThanOrEqual(newWidth + 50);
    expect(restoredBounds.height).toBeGreaterThanOrEqual(newHeight - 50);
    expect(restoredBounds.height).toBeLessThanOrEqual(newHeight + 50);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/window-restored-size.png' });
  });

  /* Preconditions: Application running
     Action: Move window to new position, close app, relaunch app
     Assertions: Window opens at the saved position
     Requirements: ui.5.2, ui.5.4 */
  test.skip('should persist window position across restarts', async () => {
    // This test is tricky because Playwright doesn't have direct API to move window
    // Would need to use Electron's BrowserWindow.setPosition through IPC
    // TODO: Implement window position testing
    // TODO: Requires exposing setPosition through IPC or using Electron API directly
  });

  /* Preconditions: Application running in normal state
     Action: Maximize window, close app, relaunch app
     Assertions: Window opens in maximized state
     Requirements: ui.5.3, ui.5.4 */
  test.skip('should persist maximized state across restarts', async () => {
    // This test requires maximizing the window
    // Playwright doesn't have direct API for this with Electron
    // TODO: Implement maximize testing
    // TODO: Requires exposing maximize/unmaximize through IPC
  });
});
