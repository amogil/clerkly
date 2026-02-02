// Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8

/**
 * Functional tests for data persistence
 * Tests that data is correctly saved and persists across application restarts
 */

import { app } from 'electron';
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
    removeAllListeners: jest.fn(),
    destroy: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    webContents: {
      on: jest.fn(),
    },
  })),
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
}));

describe('Data Persistence Functional Tests', () => {
  let testStoragePath: string;

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(os.tmpdir(), `clerkly-persist-test-${Date.now()}`);

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

  describe('Basic Data Persistence', () => {
    /* Preconditions: application not running, no existing data
       Action: start app, save string data, quit app, restart app, load data
       Assertions: loaded data equals saved data, persistence works across restarts
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist string data across application restarts', async () => {
      // First session: start and save data
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const testKey = 'test-string-key';
      const testValue = 'Hello, Clerkly!';

      const saveResult = dataManager1.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Verify database file exists
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      expect(fs.existsSync(dbPath)).toBe(true);

      // Second session: restart and load data
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      const loadResult = dataManager2.loadData(testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(testValue);

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });

    /* Preconditions: application not running, no existing data
       Action: start app, save object data, quit app, restart app, load data
       Assertions: loaded object equals saved object (deep equality), persistence works for complex data
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist object data across application restarts', async () => {
      // First session: start and save data
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const testKey = 'test-object-key';
      const testValue = {
        name: 'Test User',
        age: 30,
        active: true,
        metadata: {
          created: '2024-01-01',
          tags: ['important', 'test'],
        },
      };

      const saveResult = dataManager1.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: restart and load data
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      const loadResult = dataManager2.loadData(testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(testValue);

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });

    /* Preconditions: application not running, no existing data
       Action: start app, save array data, quit app, restart app, load data
       Assertions: loaded array equals saved array, persistence works for arrays
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist array data across application restarts', async () => {
      // First session: start and save data
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const testKey = 'test-array-key';
      const testValue = [1, 2, 3, 'four', { five: 5 }, [6, 7], true, null];

      const saveResult = dataManager1.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: restart and load data
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      const loadResult = dataManager2.loadData(testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(testValue);

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });

    /* Preconditions: application not running, no existing data
       Action: start app, save number data, quit app, restart app, load data
       Assertions: loaded number equals saved number, persistence works for numbers
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist number data across application restarts', async () => {
      // First session: start and save data
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const testKey = 'test-number-key';
      const testValue = 42.5;

      const saveResult = dataManager1.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: restart and load data
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      const loadResult = dataManager2.loadData(testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(testValue);

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });

    /* Preconditions: application not running, no existing data
       Action: start app, save boolean data, quit app, restart app, load data
       Assertions: loaded boolean equals saved boolean, persistence works for booleans
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist boolean data across application restarts', async () => {
      // First session: start and save data
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const testKey = 'test-boolean-key';
      const testValue = true;

      const saveResult = dataManager1.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: restart and load data
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      const loadResult = dataManager2.loadData(testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(testValue);

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });
  });

  describe('Multiple Data Items Persistence', () => {
    /* Preconditions: application not running, no existing data
       Action: start app, save multiple data items of different types, quit app, restart app, load all data
       Assertions: all data items persist correctly, each loaded value equals saved value
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist multiple data items across application restarts', async () => {
      // First session: start and save multiple data items
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const testData = [
        { key: 'string-key', value: 'string value' },
        { key: 'number-key', value: 123 },
        { key: 'boolean-key', value: false },
        { key: 'object-key', value: { nested: { deep: 'value' } } },
        { key: 'array-key', value: [1, 2, 3, 4, 5] },
        { key: 'null-key', value: null },
        { key: 'empty-string-key', value: '' },
        { key: 'zero-key', value: 0 },
        { key: 'false-key', value: false },
      ];

      // Save all data items
      for (const item of testData) {
        const saveResult = dataManager1.saveData(item.key, item.value);
        expect(saveResult.success).toBe(true);
      }

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: restart and load all data
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      // Verify all data items persisted
      for (const item of testData) {
        const loadResult = dataManager2.loadData(item.key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toEqual(item.value);
      }

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });

    /* Preconditions: application not running, no existing data
       Action: start app, save 100 data items, quit app, restart app, load all data
       Assertions: all 100 items persist correctly, performance is acceptable
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist large number of data items across application restarts', async () => {
      // First session: start and save many data items
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const itemCount = 100;
      const testData: Array<{ key: string; value: any }> = [];

      // Generate test data
      for (let i = 0; i < itemCount; i++) {
        testData.push({
          key: `item-${i}`,
          value: {
            id: i,
            name: `Item ${i}`,
            timestamp: Date.now(),
            data: Array(10)
              .fill(0)
              .map((_, j) => j * i),
          },
        });
      }

      // Save all data items
      for (const item of testData) {
        const saveResult = dataManager1.saveData(item.key, item.value);
        expect(saveResult.success).toBe(true);
      }

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: restart and load all data
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      // Verify all data items persisted
      for (const item of testData) {
        const loadResult = dataManager2.loadData(item.key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toEqual(item.value);
      }

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });
  });

  describe('Data Updates Persistence', () => {
    /* Preconditions: application not running, no existing data
       Action: start app, save data, quit, restart, update data, quit, restart, load data
       Assertions: updated data persists correctly, old value is overwritten
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist updated data across application restarts', async () => {
      const testKey = 'update-key';
      const initialValue = 'initial value';
      const updatedValue = 'updated value';

      // First session: save initial data
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const saveResult1 = dataManager1.saveData(testKey, initialValue);
      expect(saveResult1.success).toBe(true);

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: update data
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      // Verify initial value
      const loadResult1 = dataManager2.loadData(testKey);
      expect(loadResult1.success).toBe(true);
      expect(loadResult1.data).toBe(initialValue);

      // Update value
      const saveResult2 = dataManager2.saveData(testKey, updatedValue);
      expect(saveResult2.success).toBe(true);

      await lifecycleManager2.handleQuit();
      dataManager2.close();

      // Third session: verify updated value persisted
      const windowManager3 = new WindowManager();
      const dataManager3 = new DataManager(testStoragePath);
      const lifecycleManager3 = new LifecycleManager(windowManager3, dataManager3);

      await lifecycleManager3.initialize();

      const loadResult2 = dataManager3.loadData(testKey);
      expect(loadResult2.success).toBe(true);
      expect(loadResult2.data).toBe(updatedValue);

      await lifecycleManager3.handleQuit();
      dataManager3.close();
    });

    /* Preconditions: application not running, no existing data
       Action: start app, save data, update multiple times, quit, restart, load data
       Assertions: final updated value persists correctly
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist final value after multiple updates', async () => {
      const testKey = 'multi-update-key';
      const updates = ['value1', 'value2', 'value3', 'value4', 'final value'];

      // First session: save and update multiple times
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      // Perform multiple updates
      for (const value of updates) {
        const saveResult = dataManager1.saveData(testKey, value);
        expect(saveResult.success).toBe(true);
      }

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: verify final value persisted
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      const loadResult = dataManager2.loadData(testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(updates[updates.length - 1]);

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });
  });

  describe('Data Deletion Persistence', () => {
    /* Preconditions: application not running, no existing data
       Action: start app, save data, delete data, quit, restart, try to load deleted data
       Assertions: deleted data does not persist, load returns error
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist data deletion across application restarts', async () => {
      const testKey = 'delete-key';
      const testValue = 'to be deleted';

      // First session: save and delete data
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const saveResult = dataManager1.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      const deleteResult = dataManager1.deleteData(testKey);
      expect(deleteResult.success).toBe(true);

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: verify data was deleted
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      const loadResult = dataManager2.loadData(testKey);
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toContain('Key not found');

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });
  });

  describe('Edge Cases and Complex Scenarios', () => {
    /* Preconditions: application not running, no existing data
       Action: start app, save data with special characters in key, quit, restart, load data
       Assertions: data with special character keys persists correctly
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist data with special characters in keys', async () => {
      // First session: save data with special character keys
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const testData = [
        { key: 'key-with-dash', value: 'dash value' },
        { key: 'key_with_underscore', value: 'underscore value' },
        { key: 'key.with.dot', value: 'dot value' },
        { key: 'key:with:colon', value: 'colon value' },
        { key: 'key/with/slash', value: 'slash value' },
      ];

      for (const item of testData) {
        const saveResult = dataManager1.saveData(item.key, item.value);
        expect(saveResult.success).toBe(true);
      }

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: verify all data persisted
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      for (const item of testData) {
        const loadResult = dataManager2.loadData(item.key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toBe(item.value);
      }

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });

    /* Preconditions: application not running, no existing data
       Action: start app, save deeply nested object, quit, restart, load data
       Assertions: deeply nested object persists correctly with all nested properties
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist deeply nested objects', async () => {
      // First session: save deeply nested object
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const testKey = 'nested-object-key';
      const testValue = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  data: 'deep value',
                  array: [1, 2, { nested: true }],
                },
              },
            },
          },
        },
      };

      const saveResult = dataManager1.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: verify nested object persisted
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      const loadResult = dataManager2.loadData(testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(testValue);

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });

    /* Preconditions: application not running, no existing data
       Action: start app, save empty values (empty string, empty array, empty object), quit, restart, load data
       Assertions: empty values persist correctly
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist empty values correctly', async () => {
      // First session: save empty values
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const testData = [
        { key: 'empty-string', value: '' },
        { key: 'empty-array', value: [] },
        { key: 'empty-object', value: {} },
      ];

      for (const item of testData) {
        const saveResult = dataManager1.saveData(item.key, item.value);
        expect(saveResult.success).toBe(true);
      }

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Second session: verify empty values persisted
      const windowManager2 = new WindowManager();
      const dataManager2 = new DataManager(testStoragePath);
      const lifecycleManager2 = new LifecycleManager(windowManager2, dataManager2);

      await lifecycleManager2.initialize();

      for (const item of testData) {
        const loadResult = dataManager2.loadData(item.key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toEqual(item.value);
      }

      await lifecycleManager2.handleQuit();
      dataManager2.close();
    });

    /* Preconditions: application not running, no existing data
       Action: start app, save data, quit, restart multiple times (5 cycles), load data each time
       Assertions: data persists correctly across all restart cycles
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should persist data across multiple restart cycles', async () => {
      const testKey = 'multi-restart-key';
      const testValue = { message: 'persistent across cycles', count: 42 };
      const cycles = 5;

      // First session: save initial data
      const windowManager1 = new WindowManager();
      const dataManager1 = new DataManager(testStoragePath);
      const lifecycleManager1 = new LifecycleManager(windowManager1, dataManager1);

      await lifecycleManager1.initialize();

      const saveResult = dataManager1.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      await lifecycleManager1.handleQuit();
      dataManager1.close();

      // Multiple restart cycles
      for (let i = 0; i < cycles; i++) {
        const wm = new WindowManager();
        const dm = new DataManager(testStoragePath);
        const lm = new LifecycleManager(wm, dm);

        await lm.initialize();

        // Verify data persisted
        const loadResult = dm.loadData(testKey);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toEqual(testValue);

        await lm.handleQuit();
        dm.close();
      }
    });
  });
});
