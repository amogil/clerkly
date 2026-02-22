/**
 * @jest-environment node
 */

// Requirements: clerkly.1, clerkly.2, clerkly.nfr.2

import * as fc from 'fast-check';
import { IPCHandlers } from '../../src/main/IPCHandlers';
import {
  UserSettingsManager,
  SaveDataResult,
  LoadDataResult,
  DeleteDataResult,
} from '../../src/main/UserSettingsManager';

/**
 * Mock UserSettingsManager with configurable delay for testing timeouts
 */
class MockUserSettingsManagerWithDelay {
  private delay: number;

  constructor(delay: number) {
    this.delay = delay;
  }

  /**
   * Mock saveData with artificial async delay
   * Requirements: clerkly.1, clerkly.nfr.2   */
  async saveData(_key: string, _value: any): Promise<SaveDataResult> {
    // Simulate async operation with delay
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    return { success: true };
  }

  /**
   * Mock loadData with artificial async delay
   * Requirements: clerkly.1, clerkly.nfr.2   */
  async loadData(_key: string): Promise<LoadDataResult> {
    // Simulate async operation with delay
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    return { success: true, data: 'test-data' };
  }

  /**
   * Mock deleteData with artificial async delay
   * Requirements: clerkly.1, clerkly.nfr.2   */
  async deleteData(_key: string): Promise<DeleteDataResult> {
    // Simulate async operation with delay
    await new Promise((resolve) => setTimeout(resolve, this.delay));
    return { success: true };
  }
}

describe('Property Tests - IPC Handlers', () => {
  /* Preconditions: IPCHandlers initialized with mock UserSettingsManager that has delay > timeout
     Action: generate random valid keys, call handleSaveData with each key
     Assertions: for all operations, returns success false with timeout error message
     Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
  // Feature: clerkly, Property 4
  test('Property 4: IPC Timeout Enforcement - save-data operations timeout when exceeding limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid keys for testing
        fc.string({ minLength: 1, maxLength: 100 }),
        // Generate any JSON-safe value
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.object()),
        async (key: string, value: any) => {
          // Create mock UserSettingsManager with delay >> timeout
          // Use 5x gap to reliably trigger timeout even under system load
          const timeout = 100; // 100ms timeout for faster tests
          const delay = 500; // 500ms delay (5x timeout, reliably exceeds it)
          const mockUserSettingsManager = new MockUserSettingsManagerWithDelay(
            delay
          ) as unknown as UserSettingsManager;

          // Create IPC handlers with short timeout
          const ipcHandlers = new IPCHandlers(mockUserSettingsManager);
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
          // Allow 150ms tolerance for test execution overhead and system load
          expect(executionTime).toBeGreaterThanOrEqual(timeout - 10);
          expect(executionTime).toBeLessThan(timeout + 150);
        }
      ),
      { numRuns: 15 } // Reduced for faster execution
    );
  }, 30000); // 30 seconds timeout

  /* Preconditions: IPCHandlers initialized with mock UserSettingsManager that has delay > timeout
     Action: generate random valid keys, call handleLoadData with each key
     Assertions: for all operations, returns success false with timeout error message
     Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
  // Feature: clerkly, Property 4
  test('Property 4: IPC Timeout Enforcement - load-data operations timeout when exceeding limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid keys for testing
        fc.string({ minLength: 1, maxLength: 100 }),
        async (key: string) => {
          // Create mock UserSettingsManager with delay > timeout
          // Use larger gap to ensure timeout always occurs
          const timeout = 100; // 100ms timeout for faster tests
          const delay = 500; // 500ms delay (significantly exceeds timeout to avoid race conditions)
          const mockUserSettingsManager = new MockUserSettingsManagerWithDelay(
            delay
          ) as unknown as UserSettingsManager;

          // Create IPC handlers with short timeout
          const ipcHandlers = new IPCHandlers(mockUserSettingsManager);
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
          // Allow 150ms tolerance for test execution overhead and system load
          expect(executionTime).toBeGreaterThanOrEqual(timeout - 10);
          expect(executionTime).toBeLessThan(timeout + 150);
        }
      ),
      { numRuns: 15 } // Reduced for faster execution
    );
  }, 30000); // 30 second Jest timeout

  /* Preconditions: IPCHandlers initialized with mock UserSettingsManager that has delay > timeout
     Action: generate random valid keys, call handleDeleteData with each key
     Assertions: for all operations, returns success false with timeout error message
     Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
  // Feature: clerkly, Property 4
  test('Property 4: IPC Timeout Enforcement - delete-data operations timeout when exceeding limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate valid keys for testing
        fc.string({ minLength: 1, maxLength: 100 }),
        async (key: string) => {
          // Create mock UserSettingsManager with delay > timeout
          // Use larger gap to ensure timeout always occurs
          const timeout = 100; // 100ms timeout for faster tests
          const delay = 500; // 500ms delay (significantly exceeds timeout to avoid race conditions)
          const mockUserSettingsManager = new MockUserSettingsManagerWithDelay(
            delay
          ) as unknown as UserSettingsManager;

          // Create IPC handlers with short timeout
          const ipcHandlers = new IPCHandlers(mockUserSettingsManager);
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
          // Allow 150ms tolerance for test execution overhead and system load
          expect(executionTime).toBeGreaterThanOrEqual(timeout - 10);
          expect(executionTime).toBeLessThan(timeout + 150);
        }
      ),
      { numRuns: 15 } // Reduced for faster execution
    );
  }, 30000); // 30 second Jest timeout

  /* Preconditions: IPCHandlers initialized with mock UserSettingsManager that has delay < timeout
     Action: call save-data operation with delay just under timeout
     Assertions: operation succeeds without timeout error
     Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
  // Feature: clerkly, Property 4
  test('Property 4 edge case: operations completing just before timeout succeed', async () => {
    const timeout = 100; // 100ms timeout
    const delay = 70; // 70ms delay (under timeout)
    const mockUserSettingsManager = new MockUserSettingsManagerWithDelay(
      delay
    ) as unknown as UserSettingsManager;

    const ipcHandlers = new IPCHandlers(mockUserSettingsManager);
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

  /* Preconditions: IPCHandlers initialized with mock UserSettingsManager that has delay >> timeout
     Action: call operations with delay significantly exceeding timeout
     Assertions: operations timeout at expected time, not waiting for full delay
     Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
  // Feature: clerkly, Property 4
  test('Property 4 edge case: operations with very long delays timeout promptly', async () => {
    const timeout = 50; // 50ms timeout
    const delay = 200; // 200ms delay (much longer than timeout)
    const mockUserSettingsManager = new MockUserSettingsManagerWithDelay(
      delay
    ) as unknown as UserSettingsManager;

    const ipcHandlers = new IPCHandlers(mockUserSettingsManager);
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
     Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
  // Feature: clerkly, Property 4
  test('Property 4 edge case: different timeout values are respected', async () => {
    const delay = 70; // 70ms delay
    const mockUserSettingsManager = new MockUserSettingsManagerWithDelay(
      delay
    ) as unknown as UserSettingsManager;
    const ipcHandlers = new IPCHandlers(mockUserSettingsManager);

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

  /* Preconditions: IPCHandlers initialized with mock UserSettingsManager with delay at exact timeout boundary
     Action: call operations with delay exactly equal to timeout
     Assertions: operations may succeed or timeout (race condition at boundary)
     Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
  // Feature: clerkly, Property 4
  test('Property 4 edge case: operations at exact timeout boundary', async () => {
    const timeout = 70; // 70ms timeout
    const delay = 70; // 70ms delay (exactly at boundary)
    const mockUserSettingsManager = new MockUserSettingsManagerWithDelay(
      delay
    ) as unknown as UserSettingsManager;

    const ipcHandlers = new IPCHandlers(mockUserSettingsManager);
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
     Requirements: clerkly.1, clerkly.2, clerkly.nfr.2*/
  // Feature: clerkly, Property 4
  test('Property 4 edge case: default timeout is 10 seconds', () => {
    const mockUserSettingsManager = new MockUserSettingsManagerWithDelay(
      0
    ) as unknown as UserSettingsManager;
    const ipcHandlers = new IPCHandlers(mockUserSettingsManager);

    // Verify default timeout
    expect(ipcHandlers.getTimeout()).toBe(10000);
  });
});
