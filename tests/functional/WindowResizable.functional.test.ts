// Requirements: ui.1.3
/**
 * Functional tests for window resizable property
 * Tests that the application window can be resized by the user
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
    isResizable: jest.fn().mockReturnValue(true),
    setResizable: jest.fn(),
    getBounds: jest.fn().mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 }),
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

describe('Window Resizable Functional Tests', () => {
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
    try {
      if (dataManager) {
        dataManager.close();
      }
    } catch (error) {
      // Ignore errors during cleanup
    }

    if (fs.existsSync(testStoragePath)) {
      try {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  describe('Window Resizable Property', () => {
    /* Preconditions: fresh application start, no saved state
       Action: create window and verify resizable property
       Assertions: window is created with resizable: true
       Requirements: ui.1.3 */
    it('should create window with resizable: true', () => {
      // Create window
      windowManager.createWindow();

      // Verify BrowserWindow was created with resizable: true
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          resizable: true,
        })
      );
    });

    /* Preconditions: window created
       Action: verify window can be resized
       Assertions: window isResizable returns true
       Requirements: ui.1.3 */
    it('should allow window to be resized', () => {
      // Create window
      const window = windowManager.createWindow();

      // Verify window is resizable
      expect(window.isResizable()).toBe(true);
    });

    /* Preconditions: window created with resizable: true
       Action: attempt to change window size
       Assertions: setBounds can be called without errors
       Requirements: ui.1.3 */
    it('should allow changing window size programmatically', () => {
      // Create window
      const window = windowManager.createWindow();

      // Attempt to change window size
      expect(() => {
        window.setBounds({ x: 100, y: 100, width: 1400, height: 900 });
      }).not.toThrow();

      // Verify setBounds was called
      expect(window.setBounds).toHaveBeenCalledWith({
        x: 100,
        y: 100,
        width: 1400,
        height: 900,
      });
    });

    /* Preconditions: window created
       Action: verify resizable property is not explicitly set to false
       Assertions: window configuration does not contain resizable: false
       Requirements: ui.1.3 */
    it('should not set resizable to false', () => {
      // Create window
      windowManager.createWindow();

      // Get the BrowserWindow constructor call
      const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];

      // Verify resizable is not set to false
      expect(browserWindowCall.resizable).not.toBe(false);
      expect(browserWindowCall.resizable).toBe(true);
    });

    /* Preconditions: window created with saved state
       Action: create window with saved state and verify resizable
       Assertions: window is resizable regardless of saved state
       Requirements: ui.1.3, ui.5.4 */
    it('should be resizable even when restoring saved state', () => {
      // Save window state
      const savedState = {
        x: 200,
        y: 150,
        width: 1400,
        height: 900,
        isMaximized: false,
      };
      dataManager.saveData('window_state', JSON.stringify(savedState));

      // Create window with saved state
      windowManager.createWindow();

      // Verify window is still resizable
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          resizable: true,
        })
      );
    });

    /* Preconditions: window created
       Action: use configureWindow to change resizable property
       Assertions: setResizable can be called to change property
       Requirements: ui.1.3 */
    it('should allow changing resizable property via configureWindow', () => {
      // Create window
      const window = windowManager.createWindow();

      // Change resizable property
      windowManager.configureWindow({ resizable: false });

      // Verify setResizable was called
      expect(window.setResizable).toHaveBeenCalledWith(false);

      // Change back to resizable
      windowManager.configureWindow({ resizable: true });

      // Verify setResizable was called again
      expect(window.setResizable).toHaveBeenCalledWith(true);
    });
  });

  describe('Resizable with Maximized State', () => {
    /* Preconditions: window created (NOT maximized per ui.1.1)
       Action: verify window is resizable
       Assertions: window is resizable (not maximized)
       Requirements: ui.1.1, ui.1.3 */
    it('should be resizable even when maximized', () => {
      // Create window (will NOT be maximized per ui.1.1)
      const window = windowManager.createWindow();

      // Verify window is NOT maximized (per ui.1.1)
      expect(window.maximize).not.toHaveBeenCalled();
      expect(window.isMaximized()).toBe(false);

      // Verify window is resizable
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          resizable: true,
        })
      );
    });

    /* Preconditions: window created maximized
       Action: unmaximize window and verify it's still resizable
       Assertions: window remains resizable after unmaximize
       Requirements: ui.1.3 */
    it('should remain resizable after unmaximizing', () => {
      // Create window
      const window = windowManager.createWindow();

      // Mock unmaximize
      window.isMaximized = jest.fn().mockReturnValue(false);

      // Verify window is still resizable
      expect(window.isResizable()).toBe(true);
    });
  });

  describe('Resizable Property Persistence', () => {
    /* Preconditions: window created and resized
       Action: resize window, close, and reopen
       Assertions: new window is still resizable
       Requirements: ui.1.3, ui.5.1 */
    it('should maintain resizable property across restarts', () => {
      // Create first window
      const window1 = windowManager.createWindow();

      // Simulate resize event
      const resizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'resize'
      )?.[1];
      if (resizeHandler) {
        resizeHandler();
      }

      // Close window
      windowManager.closeWindow();

      // Clear mocks
      jest.clearAllMocks();

      // Create new test storage path to avoid database lock issues
      const testStoragePath2 = path.join(os.tmpdir(), `clerkly-test-${Date.now()}-2`);
      fs.mkdirSync(testStoragePath2, { recursive: true });

      // Create new data manager with different path
      const dataManager2 = new DataManager(testStoragePath2);
      const initResult2 = dataManager2.initialize();
      if (!initResult2.success) {
        throw new Error(
          `Failed to initialize DataManager: ${initResult2.warning || 'Unknown error'}`
        );
      }

      // Create new window manager and window
      const windowManager2 = new WindowManager(dataManager2);
      windowManager2.createWindow();

      // Verify new window is still resizable
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          resizable: true,
        })
      );

      // Clean up second test storage
      try {
        dataManager2.close();
        fs.rmSync(testStoragePath2, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });
  });

  describe('Edge Cases', () => {
    /* Preconditions: window created
       Action: attempt to set resizable to various values
       Assertions: setResizable handles all values correctly
       Requirements: ui.1.3 */
    it('should handle various resizable values', () => {
      // Create window
      const window = windowManager.createWindow();

      // Test setting to false
      expect(() => {
        windowManager.configureWindow({ resizable: false });
      }).not.toThrow();

      // Test setting to true
      expect(() => {
        windowManager.configureWindow({ resizable: true });
      }).not.toThrow();

      // Verify setResizable was called correctly
      expect(window.setResizable).toHaveBeenCalledWith(false);
      expect(window.setResizable).toHaveBeenCalledWith(true);
    });

    /* Preconditions: window not created
       Action: attempt to configure resizable before window creation
       Assertions: no error thrown, warning logged
       Requirements: ui.1.3 */
    it('should handle configuring resizable before window creation', () => {
      // Attempt to configure before creating window
      expect(() => {
        windowManager.configureWindow({ resizable: false });
      }).not.toThrow();

      // Verify no BrowserWindow methods were called
      expect(BrowserWindow).not.toHaveBeenCalled();
    });
  });
});
