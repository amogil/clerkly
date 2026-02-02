// Requirements: clerkly.2

import { BrowserWindow } from 'electron';
import WindowManager from '../../src/main/WindowManager';

// Mock Electron's BrowserWindow
jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    close: jest.fn(),
    setSize: jest.fn(),
    setTitle: jest.fn(),
    setResizable: jest.fn(),
    setFullScreen: jest.fn(),
  })),
}));

describe('WindowManager', () => {
  let windowManager: WindowManager;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create new WindowManager instance
    windowManager = new WindowManager();
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
       Assertions: BrowserWindow created with correct Mac OS X parameters (titleBarStyle, vibrancy, trafficLightPosition), returns BrowserWindow instance
       Requirements: clerkly.1, clerkly.2*/
    it('should create window with native Mac OS X interface', () => {
      const window = windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 800,
          height: 600,
          titleBarStyle: 'hiddenInset',
          vibrancy: 'under-window',
          trafficLightPosition: { x: 20, y: 20 },
          webPreferences: expect.objectContaining({
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          }),
        })
      );

      expect(window).toBeDefined();
      expect(windowManager.isWindowCreated()).toBe(true);
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
      const newWindowManager = new WindowManager();

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
      const newWindowManager = new WindowManager();

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
       Assertions: titleBarStyle set to 'hiddenInset' (Mac OS X native style)
       Requirements: clerkly.1, clerkly.2*/
    it('should set titleBarStyle to hiddenInset for Mac OS X', () => {
      windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          titleBarStyle: 'hiddenInset',
        })
      );
    });

    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: vibrancy set to 'under-window' (Mac OS X effect)
       Requirements: clerkly.1, clerkly.2*/
    it('should set vibrancy to under-window for Mac OS X', () => {
      windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          vibrancy: 'under-window',
        })
      );
    });

    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: trafficLightPosition set to {x: 20, y: 20} (Mac OS X window controls)
       Requirements: clerkly.1, clerkly.2*/
    it('should set trafficLightPosition for Mac OS X window controls', () => {
      windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          trafficLightPosition: { x: 20, y: 20 },
        })
      );
    });

    /* Preconditions: WindowManager created
       Action: call createWindow()
       Assertions: webPreferences configured with security settings (contextIsolation, nodeIntegration, sandbox)
       Requirements: clerkly.1, clerkly.2*/
    it('should configure secure webPreferences', () => {
      windowManager.createWindow();

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          webPreferences: expect.objectContaining({
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
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
  });
});
