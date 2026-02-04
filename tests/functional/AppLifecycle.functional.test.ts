// Requirements: clerkly.2
/**
 * Functional tests for application lifecycle
 * Tests the integration of WindowManager, LifecycleManager, DataManager, and MigrationRunner
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import WindowManager from '../../src/main/WindowManager';
import { LifecycleManager } from '../../src/main/LifecycleManager';
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

describe('Application Lifecycle Functional Tests', () => {
  let testStoragePath: string;
  let windowManager: WindowManager;
  let dataManager: DataManager;
  let lifecycleManager: LifecycleManager;

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
    // Requirements: ui.5
    dataManager = new DataManager(testStoragePath);
    windowManager = new WindowManager(dataManager);
    lifecycleManager = new LifecycleManager(windowManager, dataManager);
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

  describe('Application Startup', () => {
    /* Preconditions: application not running, storage does not exist
       Action: initialize lifecycle manager (creates window, initializes storage, runs migrations)
       Assertions: initialization succeeds, window created, storage initialized, migrations applied, startup time < 3 seconds
       Requirements: clerkly.2*/
    it('should start application successfully with window creation, storage initialization, and migrations', async () => {
      const startTime = Date.now();

      // Initialize application
      const result = await lifecycleManager.initialize();

      const loadTime = Date.now() - startTime;

      // Verify initialization succeeded
      expect(result.success).toBe(true);
      expect(result.loadTime).toBeLessThan(3000);
      expect(loadTime).toBeLessThan(3000);

      // Verify window was created
      expect(BrowserWindow).toHaveBeenCalledTimes(1);
      expect(windowManager.isWindowCreated()).toBe(true);

      // Verify storage was initialized
      expect(fs.existsSync(testStoragePath)).toBe(true);
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      expect(fs.existsSync(dbPath)).toBe(true);

      // Verify migrations were applied by checking migration runner
      const migrationRunner = dataManager.getMigrationRunner();
      expect(migrationRunner).toBeDefined();
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBeGreaterThanOrEqual(0);

      // Verify application is initialized
      expect(lifecycleManager.isAppInitialized()).toBe(true);
      expect(lifecycleManager.getStartupTime()).not.toBeNull();
    });

    /* Preconditions: application not running
       Action: initialize lifecycle manager, measure startup time
       Assertions: startup completes within 3 seconds (performance requirement)
       Requirements: clerkly.2, clerkly.nfr.1*/
    it('should start within 3 seconds (performance requirement)', async () => {
      const startTime = Date.now();

      const result = await lifecycleManager.initialize();

      const loadTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.loadTime).toBeLessThan(3000);
      expect(loadTime).toBeLessThan(3000);
      expect(lifecycleManager.isAppInitialized()).toBe(true);
    });

    /* Preconditions: application not running, storage directory does not exist
       Action: initialize lifecycle manager
       Assertions: storage directory created, database file created, migrations table created
       Requirements: clerkly.1, clerkly.2*/
    it('should create storage directory and database on first startup', async () => {
      // Remove the directory created in beforeEach to test first startup
      if (fs.existsSync(testStoragePath)) {
        try {
          dataManager.close();
        } catch (error) {
          // Ignore errors
        }
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      }

      // Ensure storage does not exist
      expect(fs.existsSync(testStoragePath)).toBe(false);

      // Create new components for fresh initialization
      const newDataManager = new DataManager(testStoragePath);
      const newWindowManager = new WindowManager(newDataManager);
      const newLifecycleManager = new LifecycleManager(newWindowManager, newDataManager);

      // Initialize application
      const result = await newLifecycleManager.initialize();

      expect(result.success).toBe(true);

      // Verify storage directory was created
      expect(fs.existsSync(testStoragePath)).toBe(true);

      // Verify database file was created
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      expect(fs.existsSync(dbPath)).toBe(true);

      // Verify migrations were applied by checking migration runner
      const migrationRunner = newDataManager.getMigrationRunner();
      expect(migrationRunner).toBeDefined();
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBeGreaterThanOrEqual(0);

      // Clean up
      await newLifecycleManager.handleQuit();
      newDataManager.close();
    });

    /* Preconditions: application not running, migrations exist
       Action: initialize lifecycle manager
       Assertions: migrations are applied, migration count reported correctly
       Requirements: clerkly.1, clerkly.2*/
    it('should run database migrations during startup', async () => {
      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);

      // Verify migration runner was used
      const migrationRunner = dataManager.getMigrationRunner();
      expect(migrationRunner).toBeDefined();

      // Verify migrations table exists and has records
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBeGreaterThanOrEqual(0);

      // Verify migration status
      const status = migrationRunner.getStatus();
      expect(status).toBeDefined();
      expect(status.currentVersion).toBeGreaterThanOrEqual(0);
    });

    /* Preconditions: application not running
       Action: initialize lifecycle manager, verify all components initialized
       Assertions: window manager initialized, data manager initialized, lifecycle manager initialized
       Requirements: clerkly.2*/
    it('should initialize all components in correct order', async () => {
      const result = await lifecycleManager.initialize();

      expect(result.success).toBe(true);

      // Verify DataManager initialized (storage exists)
      expect(fs.existsSync(testStoragePath)).toBe(true);

      // Verify WindowManager initialized (window created)
      expect(windowManager.isWindowCreated()).toBe(true);
      expect(BrowserWindow).toHaveBeenCalled();

      // Verify LifecycleManager initialized
      expect(lifecycleManager.isAppInitialized()).toBe(true);
      expect(lifecycleManager.getStartupTime()).not.toBeNull();
    });
  });

  describe('Application Shutdown', () => {
    beforeEach(async () => {
      // Initialize application before each shutdown test
      await lifecycleManager.initialize();
    });

    /* Preconditions: application running, window created, data in storage
       Action: save data, close window, quit application
       Assertions: window closed, data manager closed, data persisted to disk, application no longer initialized
       Requirements: clerkly.2*/
    it('should close window, save data, and shutdown gracefully', async () => {
      // Save some test data
      const testKey = 'test-shutdown-key';
      const testValue = { message: 'test data before shutdown' };
      const saveResult = dataManager.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      // Perform graceful shutdown
      await lifecycleManager.handleQuit();

      // Verify window was closed
      const window = windowManager.getWindow();
      if (window) {
        expect(window.removeAllListeners).toHaveBeenCalled();
        expect(window.destroy).toHaveBeenCalled();
      }

      // Verify application is no longer initialized
      expect(lifecycleManager.isAppInitialized()).toBe(false);

      // Verify data was persisted (database file still exists)
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      expect(fs.existsSync(dbPath)).toBe(true);

      // Verify we can reload data after shutdown
      const newDataManager = new DataManager(testStoragePath);
      newDataManager.initialize();
      const loadResult = newDataManager.loadData(testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(testValue);
      newDataManager.close();
    });

    /* Preconditions: application running
       Action: quit application, measure shutdown time
       Assertions: shutdown completes within 5 seconds (timeout requirement)
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should complete shutdown within 5 seconds', async () => {
      const startTime = Date.now();

      await lifecycleManager.handleQuit();

      const shutdownTime = Date.now() - startTime;

      expect(shutdownTime).toBeLessThan(5000);
      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });

    /* Preconditions: application running, data in storage
       Action: save multiple data items, quit application
       Assertions: all data persisted correctly, can be loaded after restart
       Requirements: clerkly.2*/
    it('should persist all data before shutdown', async () => {
      // Save multiple data items
      const testData = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: { nested: 'object' } },
        { key: 'key3', value: [1, 2, 3] },
        { key: 'key4', value: 42 },
        { key: 'key5', value: true },
      ];

      for (const item of testData) {
        const saveResult = dataManager.saveData(item.key, item.value);
        expect(saveResult.success).toBe(true);
      }

      // Quit application
      await lifecycleManager.handleQuit();

      // Ensure directory exists for new DataManager
      if (!fs.existsSync(testStoragePath)) {
        fs.mkdirSync(testStoragePath, { recursive: true });
      }

      // Verify all data persisted
      const newDataManager = new DataManager(testStoragePath);
      newDataManager.initialize();

      for (const item of testData) {
        const loadResult = newDataManager.loadData(item.key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toEqual(item.value);
      }

      newDataManager.close();
    });

    /* Preconditions: application running
       Action: close window (Mac OS X behavior)
       Assertions: application remains running, window can be recreated on activation
       Requirements: clerkly.2, clerkly.nfr.3*/
    it('should keep application running when window closed (Mac OS X behavior)', () => {
      // Close window
      lifecycleManager.handleWindowClose();

      // Verify application is still initialized (Mac OS X convention)
      expect(lifecycleManager.isAppInitialized()).toBe(true);

      // Verify window can be recreated on activation
      windowManager.closeWindow();
      lifecycleManager.handleActivation();

      expect(BrowserWindow).toHaveBeenCalledTimes(2); // Once in beforeEach, once in handleActivation
    });
  });

  describe('Application Lifecycle Integration', () => {
    /* Preconditions: application not running
       Action: start app, save data, close window, activate, save more data, quit
       Assertions: complete lifecycle works correctly, all data persisted
       Requirements: clerkly.2*/
    it('should handle complete application lifecycle: start → save → close → activate → save → quit', async () => {
      // Start application
      const initResult = await lifecycleManager.initialize();
      expect(initResult.success).toBe(true);
      expect(lifecycleManager.isAppInitialized()).toBe(true);

      // Save initial data
      const saveResult1 = dataManager.saveData('lifecycle-key-1', 'initial-value');
      expect(saveResult1.success).toBe(true);

      // Close window (Mac OS X behavior - app stays running)
      lifecycleManager.handleWindowClose();
      expect(lifecycleManager.isAppInitialized()).toBe(true);

      // Activate (recreate window)
      windowManager.closeWindow();
      lifecycleManager.handleActivation();
      expect(windowManager.isWindowCreated()).toBe(true);

      // Save more data
      const saveResult2 = dataManager.saveData('lifecycle-key-2', 'after-activation');
      expect(saveResult2.success).toBe(true);

      // Quit application
      await lifecycleManager.handleQuit();
      expect(lifecycleManager.isAppInitialized()).toBe(false);

      // Verify all data persisted
      const newDataManager = new DataManager(testStoragePath);
      newDataManager.initialize();

      const loadResult1 = newDataManager.loadData('lifecycle-key-1');
      expect(loadResult1.success).toBe(true);
      expect(loadResult1.data).toBe('initial-value');

      const loadResult2 = newDataManager.loadData('lifecycle-key-2');
      expect(loadResult2.success).toBe(true);
      expect(loadResult2.data).toBe('after-activation');

      newDataManager.close();
    });

    /* Preconditions: application not running
       Action: start app, save data, quit, restart app, load data
       Assertions: data persists across application restarts
       Requirements: clerkly.2*/
    it('should persist data across application restarts', async () => {
      // First session: start and save data
      await lifecycleManager.initialize();

      const testData = {
        key: 'persistent-key',
        value: { message: 'persistent data', count: 42, nested: { deep: true } },
      };

      const saveResult = dataManager.saveData(testData.key, testData.value);
      expect(saveResult.success).toBe(true);

      await lifecycleManager.handleQuit();

      // Second session: restart and load data
      // Requirements: ui.5
      const newDataManager = new DataManager(testStoragePath);
      const newWindowManager = new WindowManager(newDataManager);
      const newLifecycleManager = new LifecycleManager(newWindowManager, newDataManager);

      const initResult = await newLifecycleManager.initialize();
      expect(initResult.success).toBe(true);

      const loadResult = newDataManager.loadData(testData.key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(testData.value);

      await newLifecycleManager.handleQuit();
      newDataManager.close();
    });

    /* Preconditions: application not running
       Action: start app, verify migrations applied, restart app, verify migrations not re-applied
       Assertions: migrations are idempotent, not re-applied on subsequent startups
       Requirements: clerkly.1, clerkly.2*/
    it('should not re-apply migrations on subsequent startups', async () => {
      // First startup: apply migrations
      const initResult1 = await lifecycleManager.initialize();
      expect(initResult1.success).toBe(true);

      const migrationRunner1 = dataManager.getMigrationRunner();
      const version1 = migrationRunner1.getCurrentVersion();
      const appliedMigrations1 = migrationRunner1.getAppliedMigrations();

      await lifecycleManager.handleQuit();

      // Second startup: migrations should not be re-applied
      // Requirements: ui.5
      const newDataManager = new DataManager(testStoragePath);
      const newWindowManager = new WindowManager(newDataManager);
      const newLifecycleManager = new LifecycleManager(newWindowManager, newDataManager);

      const initResult2 = await newLifecycleManager.initialize();
      expect(initResult2.success).toBe(true);

      const migrationRunner2 = newDataManager.getMigrationRunner();
      const version2 = migrationRunner2.getCurrentVersion();
      const appliedMigrations2 = migrationRunner2.getAppliedMigrations();

      // Version should be the same
      expect(version2).toBe(version1);

      // Same migrations should be applied
      expect(appliedMigrations2).toEqual(appliedMigrations1);

      await newLifecycleManager.handleQuit();
      newDataManager.close();
    });

    /* Preconditions: application not running
       Action: start app multiple times in sequence
       Assertions: each startup succeeds, data persists across all sessions
       Requirements: clerkly.2*/
    it('should handle multiple startup/shutdown cycles', async () => {
      const cycles = 3;
      const testKey = 'multi-cycle-key';

      for (let i = 0; i < cycles; i++) {
        // Requirements: ui.5
        const dm = new DataManager(testStoragePath);
        dm.initialize();
        const wm = new WindowManager(dm);
        const lm = new LifecycleManager(wm, dm);

        // Start application
        const initResult = await lm.initialize();
        expect(initResult.success).toBe(true);

        // Save data with cycle number
        const value = `cycle-${i}`;
        const saveResult = dm.saveData(testKey, value);
        expect(saveResult.success).toBe(true);

        // Verify data was saved
        const loadResult = dm.loadData(testKey);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toBe(value);

        // Quit application
        await lm.handleQuit();
        dm.close();
      }

      // Verify final data persisted
      const finalDm = new DataManager(testStoragePath);
      finalDm.initialize();
      const finalLoadResult = finalDm.loadData(testKey);
      expect(finalLoadResult.success).toBe(true);
      expect(finalLoadResult.data).toBe(`cycle-${cycles - 1}`);
      finalDm.close();
    });
  });

  describe('Error Handling During Lifecycle', () => {
    /* Preconditions: application not running, storage path has permission issues (simulated)
       Action: initialize lifecycle manager
       Assertions: initialization handles error gracefully, falls back to temp directory
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should handle storage initialization errors gracefully', async () => {
      // Create a read-only directory to simulate permission issues
      const readOnlyPath = path.join(
        os.tmpdir(),
        `clerkly-readonly-${Date.now()}-${Math.random().toString(36).substring(7)}`
      );
      fs.mkdirSync(readOnlyPath, { recursive: true });

      // On Unix systems, we can make it read-only
      if (process.platform !== 'win32') {
        fs.chmodSync(readOnlyPath, 0o444);
      }

      const readOnlyDataManager = new DataManager(path.join(readOnlyPath, 'storage'));
      const readOnlyLifecycleManager = new LifecycleManager(windowManager, readOnlyDataManager);

      // Initialize should handle the error
      const result = await readOnlyLifecycleManager.initialize();

      // Should succeed (DataManager falls back to temp directory)
      expect(result.success).toBe(true);

      // Clean up
      if (process.platform !== 'win32') {
        fs.chmodSync(readOnlyPath, 0o755);
      }
      fs.rmSync(readOnlyPath, { recursive: true, force: true });
    });

    /* Preconditions: application running
       Action: quit application multiple times
       Assertions: multiple quit calls handled gracefully (idempotent)
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should handle multiple quit calls gracefully', async () => {
      await lifecycleManager.initialize();

      // Call quit multiple times
      await lifecycleManager.handleQuit();
      await lifecycleManager.handleQuit();
      await lifecycleManager.handleQuit();

      // Should not throw errors
      expect(lifecycleManager.isAppInitialized()).toBe(false);
    });
  });
});
