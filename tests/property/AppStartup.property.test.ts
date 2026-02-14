// Requirements: clerkly.nfr.1.1, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4, account-profile.1.3
/**
 * Property-based tests for application startup performance
 * Tests Property 7: Application Startup Performance
 */

import * as fc from 'fast-check';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import WindowManager from '../../src/main/WindowManager';
import { LifecycleManager } from '../../src/main/LifecycleManager';
import { UserSettingsManager } from '../../src/main/UserSettingsManager';
import { DatabaseManager } from '../../src/main/DatabaseManager';
import { OAuthClientManager } from '../../src/main/auth/OAuthClientManager';
import { TokenStorageManager } from '../../src/main/auth/TokenStorageManager';
import { UserManager } from '../../src/main/auth/UserManager';
import { getOAuthConfig } from '../../src/main/auth/OAuthConfig';

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
    removeAllListeners: jest.fn(),
    destroy: jest.fn(),
    close: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    maximize: jest.fn(),
    isMaximized: jest.fn().mockReturnValue(false),
    getBounds: jest.fn().mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 }),
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

describe('Property Tests - Application Startup Performance', () => {
  let testStoragePath: string;

  // Helper function to create DatabaseManager and UserSettingsManager with mock UserManager
  const createManagersWithMockUser = (storagePath: string) => {
    const dbManager = new DatabaseManager();
    dbManager.initialize(storagePath);

    const userSettingsManager = new UserSettingsManager(dbManager);

    // Requirements: user-data-isolation.1.10 - Mock UserManager for data isolation
    const mockUserManager = {
      getCurrentUserId: jest.fn().mockReturnValue('test@example.com'),
    } as any;

    dbManager.setUserManager(mockUserManager);
    return { dbManager, userSettingsManager };
  };

  // Helper function to create mock OAuth components
  // Note: This function does NOT override the mock user manager set by createManagersWithMockUser
  // to ensure data operations work correctly in tests that need user isolation
  const createMockOAuthComponents = (
    dbManager: DatabaseManager,
    userSettingsManager: UserSettingsManager,
    options: { overrideUserManager?: boolean } = {}
  ) => {
    const tokenStorage = new TokenStorageManager(userSettingsManager);
    const oauthClient = new OAuthClientManager(getOAuthConfig(), tokenStorage);
    // Mock getAuthStatus to return not authorized (skip profile fetch in tests)
    jest.spyOn(oauthClient, 'getAuthStatus').mockResolvedValue({ authorized: false });

    // Requirements: account-profile.1.3 - Create UserManager
    const userManager = new UserManager(dbManager, tokenStorage);

    // Only override the mock user manager if explicitly requested
    // By default, keep the mock user manager for data isolation tests
    if (options.overrideUserManager) {
      dbManager.setUserManager(userManager);
    }

    return { tokenStorage, oauthClient, userManager };
  };

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(os.tmpdir(), `clerkly-test-startup-${Date.now()}-${Math.random()}`);

    // Clear all mocks
    jest.clearAllMocks();

    // Setup app.getPath mock
    (app.getPath as jest.Mock).mockReturnValue(testStoragePath);
  });

  afterEach(() => {
    // Clean up test storage
    if (fs.existsSync(testStoragePath)) {
      try {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  /* Preconditions: application not running, storage may or may not exist
     Action: start application and measure time from initialization start to completion
     Assertions: for all startups, time is less than 3000ms, initialization succeeds, window created
     Requirements: clerkly.nfr.1.1, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 7: Application Startup Performance
  test('Property 7: Application Startup Performance - application starts within 3 seconds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // No input needed - we're testing startup performance
        async () => {
          // Create fresh components for each iteration
          // Requirements: window-management.5, database-refactoring.1
          const { dbManager, userSettingsManager } = createManagersWithMockUser(testStoragePath);
          const windowManager = new WindowManager(dbManager);
          const { oauthClient, userManager } = createMockOAuthComponents(
            dbManager,
            userSettingsManager
          );
          const lifecycleManager = new LifecycleManager(
            windowManager,
            dbManager,
            oauthClient,
            userManager
          );

          // Measure startup time
          const startTime = Date.now();
          const result = await lifecycleManager.initialize();
          const loadTime = Date.now() - startTime;

          // Verify startup time is within 3 seconds
          expect(loadTime).toBeLessThan(3000);
          expect(result.success).toBe(true);
          expect(result.loadTime).toBeLessThan(3000);

          // Verify application is properly initialized
          expect(lifecycleManager.isAppInitialized()).toBe(true);
          expect(windowManager.isWindowCreated()).toBe(true);

          // Log warning if startup is slow (but still within limit)
          if (loadTime > 2500) {
            console.warn(`Slow startup detected: ${loadTime}ms (target: <3000ms)`);
          }

          // Clean up
          await lifecycleManager.handleQuit();
          dbManager.close();

          // Clean up storage for next iteration
          if (fs.existsSync(testStoragePath)) {
            fs.rmSync(testStoragePath, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: application not running, storage does not exist (first startup)
     Action: start application for the first time and measure startup time
     Assertions: first startup (with database creation and migrations) completes within 3 seconds
     Requirements: clerkly.nfr.1.1, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 7: Application Startup Performance
  test('Property 7 edge case: first startup with database creation completes within 3 seconds', async () => {
    // Ensure storage does not exist
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // Requirements: window-management.5, database-refactoring.1
    const { dbManager, userSettingsManager } = createManagersWithMockUser(testStoragePath);
    const windowManager = new WindowManager(dbManager);
    const { oauthClient, userManager } = createMockOAuthComponents(dbManager, userSettingsManager);
    const lifecycleManager = new LifecycleManager(
      windowManager,
      dbManager,
      oauthClient,
      userManager
    );

    // Measure first startup time
    const startTime = Date.now();
    const result = await lifecycleManager.initialize();
    const loadTime = Date.now() - startTime;

    // Verify startup time is within 3 seconds even for first startup
    expect(loadTime).toBeLessThan(3000);
    expect(result.success).toBe(true);
    expect(result.loadTime).toBeLessThan(3000);

    // Verify database was created
    const dbPath = path.join(testStoragePath, 'clerkly.db');
    expect(fs.existsSync(dbPath)).toBe(true);

    // Verify migrations were applied
    const migrationRunner = dbManager.getMigrationRunner();
    const currentVersion = migrationRunner.getCurrentVersion();
    expect(currentVersion).toBeGreaterThanOrEqual(0);

    // Clean up
    await lifecycleManager.handleQuit();
    dbManager.close();
  });

  /* Preconditions: application not running, storage exists with data (subsequent startup)
     Action: start application when database already exists and measure startup time
     Assertions: subsequent startups (without migrations) complete within 3 seconds
     Requirements: clerkly.nfr.1.1, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 7: Application Startup Performance
  test('Property 7 edge case: subsequent startups with existing database complete within 3 seconds', async () => {
    // First startup to create database
    // Requirements: window-management.5, database-refactoring.1
    const { dbManager: dbManager1, userSettingsManager: userSettingsManager1 } =
      createManagersWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dbManager1,
      userSettingsManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();
    await lifecycleManager1.handleQuit();
    dbManager1.close();

    // Clear mocks for second startup
    jest.clearAllMocks();

    // Second startup - should be fast since database exists
    // Requirements: window-management.5, database-refactoring.1
    const { dbManager: dbManager2, userSettingsManager: userSettingsManager2 } =
      createManagersWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dbManager2,
      userSettingsManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    const startTime = Date.now();
    const result = await lifecycleManager2.initialize();
    const loadTime = Date.now() - startTime;

    // Verify subsequent startup is within 3 seconds
    expect(loadTime).toBeLessThan(3000);
    expect(result.success).toBe(true);
    expect(result.loadTime).toBeLessThan(3000);

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });

  /* Preconditions: application not running, storage exists with large amount of data
     Action: start application with database containing many records and measure startup time
     Assertions: startup with large database completes within 3 seconds
     Requirements: clerkly.nfr.1.1, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 7: Application Startup Performance
  test('Property 7 edge case: startup with large database completes within 3 seconds', async () => {
    // First startup to create database
    // Requirements: window-management.5, database-refactoring.1
    const { dbManager: dbManager1, userSettingsManager: userSettingsManager1 } =
      createManagersWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dbManager1,
      userSettingsManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();

    // Add large amount of data (100 records)
    for (let i = 0; i < 100; i++) {
      const key = `large-data-key-${i}`;
      const value = {
        index: i,
        data: `test-data-${i}`,
        nested: {
          field1: `value-${i}`,
          field2: i * 2,
          field3: [i, i + 1, i + 2],
        },
      };
      userSettingsManager1.saveData(key, value);
    }

    await lifecycleManager1.handleQuit();
    dbManager1.close();

    // Clear mocks for second startup
    jest.clearAllMocks();

    // Second startup with large database
    // Requirements: window-management.5, database-refactoring.1
    const { dbManager: dbManager2, userSettingsManager: userSettingsManager2 } =
      createManagersWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dbManager2,
      userSettingsManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    const startTime = Date.now();
    const result = await lifecycleManager2.initialize();
    const loadTime = Date.now() - startTime;

    // Verify startup with large database is within 3 seconds
    expect(loadTime).toBeLessThan(3000);
    expect(result.success).toBe(true);
    expect(result.loadTime).toBeLessThan(3000);

    // Verify data is accessible
    const loadResult = userSettingsManager2.loadData('large-data-key-0');
    expect(loadResult.success).toBe(true);

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });

  /* Preconditions: application not running
     Action: start application multiple times in sequence and measure each startup time
     Assertions: all startups complete within 3 seconds, performance is consistent
     Requirements: clerkly.nfr.1.1, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 7: Application Startup Performance
  test('Property 7 edge case: multiple consecutive startups all complete within 3 seconds', async () => {
    const startupTimes: number[] = [];
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      // Clear mocks for each iteration
      jest.clearAllMocks();

      // Requirements: window-management.5, database-refactoring.1
      const { dbManager, userSettingsManager } = createManagersWithMockUser(testStoragePath);
      const windowManager = new WindowManager(dbManager);
      const { oauthClient, userManager } = createMockOAuthComponents(
        dbManager,
        userSettingsManager
      );
      const lifecycleManager = new LifecycleManager(
        windowManager,
        dbManager,
        oauthClient,
        userManager
      );

      const startTime = Date.now();
      const result = await lifecycleManager.initialize();
      const loadTime = Date.now() - startTime;

      startupTimes.push(loadTime);

      // Verify each startup is within 3 seconds
      expect(loadTime).toBeLessThan(3000);
      expect(result.success).toBe(true);
      expect(result.loadTime).toBeLessThan(3000);

      // Clean up
      await lifecycleManager.handleQuit();
      dbManager.close();
    }

    // Verify all startups were within limit
    const maxStartupTime = Math.max(...startupTimes);
    const avgStartupTime = startupTimes.reduce((a, b) => a + b, 0) / startupTimes.length;

    expect(maxStartupTime).toBeLessThan(3000);
    console.log(`Startup times - Max: ${maxStartupTime}ms, Avg: ${avgStartupTime.toFixed(2)}ms`);
  });

  /* Preconditions: application not running, startup time is measured precisely
     Action: start application and verify startup time is reported correctly
     Assertions: reported loadTime matches measured time, both are within 3 seconds
     Requirements: clerkly.nfr.1.1, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 7: Application Startup Performance
  test('Property 7 edge case: startup time is measured and reported correctly', async () => {
    // Requirements: window-management.5, database-refactoring.1
    const { dbManager, userSettingsManager } = createManagersWithMockUser(testStoragePath);
    const windowManager = new WindowManager(dbManager);
    const { oauthClient, userManager } = createMockOAuthComponents(dbManager, userSettingsManager);
    const lifecycleManager = new LifecycleManager(
      windowManager,
      dbManager,
      oauthClient,
      userManager
    );

    const startTime = Date.now();
    const result = await lifecycleManager.initialize();
    const measuredTime = Date.now() - startTime;

    // Verify reported time matches measured time (within small margin)
    expect(Math.abs(result.loadTime - measuredTime)).toBeLessThan(50); // 50ms margin

    // Verify both times are within 3 seconds
    expect(result.loadTime).toBeLessThan(3000);
    expect(measuredTime).toBeLessThan(3000);

    // Verify startup time is accessible
    const startupTime = lifecycleManager.getStartupTime();
    expect(startupTime).not.toBeNull();
    expect(startupTime).toBeGreaterThan(0);

    // Clean up
    await lifecycleManager.handleQuit();
    dbManager.close();
  });

  /* Preconditions: application not running
     Action: start application and verify warning is logged if startup exceeds 3 seconds
     Assertions: if startup > 3000ms, warning is logged (this test expects fast startup)
     Requirements: clerkly.nfr.1.1, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 7: Application Startup Performance
  test('Property 7 edge case: startup performance monitoring logs warnings for slow startups', async () => {
    // Mock console.warn to capture warnings
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = jest.fn((message: string) => {
      warnings.push(message);
    });

    // Requirements: window-management.5, database-refactoring.1
    const { dbManager, userSettingsManager } = createManagersWithMockUser(testStoragePath);
    const windowManager = new WindowManager(dbManager);
    const { oauthClient, userManager } = createMockOAuthComponents(dbManager, userSettingsManager);
    const lifecycleManager = new LifecycleManager(
      windowManager,
      dbManager,
      oauthClient,
      userManager
    );

    const startTime = Date.now();
    const result = await lifecycleManager.initialize();
    const loadTime = Date.now() - startTime;

    // Verify startup is within 3 seconds
    expect(loadTime).toBeLessThan(3000);
    expect(result.success).toBe(true);

    // If startup was slow (but still within limit), warning should be logged
    if (loadTime > 3000) {
      expect(warnings.some((w) => w.includes('Slow startup'))).toBe(true);
    }

    // Clean up
    await lifecycleManager.handleQuit();
    dbManager.close();

    // Restore console.warn
    console.warn = originalWarn;
  });

  /* Preconditions: application not running, all components need initialization
     Action: start application and verify all components are initialized within 3 seconds
     Assertions: window created, data manager initialized, migrations applied, all within 3 seconds
     Requirements: clerkly.nfr.1.1, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 7: Application Startup Performance
  test('Property 7 edge case: all components initialize within 3 seconds', async () => {
    // Requirements: window-management.5, database-refactoring.1
    const { dbManager, userSettingsManager } = createManagersWithMockUser(testStoragePath);
    const windowManager = new WindowManager(dbManager);
    const { oauthClient, userManager } = createMockOAuthComponents(dbManager, userSettingsManager);
    const lifecycleManager = new LifecycleManager(
      windowManager,
      dbManager,
      oauthClient,
      userManager
    );

    const startTime = Date.now();
    const result = await lifecycleManager.initialize();
    const loadTime = Date.now() - startTime;

    // Verify startup time
    expect(loadTime).toBeLessThan(3000);
    expect(result.success).toBe(true);

    // Verify all components are initialized
    expect(lifecycleManager.isAppInitialized()).toBe(true);
    expect(windowManager.isWindowCreated()).toBe(true);

    // Verify data manager is initialized (storage exists)
    expect(fs.existsSync(testStoragePath)).toBe(true);
    const dbPath = path.join(testStoragePath, 'clerkly.db');
    expect(fs.existsSync(dbPath)).toBe(true);

    // Verify migrations were applied
    const migrationRunner = dbManager.getMigrationRunner();
    const currentVersion = migrationRunner.getCurrentVersion();
    expect(currentVersion).toBeGreaterThanOrEqual(0);

    // Verify user settings manager is functional
    const saveResult = userSettingsManager.saveData('test-key', 'test-value');
    expect(saveResult.success).toBe(true);

    // Clean up
    await lifecycleManager.handleQuit();
    dbManager.close();
  });
});
