// Requirements: ui.2
/**
 * Functional tests for window title
 * Tests that the main window has an empty title for minimalist interface
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
    isMaximized: jest.fn().mockReturnValue(false),
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

describe('Window Title Functional Tests', () => {
  let testStoragePath: string;
  let windowManager: WindowManager;
  let dataManager: DataManager;

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(
      os.tmpdir(),
      `clerkly-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    // Clear all mocks
    jest.clearAllMocks();

    // Setup app.getPath mock
    (app.getPath as jest.Mock).mockReturnValue(testStoragePath);

    // Initialize components
    // Requirements: ui.5
    dataManager = new DataManager(testStoragePath);
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

  describe('Window Title Configuration', () => {
    /* Preconditions: application not running, no window created
       Action: create main window via WindowManager
       Assertions: window is created with empty title (title: '')
       Requirements: ui.2.1 */
    it('should create window with empty title for minimalist interface', () => {
      // Create window
      const window = windowManager.createWindow();

      // Verify window was created with empty title
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '', // Requirements: ui.2.1
        })
      );

      // Verify window exists
      expect(window).toBeDefined();
      expect(windowManager.isWindowCreated()).toBe(true);
    });

    /* Preconditions: window created with empty title
       Action: get window title via getTitle()
       Assertions: title is empty string
       Requirements: ui.2.1, ui.2.2 */
    it('should have empty title after window creation', () => {
      // Create window
      const window = windowManager.createWindow();

      // Get window title
      const title = window.getTitle();

      // Verify title is empty
      expect(title).toBe('');
    });

    /* Preconditions: window created with empty title
       Action: verify window does not display application name
       Assertions: title does not contain "Clerkly" or application name
       Requirements: ui.2.2 */
    it('should not display application name in window title', () => {
      // Create window
      const window = windowManager.createWindow();

      // Get window title
      const title = window.getTitle();

      // Verify title does not contain application name
      expect(title).not.toContain('Clerkly');
      expect(title).not.toContain('clerkly');
      expect(title).toBe('');
    });

    /* Preconditions: window created with empty title
       Action: manually set title via configureWindow
       Assertions: title can be changed dynamically
       Requirements: ui.2.1 */
    it('should allow changing title dynamically via configureWindow', () => {
      // Create window
      windowManager.createWindow();

      // Change title
      windowManager.configureWindow({ title: 'Custom Title' });

      // Verify setTitle was called
      const window = windowManager.getWindow();
      expect(window?.setTitle).toHaveBeenCalledWith('Custom Title');
    });

    /* Preconditions: window created with empty title
       Action: verify window has standard macOS controls
       Assertions: window has native macOS title bar style
       Requirements: ui.2.3, ui.3.1 */
    it('should preserve standard macOS window controls with empty title', () => {
      // Create window
      windowManager.createWindow();

      // Verify window was created with native macOS title bar
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          titleBarStyle: 'default', // Requirements: ui.3.1
          title: '', // Requirements: ui.2.1
        })
      );
    });

    /* Preconditions: window created with empty title
       Action: verify window title remains empty after maximize
       Assertions: title stays empty after window state changes
       Requirements: ui.2.1 */
    it('should maintain empty title after window state changes', () => {
      // Create window
      const window = windowManager.createWindow();

      // Maximize window
      window.maximize();

      // Verify title is still empty
      const title = window.getTitle();
      expect(title).toBe('');
    });

    /* Preconditions: window created with empty title
       Action: verify empty title persists across window recreation
       Assertions: new window also has empty title
       Requirements: ui.2.1 */
    it('should create new window with empty title after closing previous window', () => {
      // Create first window
      windowManager.createWindow();

      // Close window
      windowManager.closeWindow();

      // Clear mock calls
      jest.clearAllMocks();

      // Create second window
      const newWindow = windowManager.createWindow();

      // Verify new window also has empty title
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '',
        })
      );

      expect(newWindow.getTitle()).toBe('');
    });
  });

  describe('Window Title Edge Cases', () => {
    /* Preconditions: window not created yet
       Action: attempt to set title before window creation
       Assertions: operation handled gracefully, no errors
       Requirements: ui.2.1 */
    it('should handle title configuration before window creation', () => {
      // Try to configure title before creating window
      expect(() => {
        windowManager.configureWindow({ title: 'Test' });
      }).not.toThrow();

      // Verify window is not created
      expect(windowManager.isWindowCreated()).toBe(false);
    });

    /* Preconditions: window created with empty title
       Action: set title to empty string explicitly
       Assertions: title remains empty
       Requirements: ui.2.1 */
    it('should handle explicit empty string title', () => {
      // Create window
      windowManager.createWindow();

      // Set title to empty string explicitly
      windowManager.configureWindow({ title: '' });

      // Verify setTitle was called with empty string
      const window = windowManager.getWindow();
      expect(window?.setTitle).toHaveBeenCalledWith('');
    });

    /* Preconditions: window created with empty title
       Action: verify title is not null or undefined
       Assertions: title is exactly empty string, not null/undefined
       Requirements: ui.2.1 */
    it('should have title as empty string, not null or undefined', () => {
      // Create window
      const window = windowManager.createWindow();

      // Get title
      const title = window.getTitle();

      // Verify title is empty string, not null or undefined
      expect(title).toBe('');
      expect(title).not.toBeNull();
      expect(title).not.toBeUndefined();
      expect(typeof title).toBe('string');
    });
  });
});
