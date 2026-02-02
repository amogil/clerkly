// Requirements: clerkly.1.4, clerkly.nfr.2.3, clerkly.2.6, clerkly.2.8
import * as fc from 'fast-check';
import { IPCHandlers } from '../../src/main/IPCHandlers';
import {
  DataManager,
  SaveDataResult,
  LoadDataResult,
  DeleteDataResult,
} from '../../src/main/DataManager';

/**
 * Mock DataManager with configurable delay for testing timeouts
 */
class MockDataManagerWithDelay {
  private delay: number;

  constructor(delay: number) {
    this.delay = delay;
  }

  /**
   * Mock saveData with artificial async delay
   * Requirements: clerkly.1.4, clerkly.nfr.2.3
   */
  async saveData(_key: string, _value: any): Promise<SaveDataResult> {
    // Simulate async operation with delay
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    return { success: true };
  }

  /**
   * Mock loadData with artificial async delay
   * Requirements: clerkly.1.4, clerkly.nfr.2.3
   */
  async loadData(_key: string): Promise<LoadDataResult> {
    // Simulate async operation with delay
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    return { success: true, data: 'test-data' };
  }

  /**
   * Mock deleteData with artificial async delay
   * Requirements: clerkly.1.4, clerkly.nfr.2.3
   */
  async deleteData(_key: string): Promise<DeleteDataResult> {
    // Simulate async operation with delay
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    return { success: true };
  }
}

describe('Property Tests - IPC Handlers', () => {
  /* Preconditions: IPCHandlers initialized with mock DataManager that has delay > timeout
     Action: generate random valid keys, call handleSaveData with each key
     Assertions: for all operations, returns success false with timeout error message
     Requirements: clerkly.1.4, clerkly.nfr.2.3, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 4
  test('Property 4: IPC Timeout Enforcement - save-data operations timeout when exceeding limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid keys for testing
        fc.string({ minLength: 1, maxLength: 100 }),
        // Generate any JSON-safe value
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.object()),
        async (key: string, value: any) => {
          // Create mock DataManager with delay > timeout
          const timeout = 50; // 50ms timeout for faster tests
          const delay = 80; // 80ms delay (exceeds timeout)
          const mockDataManager = new MockDataManagerWithDelay(delay) as unknown as DataManager;

          // Create IPC handlers with short timeout
          const ipcHandlers = new IPCHandlers(mockDataManager);
          ipcHandlers.setTimeout(timeout);

          // Measure execution time
          const startTime = Date.now();

          // Execute save-data operation
          const result = await ipcHandlers.handleSaveData({} as any, key, value);

          const executionTime = Date.now() - startTime;

          // Verify timeout error
          expect(result.success).toBe(false);
          expect(result.error).toBeTruthy();
          expect(result.error).toContain('timed out');

          // Verify execution time is approximately equal to timeout (not much longer)
          // Allow 60ms tolerance for test execution overhead
          expect(executionTime).toBeGreaterThanOrEqual(timeout - 5);
          expect(executionTime).toBeLessThan(timeout + 60);
        }
      ),
      { numRuns: 100 }
    );
  }, 15000); // 15 second Jest timeout

  /* Preconditions: IPCHandlers initialized with mock DataManager that has delay > timeout
     Action: generate random valid keys, call handleLoadData with each key
     Assertions: for all operations, returns success false with timeout error message
     Requirements: clerkly.1.4, clerkly.nfr.2.3, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 4
  test('Property 4: IPC Timeout Enforcement - load-data operations timeout when exceeding limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid keys for testing
        fc.string({ minLength: 1, maxLength: 100 }),
        async (key: string) => {
          // Create mock DataManager with delay > timeout
          const timeout = 50; // 50ms timeout for faster tests
          const delay = 80; // 80ms delay (exceeds timeout)
          const mockDataManager = new MockDataManagerWithDelay(delay) as unknown as DataManager;

          // Create IPC handlers with short timeout
          const ipcHandlers = new IPCHandlers(mockDataManager);
          ipcHandlers.setTimeout(timeout);

          // Measure execution time
          const startTime = Date.now();

          // Execute load-data operation
          const result = await ipcHandlers.handleLoadData({} as any, key);

          const executionTime = Date.now() - startTime;

          // Verify timeout error
          expect(result.success).toBe(false);
          expect(result.error).toBeTruthy();
          expect(result.error).toContain('timed out');

          // Verify execution time is approximately equal to timeout (not much longer)
          // Allow 60ms tolerance for test execution overhead
          expect(executionTime).toBeGreaterThanOrEqual(timeout - 5);
          expect(executionTime).toBeLessThan(timeout + 60);
        }
      ),
      { numRuns: 100 }
    );
  }, 15000); // 15 second Jest timeout

  /* Preconditions: IPCHandlers initialized with mock DataManager that has delay > timeout
     Action: generate random valid keys, call handleDeleteData with each key
     Assertions: for all operations, returns success false with timeout error message
     Requirements: clerkly.1.4, clerkly.nfr.2.3, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 4
  test('Property 4: IPC Timeout Enforcement - delete-data operations timeout when exceeding limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid keys for testing
        fc.string({ minLength: 1, maxLength: 100 }),
        async (key: string) => {
          // Create mock DataManager with delay > timeout
          const timeout = 50; // 50ms timeout for faster tests
          const delay = 80; // 80ms delay (exceeds timeout)
          const mockDataManager = new MockDataManagerWithDelay(delay) as unknown as DataManager;

          // Create IPC handlers with short timeout
          const ipcHandlers = new IPCHandlers(mockDataManager);
          ipcHandlers.setTimeout(timeout);

          // Measure execution time
          const startTime = Date.now();

          // Execute delete-data operation
          const result = await ipcHandlers.handleDeleteData({} as any, key);

          const executionTime = Date.now() - startTime;

          // Verify timeout error
          expect(result.success).toBe(false);
          expect(result.error).toBeTruthy();
          expect(result.error).toContain('timed out');

          // Verify execution time is approximately equal to timeout (not much longer)
          // Allow 60ms tolerance for test execution overhead
          expect(executionTime).toBeGreaterThanOrEqual(timeout - 5);
          expect(executionTime).toBeLessThan(timeout + 60);
        }
      ),
      { numRuns: 100 }
    );
  }, 15000); // 15 second Jest timeout

  /* Preconditions: IPCHandlers initialized with mock DataManager that has delay < timeout
     Action: call save-data operation with delay just under timeout
     Assertions: operation succeeds without timeout error
     Requirements: clerkly.1.4, clerkly.nfr.2.3, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 4
  test('Property 4 edge case: operations completing just before timeout succeed', async () => {
    const timeout = 100; // 100ms timeout
    const delay = 70; // 70ms delay (under timeout)
    const mockDataManager = new MockDataManagerWithDelay(delay) as unknown as DataManager;

    const ipcHandlers = new IPCHandlers(mockDataManager);
    ipcHandlers.setTimeout(timeout);

    // Test save-data
    const saveResult = await ipcHandlers.handleSaveData({} as any, 'test-key', 'test-value');
    expect(saveResult.success).toBe(true);

    // Test load-data
    const loadResult = await ipcHandlers.handleLoadData({} as any, 'test-key');
    expect(loadResult.success).toBe(true);

    // Test delete-data
    const deleteResult = await ipcHandlers.handleDeleteData({} as any, 'test-key');
    expect(deleteResult.success).toBe(true);
  });

  /* Preconditions: IPCHandlers initialized with mock DataManager that has delay >> timeout
     Action: call operations with delay significantly exceeding timeout
     Assertions: operations timeout at expected time, not waiting for full delay
     Requirements: clerkly.1.4, clerkly.nfr.2.3, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 4
  test('Property 4 edge case: operations with very long delays timeout promptly', async () => {
    const timeout = 50; // 50ms timeout
    const delay = 200; // 200ms delay (much longer than timeout)
    const mockDataManager = new MockDataManagerWithDelay(delay) as unknown as DataManager;

    const ipcHandlers = new IPCHandlers(mockDataManager);
    ipcHandlers.setTimeout(timeout);

    // Test save-data
    const startTime1 = Date.now();
    const saveResult = await ipcHandlers.handleSaveData({} as any, 'test-key', 'test-value');
    const executionTime1 = Date.now() - startTime1;

    expect(saveResult.success).toBe(false);
    expect(saveResult.error).toContain('timed out');
    expect(executionTime1).toBeLessThan(timeout + 60); // Should timeout quickly, not wait full delay

    // Test load-data
    const startTime2 = Date.now();
    const loadResult = await ipcHandlers.handleLoadData({} as any, 'test-key');
    const executionTime2 = Date.now() - startTime2;

    expect(loadResult.success).toBe(false);
    expect(loadResult.error).toContain('timed out');
    expect(executionTime2).toBeLessThan(timeout + 60);

    // Test delete-data
    const startTime3 = Date.now();
    const deleteResult = await ipcHandlers.handleDeleteData({} as any, 'test-key');
    const executionTime3 = Date.now() - startTime3;

    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error).toContain('timed out');
    expect(executionTime3).toBeLessThan(timeout + 60);
  });

  /* Preconditions: IPCHandlers initialized with different timeout values
     Action: change timeout using setTimeout, verify operations respect new timeout
     Assertions: operations timeout according to the configured timeout value
     Requirements: clerkly.1.4, clerkly.nfr.2.3, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 4
  test('Property 4 edge case: different timeout values are respected', async () => {
    const delay = 70; // 70ms delay
    const mockDataManager = new MockDataManagerWithDelay(delay) as unknown as DataManager;
    const ipcHandlers = new IPCHandlers(mockDataManager);

    // Test with short timeout (should timeout)
    ipcHandlers.setTimeout(50);
    const result1 = await ipcHandlers.handleSaveData({} as any, 'test-key', 'test-value');
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('timed out');

    // Test with long timeout (should succeed)
    ipcHandlers.setTimeout(100);
    const result2 = await ipcHandlers.handleSaveData({} as any, 'test-key', 'test-value');
    expect(result2.success).toBe(true);

    // Verify timeout was changed
    expect(ipcHandlers.getTimeout()).toBe(100);
  });

  /* Preconditions: IPCHandlers initialized with mock DataManager with delay at exact timeout boundary
     Action: call operations with delay exactly equal to timeout
     Assertions: operations may succeed or timeout (race condition at boundary)
     Requirements: clerkly.1.4, clerkly.nfr.2.3, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 4
  test('Property 4 edge case: operations at exact timeout boundary', async () => {
    const timeout = 70; // 70ms timeout
    const delay = 70; // 70ms delay (exactly at boundary)
    const mockDataManager = new MockDataManagerWithDelay(delay) as unknown as DataManager;

    const ipcHandlers = new IPCHandlers(mockDataManager);
    ipcHandlers.setTimeout(timeout);

    // At exact boundary, result is non-deterministic (race condition)
    // We just verify it returns a valid result (either success or timeout)
    const result = await ipcHandlers.handleSaveData({} as any, 'test-key', 'test-value');

    // Should return a result (not throw)
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');

    // If it fails, should be a timeout error
    if (!result.success) {
      expect(result.error).toContain('timed out');
    }
  });

  /* Preconditions: IPCHandlers initialized with default timeout (10 seconds)
     Action: verify default timeout value is set correctly
     Assertions: getTimeout returns 10000ms
     Requirements: clerkly.1.4, clerkly.nfr.2.3, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 4
  test('Property 4 edge case: default timeout is 10 seconds', () => {
    const mockDataManager = new MockDataManagerWithDelay(0) as unknown as DataManager;
    const ipcHandlers = new IPCHandlers(mockDataManager);

    // Verify default timeout
    expect(ipcHandlers.getTimeout()).toBe(10000);
  });
});
