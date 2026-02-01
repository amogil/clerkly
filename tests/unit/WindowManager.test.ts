// Requirements: clerkly.2.1, clerkly.2.3
import WindowManager from '../../dist/src/main/WindowManager';
import { BrowserWindow } from 'electron';

describe('WindowManager', () => {
  let windowManager: WindowManager;

  beforeEach(() => {
    windowManager = new WindowManager();
    // Clear any existing windows
    (BrowserWindow as any)._windows = [];
  });

  afterEach(() => {
    // Clean up: close any open windows
    if (windowManager && windowManager.isWindowCreated()) {
      windowManager.closeWindow();
    }
  });

  describe('Constructor', () => {
    /* Preconditions: WindowManager class is available
       Action: create WindowManager instance
       Assertions: instance is created with mainWindow set to null
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should create instance with mainWindow set to null', () => {
      expect(windowManager).toBeDefined();
      expect(windowManager.mainWindow).toBeNull();
    });
  });

  describe('createWindow()', () => {
    /* Preconditions: WindowManager instance created, no window exists
       Action: call createWindow method
       Assertions: creates BrowserWindow with correct parameters (width: 800, height: 600, minWidth: 600, minHeight: 400), returns BrowserWindow instance
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should create window with correct default parameters', () => {
      const window = windowManager.createWindow();

      expect(window).toBeDefined();
      expect(window).toBeInstanceOf(BrowserWindow);
      expect(windowManager.mainWindow).toBe(window);
      
      // Check window options
      expect((window as any).options.width).toBe(800);
      expect((window as any).options.height).toBe(600);
      expect((window as any).options.minWidth).toBe(600);
      expect((window as any).options.minHeight).toBe(400);
    });

    /* Preconditions: WindowManager instance created
       Action: call createWindow method
       Assertions: window has Mac OS X native appearance settings (titleBarStyle, trafficLightPosition, vibrancy)
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should create window with Mac OS X native appearance', () => {
      const window = windowManager.createWindow();

      expect((window as any).options.titleBarStyle).toBe('hiddenInset');
      expect((window as any).options.trafficLightPosition).toEqual({ x: 10, y: 10 });
      expect((window as any).options.vibrancy).toBe('under-window');
      expect((window as any).options.visualEffectState).toBe('active');
    });

    /* Preconditions: WindowManager instance created
       Action: call createWindow method
       Assertions: window has correct security settings (nodeIntegration: false, contextIsolation: true, preload script)
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should create window with correct security settings', () => {
      const window = windowManager.createWindow();

      expect((window as any).options.webPreferences.nodeIntegration).toBe(false);
      expect((window as any).options.webPreferences.contextIsolation).toBe(true);
      expect((window as any).options.webPreferences.preload).toBeDefined();
      expect((window as any).options.webPreferences.preload).toContain('preload.js');
    });

    /* Preconditions: WindowManager instance created
       Action: call createWindow method
       Assertions: window loads index.html file
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should load index.html file', () => {
      const window = windowManager.createWindow();

      expect((window as any).loadedFile).toBe('index.html');
    });

    /* Preconditions: WindowManager instance created, window created
       Action: simulate window close event
       Assertions: mainWindow reference is set to null
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should set mainWindow to null when window is closed', () => {
      const window = windowManager.createWindow();
      expect(windowManager.mainWindow).toBe(window);

      // Simulate window close event
      (window as any).emit('closed');

      expect(windowManager.mainWindow).toBeNull();
    });

    /* Preconditions: WindowManager instance created, window already exists
       Action: call createWindow method again
       Assertions: creates new window, replaces old mainWindow reference
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should allow creating new window when one already exists', () => {
      const firstWindow = windowManager.createWindow();
      const secondWindow = windowManager.createWindow();

      expect(secondWindow).toBeDefined();
      expect(secondWindow).toBeInstanceOf(BrowserWindow);
      expect(windowManager.mainWindow).toBe(secondWindow);
      expect(firstWindow).not.toBe(secondWindow);
    });
  });

  describe('configureWindow()', () => {
    beforeEach(() => {
      windowManager.createWindow();
    });

    /* Preconditions: window created with default size
       Action: call configureWindow with new width and height
       Assertions: window size is updated to new dimensions
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should update window size', () => {
      windowManager.configureWindow({ width: 1024, height: 768 });

      const size = windowManager.mainWindow!.getSize();
      expect(size[0]).toBe(1024);
      expect(size[1]).toBe(768);
    });

    /* Preconditions: window created with default minimum size
       Action: call configureWindow with new minWidth and minHeight
       Assertions: window minimum size is updated
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should update window minimum size', () => {
      windowManager.configureWindow({ minWidth: 800, minHeight: 600 });

      const minSize = windowManager.mainWindow!.getMinimumSize();
      expect(minSize[0]).toBe(800);
      expect(minSize[1]).toBe(600);
    });

    /* Preconditions: window created with default title
       Action: call configureWindow with new title
       Assertions: window title is updated
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should update window title', () => {
      windowManager.configureWindow({ title: 'Clerkly - AI Assistant' });

      expect((windowManager.mainWindow as any).title).toBe('Clerkly - AI Assistant');
    });

    /* Preconditions: window created
       Action: call configureWindow with resizable: false
       Assertions: window resizable property is set to false
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should update window resizable property', () => {
      windowManager.configureWindow({ resizable: false });

      expect((windowManager.mainWindow as any).resizable).toBe(false);
    });

    /* Preconditions: window created
       Action: call configureWindow with fullscreen: true
       Assertions: window enters fullscreen mode
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should update window fullscreen property', () => {
      windowManager.configureWindow({ fullscreen: true });

      expect((windowManager.mainWindow as any).fullscreen).toBe(true);
    });

    /* Preconditions: window created with default size
       Action: call configureWindow with only width (no height)
       Assertions: width is updated, height remains unchanged
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should update only specified dimensions', () => {
      const originalSize = windowManager.mainWindow!.getSize();
      windowManager.configureWindow({ width: 1000 });

      const newSize = windowManager.mainWindow!.getSize();
      expect(newSize[0]).toBe(1000);
      expect(newSize[1]).toBe(originalSize[1]);
    });

    /* Preconditions: window created
       Action: call configureWindow with multiple options
       Assertions: all specified options are applied
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should apply multiple configuration options', () => {
      windowManager.configureWindow({
        width: 1200,
        height: 800,
        title: 'Test Title',
        resizable: false
      });

      const size = windowManager.mainWindow!.getSize();
      expect(size[0]).toBe(1200);
      expect(size[1]).toBe(800);
      expect((windowManager.mainWindow as any).title).toBe('Test Title');
      expect((windowManager.mainWindow as any).resizable).toBe(false);
    });

    /* Preconditions: WindowManager instance created, no window created
       Action: call configureWindow without creating window first
       Assertions: throws error with message about window not created
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should throw error if window not created', () => {
      const uninitializedManager = new WindowManager();
      
      expect(() => {
        uninitializedManager.configureWindow({ width: 1000 });
      }).toThrow('Window not created');
    });

    /* Preconditions: window created
       Action: call configureWindow with empty options object
       Assertions: does not throw error, window remains unchanged
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle empty options object', () => {
      const originalSize = windowManager.mainWindow!.getSize();
      
      expect(() => {
        windowManager.configureWindow({});
      }).not.toThrow();

      const newSize = windowManager.mainWindow!.getSize();
      expect(newSize).toEqual(originalSize);
    });

    /* Preconditions: window created
       Action: call configureWindow and verify return value
       Assertions: returns the BrowserWindow instance
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return window instance', () => {
      const result = windowManager.configureWindow({ width: 1000 });

      expect(result).toBe(windowManager.mainWindow);
      expect(result).toBeInstanceOf(BrowserWindow);
    });
  });

  describe('closeWindow()', () => {
    /* Preconditions: window created and open
       Action: call closeWindow method
       Assertions: window is closed, mainWindow is set to null, all listeners are removed
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should close window and clean up resources', () => {
      windowManager.createWindow();
      const window = windowManager.mainWindow!;
      
      // Add some listeners to verify cleanup
      (window as any).on('test-event', () => {});
      
      windowManager.closeWindow();

      expect((window as any).isDestroyed()).toBe(true);
      expect(windowManager.mainWindow).toBeNull();
      expect(Object.keys((window as any).listeners).length).toBe(0);
    });

    /* Preconditions: WindowManager instance created, no window created
       Action: call closeWindow method
       Assertions: does not throw error, handles gracefully
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle closing when no window exists', () => {
      expect(() => {
        windowManager.closeWindow();
      }).not.toThrow();
      
      expect(windowManager.mainWindow).toBeNull();
    });

    /* Preconditions: window created and already closed
       Action: call closeWindow method again
       Assertions: does not throw error, handles gracefully
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle closing already closed window', () => {
      windowManager.createWindow();
      windowManager.closeWindow();
      
      expect(() => {
        windowManager.closeWindow();
      }).not.toThrow();
      
      expect(windowManager.mainWindow).toBeNull();
    });

    /* Preconditions: window created with multiple event listeners
       Action: call closeWindow method
       Assertions: all event listeners are removed before closing
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should remove all listeners before closing', () => {
      windowManager.createWindow();
      const window = windowManager.mainWindow!;
      
      // Add multiple listeners
      (window as any).on('event1', () => {});
      (window as any).on('event2', () => {});
      (window as any).on('event3', () => {});
      
      expect(Object.keys((window as any).listeners).length).toBeGreaterThan(0);
      
      windowManager.closeWindow();
      
      expect(Object.keys((window as any).listeners).length).toBe(0);
    });
  });

  describe('getWindow()', () => {
    /* Preconditions: window created
       Action: call getWindow method
       Assertions: returns the BrowserWindow instance
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return window instance when window exists', () => {
      windowManager.createWindow();
      const window = windowManager.getWindow();

      expect(window).toBe(windowManager.mainWindow);
      expect(window).toBeInstanceOf(BrowserWindow);
    });

    /* Preconditions: no window created
       Action: call getWindow method
       Assertions: returns null
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return null when no window exists', () => {
      const window = windowManager.getWindow();

      expect(window).toBeNull();
    });

    /* Preconditions: window created then closed
       Action: call getWindow method after closing
       Assertions: returns null
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return null after window is closed', () => {
      windowManager.createWindow();
      windowManager.closeWindow();
      const window = windowManager.getWindow();

      expect(window).toBeNull();
    });
  });

  describe('isWindowCreated()', () => {
    /* Preconditions: window created and open
       Action: call isWindowCreated method
       Assertions: returns true
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return true when window exists and is not destroyed', () => {
      windowManager.createWindow();
      
      expect(windowManager.isWindowCreated()).toBe(true);
    });

    /* Preconditions: no window created
       Action: call isWindowCreated method
       Assertions: returns false
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return false when no window exists', () => {
      expect(windowManager.isWindowCreated()).toBe(false);
    });

    /* Preconditions: window created then closed
       Action: call isWindowCreated method after closing
       Assertions: returns false
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return false after window is closed', () => {
      windowManager.createWindow();
      windowManager.closeWindow();
      
      expect(windowManager.isWindowCreated()).toBe(false);
    });

    /* Preconditions: window created then destroyed
       Action: call isWindowCreated method after destroying
       Assertions: returns false
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return false when window is destroyed', () => {
      windowManager.createWindow();
      windowManager.mainWindow!.destroy();
      
      expect(windowManager.isWindowCreated()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    /* Preconditions: window created
       Action: call configureWindow with very large dimensions
       Assertions: dimensions are applied without error
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle very large window dimensions', () => {
      windowManager.createWindow();
      
      expect(() => {
        windowManager.configureWindow({ width: 5000, height: 3000 });
      }).not.toThrow();

      const size = windowManager.mainWindow!.getSize();
      expect(size[0]).toBe(5000);
      expect(size[1]).toBe(3000);
    });

    /* Preconditions: window created
       Action: call configureWindow with very small dimensions
       Assertions: dimensions are applied without error
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle very small window dimensions', () => {
      windowManager.createWindow();
      
      expect(() => {
        windowManager.configureWindow({ width: 100, height: 100 });
      }).not.toThrow();

      const size = windowManager.mainWindow!.getSize();
      expect(size[0]).toBe(100);
      expect(size[1]).toBe(100);
    });

    /* Preconditions: window created
       Action: call configureWindow with zero dimensions
       Assertions: dimensions are applied without error
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle zero dimensions', () => {
      windowManager.createWindow();
      
      expect(() => {
        windowManager.configureWindow({ width: 0, height: 0 });
      }).not.toThrow();

      const size = windowManager.mainWindow!.getSize();
      expect(size[0]).toBe(0);
      expect(size[1]).toBe(0);
    });

    /* Preconditions: window created
       Action: call configureWindow with negative dimensions
       Assertions: dimensions are applied without error (Electron handles validation)
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle negative dimensions', () => {
      windowManager.createWindow();
      
      expect(() => {
        windowManager.configureWindow({ width: -100, height: -100 });
      }).not.toThrow();
    });

    /* Preconditions: window created
       Action: call configureWindow with special title characters
       Assertions: title with special characters is set correctly
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle special characters in title', () => {
      windowManager.createWindow();
      const specialTitle = 'Clerkly™ - AI Assistant © 2024 • Test & Demo';
      
      windowManager.configureWindow({ title: specialTitle });

      expect((windowManager.mainWindow as any).title).toBe(specialTitle);
    });

    /* Preconditions: window created
       Action: call configureWindow with very long title
       Assertions: long title is set without error
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle very long title', () => {
      windowManager.createWindow();
      const longTitle = 'A'.repeat(1000);
      
      expect(() => {
        windowManager.configureWindow({ title: longTitle });
      }).not.toThrow();

      expect((windowManager.mainWindow as any).title).toBe(longTitle);
    });

    /* Preconditions: window created
       Action: call configureWindow with empty string title
       Assertions: empty title is set without error
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle empty string title', () => {
      windowManager.createWindow();
      
      expect(() => {
        windowManager.configureWindow({ title: '' });
      }).not.toThrow();

      expect((windowManager.mainWindow as any).title).toBe('');
    });

    /* Preconditions: window created
       Action: rapidly call createWindow multiple times
       Assertions: each call creates a new window without errors
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle rapid window creation', () => {
      const windows: any[] = [];
      
      for (let i = 0; i < 10; i++) {
        const window = windowManager.createWindow();
        windows.push(window);
        expect(window).toBeInstanceOf(BrowserWindow);
      }

      expect(windowManager.mainWindow).toBe(windows[windows.length - 1]);
    });

    /* Preconditions: window created
       Action: rapidly call closeWindow multiple times
       Assertions: handles multiple close calls gracefully
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle rapid window closing', () => {
      windowManager.createWindow();
      
      expect(() => {
        for (let i = 0; i < 10; i++) {
          windowManager.closeWindow();
        }
      }).not.toThrow();

      expect(windowManager.mainWindow).toBeNull();
    });
  });
});
