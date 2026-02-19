// Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4, account-profile.1.3
/**
 * Property-based tests for graceful shutdown data persistence
 * Tests Property 9: Graceful Shutdown Data Persistence
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

describe('Property Tests - Graceful Shutdown Data Persistence', () => {
  let testStoragePath: string;

  // Helper function to create DatabaseManager and UserSettingsManager with mock UserManager
  // Requirements: database-refactoring.1, database-refactoring.2
  const createUserSettingsManagerWithMockUser = (storagePath: string) => {
    const dbManager = new DatabaseManager();
    dbManager.initialize(storagePath);

    // Requirements: user-data-isolation.1.10 - Mock UserManager for data isolation
    const mockProfileManager = {
      getCurrentUserId: jest.fn().mockReturnValue('test@example.com'),
    } as any;

    dbManager.setUserManager(mockProfileManager);

    const dataManager = new UserSettingsManager(dbManager);
    return { dataManager, dbManager };
  };

  // Helper function to create mock OAuth components
  const createMockOAuthComponents = (
    dataManager: UserSettingsManager,
    _dbManager: DatabaseManager
  ) => {
    const tokenStorage = new TokenStorageManager(dataManager);
    const oauthClient = new OAuthClientManager(getOAuthConfig(), tokenStorage);
    // Mock getAuthStatus to return not authorized (skip profile fetch in tests)
    jest.spyOn(oauthClient, 'getAuthStatus').mockResolvedValue({ authorized: false });

    // Requirements: account-profile.1.3 - Create mock UserManager for LifecycleManager
    const userManager = {
      fetchProfile: jest.fn().mockResolvedValue(null),
      getCurrentUserId: jest.fn().mockReturnValue(null),
    } as unknown as UserManager;

    return { tokenStorage, oauthClient, userManager };
  };

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(
      os.tmpdir(),
      `clerkly-test-shutdown-${Date.now()}-${Math.random()}`
    );

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

  /* Preconditions: application not running, no existing data
     Action: start application, save random data, gracefully shutdown via handleQuit(), restart, load data
     Assertions: for all data, loaded values equal saved values (deep equality), shutdown completes within 5 seconds
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9: Graceful Shutdown Data Persistence - data persists after graceful shutdown', async () => {
    // Create JSON-safe arbitrary generator (excludes undefined, functions, symbols)
    const jsonSafeValue = fc.letrec((tie) => ({
      value: fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        // Filter out -0 as JSON.stringify converts -0 to 0
        fc.double().filter((n) => !Object.is(n, -0)),
        fc.constantFrom(null),
        fc.dictionary(fc.string(), tie('value') as fc.Arbitrary<any>, { maxKeys: 10 }),
        fc.array(tie('value') as fc.Arbitrary<any>, { maxLength: 20 })
      ),
    })).value;

    await fc.assert(
      fc.asyncProperty(
        // Generate array of key-value pairs to save
        fc.array(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 50 }),
            value: jsonSafeValue,
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (dataToSave: Array<{ key: string; value: any }>) => {
          // Clean up storage before test
          if (fs.existsSync(testStoragePath)) {
            fs.rmSync(testStoragePath, { recursive: true, force: true });
          }

          // First startup - save data
          const { dataManager: dataManager1, dbManager: dbManager1 } =
            createUserSettingsManagerWithMockUser(testStoragePath);
          const windowManager1 = new WindowManager(dbManager1);
          const { oauthClient: oauthClient1, userManager: userManager1 } =
            createMockOAuthComponents(dataManager1, dbManager1);
          const lifecycleManager1 = new LifecycleManager(
            windowManager1,
            dbManager1,
            oauthClient1,
            userManager1
          );

          await lifecycleManager1.initialize();

          // Save all data and track the last value for each key
          // When duplicate keys exist, only the last value should persist
          const lastValueByKey = new Map<string, any>();
          for (const item of dataToSave) {
            const saveResult = dataManager1.saveData(item.key, item.value);
            if (saveResult.success) {
              lastValueByKey.set(item.key, item.value);
            }
          }

          // Gracefully shutdown and measure time
          const shutdownStart = Date.now();
          await lifecycleManager1.handleQuit();
          const shutdownTime = Date.now() - shutdownStart;

          // Verify shutdown completed within 5 seconds
          expect(shutdownTime).toBeLessThan(5000);

          // Close database manager
          dbManager1.close();

          // Clear mocks for restart
          jest.clearAllMocks();

          // Second startup - verify data persisted
          const { dataManager: dataManager2, dbManager: dbManager2 } =
            createUserSettingsManagerWithMockUser(testStoragePath);
          const windowManager2 = new WindowManager(dbManager2);
          const { oauthClient: oauthClient2, userManager: userManager2 } =
            createMockOAuthComponents(dataManager2, dbManager2);
          const lifecycleManager2 = new LifecycleManager(
            windowManager2,
            dbManager2,
            oauthClient2,
            userManager2
          );

          await lifecycleManager2.initialize();

          // Load and verify the last saved value for each key
          for (const [key, expectedValue] of lastValueByKey.entries()) {
            const loadResult = dataManager2.loadData(key);
            expect(loadResult.success).toBe(true);
            expect(loadResult.data).toEqual(expectedValue);
          }

          // Clean up
          await lifecycleManager2.handleQuit();
          dbManager2.close();

          // Clean up storage for next iteration
          if (fs.existsSync(testStoragePath)) {
            fs.rmSync(testStoragePath, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: application not running
     Action: start application, save single data item, gracefully shutdown, restart, load data
     Assertions: data persists correctly, shutdown completes within 5 seconds
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9 edge case: single data item persists after graceful shutdown', async () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // First startup - save data
    const { dataManager: dataManager1, dbManager: dbManager1 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dataManager1,
      dbManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();

    const testKey = 'test-key';
    const testValue = { id: 1, name: 'test', data: [1, 2, 3] };

    const saveResult = dataManager1.saveData(testKey, testValue);
    expect(saveResult.success).toBe(true);

    // Gracefully shutdown and measure time
    const shutdownStart = Date.now();
    await lifecycleManager1.handleQuit();
    const shutdownTime = Date.now() - shutdownStart;

    expect(shutdownTime).toBeLessThan(5000);

    dbManager1.close();

    // Clear mocks for restart
    jest.clearAllMocks();

    // Second startup - verify data persisted
    const { dataManager: dataManager2, dbManager: dbManager2 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dataManager2,
      dbManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    await lifecycleManager2.initialize();

    const loadResult = dataManager2.loadData(testKey);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual(testValue);

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });

  /* Preconditions: application not running
     Action: start application, save multiple data items, gracefully shutdown, restart, load all data
     Assertions: all data items persist correctly, shutdown completes within 5 seconds
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9 edge case: multiple data items persist after graceful shutdown', async () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // First startup - save data
    const { dataManager: dataManager1, dbManager: dbManager1 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dataManager1,
      dbManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();

    const testData = [
      { key: 'key1', value: 'string value' },
      { key: 'key2', value: 42 },
      { key: 'key3', value: { nested: { data: true } } },
      { key: 'key4', value: [1, 2, 3, 4, 5] },
      { key: 'key5', value: null },
      { key: 'key6', value: false },
      { key: 'key7', value: 3.14159 },
    ];

    // Save all data
    for (const item of testData) {
      const saveResult = dataManager1.saveData(item.key, item.value);
      expect(saveResult.success).toBe(true);
    }

    // Gracefully shutdown and measure time
    const shutdownStart = Date.now();
    await lifecycleManager1.handleQuit();
    const shutdownTime = Date.now() - shutdownStart;

    expect(shutdownTime).toBeLessThan(5000);

    dbManager1.close();

    // Clear mocks for restart
    jest.clearAllMocks();

    // Second startup - verify all data persisted
    const { dataManager: dataManager2, dbManager: dbManager2 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dataManager2,
      dbManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    await lifecycleManager2.initialize();

    // Load and verify all data
    for (const item of testData) {
      const loadResult = dataManager2.loadData(item.key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(item.value);
    }

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });

  /* Preconditions: application not running
     Action: start application, save large data object, gracefully shutdown, restart, load data
     Assertions: large data persists correctly, shutdown completes within 5 seconds
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9 edge case: large data object persists after graceful shutdown', async () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // First startup - save data
    const { dataManager: dataManager1, dbManager: dbManager1 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dataManager1,
      dbManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();

    const testKey = 'large-data';
    const testValue = {
      items: Array(100)
        .fill(0)
        .map((_, i) => ({
          id: i,
          name: `item-${i}`,
          data: {
            value: i * 2,
            nested: {
              field1: `value-${i}`,
              field2: [i, i + 1, i + 2],
            },
          },
        })),
    };

    const saveResult = dataManager1.saveData(testKey, testValue);
    expect(saveResult.success).toBe(true);

    // Gracefully shutdown and measure time
    const shutdownStart = Date.now();
    await lifecycleManager1.handleQuit();
    const shutdownTime = Date.now() - shutdownStart;

    expect(shutdownTime).toBeLessThan(5000);

    dbManager1.close();

    // Clear mocks for restart
    jest.clearAllMocks();

    // Second startup - verify data persisted
    const { dataManager: dataManager2, dbManager: dbManager2 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dataManager2,
      dbManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    await lifecycleManager2.initialize();

    const loadResult = dataManager2.loadData(testKey);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual(testValue);

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });

  /* Preconditions: application not running
     Action: start application, save data, update data, gracefully shutdown, restart, load data
     Assertions: updated data persists correctly (not original data), shutdown completes within 5 seconds
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9 edge case: updated data persists after graceful shutdown', async () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // First startup - save and update data
    const { dataManager: dataManager1, dbManager: dbManager1 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dataManager1,
      dbManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();

    const testKey = 'update-test';
    const originalValue = 'original value';
    const updatedValue = 'updated value';

    // Save original value
    dataManager1.saveData(testKey, originalValue);

    // Update with new value
    const saveResult = dataManager1.saveData(testKey, updatedValue);
    expect(saveResult.success).toBe(true);

    // Gracefully shutdown and measure time
    const shutdownStart = Date.now();
    await lifecycleManager1.handleQuit();
    const shutdownTime = Date.now() - shutdownStart;

    expect(shutdownTime).toBeLessThan(5000);

    dbManager1.close();

    // Clear mocks for restart
    jest.clearAllMocks();

    // Second startup - verify updated data persisted
    const { dataManager: dataManager2, dbManager: dbManager2 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dataManager2,
      dbManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    await lifecycleManager2.initialize();

    const loadResult = dataManager2.loadData(testKey);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual(updatedValue);
    expect(loadResult.data).not.toEqual(originalValue);

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });

  /* Preconditions: application not running
     Action: start application, save data, delete some data, gracefully shutdown, restart, verify deleted data is gone
     Assertions: remaining data persists, deleted data is not present, shutdown completes within 5 seconds
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9 edge case: deleted data does not persist after graceful shutdown', async () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // First startup - save and delete data
    const { dataManager: dataManager1, dbManager: dbManager1 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dataManager1,
      dbManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();

    const persistKey = 'persist-key';
    const deleteKey = 'delete-key';
    const persistValue = 'should persist';
    const deleteValue = 'should be deleted';

    // Save both items
    dataManager1.saveData(persistKey, persistValue);
    dataManager1.saveData(deleteKey, deleteValue);

    // Delete one item
    const deleteResult = dataManager1.deleteData(deleteKey);
    expect(deleteResult.success).toBe(true);

    // Gracefully shutdown and measure time
    const shutdownStart = Date.now();
    await lifecycleManager1.handleQuit();
    const shutdownTime = Date.now() - shutdownStart;

    expect(shutdownTime).toBeLessThan(5000);

    dbManager1.close();

    // Clear mocks for restart
    jest.clearAllMocks();

    // Second startup - verify persistence state
    const { dataManager: dataManager2, dbManager: dbManager2 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dataManager2,
      dbManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    await lifecycleManager2.initialize();

    // Verify persisted data exists
    const loadPersistResult = dataManager2.loadData(persistKey);
    expect(loadPersistResult.success).toBe(true);
    expect(loadPersistResult.data).toEqual(persistValue);

    // Verify deleted data does not exist
    const loadDeleteResult = dataManager2.loadData(deleteKey);
    expect(loadDeleteResult.success).toBe(false);
    expect(loadDeleteResult.error).toContain('not found');

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });

  /* Preconditions: application not running
     Action: start application, save data with special characters in keys, gracefully shutdown, restart, load data
     Assertions: data with special character keys persists correctly, shutdown completes within 5 seconds
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9 edge case: data with special character keys persists after graceful shutdown', async () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // First startup - save data
    const { dataManager: dataManager1, dbManager: dbManager1 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dataManager1,
      dbManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();

    const testData = [
      { key: 'key-with-dash', value: 'dash value' },
      { key: 'key_with_underscore', value: 'underscore value' },
      { key: 'key.with.dot', value: 'dot value' },
      { key: 'key-with_mixed.chars', value: 'mixed value' },
      { key: 'KEY_UPPERCASE', value: 'uppercase value' },
    ];

    // Save all data
    for (const item of testData) {
      const saveResult = dataManager1.saveData(item.key, item.value);
      expect(saveResult.success).toBe(true);
    }

    // Gracefully shutdown and measure time
    const shutdownStart = Date.now();
    await lifecycleManager1.handleQuit();
    const shutdownTime = Date.now() - shutdownStart;

    expect(shutdownTime).toBeLessThan(5000);

    dbManager1.close();

    // Clear mocks for restart
    jest.clearAllMocks();

    // Second startup - verify all data persisted
    const { dataManager: dataManager2, dbManager: dbManager2 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dataManager2,
      dbManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    await lifecycleManager2.initialize();

    // Load and verify all data
    for (const item of testData) {
      const loadResult = dataManager2.loadData(item.key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(item.value);
    }

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });

  /* Preconditions: application not running
     Action: start application, perform multiple shutdown-restart cycles, verify data persists across all cycles
     Assertions: data persists correctly across multiple cycles, all shutdowns complete within 5 seconds
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9 edge case: data persists across multiple shutdown-restart cycles', async () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    const testKey = 'cycle-test';
    const testValue = { cycle: 0, data: 'persistent data' };
    const cycles = 5;

    for (let i = 0; i < cycles; i++) {
      // Clear mocks for each cycle
      jest.clearAllMocks();

      const { dataManager, dbManager } = createUserSettingsManagerWithMockUser(testStoragePath);
      const windowManager = new WindowManager(dbManager);
      const { oauthClient, userManager } = createMockOAuthComponents(dataManager, dbManager);
      const lifecycleManager = new LifecycleManager(
        windowManager,
        dbManager,
        oauthClient,
        userManager
      );

      await lifecycleManager.initialize();

      if (i === 0) {
        // First cycle - save data
        const saveResult = dataManager.saveData(testKey, testValue);
        expect(saveResult.success).toBe(true);
      } else {
        // Subsequent cycles - verify data persisted
        const loadResult = dataManager.loadData(testKey);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toEqual(testValue);
      }

      // Gracefully shutdown and measure time
      const shutdownStart = Date.now();
      await lifecycleManager.handleQuit();
      const shutdownTime = Date.now() - shutdownStart;

      expect(shutdownTime).toBeLessThan(5000);

      dbManager.close();
    }

    // Final verification - restart and check data
    jest.clearAllMocks();

    const { dataManager, dbManager } = createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager = new WindowManager(dbManager);
    const { oauthClient, userManager } = createMockOAuthComponents(dataManager, dbManager);
    const lifecycleManager = new LifecycleManager(
      windowManager,
      dbManager,
      oauthClient,
      userManager
    );

    await lifecycleManager.initialize();

    const loadResult = dataManager.loadData(testKey);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual(testValue);

    // Clean up
    await lifecycleManager.handleQuit();
    dbManager.close();
  });

  /* Preconditions: application not running
     Action: start application, save no data, gracefully shutdown, restart, verify clean state
     Assertions: shutdown completes within 5 seconds, no data exists after restart
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9 edge case: graceful shutdown with no data completes within 5 seconds', async () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // First startup - no data saved
    const { dataManager: dataManager1, dbManager: dbManager1 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dataManager1,
      dbManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();

    // Gracefully shutdown and measure time
    const shutdownStart = Date.now();
    await lifecycleManager1.handleQuit();
    const shutdownTime = Date.now() - shutdownStart;

    expect(shutdownTime).toBeLessThan(5000);

    dbManager1.close();

    // Clear mocks for restart
    jest.clearAllMocks();

    // Second startup - verify clean state
    const { dataManager: dataManager2, dbManager: dbManager2 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dataManager2,
      dbManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    await lifecycleManager2.initialize();

    // Try to load non-existent data
    const loadResult = dataManager2.loadData('non-existent-key');
    expect(loadResult.success).toBe(false);
    expect(loadResult.error).toContain('not found');

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });

  /* Preconditions: application not running
     Action: start application, save deeply nested data, gracefully shutdown, restart, load data
     Assertions: deeply nested data persists correctly, shutdown completes within 5 seconds
     Requirements: clerkly.nfr.2.2, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 9: Graceful Shutdown Data Persistence
  test('Property 9 edge case: deeply nested data persists after graceful shutdown', async () => {
    // Clean up storage before test
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }

    // First startup - save data
    const { dataManager: dataManager1, dbManager: dbManager1 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager1 = new WindowManager(dbManager1);
    const { oauthClient: oauthClient1, userManager: userManager1 } = createMockOAuthComponents(
      dataManager1,
      dbManager1
    );
    const lifecycleManager1 = new LifecycleManager(
      windowManager1,
      dbManager1,
      oauthClient1,
      userManager1
    );

    await lifecycleManager1.initialize();

    const testKey = 'nested-data';
    const testValue = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                data: 'deep value',
                array: [1, 2, 3],
                nested: {
                  field1: 'value1',
                  field2: true,
                  field3: null,
                },
              },
            },
          },
        },
      },
    };

    const saveResult = dataManager1.saveData(testKey, testValue);
    expect(saveResult.success).toBe(true);

    // Gracefully shutdown and measure time
    const shutdownStart = Date.now();
    await lifecycleManager1.handleQuit();
    const shutdownTime = Date.now() - shutdownStart;

    expect(shutdownTime).toBeLessThan(5000);

    dbManager1.close();

    // Clear mocks for restart
    jest.clearAllMocks();

    // Second startup - verify data persisted
    const { dataManager: dataManager2, dbManager: dbManager2 } =
      createUserSettingsManagerWithMockUser(testStoragePath);
    const windowManager2 = new WindowManager(dbManager2);
    const { oauthClient: oauthClient2, userManager: userManager2 } = createMockOAuthComponents(
      dataManager2,
      dbManager2
    );
    const lifecycleManager2 = new LifecycleManager(
      windowManager2,
      dbManager2,
      oauthClient2,
      userManager2
    );

    await lifecycleManager2.initialize();

    const loadResult = dataManager2.loadData(testKey);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual(testValue);

    // Clean up
    await lifecycleManager2.handleQuit();
    dbManager2.close();
  });
});
