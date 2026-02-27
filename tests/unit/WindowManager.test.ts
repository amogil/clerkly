// Requirements: clerkly.2, window-management.5, database-refactoring.3.6

import { BrowserWindow } from 'electron';
import WindowManager from '../../src/main/WindowManager';
import type { IDatabaseManager } from '../../src/main/DatabaseManager';

// Mock Electron's BrowserWindow
jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
    close: jest.fn(),
    setSize: jest.fn(),
    setTitle: jest.fn(),
    setResizable: jest.fn(),
    setFullScreen: jest.fn(),
    maximize: jest.fn(),
    isMaximized: jest.fn().mockReturnValue(false),
    getBounds: jest.fn().mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 }),
    webContents: {
      session: {
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
      },
      on: jest.fn(),
    },
  })),
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

describe('WindowManager', () => {
  let windowManager: WindowManager;
  let mockDbManager: jest.Mocked<IDatabaseManager>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock for global.windowState repository
    // Requirements: user-data-isolation.6.8 - WindowStateManager uses dbManager.global.windowState
    const mockGlobalWindowState = {
      get: jest.fn().mockReturnValue(undefined), // Default: no saved state
      set: jest.fn(),
    };

    // Create mock DatabaseManager with repository accessors
    // Requirements: user-data-isolation.6.10, user-data-isolation.6.8 - WindowStateManager uses global repository
    mockDbManager = {
      getDatabase: jest.fn(),
      getCurrentUserId: jest.fn().mockReturnValue('test@example.com'),
      getCurrentUserIdStrict: jest.fn().mockReturnValue('test@example.com'),
      setUserManager: jest.fn(),
      // Repository accessors
      settings: {} as any,
      agents: {} as any,
      messages: {} as any,
      users: {} as any,
      global: {
        windowState: mockGlobalWindowState,
      },
    } as any;

    // Create new WindowManager instance with mock DatabaseManager
    // Requirements: window-management.5, database-refactoring.3.6
    windowManager = new WindowManager(mockDbManager);
  });

  // Helper function to get the most recent mock BrowserWindow instance
  const getMockWindow = (): any => {
    const MockedBrowserWindow = BrowserWindow as jest.MockedClass<typeof BrowserWindow>;
    const instances = MockedBrowserWindow.mock.results;
    if (instances.length === 0) return null;
    return instances[instances.length - 1].value;
  };

  afterEach(() => {
    // Clean up
    if (windowManager && windowManager.isWindowCreated()) {
      windowManager.closeWindow();
    }
  });

  describe('createWindow', () => {
    /* Preconditions: WindowManager created, no window exists yet
       Action: call createWindow()
       Assertions: BrowserWindow created with correct Mac OS X parameters (titleBarStyle), returns BrowserWindow instance
       Requirements: window-management.1.1, window-management.1.2, window-management.1.3, window-management.2.1, window-management.3.1, window-management.4.1, window-management.4.2, window-management.5.4, window-management.5.5 */
    it('should create window with native Mac OS X interface', () => {
      const window = windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '', // Requirements: window-management.2.1
          show: false,
          resizable: true, // Requirements: window-management.1.3
          titleBarStyle: 'default', // Requirements: window-management.3.1
          webPreferences: expect.objectContaining({
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webSecurity: true,
          }),
        })
      );

      expect(window).toBeDefined();
      expect(windowManager.isWindowCreated()).toBe(true);
    });

    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: window created with resizable: true
       Requirements: window-management.1.3 */
    it('should create resizable window', () => {
      windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          resizable: true,
        })
      );
    });

    /* Preconditions: WindowManager created, no saved state exists
       Action: call createWindow()
       Assertions: window created with compact default state min(900, screenWidth) x min(700, screenHeight), centered
       Requirements: window-management.1.1, window-management.1.6, window-management.4.1, window-management.4.2, window-management.4.4, window-management.5.5 */
    it('should create window with default state when no saved state exists', () => {
      windowManager.createWindow();

      // Default state should be compact size 900x700, centered on 1920x1080 screen
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 510, // (1920 - 900) / 2
          y: 190, // (1080 - 700) / 2
          width: 900, // min(900, 1920)
          height: 700, // min(700, 1080)
          minWidth: 350, // Requirements: window-management.1.6
          minHeight: 650, // Requirements: window-management.1.6
        })
      );
    });

    /* Preconditions: WindowManager created, saved state exists
       Action: call createWindow()
       Assertions: window created with saved state dimensions
       Requirements: window-management.5.4, user-data-isolation.6.10, user-data-isolation.6.8 */
    it('should create window with saved state when it exists', () => {
      // Mock saved state via global.windowState.get repository
      (mockDbManager.global.windowState.get as jest.Mock).mockReturnValue({
        x: 200,
        y: 150,
        width: 1400,
        height: 900,
        isMaximized: false,
      });

      // Need to recreate WindowManager to pick up new mock
      windowManager = new WindowManager(mockDbManager);
      windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 200,
          y: 150,
          width: 1400,
          height: 900,
        })
      );
    });

    /* Preconditions: WindowManager created, saved state has isMaximized: true
       Action: call createWindow()
       Assertions: maximize() IS called to restore saved maximized state
       Requirements: window-management.1.1, window-management.1.3, window-management.5.3, window-management.5.4, user-data-isolation.6.10, user-data-isolation.6.8 */
    it('should maximize window when saved state has isMaximized: true', () => {
      // Mock saved state with isMaximized: true via global.windowState.get repository
      (mockDbManager.global.windowState.get as jest.Mock).mockReturnValue({
        x: 100,
        y: 100,
        width: 1200,
        height: 800,
        isMaximized: true,
      });

      // Need to recreate WindowManager to pick up new mock
      windowManager = new WindowManager(mockDbManager);
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      // Window SHOULD be maximized to restore saved state (window-management.5.3, window-management.5.4)
      // Maximized windows are still resizable on macOS when resizable: true (window-management.1.3)
      expect(mockWindow.maximize).toHaveBeenCalled();
    });

    /* Preconditions: WindowManager created, saved state has isMaximized: false
       Action: call createWindow()
       Assertions: maximize() not called on window
       Requirements: window-management.1.1, window-management.1.3, user-data-isolation.6.10, user-data-isolation.6.8 */
    it('should not maximize window when saved state has isMaximized: false', () => {
      // Mock saved state with isMaximized: false via global.windowState.get repository
      (mockDbManager.global.windowState.get as jest.Mock).mockReturnValue({
        x: 100,
        y: 100,
        width: 1200,
        height: 800,
        isMaximized: false,
      });

      // Need to recreate WindowManager to pick up new mock
      windowManager = new WindowManager(mockDbManager);
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      expect(mockWindow.maximize).not.toHaveBeenCalled();
    });

    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: setupStateTracking called, event listeners registered
       Requirements: window-management.5.1, window-management.5.2, window-management.5.3 */
    it('should setup state tracking after creating window', () => {
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      // Verify event listeners are registered
      expect(mockWindow.on).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('move', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('maximize', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('unmaximize', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    /* Preconditions: WindowManager created, no window exists
       Action: call createWindow()
       Assertions: window loads HTML file, loadFile called with correct path
       Requirements: clerkly.1, clerkly.2*/
    it('should load HTML file after creating window', () => {
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      expect(mockWindow.loadFile).toHaveBeenCalledTimes(1);
      expect(mockWindow.loadFile).toHaveBeenCalledWith(
        expect.stringContaining('renderer/index.html')
      );
    });

    /* Preconditions: WindowManager created, no window exists
       Action: call createWindow()
       Assertions: closed event listener registered to clean up window reference
       Requirements: clerkly.1, clerkly.2*/
    it('should register closed event listener for cleanup', () => {
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      expect(mockWindow.on).toHaveBeenCalledWith('closed', expect.any(Function));
    });

    /* Preconditions: WindowManager created, no window exists
       Action: call createWindow(), trigger closed event
       Assertions: window reference set to null, isWindowCreated returns false
       Requirements: clerkly.1, clerkly.2*/
    it('should clean up window reference when closed event fires', () => {
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      // Get the closed event handler
      const closedHandler = mockWindow.on.mock.calls.find((call: any[]) => call[0] === 'closed')[1];

      // Trigger the closed event
      closedHandler();

      expect(windowManager.isWindowCreated()).toBe(false);
      expect(windowManager.getWindow()).toBeNull();
    });

    /* Preconditions: WindowManager created, window already exists
       Action: call createWindow() again
       Assertions: new window created, old window reference replaced
       Requirements: clerkly.1, clerkly.2*/
    it('should replace existing window when called multiple times', () => {
      windowManager.createWindow();
      windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledTimes(2);
      expect(windowManager.isWindowCreated()).toBe(true);
    });

    /* Preconditions: WindowManager created, BrowserWindow constructor throws error
       Action: call createWindow()
       Assertions: throws error with descriptive message
       Requirements: clerkly.1, clerkly.2*/
    it('should throw error when window creation fails', () => {
      // Mock BrowserWindow to throw error
      (BrowserWindow as jest.MockedClass<typeof BrowserWindow>).mockImplementationOnce(() => {
        throw new Error('Failed to create window');
      });

      expect(() => {
        windowManager.createWindow();
      }).toThrow('Window creation failed');
    });

    /* Preconditions: WindowManager created, BrowserWindow constructor throws non-Error object
       Action: call createWindow()
       Assertions: throws error with 'Unknown error' message
       Requirements: clerkly.1, clerkly.2*/
    it('should handle non-Error exception during window creation', () => {
      // Mock BrowserWindow to throw non-Error object
      (BrowserWindow as jest.MockedClass<typeof BrowserWindow>).mockImplementationOnce(() => {
        throw 'String error'; // Non-Error object
      });

      expect(() => {
        windowManager.createWindow();
      }).toThrow('Window creation failed: Unknown error');
    });
  });

  describe('configureWindow', () => {
    beforeEach(() => {
      windowManager.createWindow();
    });

    /* Preconditions: window created
       Action: call configureWindow with width and height
       Assertions: setSize called with correct parameters
       Requirements: clerkly.1, clerkly.2*/
    it('should configure window size', () => {
      windowManager.configureWindow({ width: 1024, height: 768 });
      const mockWindow = getMockWindow();

      expect(mockWindow.setSize).toHaveBeenCalledWith(1024, 768);
    });

    /* Preconditions: window created
       Action: call configureWindow with title
       Assertions: setTitle called with correct title
       Requirements: clerkly.1, clerkly.2*/
    it('should configure window title', () => {
      windowManager.configureWindow({ title: 'Clerkly - Test' });
      const mockWindow = getMockWindow();

      expect(mockWindow.setTitle).toHaveBeenCalledWith('Clerkly - Test');
    });

    /* Preconditions: window created
       Action: call configureWindow with resizable false
       Assertions: setResizable called with false
       Requirements: clerkly.1, clerkly.2*/
    it('should configure window resizable property', () => {
      windowManager.configureWindow({ resizable: false });
      const mockWindow = getMockWindow();

      expect(mockWindow.setResizable).toHaveBeenCalledWith(false);
    });

    /* Preconditions: window created
       Action: call configureWindow with fullscreen true
       Assertions: setFullScreen called with true
       Requirements: clerkly.1, clerkly.2*/
    it('should configure window fullscreen property', () => {
      windowManager.configureWindow({ fullscreen: true });
      const mockWindow = getMockWindow();

      expect(mockWindow.setFullScreen).toHaveBeenCalledWith(true);
    });

    /* Preconditions: window created
       Action: call configureWindow with multiple options
       Assertions: all corresponding methods called with correct parameters
       Requirements: clerkly.1, clerkly.2*/
    it('should configure multiple window properties at once', () => {
      windowManager.configureWindow({
        width: 1280,
        height: 720,
        title: 'Clerkly',
        resizable: true,
        fullscreen: false,
      });
      const mockWindow = getMockWindow();

      expect(mockWindow.setSize).toHaveBeenCalledWith(1280, 720);
      expect(mockWindow.setTitle).toHaveBeenCalledWith('Clerkly');
      expect(mockWindow.setResizable).toHaveBeenCalledWith(true);
      expect(mockWindow.setFullScreen).toHaveBeenCalledWith(false);
    });

    /* Preconditions: window created
       Action: call configureWindow with empty options object
       Assertions: no setter methods called
       Requirements: clerkly.1, clerkly.2*/
    it('should handle empty options object', () => {
      windowManager.configureWindow({});
      const mockWindow = getMockWindow();

      expect(mockWindow.setSize).not.toHaveBeenCalled();
      expect(mockWindow.setTitle).not.toHaveBeenCalled();
      expect(mockWindow.setResizable).not.toHaveBeenCalled();
      expect(mockWindow.setFullScreen).not.toHaveBeenCalled();
    });

    /* Preconditions: window not created
       Action: call configureWindow
       Assertions: no error thrown, warning logged, no methods called
       Requirements: clerkly.1, clerkly.2*/
    it('should handle configuration when window not created', () => {
      // Requirements: window-management.5, database-refactoring.3.6
      const newWindowManager = new WindowManager(mockDbManager);

      // Should not throw
      expect(() => {
        newWindowManager.configureWindow({ width: 800, height: 600 });
      }).not.toThrow();

      // No BrowserWindow methods should be called (only 1 from beforeEach)
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: window created, setSize throws error
       Action: call configureWindow with size
       Assertions: error caught and logged, no exception thrown
       Requirements: clerkly.1, clerkly.2*/
    it('should handle errors during configuration', () => {
      const mockWindow = getMockWindow();
      mockWindow.setSize.mockImplementation(() => {
        throw new Error('Failed to set size');
      });

      // Should not throw
      expect(() => {
        windowManager.configureWindow({ width: 1024, height: 768 });
      }).not.toThrow();
    });

    /* Preconditions: window created, setSize throws non-Error object
       Action: call configureWindow with size
       Assertions: error caught with 'Unknown error', no exception thrown
       Requirements: clerkly.1, clerkly.2*/
    it('should handle non-Error exception during configuration', () => {
      const mockWindow = getMockWindow();
      mockWindow.setSize.mockImplementation(() => {
        throw 'String error'; // Non-Error object
      });

      // Should not throw
      expect(() => {
        windowManager.configureWindow({ width: 1024, height: 768 });
      }).not.toThrow();
    });
  });

  describe('closeWindow', () => {
    /* Preconditions: window created
       Action: call closeWindow()
       Assertions: removeAllListeners called, close called, window reference set to null
       Requirements: clerkly.1, clerkly.2*/
    it('should close window with cleanup of listeners', () => {
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      windowManager.closeWindow();

      expect(mockWindow.removeAllListeners).toHaveBeenCalledTimes(1);
      expect(mockWindow.close).toHaveBeenCalledTimes(1);
      expect(windowManager.isWindowCreated()).toBe(false);
      expect(windowManager.getWindow()).toBeNull();
    });

    /* Preconditions: window not created
       Action: call closeWindow()
       Assertions: no error thrown, no methods called
       Requirements: clerkly.1, clerkly.2*/
    it('should handle close when window not created', () => {
      // Requirements: window-management.5, database-refactoring.3.6
      const newWindowManager = new WindowManager(mockDbManager);

      expect(() => {
        newWindowManager.closeWindow();
      }).not.toThrow();

      expect(newWindowManager.isWindowCreated()).toBe(false);
    });

    /* Preconditions: window created, close method throws error
       Action: call closeWindow()
       Assertions: error caught, window reference still cleared
       Requirements: clerkly.1, clerkly.2*/
    it('should clear window reference even if close fails', () => {
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      mockWindow.close.mockImplementation(() => {
        throw new Error('Failed to close');
      });

      // Should not throw
      expect(() => {
        windowManager.closeWindow();
      }).not.toThrow();

      // Window reference should still be cleared
      expect(windowManager.isWindowCreated()).toBe(false);
      expect(windowManager.getWindow()).toBeNull();
    });

    /* Preconditions: window created and closed
       Action: call closeWindow() again
       Assertions: no error thrown (idempotent)
       Requirements: clerkly.1, clerkly.2*/
    it('should be idempotent - multiple calls do not cause errors', () => {
      windowManager.createWindow();
      windowManager.closeWindow();

      expect(() => {
        windowManager.closeWindow();
      }).not.toThrow();

      expect(windowManager.isWindowCreated()).toBe(false);
    });
  });

  describe('getWindow', () => {
    /* Preconditions: window created
       Action: call getWindow()
       Assertions: returns BrowserWindow instance
       Requirements: clerkly.1, clerkly.2*/
    it('should return window instance when window exists', () => {
      const window = windowManager.createWindow();
      const retrievedWindow = windowManager.getWindow();

      expect(retrievedWindow).toBe(window);
      expect(retrievedWindow).toBeDefined();
    });

    /* Preconditions: window not created
       Action: call getWindow()
       Assertions: returns null
       Requirements: clerkly.1, clerkly.2*/
    it('should return null when window not created', () => {
      const window = windowManager.getWindow();

      expect(window).toBeNull();
    });

    /* Preconditions: window created then closed
       Action: call getWindow()
       Assertions: returns null
       Requirements: clerkly.1, clerkly.2*/
    it('should return null after window is closed', () => {
      windowManager.createWindow();
      windowManager.closeWindow();

      const window = windowManager.getWindow();

      expect(window).toBeNull();
    });
  });

  describe('isWindowCreated', () => {
    /* Preconditions: window not created
       Action: call isWindowCreated()
       Assertions: returns false
       Requirements: clerkly.1, clerkly.2*/
    it('should return false when window not created', () => {
      expect(windowManager.isWindowCreated()).toBe(false);
    });

    /* Preconditions: window created
       Action: call isWindowCreated()
       Assertions: returns true
       Requirements: clerkly.1, clerkly.2*/
    it('should return true when window exists', () => {
      windowManager.createWindow();

      expect(windowManager.isWindowCreated()).toBe(true);
    });

    /* Preconditions: window created then closed
       Action: call isWindowCreated()
       Assertions: returns false
       Requirements: clerkly.1, clerkly.2*/
    it('should return false after window is closed', () => {
      windowManager.createWindow();
      windowManager.closeWindow();

      expect(windowManager.isWindowCreated()).toBe(false);
    });

    /* Preconditions: window created, closed event triggered
       Action: call isWindowCreated()
       Assertions: returns false
       Requirements: clerkly.1, clerkly.2*/
    it('should return false after closed event is triggered', () => {
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      // Get and trigger the closed event handler
      const closedHandler = mockWindow.on.mock.calls.find((call: any[]) => call[0] === 'closed')[1];
      closedHandler();

      expect(windowManager.isWindowCreated()).toBe(false);
    });
  });

  describe('Mac OS X specific settings', () => {
    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: titleBarStyle set to 'default' (Mac OS X native style)
       Requirements: clerkly.1, clerkly.2*/
    it('should set titleBarStyle to default for Mac OS X', () => {
      windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          titleBarStyle: 'default',
        })
      );
    });

    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: webPreferences configured with security settings (contextIsolation, nodeIntegration, sandbox, webSecurity)
       Requirements: clerkly.1, clerkly.2*/
    it('should configure secure webPreferences', () => {
      windowManager.createWindow();

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

    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: preload script path configured in webPreferences
       Requirements: clerkly.1, clerkly.2*/
    it('should configure preload script path', () => {
      windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          webPreferences: expect.objectContaining({
            preload: expect.stringContaining('preload/index.js'),
          }),
        })
      );
    });

    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: CSP header configured via webRequest.onHeadersReceived
       Requirements: clerkly.1, clerkly.2*/
    it('should configure Content Security Policy', () => {
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      expect(mockWindow.webContents.session.webRequest.onHeadersReceived).toHaveBeenCalledTimes(1);
      expect(mockWindow.webContents.session.webRequest.onHeadersReceived).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: console-message event listener registered on webContents
       Requirements: clerkly.1, clerkly.2*/
    it('should register console message listener', () => {
      windowManager.createWindow();
      const mockWindow = getMockWindow();

      expect(mockWindow.webContents.on).toHaveBeenCalledWith(
        'console-message',
        expect.any(Function)
      );
    });
  });
});
