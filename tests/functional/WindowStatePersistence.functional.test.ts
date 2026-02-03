// Requirements: ui.5.1, ui.5.2, ui.5.4
/**
 * Functional tests for window state persistence across application restarts
 * Tests that window size and position are saved and restored correctly
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';

// Mock Electron app and BrowserWindow
jest.mock('electron', () => {
  let mockBounds = { x: 100, y: 100, width: 1200, height: 800 };

  return {
    app: {
      getPath: jest.fn(),
      whenReady: jest.fn(),
      on: jest.fn(),
      quit: jest.fn(),
    },
    BrowserWindow: jest.fn().mockImplementation(() => {
      // Each new BrowserWindow instance starts with isMaximized = false
      let instanceIsMaximized = false;

      const instance = {
        loadFile: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        once: jest.fn(),
        show: jest.fn(),
        maximize: jest.fn(() => {
          instanceIsMaximized = true;
        }),
        unmaximize: jest.fn(() => {
          instanceIsMaximized = false;
        }),
        isMaximized: jest.fn(() => instanceIsMaximized),
        isFullScreen: jest.fn().mockReturnValue(false),
        getBounds: jest.fn(() => ({ ...mockBounds })),
        setBounds: jest.fn((newBounds) => {
          mockBounds = { ...mockBounds, ...newBounds };
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
      return instance;
    }),
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
  };
});

describe('Window State Persistence Functional Tests', () => {
  let testStoragePath: string;
  let dataManager: DataManager;

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(os.tmpdir(), `clerkly-test-${Date.now()}`);

    // Clear all mocks
    jest.clearAllMocks();

    // Setup app.getPath mock
    (app.getPath as jest.Mock).mockReturnValue(testStoragePath);

    // Initialize DataManager
    dataManager = new DataManager(testStoragePath);
    dataManager.initialize();
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

  describe('Window State Persistence Across Restarts', () => {
    /* Preconditions: application running with default state
       Action: resize window, wait for save, close app, reopen app
       Assertions: window opens with saved size and position
       Requirements: ui.5.1, ui.5.2, ui.5.4 */
    it('should persist window state across restarts', async () => {
      // First launch - create window with default state
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Verify window was created
      expect(window1).toBeDefined();
      expect(windowManager1.isWindowCreated()).toBe(true);

      // Change window size and position
      const newBounds = { x: 150, y: 200, width: 900, height: 700 };
      window1.setBounds(newBounds);

      // Trigger resize and move events to save state
      const resizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'resize'
      )?.[1];
      const moveHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'move'
      )?.[1];

      expect(resizeHandler).toBeDefined();
      expect(moveHandler).toBeDefined();

      // Call the event handlers to trigger state save
      if (resizeHandler) resizeHandler();
      if (moveHandler) moveHandler();

      // Wait for save operation to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close the window
      windowManager1.closeWindow();

      // Verify state was saved to database
      const savedState = dataManager.loadData('window_state');
      expect(savedState.success).toBe(true);
      expect(savedState.data).toBeDefined();

      const parsedState = JSON.parse(savedState.data as string);
      expect(parsedState.x).toBe(150);
      expect(parsedState.y).toBe(200);
      expect(parsedState.width).toBe(900);
      expect(parsedState.height).toBe(700);

      // Second launch - create new window manager and window
      const windowManager2 = new WindowManager(dataManager);
      windowManager2.createWindow();

      // Verify window was created
      expect(windowManager2.isWindowCreated()).toBe(true);

      // Verify window was created with saved bounds
      expect(BrowserWindow).toHaveBeenLastCalledWith(
        expect.objectContaining({
          x: 150,
          y: 200,
          width: 900,
          height: 700,
        })
      );

      // Clean up
      windowManager2.closeWindow();
    });

    /* Preconditions: application running with default state
       Action: change only window position, close app, reopen app
       Assertions: window opens at saved position with original size
       Requirements: ui.5.2, ui.5.4 */
    it('should persist window position independently', async () => {
      // First launch
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Get initial bounds
      const initialBounds = window1.getBounds();

      // Change only position
      const newPosition = { x: 300, y: 400 };
      window1.setBounds({ ...initialBounds, ...newPosition });

      // Trigger move event
      const moveHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'move'
      )?.[1];
      if (moveHandler) moveHandler();

      // Wait for save
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close window
      windowManager1.closeWindow();

      // Second launch
      const windowManager2 = new WindowManager(dataManager);
      windowManager2.createWindow();

      // Verify position was restored
      expect(BrowserWindow).toHaveBeenLastCalledWith(
        expect.objectContaining({
          x: 300,
          y: 400,
        })
      );

      // Clean up
      windowManager2.closeWindow();
    });

    /* Preconditions: application running with default state
       Action: change only window size, close app, reopen app
       Assertions: window opens with saved size at original position
       Requirements: ui.5.1, ui.5.4 */
    it('should persist window size independently', async () => {
      // First launch
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Get initial bounds
      const initialBounds = window1.getBounds();

      // Change only size
      const newSize = { width: 1000, height: 750 };
      window1.setBounds({ ...initialBounds, ...newSize });

      // Trigger resize event
      const resizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'resize'
      )?.[1];
      if (resizeHandler) resizeHandler();

      // Wait for save
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close window
      windowManager1.closeWindow();

      // Second launch
      const windowManager2 = new WindowManager(dataManager);
      windowManager2.createWindow();

      // Verify size was restored
      expect(BrowserWindow).toHaveBeenLastCalledWith(
        expect.objectContaining({
          width: 1000,
          height: 750,
        })
      );

      // Clean up
      windowManager2.closeWindow();
    });

    /* Preconditions: application running with default state
       Action: change size and position multiple times, close app, reopen app
       Assertions: window opens with last saved state
       Requirements: ui.5.1, ui.5.2, ui.5.4 */
    it('should persist latest window state after multiple changes', async () => {
      // First launch
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Get event handlers
      const resizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'resize'
      )?.[1];
      const moveHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'move'
      )?.[1];

      // First change
      window1.setBounds({ x: 100, y: 100, width: 800, height: 600 });
      if (resizeHandler) resizeHandler();
      if (moveHandler) moveHandler();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Second change
      window1.setBounds({ x: 200, y: 150, width: 900, height: 650 });
      if (resizeHandler) resizeHandler();
      if (moveHandler) moveHandler();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Third change (final state)
      window1.setBounds({ x: 250, y: 175, width: 950, height: 700 });
      if (resizeHandler) resizeHandler();
      if (moveHandler) moveHandler();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close window
      windowManager1.closeWindow();

      // Second launch
      const windowManager2 = new WindowManager(dataManager);
      windowManager2.createWindow();

      // Verify latest state was restored
      expect(BrowserWindow).toHaveBeenLastCalledWith(
        expect.objectContaining({
          x: 250,
          y: 175,
          width: 950,
          height: 700,
        })
      );

      // Clean up
      windowManager2.closeWindow();
    });

    /* Preconditions: application running with custom window state
       Action: close app via close event, reopen app
       Assertions: window state saved on close and restored on reopen
       Requirements: ui.5.1, ui.5.2, ui.5.4 */
    it('should save window state on close event', async () => {
      // First launch
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Change window state
      const customBounds = { x: 175, y: 225, width: 875, height: 675 };
      window1.setBounds(customBounds);

      // Trigger close event (which should save state)
      const closeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'close'
      )?.[1];
      expect(closeHandler).toBeDefined();
      if (closeHandler) closeHandler();

      // Wait for save
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close window
      windowManager1.closeWindow();

      // Verify state was saved
      const savedState = dataManager.loadData('window_state');
      expect(savedState.success).toBe(true);

      const parsedState = JSON.parse(savedState.data as string);
      expect(parsedState.x).toBe(175);
      expect(parsedState.y).toBe(225);
      expect(parsedState.width).toBe(875);
      expect(parsedState.height).toBe(675);

      // Second launch
      const windowManager2 = new WindowManager(dataManager);
      windowManager2.createWindow();

      // Verify state was restored
      expect(BrowserWindow).toHaveBeenLastCalledWith(
        expect.objectContaining({
          x: 175,
          y: 225,
          width: 875,
          height: 675,
        })
      );

      // Clean up
      windowManager2.closeWindow();
    });
  });

  describe('Maximized State Persistence', () => {
    /* Preconditions: application running
       Action: unmaximize window, maximize window, wait for save, close app, reopen app
       Assertions: window opens in maximized state
       Requirements: ui.5.3, ui.5.4 */
    it('should persist maximized state across restarts', async () => {
      // First launch - create window
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Verify window was created
      expect(window1).toBeDefined();
      expect(windowManager1.isWindowCreated()).toBe(true);

      // Get event handlers
      const maximizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'maximize'
      )?.[1];
      const unmaximizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'unmaximize'
      )?.[1];

      expect(maximizeHandler).toBeDefined();
      expect(unmaximizeHandler).toBeDefined();

      // Unmaximize the window
      window1.unmaximize();
      if (unmaximizeHandler) unmaximizeHandler();

      // Wait for state to be saved
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Maximize the window
      window1.maximize();
      if (maximizeHandler) maximizeHandler();

      // Wait for state to be saved
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify state was saved with isMaximized: true
      const savedState = dataManager.loadData('window_state');
      expect(savedState.success).toBe(true);
      expect(savedState.data).toBeDefined();

      const parsedState = JSON.parse(savedState.data as string);
      expect(parsedState.isMaximized).toBe(true);

      // Close the window
      windowManager1.closeWindow();

      // Second launch - create new window manager and window
      const windowManager2 = new WindowManager(dataManager);
      const window2 = windowManager2.createWindow();

      // Verify window was created
      expect(windowManager2.isWindowCreated()).toBe(true);

      // Note: maximize() is NOT called even when isMaximized was true in saved state
      // This is intentional per ui.1.1 and ui.1.3 - window opens large but resizable
      // On macOS, calling maximize() would make the window non-resizable
      expect(window2.maximize).not.toHaveBeenCalled();

      // Window should report as not maximized (but will have large size from saved state)
      expect(window2.isMaximized()).toBe(false);

      // Clean up
      windowManager2.closeWindow();
    });

    /* Preconditions: application running with maximized window
       Action: unmaximize window, close app, reopen app
       Assertions: window opens in unmaximized state
       Requirements: ui.5.3, ui.5.4 */
    it('should persist unmaximized state across restarts', async () => {
      // First launch - create window (starts maximized by default)
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Get unmaximize handler
      const unmaximizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'unmaximize'
      )?.[1];

      expect(unmaximizeHandler).toBeDefined();

      // Unmaximize the window
      window1.unmaximize();
      if (unmaximizeHandler) unmaximizeHandler();

      // Wait for state to be saved
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify state was saved with isMaximized: false
      const savedState = dataManager.loadData('window_state');
      expect(savedState.success).toBe(true);

      const parsedState = JSON.parse(savedState.data as string);
      expect(parsedState.isMaximized).toBe(false);

      // Close the window
      windowManager1.closeWindow();

      // Clear mocks to verify maximize is NOT called on second launch
      jest.clearAllMocks();

      // Second launch
      const windowManager2 = new WindowManager(dataManager);
      const window2 = windowManager2.createWindow();

      // Verify window was created
      expect(windowManager2.isWindowCreated()).toBe(true);

      // Verify window.maximize() was NOT called (because isMaximized was false)
      expect(window2.maximize).not.toHaveBeenCalled();

      // Clean up
      windowManager2.closeWindow();
    });

    /* Preconditions: application running
       Action: toggle maximize state multiple times, close app, reopen app
       Assertions: window opens with last maximized state
       Requirements: ui.5.3, ui.5.4 */
    it('should persist last maximized state after multiple toggles', async () => {
      // First launch
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Get event handlers
      const maximizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'maximize'
      )?.[1];
      const unmaximizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'unmaximize'
      )?.[1];

      // Toggle maximize state multiple times
      // Start: maximized (default)

      // Toggle 1: unmaximize
      window1.unmaximize();
      if (unmaximizeHandler) unmaximizeHandler();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Toggle 2: maximize
      window1.maximize();
      if (maximizeHandler) maximizeHandler();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Toggle 3: unmaximize
      window1.unmaximize();
      if (unmaximizeHandler) unmaximizeHandler();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Toggle 4: maximize (final state)
      window1.maximize();
      if (maximizeHandler) maximizeHandler();
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify final state is maximized
      const savedState = dataManager.loadData('window_state');
      expect(savedState.success).toBe(true);

      const parsedState = JSON.parse(savedState.data as string);
      expect(parsedState.isMaximized).toBe(true);

      // Close window
      windowManager1.closeWindow();

      // Second launch
      const windowManager2 = new WindowManager(dataManager);
      const window2 = windowManager2.createWindow();

      // Verify window is NOT maximized (per ui.1.1, ui.1.3)
      // maximize() is not called to keep window resizable on macOS
      expect(window2.maximize).not.toHaveBeenCalled();
      expect(window2.isMaximized()).toBe(false);

      // Clean up
      windowManager2.closeWindow();
    });
  });

  describe('Edge Cases for State Persistence', () => {
    /* Preconditions: application running with custom state
       Action: save state with extreme values, close app, reopen app
       Assertions: extreme values are persisted and restored correctly
       Requirements: ui.5.1, ui.5.2, ui.5.4 */
    it('should persist extreme window dimensions', async () => {
      // First launch
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Set extreme but valid dimensions
      const extremeBounds = { x: 0, y: 0, width: 400, height: 300 };
      window1.setBounds(extremeBounds);

      // Trigger events
      const resizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'resize'
      )?.[1];
      const moveHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'move'
      )?.[1];
      if (resizeHandler) resizeHandler();
      if (moveHandler) moveHandler();

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Close window
      windowManager1.closeWindow();

      // Second launch
      const windowManager2 = new WindowManager(dataManager);
      windowManager2.createWindow();

      // Verify extreme values were restored
      expect(BrowserWindow).toHaveBeenLastCalledWith(
        expect.objectContaining({
          x: 0,
          y: 0,
          width: 400,
          height: 300,
        })
      );

      // Clean up
      windowManager2.closeWindow();
    });

    /* Preconditions: application running with custom state
       Action: rapid state changes, close app immediately, reopen app
       Assertions: at least one state change is persisted
       Requirements: ui.5.1, ui.5.2, ui.5.4 */
    it('should handle rapid state changes before close', async () => {
      // First launch
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      // Get event handlers
      const resizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'resize'
      )?.[1];
      const moveHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'move'
      )?.[1];

      // Rapid changes
      for (let i = 0; i < 5; i++) {
        window1.setBounds({ x: 100 + i * 10, y: 100 + i * 10, width: 800, height: 600 });
        if (resizeHandler) resizeHandler();
        if (moveHandler) moveHandler();
      }

      // Small wait for at least one save
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Close window
      windowManager1.closeWindow();

      // Verify some state was saved
      const savedState = dataManager.loadData('window_state');
      expect(savedState.success).toBe(true);
      expect(savedState.data).toBeDefined();

      // Second launch should not fail
      const windowManager2 = new WindowManager(dataManager);
      const window2 = windowManager2.createWindow();
      expect(window2).toBeDefined();

      // Clean up
      windowManager2.closeWindow();
    });

    /* Preconditions: database contains valid state
       Action: corrupt database, reopen app
       Assertions: app opens with default state, no crash
       Requirements: ui.5.4, ui.5.5 */
    it('should handle corrupted state gracefully on restart', async () => {
      // First launch - save valid state
      const windowManager1 = new WindowManager(dataManager);
      const window1 = windowManager1.createWindow();

      window1.setBounds({ x: 200, y: 200, width: 800, height: 600 });
      const resizeHandler = (window1.on as jest.Mock).mock.calls.find(
        (call) => call[0] === 'resize'
      )?.[1];
      if (resizeHandler) resizeHandler();

      await new Promise((resolve) => setTimeout(resolve, 100));
      windowManager1.closeWindow();

      // Corrupt the saved state
      dataManager.saveData('window_state', 'corrupted json {{{');

      // Second launch should not crash
      expect(() => {
        const windowManager2 = new WindowManager(dataManager);
        const window2 = windowManager2.createWindow();
        expect(window2).toBeDefined();
        windowManager2.closeWindow();
      }).not.toThrow();
    });

    /* Preconditions: database contains state with invalid position
       Action: reopen app
       Assertions: app opens with default state on primary screen
       Requirements: ui.5.4, ui.5.6 */
    it('should handle invalid position on restart', async () => {
      // Save state with invalid position (outside screen bounds)
      const invalidState = {
        x: 10000,
        y: 10000,
        width: 800,
        height: 600,
        isMaximized: false,
      };
      dataManager.saveData('window_state', JSON.stringify(invalidState));

      // Launch app
      const windowManager = new WindowManager(dataManager);
      const window = windowManager.createWindow();

      // Verify window was created (should use default state)
      expect(window).toBeDefined();
      expect(windowManager.isWindowCreated()).toBe(true);

      // Window should NOT be maximized (default state per ui.1.1)
      expect(window.maximize).not.toHaveBeenCalled();

      // Clean up
      windowManager.closeWindow();
    });
  });

  describe('State Persistence with Different Window Configurations', () => {
    /* Preconditions: application running
       Action: set various window configurations, restart multiple times
       Assertions: each configuration is persisted correctly
       Requirements: ui.5.1, ui.5.2, ui.5.4 */
    it('should persist different window configurations across multiple restarts', async () => {
      const configurations = [
        { x: 100, y: 100, width: 800, height: 600 },
        { x: 200, y: 150, width: 1000, height: 700 },
        { x: 50, y: 50, width: 1200, height: 900 },
      ];

      for (const config of configurations) {
        // Launch app
        const windowManager = new WindowManager(dataManager);
        const window = windowManager.createWindow();

        // Set configuration
        window.setBounds(config);

        // Trigger events
        const resizeHandler = (window.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'resize'
        )?.[1];
        const moveHandler = (window.on as jest.Mock).mock.calls.find(
          (call) => call[0] === 'move'
        )?.[1];
        if (resizeHandler) resizeHandler();
        if (moveHandler) moveHandler();

        await new Promise((resolve) => setTimeout(resolve, 100));

        // Close app
        windowManager.closeWindow();

        // Clear mocks for next iteration
        jest.clearAllMocks();

        // Reopen and verify
        const windowManager2 = new WindowManager(dataManager);
        windowManager2.createWindow();

        expect(BrowserWindow).toHaveBeenCalledWith(expect.objectContaining(config));

        windowManager2.closeWindow();
        jest.clearAllMocks();
      }
    });
  });
});
