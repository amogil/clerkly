// Requirements: clerkly.2
/**
 * Functional tests for IPC communication
 * Tests the integration of Renderer process → Preload → IPC → Main process → Data Manager
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DataManager } from '../../src/main/DataManager';
import { IPCHandlers } from '../../src/main/IPCHandlers';

// Mock Electron ipcMain
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
  },
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  app: {
    getPath: jest.fn(),
  },
  BrowserWindow: jest.fn(),
}));

describe('IPC Communication Functional Tests', () => {
  let testStoragePath: string;
  let dataManager: DataManager;
  let ipcHandlers: IPCHandlers;
  let mockEvent: IpcMainInvokeEvent;

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(os.tmpdir(), `clerkly-ipc-test-${Date.now()}`);

    // Clear all mocks
    jest.clearAllMocks();

    // Initialize components
    dataManager = new DataManager(testStoragePath);
    dataManager.initialize();

    ipcHandlers = new IPCHandlers(dataManager);
    ipcHandlers.registerHandlers();

    // Create mock IPC event
    mockEvent = {} as IpcMainInvokeEvent;
  });

  afterEach(() => {
    // Unregister handlers
    ipcHandlers.unregisterHandlers();

    // Close data manager
    try {
      dataManager.close();
    } catch (error) {
      // Ignore errors during cleanup
    }

    // Clean up test storage
    if (fs.existsSync(testStoragePath)) {
      try {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  describe('End-to-End IPC Communication', () => {
    /* Preconditions: IPC handlers registered, data manager initialized, no existing data
       Action: send save-data IPC request with valid key and value, then send load-data request
       Assertions: save returns success true, load returns success true with same data, data persisted to database
       Requirements: clerkly.2*/
    it('should handle complete IPC flow: Renderer → Preload → Main → Data Manager → Response', async () => {
      const testKey = 'ipc-test-key';
      const testValue = { message: 'Hello from renderer', timestamp: Date.now() };

      // Simulate IPC save-data request from renderer
      const saveResult = await ipcHandlers.handleSaveData(mockEvent, testKey, testValue);

      // Verify save succeeded
      expect(saveResult.success).toBe(true);
      expect(saveResult.error).toBeUndefined();

      // Simulate IPC load-data request from renderer
      const loadResult = await ipcHandlers.handleLoadData(mockEvent, testKey);

      // Verify load succeeded and data matches
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(testValue);
      expect(loadResult.error).toBeUndefined();

      // Verify data was actually persisted to database
      const directLoadResult = dataManager.loadData(testKey);
      expect(directLoadResult.success).toBe(true);
      expect(directLoadResult.data).toEqual(testValue);
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send save-data request, then load-data request, then delete-data request, then load-data again
       Assertions: save succeeds, first load succeeds, delete succeeds, second load fails with "Key not found"
       Requirements: clerkly.2*/
    it('should handle complete CRUD cycle through IPC', async () => {
      const testKey = 'crud-test-key';
      const testValue = 'test value for CRUD';

      // Create: save data
      const saveResult = await ipcHandlers.handleSaveData(mockEvent, testKey, testValue);
      expect(saveResult.success).toBe(true);

      // Read: load data
      const loadResult1 = await ipcHandlers.handleLoadData(mockEvent, testKey);
      expect(loadResult1.success).toBe(true);
      expect(loadResult1.data).toBe(testValue);

      // Delete: delete data
      const deleteResult = await ipcHandlers.handleDeleteData(mockEvent, testKey);
      expect(deleteResult.success).toBe(true);

      // Read again: verify data was deleted
      const loadResult2 = await ipcHandlers.handleLoadData(mockEvent, testKey);
      expect(loadResult2.success).toBe(false);
      expect(loadResult2.error).toContain('Key not found');
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send multiple save-data requests with different keys and data types
       Assertions: all saves succeed, all loads return correct data with correct types
       Requirements: clerkly.2*/
    it('should handle multiple IPC requests with different data types', async () => {
      const testData = [
        { key: 'string-key', value: 'string value' },
        { key: 'number-key', value: 42 },
        { key: 'boolean-key', value: true },
        { key: 'object-key', value: { nested: { deep: 'value' } } },
        { key: 'array-key', value: [1, 2, 3, 4, 5] },
        { key: 'null-key', value: null },
      ];

      // Save all data through IPC
      for (const item of testData) {
        const saveResult = await ipcHandlers.handleSaveData(mockEvent, item.key, item.value);
        expect(saveResult.success).toBe(true);
      }

      // Load all data through IPC and verify
      for (const item of testData) {
        const loadResult = await ipcHandlers.handleLoadData(mockEvent, item.key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toEqual(item.value);
      }
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send save-data request, update same key with new value, load data
       Assertions: save succeeds, update succeeds, load returns updated value
       Requirements: clerkly.2*/
    it('should handle data updates through IPC', async () => {
      const testKey = 'update-key';
      const initialValue = 'initial value';
      const updatedValue = 'updated value';

      // Save initial value
      const saveResult1 = await ipcHandlers.handleSaveData(mockEvent, testKey, initialValue);
      expect(saveResult1.success).toBe(true);

      // Verify initial value
      const loadResult1 = await ipcHandlers.handleLoadData(mockEvent, testKey);
      expect(loadResult1.success).toBe(true);
      expect(loadResult1.data).toBe(initialValue);

      // Update value
      const saveResult2 = await ipcHandlers.handleSaveData(mockEvent, testKey, updatedValue);
      expect(saveResult2.success).toBe(true);

      // Verify updated value
      const loadResult2 = await ipcHandlers.handleLoadData(mockEvent, testKey);
      expect(loadResult2.success).toBe(true);
      expect(loadResult2.data).toBe(updatedValue);
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send 50 concurrent IPC save-data requests
       Assertions: all requests complete successfully, all data persisted correctly
       Requirements: clerkly.2*/
    it('should handle concurrent IPC requests', async () => {
      const requestCount = 50;
      const requests: Array<Promise<any>> = [];

      // Send concurrent save requests
      for (let i = 0; i < requestCount; i++) {
        const key = `concurrent-key-${i}`;
        const value = { id: i, data: `value-${i}` };
        requests.push(ipcHandlers.handleSaveData(mockEvent, key, value));
      }

      // Wait for all requests to complete
      const results = await Promise.all(requests);

      // Verify all requests succeeded
      for (const result of results) {
        expect(result.success).toBe(true);
      }

      // Verify all data was persisted correctly
      for (let i = 0; i < requestCount; i++) {
        const key = `concurrent-key-${i}`;
        const expectedValue = { id: i, data: `value-${i}` };
        const loadResult = await ipcHandlers.handleLoadData(mockEvent, key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toEqual(expectedValue);
      }
    });
  });

  describe('IPC Error Handling', () => {
    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send save-data request with invalid key (empty string)
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.2*/
    it('should handle invalid key parameter in save-data request', async () => {
      const invalidKeys = ['', null as any, undefined as any];

      for (const invalidKey of invalidKeys) {
        const result = await ipcHandlers.handleSaveData(mockEvent, invalidKey, 'value');
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(result.error).toContain('Invalid');
      }
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send save-data request with undefined value
       Assertions: returns success false with error message about invalid value
       Requirements: clerkly.2*/
    it('should handle invalid value parameter in save-data request', async () => {
      const result = await ipcHandlers.handleSaveData(mockEvent, 'test-key', undefined);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('Invalid parameters: value is required');
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send load-data request with invalid key (empty string, null, undefined)
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.2*/
    it('should handle invalid key parameter in load-data request', async () => {
      const invalidKeys = ['', null as any, undefined as any];

      for (const invalidKey of invalidKeys) {
        const result = await ipcHandlers.handleLoadData(mockEvent, invalidKey);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(result.error).toContain('Invalid');
      }
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send delete-data request with invalid key (empty string, null, undefined)
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.2*/
    it('should handle invalid key parameter in delete-data request', async () => {
      const invalidKeys = ['', null as any, undefined as any];

      for (const invalidKey of invalidKeys) {
        const result = await ipcHandlers.handleDeleteData(mockEvent, invalidKey);
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
        expect(result.error).toContain('Invalid');
      }
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send load-data request for non-existent key
       Assertions: returns success false with "Key not found" error
       Requirements: clerkly.2*/
    it('should handle load request for non-existent key', async () => {
      const result = await ipcHandlers.handleLoadData(mockEvent, 'non-existent-key');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Key not found');
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send delete-data request for non-existent key
       Assertions: returns success false with "Key not found" error
       Requirements: clerkly.2*/
    it('should handle delete request for non-existent key', async () => {
      const result = await ipcHandlers.handleDeleteData(mockEvent, 'non-existent-key');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Key not found');
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send save-data request with key exceeding 1000 characters
       Assertions: returns success false with error about key length
       Requirements: clerkly.2*/
    it('should handle key exceeding maximum length', async () => {
      const longKey = 'a'.repeat(1001);
      const result = await ipcHandlers.handleSaveData(mockEvent, longKey, 'value');
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('maximum length');
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: send save-data request with value exceeding 10MB
       Assertions: returns success false with error about value size
       Requirements: clerkly.2*/
    it('should handle value exceeding maximum size', async () => {
      // Create a large value (> 10MB)
      const largeValue = 'x'.repeat(11 * 1024 * 1024);
      const result = await ipcHandlers.handleSaveData(mockEvent, 'large-key', largeValue);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('too large');
    });
  });

  describe('IPC Timeout Handling', () => {
    /* Preconditions: IPC handlers registered with short timeout, data manager with artificial delay
       Action: send save-data request that takes longer than timeout
       Assertions: returns success false with timeout error, operation completes within timeout period
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should timeout IPC requests that exceed timeout threshold', async () => {
      // Create a mock data manager with artificial delay that returns a promise
      const slowDataManager = {
        saveData: jest.fn().mockReturnValue(
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 500);
          })
        ),
        loadData: jest.fn(),
        deleteData: jest.fn(),
        initialize: jest.fn(),
        close: jest.fn(),
        getStoragePath: jest.fn(),
        getMigrationRunner: jest.fn(),
      } as any;

      const slowIpcHandlers = new IPCHandlers(slowDataManager);
      // Set a very short timeout
      slowIpcHandlers.setTimeout(100);

      const startTime = Date.now();
      const result = await slowIpcHandlers.handleSaveData(mockEvent, 'test-key', 'test-value');
      const duration = Date.now() - startTime;

      // Verify timeout occurred
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');

      // Verify operation completed within timeout period (with some margin)
      expect(duration).toBeLessThan(200);
    });

    /* Preconditions: IPC handlers registered with default timeout (10 seconds)
       Action: send load-data request that completes within timeout
       Assertions: returns success true, no timeout error
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should not timeout IPC requests that complete within timeout', async () => {
      // Verify default timeout is 10 seconds
      expect(ipcHandlers.getTimeout()).toBe(10000);

      // Save data
      const saveResult = await ipcHandlers.handleSaveData(mockEvent, 'test-key', 'test-value');
      expect(saveResult.success).toBe(true);

      // Load data (should complete quickly, well within timeout)
      const startTime = Date.now();
      const loadResult = await ipcHandlers.handleLoadData(mockEvent, 'test-key');
      const duration = Date.now() - startTime;

      // Verify no timeout
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe('test-value');
      expect(duration).toBeLessThan(1000);
    });

    /* Preconditions: IPC handlers registered with custom timeout
       Action: change timeout value, send request
       Assertions: timeout is applied correctly, can be changed dynamically
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should allow changing timeout dynamically', async () => {
      // Change timeout to 5 seconds
      ipcHandlers.setTimeout(5000);
      expect(ipcHandlers.getTimeout()).toBe(5000);

      // Change timeout to 15 seconds
      ipcHandlers.setTimeout(15000);
      expect(ipcHandlers.getTimeout()).toBe(15000);

      // Verify operations still work with new timeout
      const saveResult = await ipcHandlers.handleSaveData(mockEvent, 'test-key', 'test-value');
      expect(saveResult.success).toBe(true);

      const loadResult = await ipcHandlers.handleLoadData(mockEvent, 'test-key');
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe('test-value');
    });
  });

  describe('IPC Handler Registration', () => {
    /* Preconditions: IPC handlers not registered
       Action: register handlers, verify ipcMain.handle called for each channel
       Assertions: ipcMain.handle called 3 times (save-data, load-data, delete-data)
       Requirements: clerkly.2*/
    it('should register all IPC handlers correctly', () => {
      // Create new handlers (beforeEach already registered, so create fresh instance)
      const newDataManager = new DataManager(testStoragePath);
      newDataManager.initialize();
      const newIpcHandlers = new IPCHandlers(newDataManager);

      // Clear mocks
      (ipcMain.handle as jest.Mock).mockClear();

      // Register handlers
      newIpcHandlers.registerHandlers();

      // Verify all handlers were registered
      expect(ipcMain.handle).toHaveBeenCalledTimes(3);
      expect(ipcMain.handle).toHaveBeenCalledWith('save-data', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('load-data', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('delete-data', expect.any(Function));

      // Cleanup
      newIpcHandlers.unregisterHandlers();
      newDataManager.close();
    });

    /* Preconditions: IPC handlers registered
       Action: unregister handlers, verify ipcMain.removeHandler called for each channel
       Assertions: ipcMain.removeHandler called 3 times (save-data, load-data, delete-data)
       Requirements: clerkly.2*/
    it('should unregister all IPC handlers correctly', () => {
      // Clear mocks
      (ipcMain.removeHandler as jest.Mock).mockClear();

      // Unregister handlers
      ipcHandlers.unregisterHandlers();

      // Verify all handlers were unregistered
      expect(ipcMain.removeHandler).toHaveBeenCalledTimes(3);
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('save-data');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('load-data');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('delete-data');
    });

    /* Preconditions: IPC handlers registered
       Action: unregister handlers, then try to use them
       Assertions: handlers are unregistered, subsequent registration works
       Requirements: clerkly.2*/
    it('should allow re-registration after unregistering', () => {
      // Unregister handlers
      ipcHandlers.unregisterHandlers();

      // Clear mocks
      (ipcMain.handle as jest.Mock).mockClear();

      // Re-register handlers
      ipcHandlers.registerHandlers();

      // Verify handlers were re-registered
      expect(ipcMain.handle).toHaveBeenCalledTimes(3);
      expect(ipcMain.handle).toHaveBeenCalledWith('save-data', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('load-data', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('delete-data', expect.any(Function));
    });
  });

  describe('IPC Integration with Data Manager', () => {
    /* Preconditions: IPC handlers registered, data manager initialized
       Action: save data through IPC, verify data in database directly, load through IPC
       Assertions: IPC save persists to database, direct database query returns same data, IPC load returns same data
       Requirements: clerkly.2*/
    it('should correctly integrate IPC handlers with Data Manager', async () => {
      const testKey = 'integration-key';
      const testValue = { integration: true, data: 'test' };

      // Save through IPC
      const saveResult = await ipcHandlers.handleSaveData(mockEvent, testKey, testValue);
      expect(saveResult.success).toBe(true);

      // Verify data in database directly (bypass IPC)
      const directLoadResult = dataManager.loadData(testKey);
      expect(directLoadResult.success).toBe(true);
      expect(directLoadResult.data).toEqual(testValue);

      // Load through IPC
      const ipcLoadResult = await ipcHandlers.handleLoadData(mockEvent, testKey);
      expect(ipcLoadResult.success).toBe(true);
      expect(ipcLoadResult.data).toEqual(testValue);
    });

    /* Preconditions: IPC handlers registered, data manager initialized, data exists in database
       Action: load data through IPC that was saved directly to database
       Assertions: IPC can load data saved directly to database
       Requirements: clerkly.2*/
    it('should load data saved directly to Data Manager through IPC', async () => {
      const testKey = 'direct-save-key';
      const testValue = 'directly saved value';

      // Save directly to Data Manager (bypass IPC)
      const directSaveResult = dataManager.saveData(testKey, testValue);
      expect(directSaveResult.success).toBe(true);

      // Load through IPC
      const ipcLoadResult = await ipcHandlers.handleLoadData(mockEvent, testKey);
      expect(ipcLoadResult.success).toBe(true);
      expect(ipcLoadResult.data).toBe(testValue);
    });

    /* Preconditions: IPC handlers registered, data manager initialized, data exists
       Action: delete data through IPC, verify deletion in database directly
       Assertions: IPC delete removes data from database, direct database query returns "Key not found"
       Requirements: clerkly.2*/
    it('should correctly delete data from Data Manager through IPC', async () => {
      const testKey = 'delete-integration-key';
      const testValue = 'to be deleted';

      // Save data
      const saveResult = await ipcHandlers.handleSaveData(mockEvent, testKey, testValue);
      expect(saveResult.success).toBe(true);

      // Delete through IPC
      const deleteResult = await ipcHandlers.handleDeleteData(mockEvent, testKey);
      expect(deleteResult.success).toBe(true);

      // Verify deletion in database directly
      const directLoadResult = dataManager.loadData(testKey);
      expect(directLoadResult.success).toBe(false);
      expect(directLoadResult.error).toContain('Key not found');

      // Verify deletion through IPC
      const ipcLoadResult = await ipcHandlers.handleLoadData(mockEvent, testKey);
      expect(ipcLoadResult.success).toBe(false);
      expect(ipcLoadResult.error).toContain('Key not found');
    });
  });

  describe('ContextBridge Isolation', () => {
    /* Preconditions: contextBridge mock configured, preload script loaded
       Action: load preload script and verify that window.api is exposed through contextBridge, verify ipcRenderer is not directly accessible
       Assertions: contextBridge.exposeInMainWorld called with 'api', window.api has saveData/loadData/deleteData methods, ipcRenderer is not exposed to renderer
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should isolate renderer process from main process through contextBridge', () => {
      const electron = jest.requireMock('electron');
      const { contextBridge } = electron;

      // Clear previous calls
      (contextBridge.exposeInMainWorld as jest.Mock).mockClear();

      // Load preload script to trigger contextBridge setup
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../../src/preload/index');
      });

      // Verify contextBridge.exposeInMainWorld was called
      expect(contextBridge.exposeInMainWorld).toHaveBeenCalled();

      // Get the call arguments
      const calls = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls;
      const apiCall = calls.find((call: unknown[]) => call[0] === 'api');

      // Verify 'api' was exposed
      expect(apiCall).toBeDefined();
      expect(apiCall[0]).toBe('api');

      // Verify the exposed API has the correct methods
      const exposedApi = apiCall[1];
      expect(exposedApi).toHaveProperty('saveData');
      expect(exposedApi).toHaveProperty('loadData');
      expect(exposedApi).toHaveProperty('deleteData');

      // Verify methods are functions
      expect(typeof exposedApi.saveData).toBe('function');
      expect(typeof exposedApi.loadData).toBe('function');
      expect(typeof exposedApi.deleteData).toBe('function');
    });

    /* Preconditions: preload script loaded with contextBridge
       Action: attempt to access Electron APIs directly from renderer context
       Assertions: only window.api is accessible, ipcRenderer and other Electron APIs are not directly accessible
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should prevent direct access to Electron APIs from renderer process', () => {
      const electron = jest.requireMock('electron');
      const { contextBridge } = electron;

      // Clear previous calls
      (contextBridge.exposeInMainWorld as jest.Mock).mockClear();

      // Load preload script
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../../src/preload/index');
      });

      // Get the exposed API
      const calls = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls;
      const apiCall = calls.find((call: unknown[]) => call[0] === 'api');
      const exposedApi = apiCall[1];

      // Verify that the exposed API does not contain raw Electron objects
      expect(exposedApi).not.toHaveProperty('ipcRenderer');
      expect(exposedApi).not.toHaveProperty('remote');
      expect(exposedApi).not.toHaveProperty('require');
      expect(exposedApi).not.toHaveProperty('process');

      // Verify that only the intended methods are exposed
      const apiKeys = Object.keys(exposedApi);
      expect(apiKeys).toEqual(['saveData', 'loadData', 'deleteData']);
    });

    /* Preconditions: preload script loaded, contextBridge configured
       Action: call window.api methods and verify they use ipcRenderer.invoke internally
       Assertions: window.api.saveData calls ipcRenderer.invoke('save-data'), window.api.loadData calls ipcRenderer.invoke('load-data'), window.api.deleteData calls ipcRenderer.invoke('delete-data')
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should use ipcRenderer.invoke internally for all API methods', async () => {
      const electron = jest.requireMock('electron');
      const { contextBridge, ipcRenderer } = electron;

      // Clear previous calls
      (contextBridge.exposeInMainWorld as jest.Mock).mockClear();
      (ipcRenderer.invoke as jest.Mock).mockClear();

      // Load preload script
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../../src/preload/index');
      });

      // Get the exposed API
      const calls = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls;
      const apiCall = calls.find((call: unknown[]) => call[0] === 'api');
      const exposedApi = apiCall[1];

      // Mock ipcRenderer.invoke to return success
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({ success: true });

      // Test saveData
      await exposedApi.saveData('test-key', 'test-value');
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('save-data', 'test-key', 'test-value');

      // Clear mock
      (ipcRenderer.invoke as jest.Mock).mockClear();

      // Test loadData
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({ success: true, data: 'test-value' });
      await exposedApi.loadData('test-key');
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('load-data', 'test-key');

      // Clear mock
      (ipcRenderer.invoke as jest.Mock).mockClear();

      // Test deleteData
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({ success: true });
      await exposedApi.deleteData('test-key');
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('delete-data', 'test-key');
    });

    /* Preconditions: preload script loaded, contextBridge configured
       Action: verify that API methods return promises with correct structure
       Assertions: saveData returns Promise<{success: boolean, error?: string}>, loadData returns Promise<{success: boolean, data?: any, error?: string}>, deleteData returns Promise<{success: boolean, error?: string}>
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should return correctly typed promises from API methods', async () => {
      const electron = jest.requireMock('electron');
      const { contextBridge, ipcRenderer } = electron;

      // Clear previous calls
      (contextBridge.exposeInMainWorld as jest.Mock).mockClear();

      // Load preload script
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../../src/preload/index');
      });

      // Get the exposed API
      const calls = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls;
      const apiCall = calls.find((call: unknown[]) => call[0] === 'api');
      const exposedApi = apiCall[1];

      // Test saveData return type
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({ success: true });
      const saveResult = await exposedApi.saveData('key', 'value');
      expect(saveResult).toHaveProperty('success');
      expect(typeof saveResult.success).toBe('boolean');

      // Test loadData return type
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({ success: true, data: 'test' });
      const loadResult = await exposedApi.loadData('key');
      expect(loadResult).toHaveProperty('success');
      expect(loadResult).toHaveProperty('data');
      expect(typeof loadResult.success).toBe('boolean');

      // Test deleteData return type
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({ success: true });
      const deleteResult = await exposedApi.deleteData('key');
      expect(deleteResult).toHaveProperty('success');
      expect(typeof deleteResult.success).toBe('boolean');
    });

    /* Preconditions: preload script loaded, contextBridge configured
       Action: verify that errors from IPC are properly propagated through the API
       Assertions: when ipcRenderer.invoke returns error, API methods return error in result object
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should properly propagate errors through contextBridge API', async () => {
      const electron = jest.requireMock('electron');
      const { contextBridge, ipcRenderer } = electron;

      // Clear previous calls
      (contextBridge.exposeInMainWorld as jest.Mock).mockClear();

      // Load preload script
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../../src/preload/index');
      });

      // Get the exposed API
      const calls = (contextBridge.exposeInMainWorld as jest.Mock).mock.calls;
      const apiCall = calls.find((call: unknown[]) => call[0] === 'api');
      const exposedApi = apiCall[1];

      // Test error propagation in saveData
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Invalid key',
      });
      const saveResult = await exposedApi.saveData('', 'value');
      expect(saveResult.success).toBe(false);
      expect(saveResult.error).toBe('Invalid key');

      // Test error propagation in loadData
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Key not found',
      });
      const loadResult = await exposedApi.loadData('nonexistent');
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toBe('Key not found');

      // Test error propagation in deleteData
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Key not found',
      });
      const deleteResult = await exposedApi.deleteData('nonexistent');
      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toBe('Key not found');
    });
  });

  describe('IPC Edge Cases', () => {
    /* Preconditions: IPC handlers registered, data manager initialized
       Action: save data with special characters in key
       Assertions: save succeeds, load returns correct data
       Requirements: clerkly.2*/
    it('should handle keys with special characters', async () => {
      const specialKeys = [
        'key-with-dash',
        'key_with_underscore',
        'key.with.dot',
        'key:with:colon',
        'key/with/slash',
      ];

      for (const key of specialKeys) {
        const value = `value for ${key}`;

        const saveResult = await ipcHandlers.handleSaveData(mockEvent, key, value);
        expect(saveResult.success).toBe(true);

        const loadResult = await ipcHandlers.handleLoadData(mockEvent, key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toBe(value);
      }
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: save empty values (empty string, empty array, empty object)
       Assertions: all saves succeed, all loads return correct empty values
       Requirements: clerkly.2*/
    it('should handle empty values correctly', async () => {
      const emptyValues = [
        { key: 'empty-string', value: '' },
        { key: 'empty-array', value: [] },
        { key: 'empty-object', value: {} },
      ];

      for (const item of emptyValues) {
        const saveResult = await ipcHandlers.handleSaveData(mockEvent, item.key, item.value);
        expect(saveResult.success).toBe(true);

        const loadResult = await ipcHandlers.handleLoadData(mockEvent, item.key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toEqual(item.value);
      }
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: save deeply nested object through IPC
       Assertions: save succeeds, load returns correct deeply nested structure
       Requirements: clerkly.2*/
    it('should handle deeply nested objects', async () => {
      const testKey = 'nested-key';
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

      const saveResult = await ipcHandlers.handleSaveData(mockEvent, testKey, testValue);
      expect(saveResult.success).toBe(true);

      const loadResult = await ipcHandlers.handleLoadData(mockEvent, testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(testValue);
    });

    /* Preconditions: IPC handlers registered, data manager initialized
       Action: save null value through IPC
       Assertions: save succeeds, load returns null
       Requirements: clerkly.2*/
    it('should handle null values correctly', async () => {
      const testKey = 'null-key';
      const testValue = null;

      const saveResult = await ipcHandlers.handleSaveData(mockEvent, testKey, testValue);
      expect(saveResult.success).toBe(true);

      const loadResult = await ipcHandlers.handleLoadData(mockEvent, testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(null);
    });
  });
});
