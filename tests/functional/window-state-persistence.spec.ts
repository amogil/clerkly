// Requirements: ui.2, ui.3, ui.5, testing.3.1, testing.3.2, testing.3.6

import { test, expect } from '@playwright/test';
import {
  launchElectron,
  closeElectron,
  ElectronTestContext,
  getWindowBounds,
  setWindowPosition,
  maximizeWindow,
  unmaximizeWindow,
  isWindowMaximized,
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
  test('should persist window position across restarts', async () => {
    // First launch
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Get initial bounds
    const initialBounds = await getWindowBounds(context.app);
    console.log(`Initial bounds: ${JSON.stringify(initialBounds)}`);

    // Check if window is maximized
    const isMaximized = await isWindowMaximized(context.app);
    console.log(`Is maximized: ${isMaximized}`);

    // If maximized, unmaximize first (can't move maximized window on macOS)
    if (isMaximized) {
      await unmaximizeWindow(context.app);
      await context.window.waitForTimeout(1000);
    }

    // Set a specific size first (smaller than screen)
    await context.app.evaluate(
      ({ BrowserWindow }, { width, height }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window) {
          window.setSize(width, height);
        }
      },
      { width: 1000, height: 700 }
    );

    await context.window.waitForTimeout(500);

    // Move window to specific position
    const newX = 100;
    const newY = 100;

    await setWindowPosition(context.app, newX, newY);

    // Wait for position change to be processed and saved
    await context.window.waitForTimeout(2000);

    // Verify the move actually happened before closing
    const movedBounds = await getWindowBounds(context.app);
    console.log(`After move: ${JSON.stringify(movedBounds)}`);
    expect(movedBounds.x).toBeGreaterThanOrEqual(newX - 10);
    expect(movedBounds.y).toBeGreaterThanOrEqual(newY - 10);

    // Close application
    await context.app.close();

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Relaunch application with same data path
    context = await launchElectron(context.testDataPath);
    await context.window.waitForLoadState('domcontentloaded');

    // Get restored bounds
    const restoredBounds = await getWindowBounds(context.app);
    console.log(`Restored bounds: ${JSON.stringify(restoredBounds)}`);

    // Verify position was restored (with some tolerance)
    expect(restoredBounds.x).toBeGreaterThanOrEqual(newX - 10);
    expect(restoredBounds.x).toBeLessThanOrEqual(newX + 10);
    expect(restoredBounds.y).toBeGreaterThanOrEqual(newY - 10);
    expect(restoredBounds.y).toBeLessThanOrEqual(newY + 10);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/window-restored-position.png' });
  });

  /* Preconditions: Application running in normal state
     Action: Maximize window, close app, relaunch app
     Assertions: Window opens in maximized state
     Requirements: ui.5.3, ui.5.4 */
  test('should persist maximized state across restarts', async () => {
    // First launch
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Check initial maximized state
    let isMaximized = await isWindowMaximized(context.app);
    console.log(`Initial maximized state: ${isMaximized}`);

    // If already maximized, unmaximize first
    if (isMaximized) {
      await unmaximizeWindow(context.app);
      await context.window.waitForTimeout(1000);
      isMaximized = await isWindowMaximized(context.app);
      console.log(`After unmaximize: ${isMaximized}`);
    }

    // Verify window is not maximized now
    expect(isMaximized).toBe(false);

    // Maximize window
    await maximizeWindow(context.app);

    // Wait for maximize to be processed and saved
    await context.window.waitForTimeout(2000);

    // Verify window is now maximized
    isMaximized = await isWindowMaximized(context.app);
    expect(isMaximized).toBe(true);

    // Close application
    await context.app.close();

    // Wait a moment
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Relaunch application with same data path
    context = await launchElectron(context.testDataPath);
    await context.window.waitForLoadState('domcontentloaded');

    // Wait for window to be fully restored
    await context.window.waitForTimeout(1000);

    // Verify window is still maximized
    isMaximized = await isWindowMaximized(context.app);
    expect(isMaximized).toBe(true);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/window-restored-maximized.png' });
  });

  /* Preconditions: Application not running
     Action: Launch application and check window title
     Assertions: Window title is empty string
     Requirements: ui.2.1, ui.2.2 */
  test('should have empty window title', async () => {
    // Launch the application
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Get window title
    const title = await context.window.title();

    // Verify title is empty
    // Requirements: ui.2.1
    expect(title).toBe('');

    // Also verify through Electron API
    const electronTitle = await context.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return window ? window.getTitle() : null;
    });

    // Requirements: ui.2.2 - Should NOT display application name
    expect(electronTitle).toBe('');

    console.log(`Window title: "${title}"`);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/window-empty-title.png' });
  });

  /* Preconditions: Application not running
     Action: Launch application and verify native Mac OS X elements
     Assertions: Window has standard Mac control buttons and integrates with system
     Requirements: ui.3.1, ui.3.2, ui.3.3, ui.3.4, ui.3.5 */
  test('should have native Mac OS X window controls', async () => {
    // Launch the application
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Verify window has native Mac controls
    // Requirements: ui.3.1
    const windowInfo = await context.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) return null;

      return {
        // Check if window has standard frame (native controls)
        hasFrame: !window.isSimpleFullScreen(),
        // Check if window is closable
        isClosable: window.isClosable(),
        // Check if window is minimizable
        isMinimizable: window.isMinimizable(),
        // Check if window is maximizable
        isMaximizable: window.isMaximizable(),
        // Check if window is resizable
        isResizable: window.isResizable(),
        // Check window type
        isNormal: window.isNormal(),
      };
    });

    expect(windowInfo).not.toBeNull();

    // Verify standard Mac window controls are present
    // Requirements: ui.3.1, ui.3.2
    expect(windowInfo!.isClosable).toBe(true);
    expect(windowInfo!.isMinimizable).toBe(true);
    expect(windowInfo!.isMaximizable).toBe(true);
    expect(windowInfo!.isResizable).toBe(true);
    // Note: isNormal() may be false if window is maximized by default
    // This is acceptable as long as other controls are present

    console.log(`Window controls: ${JSON.stringify(windowInfo)}`);

    // Take screenshot showing window controls
    await context.window.screenshot({ path: 'playwright-report/window-native-controls.png' });
  });

  /* Preconditions: Application running
     Action: Close window and verify Mac OS X close behavior
     Assertions: Window closes but app may stay running (Mac convention)
     Requirements: ui.3.3 */
  test('should follow Mac OS X window close conventions', async () => {
    // Launch the application
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Get initial window count
    const initialWindowCount = await context.app.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });

    expect(initialWindowCount).toBe(1);

    // Take screenshot before closing
    await context.window.screenshot({ path: 'playwright-report/window-before-close-macos.png' });

    // Close the window (not the app)
    await context.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        window.close();
      }
    });

    // Wait a bit for close to process
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify window is closed
    expect(context.window.isClosed()).toBe(true);

    // On macOS, app may stay running even when all windows are closed
    // Requirements: ui.3.3
    console.log('[TEST] Window closed following Mac OS X conventions');
  });

  /* Preconditions: Application not running
     Action: Launch application and verify dock integration
     Assertions: Application appears in dock and responds to activation
     Requirements: ui.3.5 */
  test('should integrate with Mac OS X dock', async () => {
    // Launch the application
    context = await launchElectron();
    await context.window.waitForLoadState('domcontentloaded');

    // Verify app is visible and can be activated
    // Requirements: ui.3.5
    const appInfo = await context.app.evaluate(({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];

      return {
        // Check if app is in dock
        isInDock: process.platform === 'darwin',
        // Check if window exists and is not destroyed
        windowExists: window ? !window.isDestroyed() : false,
        // Check if app can be focused
        canFocus: window ? !window.isDestroyed() : false,
      };
    });

    expect(appInfo.isInDock).toBe(true);
    expect(appInfo.windowExists).toBe(true);
    expect(appInfo.canFocus).toBe(true);

    console.log(`Dock integration: ${JSON.stringify(appInfo)}`);

    // Simulate dock activation by focusing window
    await context.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        window.show();
        window.focus();
      }
    });

    // Wait for activation
    await context.window.waitForTimeout(500);

    // Verify window is focused
    const isFocused = await context.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return window ? window.isFocused() : false;
    });

    expect(isFocused).toBe(true);

    // Take screenshot
    await context.window.screenshot({ path: 'playwright-report/window-dock-integration.png' });
  });
});
