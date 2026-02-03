// Requirements: ui.1, ui.4, ui.5

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { screen } from 'electron';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';

// Mock Electron's BrowserWindow and screen APIs
jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(function (
    this: Record<string, unknown>,
    options: Record<string, unknown>
  ) {
    this.bounds = {
      x: (options.x as number) || 0,
      y: (options.y as number) || 0,
      width: (options.width as number) || 800,
      height: (options.height as number) || 600,
    };
    this.maximized = false;
    this.destroyed = false;
    this.listeners = new Map();

    this.loadFile = jest.fn().mockResolvedValue(undefined);
    this.on = jest.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (!(this.listeners as Map<string, unknown[]>).has(event)) {
        (this.listeners as Map<string, unknown[]>).set(event, []);
      }
      (this.listeners as Map<string, unknown[]>).get(event)?.push(callback);
    });
    this.once = jest.fn();
    this.emit = jest.fn((event: string, ...args: unknown[]) => {
      const callbacks =
        (this.listeners as Map<string, ((...args: unknown[]) => void)[]>).get(event) || [];
      callbacks.forEach((cb: (...args: unknown[]) => void) => cb(...args));
    });
    this.removeAllListeners = jest.fn(() => {
      (this.listeners as Map<string, unknown[]>).clear();
    });
    this.close = jest.fn();
    this.destroy = jest.fn(() => {
      this.destroyed = true;
    });
    this.isDestroyed = jest.fn(() => this.destroyed);
    this.setSize = jest.fn((width: number, height: number) => {
      (this.bounds as Record<string, number>).width = width;
      (this.bounds as Record<string, number>).height = height;
    });
    this.setPosition = jest.fn((x: number, y: number) => {
      (this.bounds as Record<string, number>).x = x;
      (this.bounds as Record<string, number>).y = y;
    });
    this.setBounds = jest.fn((bounds: Record<string, number>) => {
      this.bounds = { ...(this.bounds as Record<string, number>), ...bounds };
    });
    this.getBounds = jest.fn(() => ({ ...(this.bounds as Record<string, number>) }));
    this.getPosition = jest.fn(() => [
      (this.bounds as Record<string, number>).x,
      (this.bounds as Record<string, number>).y,
    ]);
    this.maximize = jest.fn(() => {
      this.maximized = true;
    });
    this.unmaximize = jest.fn(() => {
      this.maximized = false;
    });
    this.isMaximized = jest.fn(() => this.maximized);
    this.show = jest.fn();
    this.webContents = {
      session: {
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
      },
      on: jest.fn(),
    };

    return this;
  }),
  screen: {
    getPrimaryDisplay: jest.fn(() => ({
      workAreaSize: { width: 1920, height: 1080 },
    })),
    getAllDisplays: jest.fn(() => [
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
  },
}));

/**
 * Integration tests for window state persistence across application restarts
 * These tests use real DataManager and WindowStateManager instances to verify
 * end-to-end functionality of window state persistence
 */
describe('Window State Integration Tests', () => {
  let testDbPath: string;
  let dataManager: DataManager;
  let windowManager: WindowManager;

  beforeEach(() => {
    // Create a temporary directory for test database
    testDbPath = path.join(os.tmpdir(), `clerkly-test-${Date.now()}`);
    if (!fs.existsSync(testDbPath)) {
      fs.mkdirSync(testDbPath, { recursive: true });
    }

    // Initialize real DataManager with test database
    dataManager = new DataManager(testDbPath);
    dataManager.initialize();

    // Create WindowManager with real DataManager
    // Requirements: ui.5
    windowManager = new WindowManager(dataManager);
  });

  afterEach(() => {
    // Clean up window
    if (windowManager && windowManager.isWindowCreated()) {
      const window = windowManager.getWindow();
      if (window && !window.isDestroyed()) {
        window.destroy();
      }
      windowManager.closeWindow();
    }

    // Clean up database
    if (dataManager) {
      dataManager.close();
    }

    // Clean up test directory
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  /* Preconditions: fresh application start, no saved state
     Action: create window, modify state, restart application
     Assertions: window opens with saved state
     Requirements: ui.1, ui.4, ui.5 */
  it('should persist and restore window state across restarts', async () => {
    // First launch - create window with default state
    const window1 = windowManager.createWindow();

    // Verify window was created
    expect(window1).toBeDefined();
    expect(windowManager.isWindowCreated()).toBe(true);

    // Get initial bounds (should be default state based on screen size)
    const initialBounds = window1.getBounds();
    expect(initialBounds.width).toBeGreaterThan(0);
    expect(initialBounds.height).toBeGreaterThan(0);

    // Modify window state - set specific bounds
    const newBounds = {
      x: 100,
      y: 100,
      width: 800,
      height: 600,
    };
    window1.setBounds(newBounds);

    // Wait a bit for the bounds to be applied
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger resize event to save state
    window1.emit('resize');

    // Wait for state to be saved
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify the bounds were applied
    const modifiedBounds = window1.getBounds();
    expect(modifiedBounds.x).toBe(newBounds.x);
    expect(modifiedBounds.y).toBe(newBounds.y);
    expect(modifiedBounds.width).toBe(newBounds.width);
    expect(modifiedBounds.height).toBe(newBounds.height);

    // Close the window (simulating application shutdown)
    window1.destroy();
    windowManager.closeWindow();

    // Verify window is closed
    expect(windowManager.isWindowCreated()).toBe(false);

    // Second launch - create new WindowManager (simulating app restart)
    // Requirements: ui.5
    const windowManager2 = new WindowManager(dataManager);
    const window2 = windowManager2.createWindow();

    // Verify window was created
    expect(window2).toBeDefined();
    expect(windowManager2.isWindowCreated()).toBe(true);

    // Wait for window to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify state was restored
    const restoredBounds = window2.getBounds();

    // Requirements: ui.5.1, ui.5.2, ui.5.4
    expect(restoredBounds.x).toBe(newBounds.x);
    expect(restoredBounds.y).toBe(newBounds.y);
    expect(restoredBounds.width).toBe(newBounds.width);
    expect(restoredBounds.height).toBe(newBounds.height);

    // Clean up second window
    window2.destroy();
    windowManager2.closeWindow();
  });

  /* Preconditions: fresh application start, no saved state
     Action: create window, maximize, restart application
     Assertions: window opens in maximized state
     Requirements: ui.1.1, ui.5.3, ui.5.4 */
  it('should persist and restore maximized state across restarts', async () => {
    // First launch - create window
    const window1 = windowManager.createWindow();

    // Verify window was created
    expect(window1).toBeDefined();

    // Unmaximize first (to ensure we're testing the maximize action)
    window1.unmaximize();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify window is not maximized
    expect(window1.isMaximized()).toBe(false);

    // Maximize the window
    window1.maximize();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify window is maximized
    expect(window1.isMaximized()).toBe(true);

    // Trigger maximize event to save state
    window1.emit('maximize');

    // Wait for state to be saved
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Close the window
    window1.destroy();
    windowManager.closeWindow();

    // Second launch - create new WindowManager
    // Requirements: ui.5
    const windowManager2 = new WindowManager(dataManager);
    const window2 = windowManager2.createWindow();

    // Wait for window to be ready
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify maximized state was restored
    // Requirements: ui.5.3, ui.5.4
    expect(window2.isMaximized()).toBe(true);

    // Clean up
    window2.destroy();
    windowManager2.closeWindow();
  });

  /* Preconditions: fresh application start, no saved state
     Action: create window, move to new position, restart application
     Assertions: window opens at saved position
     Requirements: ui.5.2, ui.5.4 */
  it('should persist and restore window position across restarts', async () => {
    // First launch - create window
    const window1 = windowManager.createWindow();

    // Move window to specific position
    const newPosition = { x: 250, y: 150 };
    window1.setPosition(newPosition.x, newPosition.y);

    // Wait for position to be applied
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger move event to save state
    window1.emit('move');

    // Wait for state to be saved
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify position was applied
    const position1 = window1.getPosition();
    expect(position1[0]).toBe(newPosition.x);
    expect(position1[1]).toBe(newPosition.y);

    // Close the window
    window1.destroy();
    windowManager.closeWindow();

    // Second launch - create new WindowManager
    // Requirements: ui.5
    const windowManager2 = new WindowManager(dataManager);
    const window2 = windowManager2.createWindow();

    // Wait for window to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify position was restored
    const position2 = window2.getPosition();

    // Requirements: ui.5.2, ui.5.4
    expect(position2[0]).toBe(newPosition.x);
    expect(position2[1]).toBe(newPosition.y);

    // Clean up
    window2.destroy();
    windowManager2.closeWindow();
  });

  /* Preconditions: fresh application start, no saved state
     Action: create window, verify default state
     Assertions: window opens with default state based on screen size
     Requirements: ui.1.1, ui.4.1, ui.4.2, ui.5.5 */
  it('should use default state on first launch when no saved state exists', async () => {
    // Create window (first launch, no saved state)
    const window = windowManager.createWindow();

    // Wait for window to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get screen size
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Calculate expected default dimensions (90% of screen size)
    const expectedWidth = Math.floor(screenWidth * 0.9);
    const expectedHeight = Math.floor(screenHeight * 0.9);
    const expectedX = Math.floor(screenWidth * 0.05);
    const expectedY = Math.floor(screenHeight * 0.05);

    // Get actual bounds
    const bounds = window.getBounds();

    // Verify default state
    // Requirements: ui.4.1, ui.4.2, ui.5.5
    expect(bounds.width).toBe(expectedWidth);
    expect(bounds.height).toBe(expectedHeight);
    expect(bounds.x).toBe(expectedX);
    expect(bounds.y).toBe(expectedY);

    // Verify window is maximized by default
    // Requirements: ui.1.1
    expect(window.isMaximized()).toBe(true);

    // Clean up
    window.destroy();
    windowManager.closeWindow();
  });

  /* Preconditions: saved state exists with multiple state changes
     Action: create window, change size, position, and maximize state multiple times, restart
     Assertions: final state is correctly persisted and restored
     Requirements: ui.5.1, ui.5.2, ui.5.3, ui.5.4 */
  it('should persist final state after multiple state changes', async () => {
    // First launch - create window
    const window1 = windowManager.createWindow();

    // Make multiple state changes
    // Change 1: Set initial bounds
    window1.setBounds({ x: 100, y: 100, width: 800, height: 600 });
    window1.emit('resize');
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Change 2: Move window
    window1.setPosition(200, 150);
    window1.emit('move');
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Change 3: Resize window
    window1.setSize(1000, 700);
    window1.emit('resize');
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Change 4: Maximize window
    window1.maximize();
    window1.emit('maximize');
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Change 5: Unmaximize and set final bounds
    window1.unmaximize();
    window1.emit('unmaximize');
    await new Promise((resolve) => setTimeout(resolve, 50));

    const finalBounds = { x: 300, y: 200, width: 1200, height: 800 };
    window1.setBounds(finalBounds);
    window1.emit('resize');
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify final state
    const bounds1 = window1.getBounds();
    expect(bounds1.x).toBe(finalBounds.x);
    expect(bounds1.y).toBe(finalBounds.y);
    expect(bounds1.width).toBe(finalBounds.width);
    expect(bounds1.height).toBe(finalBounds.height);
    expect(window1.isMaximized()).toBe(false);

    // Close the window
    window1.destroy();
    windowManager.closeWindow();

    // Second launch - verify final state was persisted
    // Requirements: ui.5
    const windowManager2 = new WindowManager(dataManager);
    const window2 = windowManager2.createWindow();

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify final state was restored
    const bounds2 = window2.getBounds();

    // Requirements: ui.5.1, ui.5.2, ui.5.3, ui.5.4
    expect(bounds2.x).toBe(finalBounds.x);
    expect(bounds2.y).toBe(finalBounds.y);
    expect(bounds2.width).toBe(finalBounds.width);
    expect(bounds2.height).toBe(finalBounds.height);
    expect(window2.isMaximized()).toBe(false);

    // Clean up
    window2.destroy();
    windowManager2.closeWindow();
  });
});
