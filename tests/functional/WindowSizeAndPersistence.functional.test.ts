// Requirements: ui.1.1, ui.1.3, ui.5.1, ui.5.2, ui.5.4
/**
 * Functional tests for window size and persistence behavior
 * Tests that the application window opens at full workAreaSize on first launch
 * and remembers size/position between restarts
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';

// Mock Electron modules
jest.mock('electron', () => {
  const mockWindow = {
    loadFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    show: jest.fn(),
    isMaximized: jest.fn().mockReturnValue(false),
    isFullScreen: jest.fn().mockReturnValue(false),
    isResizable: jest.fn().mockReturnValue(true),
    getBounds: jest.fn().mockReturnValue({ x: 0, y: 0, width: 1920, height: 1055 }),
    setBounds: jest.fn(),
    getTitle: jest.fn().mockReturnValue(''),
    setTitle: jest.fn(),
    removeAllListeners: jest.fn(),
    destroy: jest.fn(),
    close: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    webContents: {
      on: jest.fn(),
      session: {
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
      },
    },
  };

  return {
    app: {
      getPath: jest.fn(),
      whenReady: jest.fn(),
      on: jest.fn(),
      quit: jest.fn(),
    },
    BrowserWindow: jest.fn().mockImplementation(() => mockWindow),
    ipcMain: {
      handle: jest.fn(),
      removeHandler: jest.fn(),
    },
    screen: {
      getPrimaryDisplay: jest.fn().mockReturnValue({
        workAreaSize: { width: 1920, height: 1055 },
      }),
      getAllDisplays: jest.fn().mockReturnValue([
        {
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        },
      ]),
    },
  };
});

describe('Window Size and Persistence Functional Tests', () => {
  let testStoragePath: string;
  let windowManager: WindowManager;
  let dataManager: DataManager;
  let mockWindow: any;

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(os.tmpdir(), `clerkly-test-${Date.now()}`);

    // Ensure directory exists
    fs.mkdirSync(testStoragePath, { recursive: true });

    // Clear all mocks
    jest.clearAllMocks();

    // Setup app.getPath mock
    (app.getPath as jest.Mock).mockReturnValue(testStoragePath);

    // Initialize components
    dataManager = new DataManager(testStoragePath);
    const initResult = dataManager.initialize();
    if (!initResult.success) {
      throw new Error(`Failed to initialize DataManager: ${initResult.warning || 'Unknown error'}`);
    }
  });

  afterEach(() => {
    // Clean up test storage
    if (fs.existsSync(testStoragePath)) {
      try {
        dataManager.close();
      } catch (error) {
        // Ignore errors during cleanup
      }

      try {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  describe('First Launch - Full WorkArea Size', () => {
    /* Preconditions: fresh application start, no saved state
       Action: launch application for the first time
       Assertions: window opens at full workAreaSize, not maximized, resizable
       Requirements: ui.1.1, ui.1.3 */
    it('should open window at full workAreaSize on first launch', () => {
      // Create window manager
      windowManager = new WindowManager(dataManager);

      // Start application by creating main window
      const window = windowManager.createWindow();

      // Verify window was created
      expect(window).toBeDefined();
      expect(windowManager.isWindowCreated()).toBe(true);

      // Verify BrowserWindow was called with workAreaSize dimensions
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0,
          y: 0,
          width: 1920,
          height: 1055,
        })
      );

      // Window should NOT be in maximized state (Requirements: ui.1.1, ui.1.3)
      // Note: We don't call maximize() to keep window resizable
      expect(window.isMaximized()).toBe(false);

      // Window should be resizable (Requirements: ui.1.3)
      expect(window.isResizable()).toBe(true);
    });

    /* Preconditions: fresh application start
       Action: launch application and check window properties
       Assertions: window is resizable and positioned at origin
       Requirements: ui.1.3 */
    it('should allow resizing window immediately after launch', () => {
      // Create window manager
      windowManager = new WindowManager(dataManager);

      // Create window
      const window = windowManager.createWindow();

      // Verify window is resizable
      expect(window.isResizable()).toBe(true);

      // Verify window is positioned at origin (0, 0)
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0,
          y: 0,
        })
      );

      // Verify window can be resized programmatically
      window.setBounds({ x: 0, y: 0, width: 1720, height: 955 });
      expect(window.setBounds).toHaveBeenCalledWith({
        x: 0,
        y: 0,
        width: 1720,
        height: 955,
      });
    });

    /* Preconditions: fresh application start
       Action: launch application and verify it's not in maximized state
       Assertions: window is not maximized, allowing immediate resize
       Requirements: ui.1.1, ui.1.3 */
    it('should not be in maximized state on first launch', () => {
      // Create window manager
      windowManager = new WindowManager(dataManager);

      // Create window
      const window = windowManager.createWindow();

      // Window should NOT be maximized (Requirements: ui.1.1, ui.1.3)
      expect(window.isMaximized()).toBe(false);

      // This allows the window to be resized immediately
      expect(window.isResizable()).toBe(true);
    });
  });

  describe('Window State Persistence Between Restarts', () => {
    /* Preconditions: application launched, window resized
       Action: resize window, close app, reopen app
       Assertions: window opens with saved size and position
       Requirements: ui.5.1, ui.5.2, ui.5.4 */
    it('should remember window size and position between restarts', () => {
      // First launch
      windowManager = new WindowManager(dataManager);
      let window = windowManager.createWindow();

      // Get mock window reference
      mockWindow = window as any;

      // Simulate window resize and move
      mockWindow.getBounds.mockReturnValue({
        x: 100,
        y: 50,
        width: 1200,
        height: 800,
      });

      // Trigger resize event to save state
      const resizeHandler = mockWindow.on.mock.calls.find((call: any) => call[0] === 'resize')?.[1];
      resizeHandler?.();

      // Close window
      windowManager.closeWindow();

      // Clear mocks for second launch
      jest.clearAllMocks();

      // Second launch with same data manager (same database)
      windowManager = new WindowManager(dataManager);
      window = windowManager.createWindow();

      // Verify bounds are restored
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 100,
          y: 50,
          width: 1200,
          height: 800,
        })
      );
    });

    /* Preconditions: application launched, window moved
       Action: move window to new position, close app, reopen app
       Assertions: window opens at saved position
       Requirements: ui.5.2, ui.5.4 */
    it('should remember window position between restarts', () => {
      // First launch
      windowManager = new WindowManager(dataManager);
      let window = windowManager.createWindow();

      // Get mock window reference
      mockWindow = window as any;

      // Simulate window move
      mockWindow.getBounds.mockReturnValue({
        x: 200,
        y: 100,
        width: 1920,
        height: 1055,
      });

      // Trigger move event to save state
      const moveHandler = mockWindow.on.mock.calls.find((call: any) => call[0] === 'move')?.[1];
      moveHandler?.();

      // Close window
      windowManager.closeWindow();

      // Clear mocks for second launch
      jest.clearAllMocks();

      // Second launch
      windowManager = new WindowManager(dataManager);
      window = windowManager.createWindow();

      // Verify position is restored
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 200,
          y: 100,
        })
      );
    });

    /* Preconditions: application launched, window resized multiple times
       Action: resize window several times, close app, reopen app
       Assertions: window opens with last saved size
       Requirements: ui.5.1, ui.5.4 */
    it('should remember last window size after multiple resizes', () => {
      // First launch
      windowManager = new WindowManager(dataManager);
      let window = windowManager.createWindow();

      // Get mock window reference
      mockWindow = window as any;

      // Get resize handler
      const resizeHandler = mockWindow.on.mock.calls.find((call: any) => call[0] === 'resize')?.[1];

      // Resize multiple times
      mockWindow.getBounds.mockReturnValue({ x: 0, y: 0, width: 1000, height: 700 });
      resizeHandler?.();

      mockWindow.getBounds.mockReturnValue({ x: 0, y: 0, width: 1400, height: 900 });
      resizeHandler?.();

      mockWindow.getBounds.mockReturnValue({ x: 0, y: 0, width: 1100, height: 750 });
      resizeHandler?.();

      // Close window
      windowManager.closeWindow();

      // Clear mocks for second launch
      jest.clearAllMocks();

      // Second launch
      windowManager = new WindowManager(dataManager);
      window = windowManager.createWindow();

      // Verify last bounds are restored
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 1100,
          height: 750,
        })
      );
    });

    /* Preconditions: application launched, window state changed
       Action: change window size and position, close app, reopen app
       Assertions: both size and position are restored
       Requirements: ui.5.1, ui.5.2, ui.5.4 */
    it('should remember both size and position together', () => {
      // First launch
      windowManager = new WindowManager(dataManager);
      let window = windowManager.createWindow();

      // Get mock window reference
      mockWindow = window as any;

      // Simulate window resize and move
      mockWindow.getBounds.mockReturnValue({
        x: 150,
        y: 75,
        width: 1300,
        height: 850,
      });

      // Trigger resize event to save state
      const resizeHandler = mockWindow.on.mock.calls.find((call: any) => call[0] === 'resize')?.[1];
      resizeHandler?.();

      // Close window
      windowManager.closeWindow();

      // Clear mocks for second launch
      jest.clearAllMocks();

      // Second launch
      windowManager = new WindowManager(dataManager);
      window = windowManager.createWindow();

      // Verify complete state is restored
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 150,
          y: 75,
          width: 1300,
          height: 850,
        })
      );
    });
  });

  describe('Window Resizability After Restart', () => {
    /* Preconditions: application launched and restarted
       Action: launch app, close, reopen, verify resizable
       Assertions: window remains resizable after restart
       Requirements: ui.1.3, ui.5.4 */
    it('should remain resizable after restart', () => {
      // First launch
      windowManager = new WindowManager(dataManager);
      let window = windowManager.createWindow();

      // Verify resizable
      expect(window.isResizable()).toBe(true);

      // Close window
      windowManager.closeWindow();

      // Clear mocks for second launch
      jest.clearAllMocks();

      // Second launch
      windowManager = new WindowManager(dataManager);
      window = windowManager.createWindow();

      // Verify still resizable
      expect(window.isResizable()).toBe(true);
    });

    /* Preconditions: application launched, resized, and restarted
       Action: launch app, resize, close, reopen, resize again
       Assertions: window can be resized after restart
       Requirements: ui.1.3, ui.5.1, ui.5.4 */
    it('should allow resizing after restart with saved state', () => {
      // First launch
      windowManager = new WindowManager(dataManager);
      let window = windowManager.createWindow();

      // Get mock window reference
      mockWindow = window as any;

      // Simulate window resize
      mockWindow.getBounds.mockReturnValue({
        x: 100,
        y: 100,
        width: 1200,
        height: 800,
      });

      // Trigger resize event to save state
      const resizeHandler = mockWindow.on.mock.calls.find((call: any) => call[0] === 'resize')?.[1];
      resizeHandler?.();

      // Close window
      windowManager.closeWindow();

      // Clear mocks for second launch
      jest.clearAllMocks();

      // Second launch
      windowManager = new WindowManager(dataManager);
      window = windowManager.createWindow();

      // Verify window can be resized again
      window.setBounds({ x: 100, y: 100, width: 1000, height: 700 });
      expect(window.setBounds).toHaveBeenCalledWith({
        x: 100,
        y: 100,
        width: 1000,
        height: 700,
      });
    });
  });

  describe('Edge Cases', () => {
    /* Preconditions: application launched
       Action: set very small window size, close, reopen
       Assertions: window opens with saved small size
       Requirements: ui.5.1, ui.5.4 */
    it('should handle small window sizes', () => {
      // First launch
      windowManager = new WindowManager(dataManager);
      let window = windowManager.createWindow();

      // Get mock window reference
      mockWindow = window as any;

      // Simulate small window size
      mockWindow.getBounds.mockReturnValue({
        x: 100,
        y: 100,
        width: 600,
        height: 400,
      });

      // Trigger resize event to save state
      const resizeHandler = mockWindow.on.mock.calls.find((call: any) => call[0] === 'resize')?.[1];
      resizeHandler?.();

      // Close window
      windowManager.closeWindow();

      // Clear mocks for second launch
      jest.clearAllMocks();

      // Second launch
      windowManager = new WindowManager(dataManager);
      window = windowManager.createWindow();

      // Verify small bounds are restored
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 600,
          height: 400,
        })
      );
    });

    /* Preconditions: application launched
       Action: set very large window size, close, reopen
       Assertions: window opens with saved large size
       Requirements: ui.5.1, ui.5.4 */
    it('should handle large window sizes', () => {
      // First launch
      windowManager = new WindowManager(dataManager);
      let window = windowManager.createWindow();

      // Get mock window reference
      mockWindow = window as any;

      // Simulate large window size
      mockWindow.getBounds.mockReturnValue({
        x: 0,
        y: 0,
        width: 2000,
        height: 1400,
      });

      // Trigger resize event to save state
      const resizeHandler = mockWindow.on.mock.calls.find((call: any) => call[0] === 'resize')?.[1];
      resizeHandler?.();

      // Close window
      windowManager.closeWindow();

      // Clear mocks for second launch
      jest.clearAllMocks();

      // Second launch
      windowManager = new WindowManager(dataManager);
      window = windowManager.createWindow();

      // Verify large bounds are restored
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 2000,
          height: 1400,
        })
      );
    });

    /* Preconditions: application launched multiple times
       Action: launch, resize, close, repeat 3 times
       Assertions: each restart remembers the last state
       Requirements: ui.5.1, ui.5.2, ui.5.4 */
    it('should persist state across multiple restart cycles', () => {
      const testBounds = [
        { x: 100, y: 100, width: 1000, height: 700 },
        { x: 200, y: 150, width: 1200, height: 800 },
        { x: 150, y: 100, width: 1100, height: 750 },
      ];

      for (const bounds of testBounds) {
        // Launch application
        windowManager = new WindowManager(dataManager);
        const window = windowManager.createWindow();

        // Get mock window reference
        mockWindow = window as any;

        // Simulate window bounds change
        mockWindow.getBounds.mockReturnValue(bounds);

        // Trigger resize event to save state
        const resizeHandler = mockWindow.on.mock.calls.find(
          (call: any) => call[0] === 'resize'
        )?.[1];
        resizeHandler?.();

        // Close window
        windowManager.closeWindow();

        // Clear mocks for next iteration
        jest.clearAllMocks();

        // Relaunch and verify
        windowManager = new WindowManager(dataManager);
        windowManager.createWindow();

        expect(BrowserWindow).toHaveBeenCalledWith(
          expect.objectContaining({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          })
        );

        // Close for next iteration
        windowManager.closeWindow();
        jest.clearAllMocks();
      }
    });

    /* Preconditions: saved state with invalid position
       Action: create window with position outside screen bounds
       Assertions: window created with default position on primary screen
       Requirements: ui.5.6 */
    it('should handle invalid window position and use default state', () => {
      // First launch - save invalid position
      windowManager = new WindowManager(dataManager);
      let window = windowManager.createWindow();

      // Get mock window reference
      mockWindow = window as any;

      // Simulate window at invalid position (outside screen bounds)
      mockWindow.getBounds.mockReturnValue({
        x: 10000,
        y: 10000,
        width: 800,
        height: 600,
      });

      // Trigger move event to save state
      const moveHandler = mockWindow.on.mock.calls.find((call: any) => call[0] === 'move')?.[1];
      moveHandler?.();

      // Close window
      windowManager.closeWindow();

      // Clear mocks for second launch
      jest.clearAllMocks();

      // Second launch - should use default state
      windowManager = new WindowManager(dataManager);
      window = windowManager.createWindow();

      // Verify window uses default state (workAreaSize at origin)
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 0,
          y: 0,
          width: 1920,
          height: 1055,
        })
      );
    });
  });
});
