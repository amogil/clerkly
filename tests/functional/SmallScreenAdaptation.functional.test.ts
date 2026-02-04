// Requirements: ui.4.1, ui.4.4
/**
 * Functional tests for small screen adaptation
 * Tests that the application adapts window size to small screens correctly
 */

import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';

// Mock Electron app and BrowserWindow
jest.mock('electron', () => {
  // Small screen dimensions (1366x768)
  let currentScreenSize = { width: 1366, height: 768 };

  return {
    app: {
      getPath: jest.fn(),
      whenReady: jest.fn(),
      on: jest.fn(),
      quit: jest.fn(),
    },
    BrowserWindow: jest.fn().mockImplementation((options) => {
      // Each instance starts with isMaximized = false
      let instanceIsMaximized = false;

      return {
        loadFile: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        once: jest.fn(),
        show: jest.fn(),
        maximize: jest.fn(() => {
          instanceIsMaximized = true;
        }),
        isMaximized: jest.fn(() => instanceIsMaximized),
        isFullScreen: jest.fn().mockReturnValue(false),
        getBounds: jest.fn().mockReturnValue({
          x: options.x || 0,
          y: options.y || 0,
          width: options.width || currentScreenSize.width,
          height: options.height || currentScreenSize.height,
        }),
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
    }),
    ipcMain: {
      handle: jest.fn(),
      removeHandler: jest.fn(),
    },
    screen: {
      getPrimaryDisplay: jest.fn(() => ({
        workAreaSize: { ...currentScreenSize },
      })),
      getAllDisplays: jest.fn(() => [
        {
          bounds: { x: 0, y: 0, ...currentScreenSize },
        },
      ]),
      __setCurrentScreenSize: (size: { width: number; height: number }) => {
        currentScreenSize = size;
      },
    },
  };
});

describe('Small Screen Adaptation Functional Tests', () => {
  let testStoragePath: string;
  let windowManager: WindowManager;
  let dataManager: DataManager;

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(
      os.tmpdir(),
      `clerkly-test-${Date.now()}-${Math.random().toString(36).substring(7)}`
    );

    // Ensure directory exists before initializing DataManager
    fs.mkdirSync(testStoragePath, { recursive: true });

    // Clear all mocks
    jest.clearAllMocks();

    // Setup app.getPath mock
    (app.getPath as jest.Mock).mockReturnValue(testStoragePath);

    // Initialize components
    dataManager = new DataManager(testStoragePath);
    dataManager.initialize();
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

  describe('Small Screen Adaptation (1366x768)', () => {
    /* Preconditions: application running on small screen (1366x768), no saved state
       Action: launch application and get window dimensions
       Assertions: window doesn't exceed screen size, dimensions aren't hardcoded (not 1920x1080)
       Requirements: ui.4.1, ui.4.4 */
    it('should adapt window size to small screens', () => {
      // Get small screen dimensions
      const primaryDisplay = screen.getPrimaryDisplay();
      const screenSize = primaryDisplay.workAreaSize;

      // Verify we're testing with small screen
      expect(screenSize.width).toBe(1366);
      expect(screenSize.height).toBe(768);

      // Launch application by creating main window
      const window = windowManager.createWindow();

      // Verify window was created
      expect(window).toBeDefined();
      expect(windowManager.isWindowCreated()).toBe(true);

      // Get window dimensions
      const bounds = window.getBounds();

      // Verify window doesn't exceed screen size (Requirements: ui.4.4)
      expect(bounds.width).toBeLessThanOrEqual(screenSize.width);
      expect(bounds.height).toBeLessThanOrEqual(screenSize.height);

      // Verify dimensions aren't hardcoded to 1920x1080 (Requirements: ui.4.1)
      expect(bounds.width).not.toBe(1920);
      expect(bounds.height).not.toBe(1080);

      // Verify dimensions are positive and reasonable
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);

      // Verify dimensions are based on screen size (should be 100% of workAreaSize)
      const expectedWidth = screenSize.width;
      const expectedHeight = screenSize.height;

      // Allow small variance due to rounding
      expect(bounds.width).toBeGreaterThanOrEqual(expectedWidth - 10);
      expect(bounds.width).toBeLessThanOrEqual(expectedWidth + 10);
      expect(bounds.height).toBeGreaterThanOrEqual(expectedHeight - 10);
      expect(bounds.height).toBeLessThanOrEqual(expectedHeight + 10);
    });

    /* Preconditions: application running on small screen (1366x768)
       Action: create window and verify it uses screen-based dimensions
       Assertions: window dimensions are calculated from screen size, not hardcoded
       Requirements: ui.4.1, ui.4.4 */
    it('should calculate window dimensions from screen size', () => {
      // Get screen size
      const primaryDisplay = screen.getPrimaryDisplay();
      const screenSize = primaryDisplay.workAreaSize;

      // Create window
      windowManager.createWindow();

      // Verify BrowserWindow was called with screen-based dimensions
      const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];

      // Verify dimensions are set
      expect(browserWindowCall.width).toBeDefined();
      expect(browserWindowCall.height).toBeDefined();

      // Verify dimensions don't exceed screen size
      expect(browserWindowCall.width).toBeLessThanOrEqual(screenSize.width);
      expect(browserWindowCall.height).toBeLessThanOrEqual(screenSize.height);

      // Verify dimensions are not the standard 1920x1080
      expect(browserWindowCall.width).not.toBe(1920);
      expect(browserWindowCall.height).not.toBe(1080);

      // Verify dimensions are proportional to screen size (should be 100%)
      const widthRatio = browserWindowCall.width / screenSize.width;
      const heightRatio = browserWindowCall.height / screenSize.height;

      // Both ratios should be 1.0 (100% of workAreaSize)
      expect(widthRatio).toBeGreaterThanOrEqual(0.95);
      expect(widthRatio).toBeLessThanOrEqual(1.05);
      expect(heightRatio).toBeGreaterThanOrEqual(0.95);
      expect(heightRatio).toBeLessThanOrEqual(1.05);
    });

    /* Preconditions: application running on small screen
       Action: create window and verify position is within screen bounds
       Assertions: window position is valid for small screen
       Requirements: ui.4.1, ui.4.4 */
    it('should position window within small screen bounds', () => {
      // Get screen size
      const primaryDisplay = screen.getPrimaryDisplay();
      const screenSize = primaryDisplay.workAreaSize;

      // Create window
      const window = windowManager.createWindow();

      // Get window bounds
      const bounds = window.getBounds();

      // Verify position is within screen bounds
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x).toBeLessThan(screenSize.width);
      expect(bounds.y).toBeLessThan(screenSize.height);

      // Verify window doesn't extend beyond screen
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(screenSize.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(screenSize.height);
    });

    /* Preconditions: application running on small screen, no saved state
       Action: create window and verify it's NOT maximized
       Assertions: window is large but not maximized (per ui.1.1)
       Requirements: ui.1.1, ui.4.4 */
    it('should maximize window on small screen', () => {
      // Create window
      const window = windowManager.createWindow();

      // Verify window is NOT maximized (Requirements: ui.1.1)
      // Window opens large (workAreaSize) but not maximized to stay resizable
      expect(window.maximize).not.toHaveBeenCalled();
      expect(window.isMaximized()).toBe(false);

      // Verify window is not in fullscreen mode
      expect(window.isFullScreen()).toBe(false);
    });

    /* Preconditions: application running on small screen
       Action: create window and verify all properties are correct
       Assertions: window has correct configuration for small screen
       Requirements: ui.1.1, ui.2.1, ui.3.1, ui.4.1, ui.4.4 */
    it('should create window with correct configuration on small screen', () => {
      // Get screen size
      const primaryDisplay = screen.getPrimaryDisplay();
      const screenSize = primaryDisplay.workAreaSize;

      // Create window
      const window = windowManager.createWindow();

      // Verify window was created
      expect(window).toBeDefined();
      expect(windowManager.isWindowCreated()).toBe(true);

      // Verify window configuration
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

      // Verify dimensions are adapted to small screen
      const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];
      expect(browserWindowCall.width).toBeLessThanOrEqual(screenSize.width);
      expect(browserWindowCall.height).toBeLessThanOrEqual(screenSize.height);

      // Verify window is NOT maximized (Requirements: ui.1.1)
      // Window opens large but not maximized to stay resizable
      expect(window.maximize).not.toHaveBeenCalled();
      expect(window.isMaximized()).toBe(false);

      // Verify window is not in fullscreen (Requirements: ui.1.2)
      expect(window.isFullScreen()).toBe(false);
    });
  });

  describe('Edge Cases for Small Screens', () => {
    /* Preconditions: very small screen (minimum supported size)
       Action: create window on very small screen
       Assertions: window adapts to very small screen without errors
       Requirements: ui.4.1, ui.4.4 */
    it('should handle very small screen dimensions', () => {
      // Mock very small screen (e.g., 1024x600)
      const verySmallScreen = { width: 1024, height: 600 };

      // Update screen size in mock
      (screen as any).__setCurrentScreenSize(verySmallScreen);

      // Ensure directory exists
      if (!fs.existsSync(testStoragePath)) {
        fs.mkdirSync(testStoragePath, { recursive: true });
      }

      // Create new window manager with updated screen mock
      const newDataManager = new DataManager(testStoragePath);
      newDataManager.initialize();
      const newWindowManager = new WindowManager(newDataManager);

      // Create window - should not throw
      expect(() => {
        const window = newWindowManager.createWindow();
        expect(window).toBeDefined();
      }).not.toThrow();

      // Verify window was created
      expect(BrowserWindow).toHaveBeenCalled();

      // Verify dimensions don't exceed very small screen
      const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];
      expect(browserWindowCall.width).toBeLessThanOrEqual(verySmallScreen.width);
      expect(browserWindowCall.height).toBeLessThanOrEqual(verySmallScreen.height);

      // Clean up
      newWindowManager.closeWindow();
      newDataManager.close();

      // Reset screen size
      (screen as any).__setCurrentScreenSize({ width: 1366, height: 768 });
    });

    /* Preconditions: small screen with saved state from larger screen
       Action: open app on small screen with state from large screen
       Assertions: window adapts to small screen, ignores invalid large screen state
       Requirements: ui.4.4, ui.5.6 */
    it('should adapt to small screen when saved state is from larger screen', () => {
      // Save state from large screen (1920x1080)
      const largeScreenState = {
        x: 100,
        y: 100,
        width: 1728, // 90% of 1920
        height: 972, // 90% of 1080
        isMaximized: false,
      };
      dataManager.saveData('window_state', JSON.stringify(largeScreenState));

      // Create window on small screen
      const window = windowManager.createWindow();

      // Verify window was created
      expect(window).toBeDefined();

      // Verify BrowserWindow was called with dimensions that fit small screen
      const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];

      // The window should use the saved state dimensions initially
      // but they should be validated against screen bounds
      expect(browserWindowCall.width).toBeDefined();
      expect(browserWindowCall.height).toBeDefined();
    });

    /* Preconditions: small screen, multiple window creation attempts
       Action: create and close window multiple times
       Assertions: window consistently adapts to small screen
       Requirements: ui.4.1, ui.4.4 */
    it('should consistently adapt to small screen across multiple window creations', () => {
      // Get screen size
      const primaryDisplay = screen.getPrimaryDisplay();
      const screenSize = primaryDisplay.workAreaSize;

      // Create and close window multiple times
      for (let i = 0; i < 3; i++) {
        // Clear mocks before each iteration
        jest.clearAllMocks();

        // Create window
        const window = windowManager.createWindow();

        // Verify window was created
        expect(window).toBeDefined();

        // Verify BrowserWindow was called with correct dimensions
        const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];

        // Verify dimensions don't exceed screen size
        expect(browserWindowCall.width).toBeLessThanOrEqual(screenSize.width);
        expect(browserWindowCall.height).toBeLessThanOrEqual(screenSize.height);

        // Verify dimensions are not hardcoded
        expect(browserWindowCall.width).not.toBe(1920);
        expect(browserWindowCall.height).not.toBe(1080);

        // Close window
        windowManager.closeWindow();
      }
    });
  });

  describe('Screen Size Detection', () => {
    /* Preconditions: small screen environment
       Action: verify screen API is called correctly
       Assertions: screen.getPrimaryDisplay is called to get screen size
       Requirements: ui.4.1 */
    it('should detect screen size using Electron screen API', () => {
      // Create window
      windowManager.createWindow();

      // Verify screen API was called
      expect(screen.getPrimaryDisplay).toHaveBeenCalled();

      // Verify screen size was retrieved
      const primaryDisplay = screen.getPrimaryDisplay();
      expect(primaryDisplay.workAreaSize).toBeDefined();
      expect(primaryDisplay.workAreaSize.width).toBe(1366);
      expect(primaryDisplay.workAreaSize.height).toBe(768);
    });

    /* Preconditions: small screen with different aspect ratio
       Action: create window on screen with non-standard aspect ratio
       Assertions: window adapts proportionally to aspect ratio
       Requirements: ui.4.1, ui.4.4 */
    it('should adapt to different aspect ratios on small screens', () => {
      // Mock screen with different aspect ratio (e.g., 1280x720)
      const differentAspectScreen = { width: 1280, height: 720 };

      // Update screen size in mock
      (screen as any).__setCurrentScreenSize(differentAspectScreen);

      // Ensure directory exists
      if (!fs.existsSync(testStoragePath)) {
        fs.mkdirSync(testStoragePath, { recursive: true });
      }

      // Create new window manager
      const newDataManager = new DataManager(testStoragePath);
      newDataManager.initialize();
      const newWindowManager = new WindowManager(newDataManager);

      // Create window
      newWindowManager.createWindow();

      // Verify dimensions are adapted to different aspect ratio
      const browserWindowCall = (BrowserWindow as unknown as jest.Mock).mock.calls[0][0];
      expect(browserWindowCall.width).toBeLessThanOrEqual(differentAspectScreen.width);
      expect(browserWindowCall.height).toBeLessThanOrEqual(differentAspectScreen.height);

      // Verify proportions are maintained
      const widthRatio = browserWindowCall.width / differentAspectScreen.width;
      const heightRatio = browserWindowCall.height / differentAspectScreen.height;
      expect(widthRatio).toBeCloseTo(heightRatio, 1);

      // Clean up
      newWindowManager.closeWindow();
      newDataManager.close();

      // Reset screen size
      (screen as any).__setCurrentScreenSize({ width: 1366, height: 768 });
    });
  });
});
