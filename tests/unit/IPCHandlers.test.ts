// Requirements: clerkly.2

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPCHandlers } from '../../src/main/IPCHandlers';
import { DataManager } from '../../src/main/DataManager';

// Mock electron
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
}));

// Mock DataManager
jest.mock('../../src/main/DataManager');

describe('IPCHandlers', () => {
  let ipcHandlers: IPCHandlers;
  let mockDataManager: jest.Mocked<DataManager>;
  let mockEvent: IpcMainInvokeEvent;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock DataManager
    mockDataManager = {
      saveData: jest.fn(),
      loadData: jest.fn(),
      deleteData: jest.fn(),
    } as any;

    // Create mock IPC event
    mockEvent = {} as IpcMainInvokeEvent;

    // Create IPCHandlers instance
    ipcHandlers = new IPCHandlers(mockDataManager);
  });

  describe('registerHandlers', () => {
    /* Preconditions: IPCHandlers instance created, no handlers registered
       Action: call registerHandlers()
       Assertions: ipcMain.handle called 3 times for save-data, load-data, delete-data
       Requirements: clerkly.2*/
    it('should register all IPC handlers', () => {
      ipcHandlers.registerHandlers();

      expect(ipcMain.handle).toHaveBeenCalledTimes(3);
      expect(ipcMain.handle).toHaveBeenCalledWith('save-data', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('load-data', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('delete-data', expect.any(Function));
    });
  });

  describe('unregisterHandlers', () => {
    /* Preconditions: IPCHandlers instance created, handlers registered
       Action: call registerHandlers() then unregisterHandlers()
       Assertions: ipcMain.removeHandler called 3 times for all channels
       Requirements: clerkly.2*/
    it('should unregister all IPC handlers', () => {
      ipcHandlers.registerHandlers();
      ipcHandlers.unregisterHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledTimes(3);
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('save-data');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('load-data');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('delete-data');
    });

    /* Preconditions: IPCHandlers instance created, no handlers registered
       Action: call unregisterHandlers() without registering first
       Assertions: ipcMain.removeHandler not called, no errors thrown
       Requirements: clerkly.2*/
    it('should handle unregister when no handlers are registered', () => {
      ipcHandlers.unregisterHandlers();

      expect(ipcMain.removeHandler).not.toHaveBeenCalled();
    });
  });

  describe('handleSaveData', () => {
    /* Preconditions: DataManager mock configured to return success true
       Action: call handleSaveData with valid key and value
       Assertions: returns success true, DataManager.saveData called with correct params
       Requirements: clerkly.2*/
    it('should handle valid save-data request', async () => {
      mockDataManager.saveData.mockReturnValue({ success: true });

      const result = await ipcHandlers.handleSaveData(mockEvent, 'test-key', 'test-value');

      expect(result.success).toBe(true);
      expect(mockDataManager.saveData).toHaveBeenCalledWith('test-key', 'test-value');
    });

    /* Preconditions: DataManager mock configured to return success true
       Action: call handleSaveData with various data types (string, number, object, array, boolean)
       Assertions: all calls succeed, DataManager.saveData called with correct values
       Requirements: clerkly.2*/
    it('should handle save-data with different value types', async () => {
      mockDataManager.saveData.mockReturnValue({ success: true });

      const testCases = [
        { key: 'string-key', value: 'string-value' },
        { key: 'number-key', value: 42 },
        { key: 'object-key', value: { nested: 'object' } },
        { key: 'array-key', value: [1, 2, 3] },
        { key: 'boolean-key', value: true },
      ];

      for (const testCase of testCases) {
        const result = await ipcHandlers.handleSaveData(mockEvent, testCase.key, testCase.value);
        expect(result.success).toBe(true);
        expect(mockDataManager.saveData).toHaveBeenCalledWith(testCase.key, testCase.value);
      }
    });

    /* Preconditions: IPCHandlers instance created
       Action: call handleSaveData with undefined key
       Assertions: returns success false with error about required key, DataManager not called
       Requirements: clerkly.2*/
    it('should reject save-data with undefined key', async () => {
      const result = await ipcHandlers.handleSaveData(mockEvent, undefined as any, 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('key is required');
      expect(mockDataManager.saveData).not.toHaveBeenCalled();
    });

    /* Preconditions: IPCHandlers instance created
       Action: call handleSaveData with null key
       Assertions: returns success false with error about required key, DataManager not called
       Requirements: clerkly.2*/
    it('should reject save-data with null key', async () => {
      const result = await ipcHandlers.handleSaveData(mockEvent, null as any, 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('key is required');
      expect(mockDataManager.saveData).not.toHaveBeenCalled();
    });

    /* Preconditions: IPCHandlers instance created
       Action: call handleSaveData with valid key but undefined value
       Assertions: returns success false with error about required value, DataManager not called
       Requirements: clerkly.2*/
    it('should reject save-data with undefined value', async () => {
      const result = await ipcHandlers.handleSaveData(mockEvent, 'test-key', undefined);

      expect(result.success).toBe(false);
      expect(result.error).toContain('value is required');
      expect(mockDataManager.saveData).not.toHaveBeenCalled();
    });

    /* Preconditions: DataManager mock configured to return error
       Action: call handleSaveData with valid parameters
       Assertions: returns success false with error message, error logged
       Requirements: clerkly.2*/
    it('should handle DataManager save error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDataManager.saveData.mockReturnValue({ success: false, error: 'Database error' });

      const result = await ipcHandlers.handleSaveData(mockEvent, 'test-key', 'test-value');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('save-data failed'));

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: DataManager mock configured to throw exception
       Action: call handleSaveData with valid parameters
       Assertions: returns success false with exception message, exception logged
       Requirements: clerkly.2*/
    it('should handle DataManager exception', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDataManager.saveData.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await ipcHandlers.handleSaveData(mockEvent, 'test-key', 'test-value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('save-data exception'));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleLoadData', () => {
    /* Preconditions: DataManager mock configured to return success true with data
       Action: call handleLoadData with valid key
       Assertions: returns success true with data, DataManager.loadData called with correct key
       Requirements: clerkly.2*/
    it('should handle valid load-data request', async () => {
      mockDataManager.loadData.mockReturnValue({ success: true, data: 'test-value' });

      const result = await ipcHandlers.handleLoadData(mockEvent, 'test-key');

      expect(result.success).toBe(true);
      expect(result.data).toBe('test-value');
      expect(mockDataManager.loadData).toHaveBeenCalledWith('test-key');
    });

    /* Preconditions: DataManager mock configured to return various data types
       Action: call handleLoadData with different keys
       Assertions: all calls succeed, correct data returned for each type
       Requirements: clerkly.2*/
    it('should handle load-data with different data types', async () => {
      const testCases = [
        { key: 'string-key', data: 'string-value' },
        { key: 'number-key', data: 42 },
        { key: 'object-key', data: { nested: 'object' } },
        { key: 'array-key', data: [1, 2, 3] },
        { key: 'boolean-key', data: true },
      ];

      for (const testCase of testCases) {
        mockDataManager.loadData.mockReturnValue({ success: true, data: testCase.data });
        const result = await ipcHandlers.handleLoadData(mockEvent, testCase.key);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(testCase.data);
      }
    });

    /* Preconditions: IPCHandlers instance created
       Action: call handleLoadData with undefined key
       Assertions: returns success false with error about required key, DataManager not called
       Requirements: clerkly.2*/
    it('should reject load-data with undefined key', async () => {
      const result = await ipcHandlers.handleLoadData(mockEvent, undefined as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('key is required');
      expect(mockDataManager.loadData).not.toHaveBeenCalled();
    });

    /* Preconditions: IPCHandlers instance created
       Action: call handleLoadData with null key
       Assertions: returns success false with error about required key, DataManager not called
       Requirements: clerkly.2*/
    it('should reject load-data with null key', async () => {
      const result = await ipcHandlers.handleLoadData(mockEvent, null as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('key is required');
      expect(mockDataManager.loadData).not.toHaveBeenCalled();
    });

    /* Preconditions: DataManager mock configured to return error (key not found)
       Action: call handleLoadData with non-existent key
       Assertions: returns success false with error message, error logged
       Requirements: clerkly.2*/
    it('should handle DataManager load error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDataManager.loadData.mockReturnValue({ success: false, error: 'Key not found' });

      const result = await ipcHandlers.handleLoadData(mockEvent, 'non-existent-key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Key not found');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('load-data failed'));

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: DataManager mock configured to throw exception
       Action: call handleLoadData with valid key
       Assertions: returns success false with exception message, exception logged
       Requirements: clerkly.2*/
    it('should handle DataManager exception', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDataManager.loadData.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      const result = await ipcHandlers.handleLoadData(mockEvent, 'test-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection lost');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('load-data exception'));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleDeleteData', () => {
    /* Preconditions: DataManager mock configured to return success true
       Action: call handleDeleteData with valid key
       Assertions: returns success true, DataManager.deleteData called with correct key
       Requirements: clerkly.2*/
    it('should handle valid delete-data request', async () => {
      mockDataManager.deleteData.mockReturnValue({ success: true });

      const result = await ipcHandlers.handleDeleteData(mockEvent, 'test-key');

      expect(result.success).toBe(true);
      expect(mockDataManager.deleteData).toHaveBeenCalledWith('test-key');
    });

    /* Preconditions: IPCHandlers instance created
       Action: call handleDeleteData with undefined key
       Assertions: returns success false with error about required key, DataManager not called
       Requirements: clerkly.2*/
    it('should reject delete-data with undefined key', async () => {
      const result = await ipcHandlers.handleDeleteData(mockEvent, undefined as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('key is required');
      expect(mockDataManager.deleteData).not.toHaveBeenCalled();
    });

    /* Preconditions: IPCHandlers instance created
       Action: call handleDeleteData with null key
       Assertions: returns success false with error about required key, DataManager not called
       Requirements: clerkly.2*/
    it('should reject delete-data with null key', async () => {
      const result = await ipcHandlers.handleDeleteData(mockEvent, null as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('key is required');
      expect(mockDataManager.deleteData).not.toHaveBeenCalled();
    });

    /* Preconditions: DataManager mock configured to return error
       Action: call handleDeleteData with valid key
       Assertions: returns success false with error message, error logged
       Requirements: clerkly.2*/
    it('should handle DataManager delete error', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDataManager.deleteData.mockReturnValue({ success: false, error: 'Key not found' });

      const result = await ipcHandlers.handleDeleteData(mockEvent, 'test-key');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Key not found');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('delete-data failed'));

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: DataManager mock configured to throw exception
       Action: call handleDeleteData with valid key
       Assertions: returns success false with exception message, exception logged
       Requirements: clerkly.2*/
    it('should handle DataManager exception', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      mockDataManager.deleteData.mockImplementation(() => {
        throw new Error('Database locked');
      });

      const result = await ipcHandlers.handleDeleteData(mockEvent, 'test-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database locked');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('delete-data exception')
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('withTimeout', () => {
    /* Preconditions: IPCHandlers instance created
       Action: call withTimeout with promise that resolves quickly (< timeout)
       Assertions: promise resolves successfully with expected value
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should resolve promise that completes before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await ipcHandlers.withTimeout(promise, 1000, 'timeout message');

      expect(result).toBe('success');
    });

    /* Preconditions: IPCHandlers instance created
       Action: call withTimeout with promise that takes longer than timeout
       Assertions: promise rejects with timeout error message
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should reject promise that exceeds timeout', async () => {
      jest.useFakeTimers();

      const promise = new Promise((resolve) => setTimeout(() => resolve('too late'), 2000));
      const timeoutPromise = ipcHandlers.withTimeout(promise, 100, 'Operation timed out');

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(100);

      await expect(timeoutPromise).rejects.toThrow('Operation timed out');

      jest.useRealTimers();
    });

    /* Preconditions: IPCHandlers instance created
       Action: call withTimeout with promise that rejects before timeout
       Assertions: promise rejects with original error, not timeout error
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should propagate promise rejection before timeout', async () => {
      const promise = Promise.reject(new Error('Original error'));

      await expect(ipcHandlers.withTimeout(promise, 1000, 'timeout message')).rejects.toThrow(
        'Original error'
      );
    });

    /* Preconditions: IPCHandlers instance created
       Action: call withTimeout with promise that completes exactly at timeout boundary
       Assertions: promise resolves or rejects based on race condition
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should handle promise completing near timeout boundary', async () => {
      jest.useFakeTimers();

      const promise = new Promise((resolve) => setTimeout(() => resolve('boundary'), 50));
      const timeoutPromise = ipcHandlers.withTimeout(promise, 100, 'timeout message');

      // Fast-forward time to complete the promise
      jest.advanceTimersByTime(50);

      // This should succeed as promise completes before timeout
      const result = await timeoutPromise;
      expect(result).toBe('boundary');

      jest.useRealTimers();
    });
  });

  describe('setTimeout and getTimeout', () => {
    /* Preconditions: IPCHandlers instance created with default timeout (10000ms)
       Action: call getTimeout()
       Assertions: returns 10000
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should return default timeout of 10000ms', () => {
      expect(ipcHandlers.getTimeout()).toBe(10000);
    });

    /* Preconditions: IPCHandlers instance created
       Action: call setTimeout with new value, then getTimeout
       Assertions: getTimeout returns new value
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should update timeout value', () => {
      ipcHandlers.setTimeout(5000);
      expect(ipcHandlers.getTimeout()).toBe(5000);
    });

    /* Preconditions: IPCHandlers instance created, timeout set to custom value
       Action: call setTimeout multiple times with different values
       Assertions: getTimeout always returns most recent value
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should allow multiple timeout updates', () => {
      ipcHandlers.setTimeout(3000);
      expect(ipcHandlers.getTimeout()).toBe(3000);

      ipcHandlers.setTimeout(7000);
      expect(ipcHandlers.getTimeout()).toBe(7000);

      ipcHandlers.setTimeout(15000);
      expect(ipcHandlers.getTimeout()).toBe(15000);
    });
  });

  describe('timeout enforcement in IPC operations', () => {
    /* Preconditions: IPCHandlers instance created, timeout set to 100ms, DataManager mock with slow operation
       Action: call handleSaveData with operation that takes > 100ms
       Assertions: returns success false with timeout error message
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should enforce timeout on save-data operation', async () => {
      jest.useFakeTimers();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      ipcHandlers.setTimeout(100);

      // Mock slow operation
      mockDataManager.saveData.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 500);
          }) as any
      );

      const resultPromise = ipcHandlers.handleSaveData(mockEvent, 'test-key', 'test-value');

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(100);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('save-data exception'));

      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    });

    /* Preconditions: IPCHandlers instance created, timeout set to 100ms, DataManager mock with slow operation
       Action: call handleLoadData with operation that takes > 100ms
       Assertions: returns success false with timeout error message
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should enforce timeout on load-data operation', async () => {
      jest.useFakeTimers();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      ipcHandlers.setTimeout(100);

      // Mock slow operation
      mockDataManager.loadData.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true, data: 'value' }), 500);
          }) as any
      );

      const resultPromise = ipcHandlers.handleLoadData(mockEvent, 'test-key');

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(100);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('load-data exception'));

      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    });

    /* Preconditions: IPCHandlers instance created, timeout set to 100ms, DataManager mock with slow operation
       Action: call handleDeleteData with operation that takes > 100ms
       Assertions: returns success false with timeout error message
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should enforce timeout on delete-data operation', async () => {
      jest.useFakeTimers();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      ipcHandlers.setTimeout(100);

      // Mock slow operation
      mockDataManager.deleteData.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 500);
          }) as any
      );

      const resultPromise = ipcHandlers.handleDeleteData(mockEvent, 'test-key');

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(100);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('delete-data exception')
      );

      consoleErrorSpy.mockRestore();
      jest.useRealTimers();
    });

    /* Preconditions: IPCHandlers instance created, timeout set to 200ms, DataManager mock with fast operation
       Action: call handleSaveData with operation that completes in 50ms
       Assertions: returns success true, operation completes before timeout
       Requirements: clerkly.2, clerkly.nfr.2*/
    it('should not timeout when operation completes quickly', async () => {
      jest.useFakeTimers();
      ipcHandlers.setTimeout(200);

      // Mock fast operation
      mockDataManager.saveData.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ success: true }), 50);
          }) as any
      );

      const resultPromise = ipcHandlers.handleSaveData(mockEvent, 'test-key', 'test-value');

      // Fast-forward time to complete the operation
      jest.advanceTimersByTime(50);

      const result = await resultPromise;

      expect(result.success).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('error logging', () => {
    /* Preconditions: IPCHandlers instance created, DataManager returns error
       Action: call handleSaveData, handleLoadData, handleDeleteData with errors
       Assertions: console.error called for each operation with appropriate message
       Requirements: clerkly.2*/
    it('should log errors for all failed operations', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      mockDataManager.saveData.mockReturnValue({ success: false, error: 'Save error' });
      mockDataManager.loadData.mockReturnValue({ success: false, error: 'Load error' });
      mockDataManager.deleteData.mockReturnValue({ success: false, error: 'Delete error' });

      await ipcHandlers.handleSaveData(mockEvent, 'key', 'value');
      await ipcHandlers.handleLoadData(mockEvent, 'key');
      await ipcHandlers.handleDeleteData(mockEvent, 'key');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('save-data failed'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('load-data failed'));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('delete-data failed'));

      consoleErrorSpy.mockRestore();
    });

    /* Preconditions: IPCHandlers instance created
       Action: call handlers with invalid parameters
       Assertions: console.error called with parameter validation errors
       Requirements: clerkly.2*/
    it('should log parameter validation errors', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await ipcHandlers.handleSaveData(mockEvent, null as any, 'value');
      await ipcHandlers.handleLoadData(mockEvent, undefined as any);
      await ipcHandlers.handleDeleteData(mockEvent, null as any);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('key is required'));

      consoleErrorSpy.mockRestore();
    });
  });
});
