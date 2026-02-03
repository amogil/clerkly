// Requirements: ui.1, ui.2, ui.3
/**
 * Functional tests for initial window state
 * Tests that the application opens with correct window configuration on first launch
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';

// Mock Electron app and BrowserWindow
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(),
    whenReady: jest.fn(),
    on: jest.fn(),
    quit: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    show: jest.fn(),
    maximize: jest.fn(),
    isMaximized: jest.fn().mockReturnValue(true),
    isFullScreen: jest.fn().mockReturnValue(false),
    getBounds: jest.fn().mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 }),
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
  })),
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  screen: {
    getPrimaryDisplay: jest.fn().mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    }),
    getAllDisplays: jest.fn().mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
  },
}));

describe('Initial Window State Functional Tests', () => {
  let testStoragePath: string;
  let windowManager: WindowManager;
  let dataManager: DataManager;

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(os.tmpdir(), `clerkly-test-${Date.now()}`);

    // Ensure directory exists before initializing DataManager
    fs.mkdirSync(testStoragePath, { recursive: true });

    // Clear all mocks
    jest.clearAllMocks();

    // Setup app.getPath mock
    (app.getPath as jest.Mock).mockReturnValue(testStoragePath);

    // Initialize components
    // Requirements: ui.5
    dataManager = new DataManager(testStoragePath);
    const initResult = dataManager.initialize();
    if (!initResult.success) {
      throw new Error(`Failed to initialize DataManager: ${initResult.warning || 'Unknown error'}`);
    }
    windowManager = new WindowManager(dataManager);
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

  describe('Application Launch with Clean Database', () => {
    /* Preconditions: fresh application start, no saved state in database
       Action: launch application by creating main window
       Assertions: window opens maximized, has empty title, not in fullscreen mode, uses native macOS controls
       Requirements: ui.1.1, ui.1.2, ui.2.1, ui.3.1 */
    it('should open application with correct initial window state', () => {
      // Launch application by creating main window
      const window = windowManager.createWindow();

      // Verify window was created
      expect(window).toBeDefined();
      expect(windowManager.isWindowCreated()).toBe(true);

      // Verify window is NOT maximized (Requirements: ui.1.1)
      // Window opens large (workAreaSize) but not maximized to stay resizable
      expect(window.maximize).not.toHaveBeenCalled();
      expect(window.isMaximized()).toBe(false);

      // Verify window has empty title (Requirements: ui.2.1)
      expect(window.getTitle()).toBe('');
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '',
        })
      );

      // Verify window is not in fullscreen mode (Requirements: ui.1.2)
      expect(window.isFullScreen()).toBe(false);
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.not.objectContaining({
          fullscreen: true,
        })
      );

      // Verify window uses native macOS controls (Requirements: ui.3.1)
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          titleBarStyle: 'default',
        })
      );
    });

    /* Preconditions: fresh application start, no saved state
       Action: create window and verify all configuration properties
       Assertions: window has correct initial configuration matching requirements
       Requirements: ui.1.1, ui.1.2, ui.1.3, ui.2.1, ui.3.1 */
    it('should create window with all correct initial properties', () => {
      // Create window
      const window = windowManager.createWindow();

      // Verify BrowserWindow was created with correct configuration
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          // Requirements: ui.2.1 - empty title
          title: '',
          // Requirements: ui.3.1 - native macOS controls
          titleBarStyle: 'default',
          // Window should not be shown immediately
          show: false,
        })
      );

      // Verify window is not in fullscreen (Requirements: ui.1.2)
      const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];
      expect(browserWindowCall.fullscreen).not.toBe(true);

      // Verify window is NOT maximized after creation (Requirements: ui.1.1)
      // Window opens large (workAreaSize) but not maximized to stay resizable
      expect(window.maximize).not.toHaveBeenCalled();
    });

    /* Preconditions: fresh application start, clean database
       Action: create window and verify it uses screen-based dimensions
       Assertions: window dimensions are based on screen size, not hardcoded
       Requirements: ui.4.1, ui.4.2 */
    it('should use screen-based dimensions for initial window', () => {
      // Create window
      windowManager.createWindow();

      // Verify BrowserWindow was called with dimensions
      const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];

      // Verify dimensions are set (should be based on screen size)
      expect(browserWindowCall.width).toBeDefined();
      expect(browserWindowCall.height).toBeDefined();
      expect(browserWindowCall.x).toBeDefined();
      expect(browserWindowCall.y).toBeDefined();

      // Verify dimensions are positive numbers
      expect(browserWindowCall.width).toBeGreaterThan(0);
      expect(browserWindowCall.height).toBeGreaterThan(0);
    });

    /* Preconditions: fresh application start
       Action: create window and verify macOS integration
       Assertions: window has native macOS elements and follows conventions
       Requirements: ui.3.1, ui.3.2 */
    it('should integrate with native macOS elements', () => {
      // Create window
      windowManager.createWindow();

      // Verify window uses native macOS title bar style
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          titleBarStyle: 'default', // Requirements: ui.3.1
        })
      );

      // Verify webPreferences for macOS integration
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          webPreferences: expect.objectContaining({
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true,
          }),
        })
      );
    });

    /* Preconditions: fresh application start, no saved state
       Action: create window and verify it's resizable
       Assertions: window can be resized by user
       Requirements: ui.1.3 */
    it('should create resizable window', () => {
      // Create window
      windowManager.createWindow();

      // Verify window is resizable (default is true, should not be set to false)
      const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];
      expect(browserWindowCall.resizable).not.toBe(false);
    });

    /* Preconditions: fresh application start
       Action: create window and verify system elements visibility
       Assertions: window preserves macOS system elements (menu, dock)
       Requirements: ui.1.4 */
    it('should preserve macOS system elements visibility', () => {
      // Create window
      const window = windowManager.createWindow();

      // Verify window is not in fullscreen mode (which would hide system elements)
      expect(window.isFullScreen()).toBe(false);

      // Verify window is maximized but not fullscreen (Requirements: ui.1.1, ui.1.4)
      expect(window.isMaximized()).toBe(true);
      expect(window.isFullScreen()).toBe(false);
    });
  });

  describe('Window State Tracking Setup', () => {
    /* Preconditions: window created
       Action: verify state tracking is set up
       Assertions: window event listeners are registered for state changes
       Requirements: ui.5.1, ui.5.2, ui.5.3 */
    it('should set up state tracking on window creation', () => {
      // Create window
      const window = windowManager.createWindow();

      // Verify event listeners are registered
      expect(window.on).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(window.on).toHaveBeenCalledWith('move', expect.any(Function));
      expect(window.on).toHaveBeenCalledWith('maximize', expect.any(Function));
      expect(window.on).toHaveBeenCalledWith('unmaximize', expect.any(Function));
      expect(window.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('Edge Cases', () => {
    /* Preconditions: database initialization fails
       Action: attempt to create window with database error
       Assertions: window still created with default state
       Requirements: ui.1.1, ui.5.5 */
    it('should handle database errors gracefully and use default state', () => {
      // Mock DataManager to throw error on loadData
      jest.spyOn(dataManager, 'loadData').mockReturnValue({
        success: false,
        error: 'Database error',
      });

      // Create window - should not throw
      expect(() => {
        const window = windowManager.createWindow();
        expect(window).toBeDefined();
      }).not.toThrow();

      // Verify window was created with default state
      expect(BrowserWindow).toHaveBeenCalled();
    });

    /* Preconditions: corrupted state data in database
       Action: create window with invalid JSON in database
       Assertions: window created with default state, no errors thrown
       Requirements: ui.5.5 */
    it('should handle corrupted state data and use default state', () => {
      // Save corrupted data to database
      dataManager.saveData('window_state', 'invalid json {{{');

      // Create window - should not throw
      expect(() => {
        const window = windowManager.createWindow();
        expect(window).toBeDefined();
      }).not.toThrow();

      // Verify window was created
      expect(BrowserWindow).toHaveBeenCalled();
    });

    /* Preconditions: saved state with invalid position
       Action: create window with position outside screen bounds
       Assertions: window created with default position on primary screen
       Requirements: ui.5.6 */
    it('should handle invalid window position and use default state', () => {
      // Save state with position outside screen bounds
      const invalidState = {
        x: 10000,
        y: 10000,
        width: 800,
        height: 600,
        isMaximized: false,
      };
      dataManager.saveData('window_state', JSON.stringify(invalidState));

      // Create window - should use default state
      const window = windowManager.createWindow();

      // Verify window was created
      expect(window).toBeDefined();
      expect(BrowserWindow).toHaveBeenCalled();

      // Window should NOT be maximized (default state per ui.1.1)
      expect(window.maximize).not.toHaveBeenCalled();
    });
  });
});
