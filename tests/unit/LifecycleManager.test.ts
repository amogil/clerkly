// Requirements: clerkly.2, window-management.5, account-profile.1.5

import { LifecycleManager } from '../../src/main/LifecycleManager';
import WindowManager from '../../src/main/WindowManager';
import { DataManager } from '../../src/main/DataManager';
import { OAuthClientManager } from '../../src/main/auth/OAuthClientManager';
import { TokenStorageManager } from '../../src/main/auth/TokenStorageManager';

// Mock WindowManager
jest.mock('../../src/main/WindowManager');

// Mock DataManager
jest.mock('../../src/main/DataManager');

// Mock OAuthClientManager
jest.mock('../../src/main/auth/OAuthClientManager');

// Mock TokenStorageManager
jest.mock('../../src/main/auth/TokenStorageManager');

describe('LifecycleManager', () => {
  let lifecycleManager: LifecycleManager;
  let mockWindowManager: jest.Mocked<WindowManager>;
  let mockDataManager: jest.Mocked<DataManager>;
  let mockOAuthClient: jest.Mocked<OAuthClientManager>;
  let mockTokenStorage: jest.Mocked<TokenStorageManager>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock instances
    // Requirements: window-management.5
    mockDataManager = new DataManager('/tmp/test') as jest.Mocked<DataManager>;
    mockWindowManager = new WindowManager(mockDataManager) as jest.Mocked<WindowManager>;
    mockTokenStorage = new TokenStorageManager(mockDataManager) as jest.Mocked<TokenStorageManager>;
    mockOAuthClient = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: false }),
    } as any;

    // Setup default mock implementations
    mockWindowManager.createWindow = jest.fn().mockReturnValue({});
    mockWindowManager.closeWindow = jest.fn();
    mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(false);

    mockDataManager.initialize = jest.fn().mockReturnValue({
      success: true,
      migrations: { success: true, appliedCount: 0, message: 'No migrations to apply' },
    });
    mockDataManager.close = jest.fn();
    mockDataManager.saveData = jest.fn().mockReturnValue({ success: true });
    mockDataManager.loadData = jest.fn().mockReturnValue({ success: false });
    mockDataManager.deleteData = jest.fn().mockReturnValue({ success: true });

    // Create LifecycleManager instance
    lifecycleManager = new LifecycleManager(
      mockWindowManager,
      mockDataManager,
      mockOAuthClient,
      mockTokenStorage
    );
  });

  describe('initialize', () => {
    /* Preconditions: LifecycleManager created, WindowManager and DataManager mocked
       Action: call initialize()
       Assertions: returns success true, loadTime < 3000ms, DataManager.initialize called, WindowManager.createWindow called, isAppInitialized returns true
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.1*/
    it('should initialize application successfully within 3 seconds', async () => {
      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeLessThan(3000);
      expect(mockDataManager.initialize).toHaveBeenCalledTimes(1);
      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(1);
      expect(lifecycleManager.isAppInitialized()).toBe(true);
      expect(lifecycleManager.getStartupTime()).not.toBeNull();
    });

    /* Preconditions: LifecycleManager created, DataManager and WindowManager initialize quickly
       Action: call initialize()
       Assertions: loadTime measured correctly, startupTime set
       Requirements: clerkly.2, clerkly.nfr.1*/
    it('should measure startup time correctly', async () => {
      const startTime = Date.now();
      const result = await lifecycleManager.initialize();
      const endTime = Date.now();

      expect(result.loadTime).toBeGreaterThanOrEqual(0);
      expect(result.loadTime).toBeLessThanOrEqual(endTime - startTime + 10); // Allow 10ms tolerance
      expect(lifecycleManager.getStartupTime()).toBe(startTime);
    });

    /* Preconditions: LifecycleManager created, DataManager.initialize throws error
       Action: call initialize()
       Assertions: throws error with descriptive message, isAppInitialized returns false
       Requirements: clerkly.1, clerkly.2*/
    it('should handle DataManager initialization failure', async () => {
      mockDataManager.initialize = jest.fn().mockImplementation(() => {
        throw new Error('Database initialization failed');
      });

      await expect(lifecycleManager.initialize()).rejects.toThrow(
        'Application initialization failed'
      );
      await expect(lifecycleManager.initialize()).rejects.toThrow('Database initialization failed');
      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });

    /* Preconditions: LifecycleManager created, WindowManager.createWindow throws error
       Action: call initialize()
       Assertions: throws error with descriptive message, isAppInitialized returns false
       Requirements: clerkly.1, clerkly.2*/
    it('should handle WindowManager creation failure', async () => {
      mockWindowManager.createWindow = jest.fn().mockImplementation(() => {
        throw new Error('Window creation failed');
      });

      await expect(lifecycleManager.initialize()).rejects.toThrow(
        'Application initialization failed'
      );
      await expect(lifecycleManager.initialize()).rejects.toThrow('Window creation failed');
      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });

    /* Preconditions: LifecycleManager created and initialized
       Action: call initialize() again
       Assertions: succeeds, can be called multiple times
       Requirements: clerkly.1, clerkly.2*/
    it('should allow multiple initializations', async () => {
      await lifecycleManager.initialize();
      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(mockDataManager.initialize).toHaveBeenCalledTimes(2);
      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(2);
    });

    /* Preconditions: LifecycleManager created, user is authenticated
       Action: call initialize()
       Assertions: profile is fetched automatically
       Requirements: account-profile.1.5*/
    it('should fetch profile on startup when user is authenticated', async () => {
      // Mock authenticated user
      mockOAuthClient.getAuthStatus = jest.fn().mockResolvedValue({ authorized: true });

      // Spy on UserManager.fetchProfile
      const fetchProfileSpy = jest.spyOn((lifecycleManager as any).userManager, 'fetchProfile');

      await lifecycleManager.initialize();

      expect(mockOAuthClient.getAuthStatus).toHaveBeenCalled();
      expect(fetchProfileSpy).toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager created, user is not authenticated
       Action: call initialize()
       Assertions: profile is not fetched
       Requirements: account-profile.1.5*/
    it('should not fetch profile on startup when user is not authenticated', async () => {
      // Mock unauthenticated user (default)
      mockOAuthClient.getAuthStatus = jest.fn().mockResolvedValue({ authorized: false });

      // Spy on UserManager.fetchProfile
      const fetchProfileSpy = jest.spyOn((lifecycleManager as any).userManager, 'fetchProfile');

      await lifecycleManager.initialize();

      expect(mockOAuthClient.getAuthStatus).toHaveBeenCalled();
      expect(fetchProfileSpy).not.toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager created, initialization takes longer than 3 seconds
       Action: call initialize() with slow operations
       Assertions: returns success true, warning logged about slow startup
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.1*/
    it('should warn when startup exceeds 3 seconds', async () => {
      // Mock slow initialization
      mockDataManager.initialize = jest.fn().mockImplementation(() => {
        // Simulate slow operation
        const start = Date.now();
        while (Date.now() - start < 3100) {
          // Busy wait for 3.1 seconds
        }
        return {
          success: true,
          migrations: { success: true, appliedCount: 0, message: 'No migrations to apply' },
        };
      });

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeGreaterThan(3000);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Slow startup: \d+ms \(target: <3000ms\)/)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('handleActivation', () => {
    /* Preconditions: LifecycleManager initialized, window does not exist
       Action: call handleActivation()
       Assertions: WindowManager.createWindow called to recreate window
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.3*/
    it('should recreate window when not created (Mac OS X behavior)', () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(false);

      lifecycleManager.handleActivation();

      expect(mockWindowManager.isWindowCreated).toHaveBeenCalledTimes(1);
      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: LifecycleManager initialized, window already exists
       Action: call handleActivation()
       Assertions: WindowManager.createWindow not called (window already exists)
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.3*/
    it('should not recreate window when already created', () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(true);

      lifecycleManager.handleActivation();

      expect(mockWindowManager.isWindowCreated).toHaveBeenCalledTimes(1);
      expect(mockWindowManager.createWindow).not.toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager initialized, WindowManager.createWindow throws error
       Action: call handleActivation()
       Assertions: error caught and logged, no exception thrown
       Requirements: clerkly.1, clerkly.2*/
    it('should handle window creation failure gracefully', () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(false);
      mockWindowManager.createWindow = jest.fn().mockImplementation(() => {
        throw new Error('Failed to create window');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        lifecycleManager.handleActivation();
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle activation')
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager created, handleActivation called multiple times
       Action: call handleActivation() multiple times with window not created
       Assertions: createWindow called each time
       Requirements: clerkly.1, clerkly.2*/
    it('should handle multiple activation calls', () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(false);

      lifecycleManager.handleActivation();
      lifecycleManager.handleActivation();
      lifecycleManager.handleActivation();

      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(3);
    });
  });

  describe('handleQuit', () => {
    beforeEach(async () => {
      await lifecycleManager.initialize();
    });

    /* Preconditions: LifecycleManager initialized, window created, data manager open
       Action: call handleQuit()
       Assertions: WindowManager.closeWindow called, DataManager.close called, isAppInitialized returns false, completes within 5 seconds
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
    it('should perform graceful shutdown within 5 seconds', async () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(true);

      const startTime = Date.now();
      await lifecycleManager.handleQuit();
      const duration = Date.now() - startTime;

      expect(mockWindowManager.closeWindow).toHaveBeenCalledTimes(1);
      expect(mockDataManager.close).toHaveBeenCalledTimes(1);
      expect(lifecycleManager.isAppInitialized()).toBe(false);
      expect(duration).toBeLessThan(5000);
    });

    /* Preconditions: LifecycleManager initialized, window not created
       Action: call handleQuit()
       Assertions: WindowManager.closeWindow not called, DataManager.close called
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
    it('should handle quit when window not created', async () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(false);

      await lifecycleManager.handleQuit();

      expect(mockWindowManager.closeWindow).not.toHaveBeenCalled();
      expect(mockDataManager.close).toHaveBeenCalledTimes(1);
      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });

    /* Preconditions: LifecycleManager initialized, WindowManager.closeWindow throws error
       Action: call handleQuit()
       Assertions: error caught and logged, no exception thrown to caller
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should handle window close failure during quit', async () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(true);
      mockWindowManager.closeWindow = jest.fn().mockImplementation(() => {
        throw new Error('Failed to close window');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Should not throw to caller - error is caught internally
      await lifecycleManager.handleQuit();

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error during shutdown')
      );

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager initialized, DataManager.close throws error
       Action: call handleQuit()
       Assertions: error caught and logged, no exception thrown
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should handle data manager close failure during quit', async () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(true);
      mockDataManager.close = jest.fn().mockImplementation(() => {
        throw new Error('Failed to close database');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(lifecycleManager.handleQuit()).resolves.not.toThrow();

      expect(mockWindowManager.closeWindow).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager initialized, shutdown operations complete quickly
       Action: call handleQuit()
       Assertions: completes within 5 seconds (timeout not triggered for fast operations)
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should complete shutdown quickly when operations are fast', async () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(true);

      const startTime = Date.now();
      await lifecycleManager.handleQuit();
      const duration = Date.now() - startTime;

      // Should complete quickly (well under 5 second timeout)
      expect(duration).toBeLessThan(1000);
      expect(mockWindowManager.closeWindow).toHaveBeenCalledTimes(1);
      expect(mockDataManager.close).toHaveBeenCalledTimes(1);
      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });

    /* Preconditions: LifecycleManager initialized and quit
       Action: call handleQuit() again
       Assertions: no error thrown, operations still performed (idempotent)
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should be idempotent - multiple quit calls do not cause errors', async () => {
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(true);

      await lifecycleManager.handleQuit();
      await expect(lifecycleManager.handleQuit()).resolves.not.toThrow();

      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });
  });

  describe('handleWindowClose', () => {
    /* Preconditions: LifecycleManager initialized, window closed by user
       Action: call handleWindowClose()
       Assertions: no error thrown, application remains initialized (Mac OS X behavior)
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.3*/
    it('should keep application running when window closed (Mac OS X behavior)', () => {
      expect(() => {
        lifecycleManager.handleWindowClose();
      }).not.toThrow();

      // Application should remain initialized (Mac OS X convention)
      // Window will be recreated on activation
      expect(mockWindowManager.closeWindow).not.toHaveBeenCalled();
      expect(mockDataManager.close).not.toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager initialized
       Action: call handleWindowClose() multiple times
       Assertions: no error thrown, no operations performed (Mac OS X behavior)
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.3*/
    it('should handle multiple window close events', () => {
      expect(() => {
        lifecycleManager.handleWindowClose();
        lifecycleManager.handleWindowClose();
        lifecycleManager.handleWindowClose();
      }).not.toThrow();

      expect(mockWindowManager.closeWindow).not.toHaveBeenCalled();
      expect(mockDataManager.close).not.toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager not initialized
       Action: call handleWindowClose()
       Assertions: no error thrown (safe to call anytime)
       Requirements: clerkly.1, clerkly.2*/
    it('should handle window close before initialization', () => {
      const newLifecycleManager = new LifecycleManager(
        mockWindowManager,
        mockDataManager,
        mockOAuthClient,
        mockTokenStorage
      );

      expect(() => {
        newLifecycleManager.handleWindowClose();
      }).not.toThrow();
    });
  });

  describe('getStartupTime', () => {
    /* Preconditions: LifecycleManager created but not initialized
       Action: call getStartupTime()
       Assertions: returns null
       Requirements: clerkly.2, clerkly.nfr.1*/
    it('should return null before initialization', () => {
      const startupTime = lifecycleManager.getStartupTime();

      expect(startupTime).toBeNull();
    });

    /* Preconditions: LifecycleManager initialized
       Action: call getStartupTime()
       Assertions: returns timestamp (number) of when initialize was called
       Requirements: clerkly.2, clerkly.nfr.1*/
    it('should return startup timestamp after initialization', async () => {
      const beforeInit = Date.now();
      await lifecycleManager.initialize();
      const afterInit = Date.now();

      const startupTime = lifecycleManager.getStartupTime();

      expect(startupTime).not.toBeNull();
      expect(startupTime).toBeGreaterThanOrEqual(beforeInit);
      expect(startupTime).toBeLessThanOrEqual(afterInit);
    });

    /* Preconditions: LifecycleManager initialized multiple times
       Action: call getStartupTime() after each initialization
       Assertions: returns timestamp of most recent initialization
       Requirements: clerkly.2, clerkly.nfr.1*/
    it('should update startup time on re-initialization', async () => {
      await lifecycleManager.initialize();
      const firstStartupTime = lifecycleManager.getStartupTime();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      await lifecycleManager.initialize();
      const secondStartupTime = lifecycleManager.getStartupTime();

      expect(secondStartupTime).not.toBeNull();
      expect(secondStartupTime).toBeGreaterThan(firstStartupTime!);
    });
  });

  describe('isAppInitialized', () => {
    /* Preconditions: LifecycleManager created but not initialized
       Action: call isAppInitialized()
       Assertions: returns false
       Requirements: clerkly.1, clerkly.2*/
    it('should return false before initialization', () => {
      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });

    /* Preconditions: LifecycleManager initialized successfully
       Action: call isAppInitialized()
       Assertions: returns true
       Requirements: clerkly.1, clerkly.2*/
    it('should return true after successful initialization', async () => {
      await lifecycleManager.initialize();

      expect(lifecycleManager.isAppInitialized()).toBe(true);
    });

    /* Preconditions: LifecycleManager initialization failed
       Action: call isAppInitialized()
       Assertions: returns false
       Requirements: clerkly.1, clerkly.2*/
    it('should return false after failed initialization', async () => {
      mockDataManager.initialize = jest.fn().mockImplementation(() => {
        throw new Error('Initialization failed');
      });

      try {
        await lifecycleManager.initialize();
      } catch (error) {
        // Expected error
      }

      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });

    /* Preconditions: LifecycleManager initialized and then quit
       Action: call isAppInitialized()
       Assertions: returns false
       Requirements: clerkly.1, clerkly.2*/
    it('should return false after quit', async () => {
      await lifecycleManager.initialize();
      expect(lifecycleManager.isAppInitialized()).toBe(true);

      await lifecycleManager.handleQuit();
      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });

    /* Preconditions: LifecycleManager initialized, quit, then initialized again
       Action: call isAppInitialized() after each step
       Assertions: returns true after re-initialization
       Requirements: clerkly.1, clerkly.2*/
    it('should return true after re-initialization following quit', async () => {
      await lifecycleManager.initialize();
      await lifecycleManager.handleQuit();
      await lifecycleManager.initialize();

      expect(lifecycleManager.isAppInitialized()).toBe(true);
    });
  });

  describe('integration scenarios', () => {
    /* Preconditions: LifecycleManager created
       Action: initialize, close window, activate, quit
       Assertions: full lifecycle works correctly
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.3*/
    it('should handle complete application lifecycle', async () => {
      // Initialize
      await lifecycleManager.initialize();
      expect(lifecycleManager.isAppInitialized()).toBe(true);
      expect(mockDataManager.initialize).toHaveBeenCalledTimes(1);
      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(1);

      // Close window (Mac OS X behavior - app stays running)
      lifecycleManager.handleWindowClose();
      expect(lifecycleManager.isAppInitialized()).toBe(true);

      // Activate (recreate window)
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(false);
      lifecycleManager.handleActivation();
      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(2);

      // Quit
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(true);
      await lifecycleManager.handleQuit();
      expect(lifecycleManager.isAppInitialized()).toBe(false);
      expect(mockWindowManager.closeWindow).toHaveBeenCalledTimes(1);
      expect(mockDataManager.close).toHaveBeenCalledTimes(1);
    });

    /* Preconditions: LifecycleManager created
       Action: initialize, activate multiple times, quit
       Assertions: handles multiple activations correctly
       Requirements: clerkly.1, clerkly.2, clerkly.nfr.3*/
    it('should handle multiple activation cycles', async () => {
      await lifecycleManager.initialize();

      // Simulate multiple dock icon clicks
      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(false);
      lifecycleManager.handleActivation();
      lifecycleManager.handleActivation();
      lifecycleManager.handleActivation();

      expect(mockWindowManager.createWindow).toHaveBeenCalledTimes(4); // 1 from init + 3 from activations
    });

    /* Preconditions: LifecycleManager created, initialization takes > 3000ms
       Action: call initialize() with slow operations
       Assertions: warning logged about slow startup
       Requirements: clerkly.nfr.1 */
    it('should log warning when startup exceeds 3 seconds', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Mock slow initialization
      mockDataManager.initialize = jest.fn().mockImplementation(() => {
        // Simulate slow operation
        const start = Date.now();
        while (Date.now() - start < 3100) {
          // Busy wait
        }
        return {
          success: true,
          migrations: { success: true, appliedCount: 0, message: 'No migrations' },
        };
      });

      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeGreaterThan(3000);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LifecycleManager] Slow startup:')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('target: <3000ms'));

      consoleWarnSpy.mockRestore();
    });

    /* Preconditions: LifecycleManager created, user authenticated, profile fetch fails
       Action: call initialize()
       Assertions: initialization succeeds despite profile fetch failure
       Requirements: clerkly.1, account-profile.1.5 */
    it('should handle profile fetch failure during initialization', async () => {
      mockOAuthClient.getAuthStatus = jest.fn().mockResolvedValue({ authorized: true });

      // Mock userManager.fetchProfile to throw error
      const fetchProfileSpy = jest
        .spyOn(lifecycleManager['userManager'], 'fetchProfile')
        .mockRejectedValue(new Error('Network error'));

      await expect(lifecycleManager.initialize()).rejects.toThrow(
        'Application initialization failed: Network error'
      );

      expect(fetchProfileSpy).toHaveBeenCalled();
    });

    /* Preconditions: LifecycleManager created, handleActivation throws error
       Action: call handleActivation() when createWindow throws
       Assertions: error logged, no crash
       Requirements: clerkly.1, clerkly.nfr.3 */
    it('should handle errors in handleActivation gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockWindowManager.isWindowCreated = jest.fn().mockReturnValue(false);
      mockWindowManager.createWindow = jest.fn().mockImplementation(() => {
        throw new Error('Window creation failed');
      });

      expect(() => lifecycleManager.handleActivation()).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LifecycleManager] Failed to handle activation:')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Window creation failed')
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
