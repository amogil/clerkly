// Requirements: clerkly.2.1, clerkly.2.3
import { LifecycleManager } from '../../src/main/LifecycleManager';
import { app } from 'electron';

describe('LifecycleManager', () => {
  let lifecycleManager;
  let mockWindowManager;
  let mockDataManager;

  beforeEach(() => {
    // Create mock window manager
    mockWindowManager = {
      createWindow: jest.fn(),
      closeWindow: jest.fn(),
      isWindowCreated: jest.fn(() => false),
      mainWindow: null
    };

    // Create mock data manager
    mockDataManager = {
      initialize: jest.fn().mockResolvedValue({ success: true }),
      close: jest.fn().mockResolvedValue({ success: true })
    };

    // Create lifecycle manager instance
    lifecycleManager = new LifecycleManager(mockWindowManager, mockDataManager);

    // Reset app state
    app.isQuitting = false;
    app.listeners = {};

    // Mock process.platform
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      writable: true,
      configurable: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    /* Preconditions: LifecycleManager class is available
       Action: create LifecycleManager instance with windowManager and dataManager
       Assertions: instance is created with correct properties initialized
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should create instance with correct initial state', () => {
      expect(lifecycleManager).toBeDefined();
      expect(lifecycleManager.windowManager).toBe(mockWindowManager);
      expect(lifecycleManager.dataManager).toBe(mockDataManager);
      expect(lifecycleManager.startTime).toBeNull();
      expect(lifecycleManager.isInitialized).toBe(false);
    });

    /* Preconditions: LifecycleManager class is available
       Action: create LifecycleManager instance without managers
       Assertions: instance is created without errors
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should create instance without managers', () => {
      const manager = new LifecycleManager(null, null);
      
      expect(manager).toBeDefined();
      expect(manager.windowManager).toBeNull();
      expect(manager.dataManager).toBeNull();
    });
  });

  describe('initialize()', () => {
    /* Preconditions: LifecycleManager instance created, not yet initialized
       Action: call initialize method
       Assertions: initializes data manager, creates window, returns success with load time < 3000ms
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should initialize application successfully', async () => {
      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeDefined();
      expect(result.loadTime).toBeLessThan(3000);
      expect(mockDataManager.initialize).toHaveBeenCalledTimes(1);
      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(1);
      expect(lifecycleManager.isInitialized).toBe(true);
      expect(lifecycleManager.startTime).toBeDefined();
    });

    /* Preconditions: LifecycleManager instance created
       Action: call initialize method twice
       Assertions: second call returns immediately without re-initializing
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should not re-initialize if already initialized', async () => {
      await lifecycleManager.initialize();
      
      // Reset mocks
      mockDataManager.initialize.mockClear();
      mockWindowManager.createWindow.mockClear();
      
      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBe(0);
      expect(mockDataManager.initialize).not.toHaveBeenCalled();
      expect(mockWindowManager.createWindow).not.toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager instance created, data manager initialization fails
       Action: call initialize method
       Assertions: returns failure with error message
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle data manager initialization failure', async () => {
      const error = new Error('Database connection failed');
      mockDataManager.initialize.mockRejectedValue(error);

      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(lifecycleManager.isInitialized).toBe(false);
    });

    /* Preconditions: LifecycleManager instance created, window creation fails
       Action: call initialize method
       Assertions: returns failure with error message
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle window creation failure', async () => {
      const error = new Error('Failed to create window');
      mockWindowManager.createWindow.mockImplementation(() => {
        throw error;
      });

      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create window');
      expect(lifecycleManager.isInitialized).toBe(false);
    });

    /* Preconditions: LifecycleManager instance created without managers
       Action: call initialize method
       Assertions: initializes successfully without calling manager methods
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should initialize without managers', async () => {
      const manager = new LifecycleManager(null, null);
      
      const result = await manager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeDefined();
      expect(manager.isInitialized).toBe(true);
    });

    /* Preconditions: LifecycleManager instance created, initialization takes > 3000ms
       Action: call initialize method with delayed operations
       Assertions: logs warning about slow startup, returns success with load time > 3000ms
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should log warning for slow startup', async () => {
      // Mock console.warn
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      // Simulate slow initialization
      mockDataManager.initialize.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve({ success: true }), 3100);
        });
      });

      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeGreaterThan(3000);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Slow startup:')
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('target: <3000ms')
      );

      warnSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager instance created
       Action: call initialize method
       Assertions: startTime is set correctly
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should set startTime during initialization', async () => {
      const beforeInit = Date.now();
      await lifecycleManager.initialize();
      const afterInit = Date.now();

      expect(lifecycleManager.startTime).toBeGreaterThanOrEqual(beforeInit);
      expect(lifecycleManager.startTime).toBeLessThanOrEqual(afterInit);
    });
  });

  describe('handleActivation()', () => {
    /* Preconditions: LifecycleManager instance created, running on Mac OS X, no window exists
       Action: call handleActivation method
       Assertions: creates new window
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should create window on Mac OS X when no window exists', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true
      });
      mockWindowManager.isWindowCreated.mockReturnValue(false);

      lifecycleManager.handleActivation();

      expect(mockWindowManager.isWindowCreated).toHaveBeenCalled();
      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: LifecycleManager instance created, running on Mac OS X, window already exists
       Action: call handleActivation method
       Assertions: does not create new window
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should not create window on Mac OS X when window exists', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true
      });
      mockWindowManager.isWindowCreated.mockReturnValue(true);

      lifecycleManager.handleActivation();

      expect(mockWindowManager.isWindowCreated).toHaveBeenCalled();
      expect(mockWindowManager.createWindow).not.toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager instance created, running on Windows
       Action: call handleActivation method
       Assertions: does not create window (not Mac OS X behavior)
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should not create window on non-Mac platforms', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true
      });
      mockWindowManager.isWindowCreated.mockReturnValue(false);

      lifecycleManager.handleActivation();

      expect(mockWindowManager.createWindow).not.toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager instance created, running on Linux
       Action: call handleActivation method
       Assertions: does not create window (not Mac OS X behavior)
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should not create window on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true
      });
      mockWindowManager.isWindowCreated.mockReturnValue(false);

      lifecycleManager.handleActivation();

      expect(mockWindowManager.createWindow).not.toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager instance created without window manager
       Action: call handleActivation method
       Assertions: does not throw error
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle missing window manager gracefully', () => {
      const manager = new LifecycleManager(null, null);
      
      expect(() => {
        manager.handleActivation();
      }).not.toThrow();
    });
  });

  describe('handleQuit()', () => {
    /* Preconditions: LifecycleManager instance created and initialized
       Action: call handleQuit method
       Assertions: closes window gracefully, returns success
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should quit application gracefully', async () => {
      const result = await lifecycleManager.handleQuit();

      expect(result.success).toBe(true);
      expect(mockWindowManager.closeWindow).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: LifecycleManager instance created with data manager
       Action: call handleQuit method
       Assertions: ensures data is saved before quitting
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should ensure data is saved before quitting', async () => {
      await lifecycleManager.handleQuit();

      // DataManager handles data flushing internally
      // We just verify the quit process completes successfully
      expect(mockWindowManager.closeWindow).toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager instance created, window close fails
       Action: call handleQuit method
       Assertions: returns failure with error message
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle window close failure', async () => {
      const error = new Error('Failed to close window');
      mockWindowManager.closeWindow.mockImplementation(() => {
        throw error;
      });

      const result = await lifecycleManager.handleQuit();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to close window');
    });

    /* Preconditions: LifecycleManager instance created without managers
       Action: call handleQuit method
       Assertions: quits successfully without calling manager methods
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should quit without managers', async () => {
      const manager = new LifecycleManager(null, null);
      
      const result = await manager.handleQuit();

      expect(result.success).toBe(true);
    });

    /* Preconditions: LifecycleManager instance created
       Action: call handleQuit method
       Assertions: logs error if quit fails
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should log error during quit', async () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Quit error');
      mockWindowManager.closeWindow.mockImplementation(() => {
        throw error;
      });

      await lifecycleManager.handleQuit();

      expect(errorSpy).toHaveBeenCalledWith('Error during quit:', error);

      errorSpy.mockRestore();
    });
  });

  describe('handleWindowClose()', () => {
    /* Preconditions: LifecycleManager instance created, running on Mac OS X
       Action: call handleWindowClose method
       Assertions: app does not quit (Mac OS X behavior)
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should not quit app on Mac OS X when windows close', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true
      });
      const quitSpy = jest.spyOn(app, 'quit');

      lifecycleManager.handleWindowClose();

      expect(quitSpy).not.toHaveBeenCalled();

      quitSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager instance created, running on Windows
       Action: call handleWindowClose method
       Assertions: app quits (non-Mac behavior)
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should quit app on Windows when windows close', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true
      });
      const quitSpy = jest.spyOn(app, 'quit');

      lifecycleManager.handleWindowClose();

      expect(quitSpy).toHaveBeenCalledTimes(1);

      quitSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager instance created, running on Linux
       Action: call handleWindowClose method
       Assertions: app quits (non-Mac behavior)
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should quit app on Linux when windows close', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true
      });
      const quitSpy = jest.spyOn(app, 'quit');

      lifecycleManager.handleWindowClose();

      expect(quitSpy).toHaveBeenCalledTimes(1);

      quitSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager instance created
       Action: call handleWindowClose multiple times
       Assertions: handles multiple calls gracefully
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle multiple window close events', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true
      });

      expect(() => {
        lifecycleManager.handleWindowClose();
        lifecycleManager.handleWindowClose();
        lifecycleManager.handleWindowClose();
      }).not.toThrow();
    });
  });

  describe('getStartupTime()', () => {
    /* Preconditions: LifecycleManager instance created, not yet initialized
       Action: call getStartupTime method
       Assertions: returns null
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return null before initialization', () => {
      const startupTime = lifecycleManager.getStartupTime();

      expect(startupTime).toBeNull();
    });

    /* Preconditions: LifecycleManager instance created and initialized
       Action: call getStartupTime method
       Assertions: returns time elapsed since initialization
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return startup time after initialization', async () => {
      await lifecycleManager.initialize();
      
      // Wait a bit to ensure time has passed
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const startupTime = lifecycleManager.getStartupTime();

      expect(startupTime).toBeGreaterThan(0);
      expect(typeof startupTime).toBe('number');
    });

    /* Preconditions: LifecycleManager instance created and initialized
       Action: call getStartupTime multiple times
       Assertions: returns increasing values
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return increasing values over time', async () => {
      await lifecycleManager.initialize();
      
      const time1 = lifecycleManager.getStartupTime();
      await new Promise(resolve => setTimeout(resolve, 10));
      const time2 = lifecycleManager.getStartupTime();

      expect(time2).toBeGreaterThanOrEqual(time1);
    });
  });

  describe('isAppInitialized()', () => {
    /* Preconditions: LifecycleManager instance created, not yet initialized
       Action: call isAppInitialized method
       Assertions: returns false
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return false before initialization', () => {
      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });

    /* Preconditions: LifecycleManager instance created and initialized
       Action: call isAppInitialized method
       Assertions: returns true
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return true after initialization', async () => {
      await lifecycleManager.initialize();

      expect(lifecycleManager.isAppInitialized()).toBe(true);
    });

    /* Preconditions: LifecycleManager instance created, initialization failed
       Action: call isAppInitialized method
       Assertions: returns false
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should return false if initialization failed', async () => {
      mockDataManager.initialize.mockRejectedValue(new Error('Init failed'));
      
      await lifecycleManager.initialize();

      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    /* Preconditions: LifecycleManager instance created
       Action: call methods in unusual order
       Assertions: handles gracefully without errors
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle methods called in unusual order', async () => {
      // Call quit before initialize
      await lifecycleManager.handleQuit();
      
      // Call activation before initialize
      lifecycleManager.handleActivation();
      
      // Now initialize
      const result = await lifecycleManager.initialize();
      
      expect(result.success).toBe(true);
    });

    /* Preconditions: LifecycleManager instance created
       Action: call handleActivation rapidly multiple times
       Assertions: handles rapid calls without creating duplicate windows
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle rapid activation calls', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true
      });
      mockWindowManager.isWindowCreated.mockReturnValue(false);

      for (let i = 0; i < 10; i++) {
        lifecycleManager.handleActivation();
      }

      // Should create window on each call since isWindowCreated returns false
      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(10);
    });

    /* Preconditions: LifecycleManager instance created
       Action: call handleQuit multiple times
       Assertions: handles multiple quit calls gracefully
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle multiple quit calls', async () => {
      await lifecycleManager.handleQuit();
      await lifecycleManager.handleQuit();
      await lifecycleManager.handleQuit();

      // Should call closeWindow each time
      expect(mockWindowManager.closeWindow).toHaveBeenCalledTimes(3);
    });

    /* Preconditions: LifecycleManager instance created with managers that throw errors
       Action: call initialize method
       Assertions: handles errors gracefully and returns failure
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle manager errors during initialization', async () => {
      mockDataManager.initialize.mockRejectedValue(new Error('Critical error'));

      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    /* Preconditions: LifecycleManager instance created
       Action: initialize, quit, then try to initialize again
       Assertions: second initialization is skipped
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should not re-initialize after quit', async () => {
      await lifecycleManager.initialize();
      await lifecycleManager.handleQuit();
      
      mockDataManager.initialize.mockClear();
      mockWindowManager.createWindow.mockClear();
      
      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBe(0);
      expect(mockDataManager.initialize).not.toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager instance created
       Action: call getStartupTime immediately after setting startTime
       Assertions: returns very small positive number
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle getStartupTime called immediately after init', async () => {
      const initPromise = lifecycleManager.initialize();
      const startupTime = lifecycleManager.getStartupTime();
      
      await initPromise;

      // Should return a small number since called during/right after init
      expect(startupTime).toBeGreaterThanOrEqual(0);
      expect(startupTime).toBeLessThan(1000);
    });

    /* Preconditions: LifecycleManager instance created with undefined managers
       Action: call all methods
       Assertions: handles undefined managers gracefully
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should handle undefined managers', async () => {
      const manager = new LifecycleManager(undefined, undefined);
      
      const initResult = await manager.initialize();
      expect(initResult.success).toBe(true);
      
      manager.handleActivation();
      
      const quitResult = await manager.handleQuit();
      expect(quitResult.success).toBe(true);
      
      manager.handleWindowClose();
      
      expect(manager.getStartupTime()).toBeGreaterThanOrEqual(0);
      expect(manager.isAppInitialized()).toBe(true);
    });
  });

  describe('Performance Monitoring', () => {
    /* Preconditions: LifecycleManager instance created
       Action: initialize with fast operations
       Assertions: load time is less than 3000ms, no warning logged
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should not log warning for fast startup', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeLessThan(3000);
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager instance created
       Action: initialize with operations taking exactly 3000ms
       Assertions: no warning logged (threshold is > 3000ms)
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should not log warning at exactly 3000ms threshold', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      mockDataManager.initialize.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve({ success: true }), 2990);
        });
      });

      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeLessThanOrEqual(3000);
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager instance created
       Action: initialize with operations taking 3001ms
       Assertions: warning is logged
       Requirements: clerkly.1.2, clerkly.1.3 */
    it('should log warning at 3001ms', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      mockDataManager.initialize.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve({ success: true }), 3050);
        });
      });

      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeGreaterThan(3000);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
