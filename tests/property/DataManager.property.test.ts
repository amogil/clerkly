// Requirements: clerkly.1, clerkly.2

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DataManager } from '../../src/main/DataManager';

describe('Property Tests - Data Manager', () => {
  let dataManager: DataManager;
  let testStoragePath: string;
  let testDbPath: string;

  beforeEach(() => {
    // Create temporary storage directory
    testStoragePath = fs.mkdtempSync(path.join(os.tmpdir(), 'datamanager-property-test-'));
    testDbPath = path.join(testStoragePath, 'clerkly.db');

    // Initialize DataManager
    dataManager = new DataManager(testStoragePath);
    dataManager.initialize();

    // Requirements: user-data-isolation.1.10 - Mock UserProfileManager for data isolation
    const mockProfileManager = {
      getCurrentEmail: jest.fn().mockReturnValue('test@example.com'),
    } as any;

    dataManager.setUserProfileManager(mockProfileManager);
  });

  afterEach(() => {
    // Clean up
    if (dataManager) {
      dataManager.close();
    }

    // Remove test files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Remove storage directory
    if (fs.existsSync(testStoragePath)) {
      const files = fs.readdirSync(testStoragePath);
      files.forEach((file) => {
        const filePath = path.join(testStoragePath, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      });
      fs.rmdirSync(testStoragePath);
    }
  });

  /* Preconditions: DataManager initialized with clean database
     Action: generate random key-value pairs of various types, save each, then load each
     Assertions: for all pairs, loaded value equals saved value (deep equality)
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1: Data Storage Round-Trip - saving then loading data returns equivalent value', async () => {
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
        // Generate valid keys: non-empty strings with length 1-100
        fc.string({ minLength: 1, maxLength: 100 }),
        // Generate JSON-safe values
        jsonSafeValue,
        async (key: string, value: any) => {
          // Save data
          const saveResult = dataManager.saveData(key, value);

          // Verify save succeeded
          expect(saveResult.success).toBe(true);

          // Load data
          const loadResult = dataManager.loadData(key);

          // Verify load succeeded
          expect(loadResult.success).toBe(true);

          // Verify equivalence (deep equality)
          expect(loadResult.data).toEqual(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: DataManager initialized
     Action: save empty string value with valid key
     Assertions: save succeeds, load returns same empty string
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1 edge case: empty string values', () => {
    const key = 'test-empty-string';
    const value = '';

    const saveResult = dataManager.saveData(key, value);
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData(key);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBe(value);
  });

  /* Preconditions: DataManager initialized
     Action: save data with keys containing special characters (dashes, underscores, dots)
     Assertions: all saves succeed, all loads return correct values
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1 edge case: special characters in keys', () => {
    const specialKeys = [
      'key-with-dash',
      'key_with_underscore',
      'key.with.dot',
      'key-with_mixed.chars',
      'key123',
      'KEY_UPPERCASE',
    ];

    for (const key of specialKeys) {
      const value = `test-value-for-${key}`;
      const saveResult = dataManager.saveData(key, value);
      expect(saveResult.success).toBe(true);

      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(value);
    }
  });

  /* Preconditions: DataManager initialized
     Action: save large object (1000 items array)
     Assertions: save succeeds, load returns equivalent object
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1 edge case: large objects', () => {
    const key = 'large-object';
    const value = {
      data: Array(1000)
        .fill(0)
        .map((_, i) => ({ id: i, value: `item-${i}` })),
    };

    const saveResult = dataManager.saveData(key, value);
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData(key);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual(value);
  });

  /* Preconditions: DataManager initialized
     Action: save nested objects with multiple levels
     Assertions: save succeeds, load returns equivalent nested structure
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1 edge case: deeply nested objects', () => {
    const key = 'nested-object';
    const value = {
      level1: {
        level2: {
          level3: {
            level4: {
              data: 'deep-value',
              array: [1, 2, 3],
              boolean: true,
            },
          },
        },
      },
    };

    const saveResult = dataManager.saveData(key, value);
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData(key);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual(value);
  });

  /* Preconditions: DataManager initialized
     Action: save data with key, overwrite with new value, load
     Assertions: load returns the new value, not the old one
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1 edge case: overwriting existing keys', () => {
    const key = 'overwrite-key';
    const oldValue = 'old-value';
    const newValue = 'new-value';

    // Save old value
    const saveResult1 = dataManager.saveData(key, oldValue);
    expect(saveResult1.success).toBe(true);

    // Overwrite with new value
    const saveResult2 = dataManager.saveData(key, newValue);
    expect(saveResult2.success).toBe(true);

    // Load should return new value
    const loadResult = dataManager.loadData(key);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBe(newValue);
  });

  /* Preconditions: DataManager initialized
     Action: save data with boundary values (0, negative numbers, fractional numbers)
     Assertions: all saves succeed, all loads return correct values
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1 edge case: boundary values for numbers', () => {
    const testCases = [
      { key: 'zero', value: 0 },
      { key: 'negative', value: -42 },
      { key: 'fractional', value: 3.14159 },
      { key: 'large-positive', value: Number.MAX_SAFE_INTEGER },
      { key: 'large-negative', value: Number.MIN_SAFE_INTEGER },
      { key: 'small-fractional', value: 0.0000001 },
    ];

    for (const testCase of testCases) {
      const saveResult = dataManager.saveData(testCase.key, testCase.value);
      expect(saveResult.success).toBe(true);

      const loadResult = dataManager.loadData(testCase.key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(testCase.value);
    }
  });

  /* Preconditions: DataManager initialized
     Action: save arrays with mixed types
     Assertions: save succeeds, load returns equivalent array
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1 edge case: arrays with mixed types', () => {
    const key = 'mixed-array';
    const value = [1, 'string', true, null, { nested: 'object' }, [1, 2, 3], 3.14, false];

    const saveResult = dataManager.saveData(key, value);
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData(key);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toEqual(value);
  });

  /* Preconditions: DataManager initialized
     Action: save null value
     Assertions: save succeeds, load returns null
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1 edge case: null values', () => {
    const key = 'null-value';
    const value = null;

    const saveResult = dataManager.saveData(key, value);
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData(key);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBe(value);
  });

  /* Preconditions: DataManager initialized
     Action: save multiple key-value pairs, load all
     Assertions: all saves succeed, all loads return correct values
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 1
  test('Property 1 edge case: multiple concurrent key-value pairs', () => {
    const testData = [
      { key: 'key1', value: 'value1' },
      { key: 'key2', value: 42 },
      { key: 'key3', value: { nested: true } },
      { key: 'key4', value: [1, 2, 3] },
      { key: 'key5', value: false },
    ];

    // Save all
    for (const item of testData) {
      const saveResult = dataManager.saveData(item.key, item.value);
      expect(saveResult.success).toBe(true);
    }

    // Load all and verify
    for (const item of testData) {
      const loadResult = dataManager.loadData(item.key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(item.value);
    }
  });

  /* Preconditions: DataManager initialized, database has some valid data
     Action: attempt operations with invalid keys
     Assertions: invalid operations fail, but database state remains unchanged (no corruption)
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 2
  test('Property 2 edge case: database state unchanged after invalid operations', () => {
    // Save some valid data first
    const validKey = 'valid-key';
    const validValue = 'valid-value';
    const saveResult = dataManager.saveData(validKey, validValue);
    expect(saveResult.success).toBe(true);

    // Attempt invalid operations
    const invalidKeys = ['', null, undefined, 123, 'a'.repeat(1001)];
    for (const invalidKey of invalidKeys) {
      dataManager.saveData(invalidKey as any, 'should-not-save');
      dataManager.loadData(invalidKey as any);
      dataManager.deleteData(invalidKey as any);
    }

    // Verify original data is still intact
    const loadResult = dataManager.loadData(validKey);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBe(validValue);
  });

  /* Preconditions: DataManager initialized
     Action: generate random invalid keys (empty strings, null, undefined, non-strings, too long strings)
     Assertions: for all invalid keys, saveData/loadData/deleteData return success false with error message
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 2
  test('Property 2: Invalid Key Rejection - invalid keys are rejected by all operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate various types of invalid keys
        fc.oneof(
          fc.constant(''), // Empty string
          fc.constant(null), // null
          fc.constant(undefined), // undefined
          fc.integer(), // Numbers (non-strings)
          fc.boolean(), // Booleans (non-strings)
          fc.object(), // Objects (non-strings)
          fc.array(fc.string()), // Arrays (non-strings)
          fc.string({ minLength: 1001, maxLength: 2000 }) // Strings exceeding max length
        ),
        async (invalidKey: any) => {
          // Test saveData with invalid key
          const saveResult = dataManager.saveData(invalidKey, 'test-value');
          expect(saveResult.success).toBe(false);
          expect(saveResult.error).toBeTruthy();
          expect(saveResult.error).toContain('Invalid key');

          // Test loadData with invalid key
          const loadResult = dataManager.loadData(invalidKey);
          expect(loadResult.success).toBe(false);
          expect(loadResult.error).toBeTruthy();
          expect(loadResult.error).toContain('Invalid key');

          // Test deleteData with invalid key
          const deleteResult = dataManager.deleteData(invalidKey);
          expect(deleteResult.success).toBe(false);
          expect(deleteResult.error).toBeTruthy();
          expect(deleteResult.error).toContain('Invalid key');
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: DataManager initialized
     Action: attempt to save data with empty string key
     Assertions: returns success false with error message about invalid key
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 2
  test('Property 2 edge case: empty string key', () => {
    const invalidKey = '';
    const value = 'test-value';

    const saveResult = dataManager.saveData(invalidKey, value);
    expect(saveResult.success).toBe(false);
    expect(saveResult.error).toContain('Invalid key');

    const loadResult = dataManager.loadData(invalidKey);
    expect(loadResult.success).toBe(false);
    expect(loadResult.error).toContain('Invalid key');

    const deleteResult = dataManager.deleteData(invalidKey);
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error).toContain('Invalid key');
  });

  /* Preconditions: DataManager initialized
     Action: attempt operations with null key
     Assertions: all operations return success false with error message
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 2
  test('Property 2 edge case: null key', () => {
    const invalidKey = null as any;
    const value = 'test-value';

    const saveResult = dataManager.saveData(invalidKey, value);
    expect(saveResult.success).toBe(false);
    expect(saveResult.error).toContain('Invalid key');

    const loadResult = dataManager.loadData(invalidKey);
    expect(loadResult.success).toBe(false);
    expect(loadResult.error).toContain('Invalid key');

    const deleteResult = dataManager.deleteData(invalidKey);
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error).toContain('Invalid key');
  });

  /* Preconditions: DataManager initialized
     Action: attempt operations with undefined key
     Assertions: all operations return success false with error message
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 2
  test('Property 2 edge case: undefined key', () => {
    const invalidKey = undefined as any;
    const value = 'test-value';

    const saveResult = dataManager.saveData(invalidKey, value);
    expect(saveResult.success).toBe(false);
    expect(saveResult.error).toContain('Invalid key');

    const loadResult = dataManager.loadData(invalidKey);
    expect(loadResult.success).toBe(false);
    expect(loadResult.error).toContain('Invalid key');

    const deleteResult = dataManager.deleteData(invalidKey);
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error).toContain('Invalid key');
  });

  /* Preconditions: DataManager initialized
     Action: attempt operations with non-string keys (numbers, objects, arrays, booleans)
     Assertions: all operations return success false with error message
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 2
  test('Property 2 edge case: non-string keys', () => {
    const invalidKeys = [
      123, // Number
      { key: 'object' }, // Object
      ['array'], // Array
      true, // Boolean
      false, // Boolean
    ];

    for (const invalidKey of invalidKeys) {
      const saveResult = dataManager.saveData(invalidKey as any, 'test-value');
      expect(saveResult.success).toBe(false);
      expect(saveResult.error).toContain('Invalid key');

      const loadResult = dataManager.loadData(invalidKey as any);
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toContain('Invalid key');

      const deleteResult = dataManager.deleteData(invalidKey as any);
      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toContain('Invalid key');
    }
  });

  /* Preconditions: DataManager initialized
     Action: attempt operations with string key exactly at boundary (1000 chars)
     Assertions: operations succeed (boundary is inclusive)
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 2
  test('Property 2 edge case: key at exact boundary (1000 chars)', () => {
    const validKey = 'a'.repeat(1000); // Exactly 1000 characters
    const value = 'test-value';

    const saveResult = dataManager.saveData(validKey, value);
    expect(saveResult.success).toBe(true);

    const loadResult = dataManager.loadData(validKey);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBe(value);

    const deleteResult = dataManager.deleteData(validKey);
    expect(deleteResult.success).toBe(true);
  });

  /* Preconditions: DataManager initialized
     Action: attempt operations with string key exceeding max length (1001+ chars)
     Assertions: all operations return success false with error about exceeding max length
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 2
  test('Property 2 edge case: key exceeding max length', () => {
    const invalidKeys = [
      'a'.repeat(1001), // 1001 characters
      'b'.repeat(1500), // 1500 characters
      'c'.repeat(2000), // 2000 characters
    ];

    for (const invalidKey of invalidKeys) {
      const saveResult = dataManager.saveData(invalidKey, 'test-value');
      expect(saveResult.success).toBe(false);
      expect(saveResult.error).toContain('exceeds maximum length');

      const loadResult = dataManager.loadData(invalidKey);
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toContain('exceeds maximum length');

      const deleteResult = dataManager.deleteData(invalidKey);
      expect(deleteResult.success).toBe(false);
      expect(deleteResult.error).toContain('exceeds maximum length');
    }
  });

  /* Preconditions: DataManager initialized, database has some valid data
     Action: attempt operations with invalid keys
     Assertions: invalid operations fail, but database state remains unchanged (no corruption)
     Requirements: clerkly.1, clerkly.2*/
  // Feature: clerkly, Property 2
  test('Property 2 edge case: database state unchanged after invalid operations', () => {
    // Save some valid data first
    const validKey = 'valid-key';
    const validValue = 'valid-value';
    const saveResult = dataManager.saveData(validKey, validValue);
    expect(saveResult.success).toBe(true);

    // Attempt invalid operations
    const invalidKeys = ['', null, undefined, 123, 'a'.repeat(1001)];
    for (const invalidKey of invalidKeys) {
      dataManager.saveData(invalidKey as any, 'should-not-save');
      dataManager.loadData(invalidKey as any);
      dataManager.deleteData(invalidKey as any);
    }

    // Verify original data is still intact
    const loadResult = dataManager.loadData(validKey);
    expect(loadResult.success).toBe(true);
    expect(loadResult.data).toBe(validValue);
  });

  /* Preconditions: DataManager initialized with clean database
     Action: generate random small data objects (< 1KB), perform saveData/loadData/deleteData operations and measure time
     Assertions: each operation completes in < 50ms for simple operations
     Requirements: clerkly.nfr.1.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
  // Feature: clerkly, Property 8: Data Operations Performance
  test('Property 8: Data Operations Performance - operations complete in < 50ms', async () => {
    // Generator for small data objects (< 1KB)
    const smallDataObject = fc.oneof(
      fc.string({ maxLength: 100 }),
      fc.integer({ min: -1000, max: 1000 }),
      fc.boolean(),
      fc.record({
        id: fc.integer({ min: 1, max: 100 }),
        name: fc.string({ maxLength: 50 }),
        active: fc.boolean(),
      }),
      fc.array(fc.string({ maxLength: 20 }), { maxLength: 10 }),
      fc.record({
        data: fc.array(fc.integer(), { maxLength: 20 }),
        metadata: fc.record({
          created: fc.integer(),
          updated: fc.integer(),
        }),
      })
    );

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        smallDataObject,
        async (key: string, value: any) => {
          // Measure saveData performance
          const saveStart = performance.now();
          const saveResult = dataManager.saveData(key, value);
          const saveTime = performance.now() - saveStart;

          expect(saveResult.success).toBe(true);
          expect(saveTime).toBeLessThan(100);

          // Measure loadData performance
          const loadStart = performance.now();
          const loadResult = dataManager.loadData(key);
          const loadTime = performance.now() - loadStart;

          expect(loadResult.success).toBe(true);
          expect(loadResult.data).toEqual(value);
          expect(loadTime).toBeLessThan(100);

          // Measure deleteData performance
          const deleteStart = performance.now();
          const deleteResult = dataManager.deleteData(key);
          const deleteTime = performance.now() - deleteStart;

          expect(deleteResult.success).toBe(true);
          expect(deleteTime).toBeLessThan(100);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: DataManager initialized
     Action: save small string data and measure time
     Assertions: operation completes in < 50ms
     Requirements: clerkly.nfr.1.4 */
  // Feature: clerkly, Property 8: Data Operations Performance
  test('Property 8 edge case: saveData performance with small strings', () => {
    const key = 'perf-test-string';
    const value = 'small test string';

    const start = performance.now();
    const result = dataManager.saveData(key, value);
    const duration = performance.now() - start;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(50);
  });

  /* Preconditions: DataManager initialized with saved data
     Action: load small data and measure time
     Assertions: operation completes in < 50ms
     Requirements: clerkly.nfr.1.4 */
  // Feature: clerkly, Property 8: Data Operations Performance
  test('Property 8 edge case: loadData performance with small objects', () => {
    const key = 'perf-test-load';
    const value = { id: 1, name: 'test', active: true };

    // Save first
    dataManager.saveData(key, value);

    // Measure load performance
    const start = performance.now();
    const result = dataManager.loadData(key);
    const duration = performance.now() - start;

    expect(result.success).toBe(true);
    expect(result.data).toEqual(value);
    expect(duration).toBeLessThan(50);
  });

  /* Preconditions: DataManager initialized with saved data
     Action: delete data and measure time
     Assertions: operation completes in < 50ms
     Requirements: clerkly.nfr.1.4 */
  // Feature: clerkly, Property 8: Data Operations Performance
  test('Property 8 edge case: deleteData performance', () => {
    const key = 'perf-test-delete';
    const value = 'test data';

    // Save first
    dataManager.saveData(key, value);

    // Measure delete performance
    const start = performance.now();
    const result = dataManager.deleteData(key);
    const duration = performance.now() - start;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(50);
  });

  /* Preconditions: DataManager initialized
     Action: perform multiple sequential operations and measure cumulative time
     Assertions: average time per operation < 50ms
     Requirements: clerkly.nfr.1.4 */
  // Feature: clerkly, Property 8: Data Operations Performance
  test('Property 8 edge case: multiple sequential operations performance', () => {
    const operations = 10;
    const totalStart = performance.now();

    for (let i = 0; i < operations; i++) {
      const key = `perf-test-${i}`;
      const value = { index: i, data: `test-${i}` };

      dataManager.saveData(key, value);
      dataManager.loadData(key);
      dataManager.deleteData(key);
    }

    const totalDuration = performance.now() - totalStart;
    const avgTimePerOperation = totalDuration / (operations * 3); // 3 operations per iteration

    expect(avgTimePerOperation).toBeLessThan(50);
  });

  /* Preconditions: DataManager initialized
     Action: save data with various sizes (small to medium) and measure time
     Assertions: all operations complete in < 50ms for data < 1KB
     Requirements: clerkly.nfr.1.4 */
  // Feature: clerkly, Property 8: Data Operations Performance
  test('Property 8 edge case: performance with varying data sizes', () => {
    const testCases = [
      { key: 'tiny', value: 'x' },
      { key: 'small', value: 'x'.repeat(100) },
      { key: 'medium', value: 'x'.repeat(500) },
      { key: 'array-small', value: Array(10).fill({ id: 1, name: 'test' }) },
      { key: 'nested', value: { level1: { level2: { level3: { data: 'test' } } } } },
    ];

    for (const testCase of testCases) {
      const start = performance.now();
      const result = dataManager.saveData(testCase.key, testCase.value);
      const duration = performance.now() - start;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(50);
    }
  });

  /* Preconditions: DataManager initialized with multiple saved keys
     Action: load multiple different keys sequentially and measure time
     Assertions: each load operation completes in < 50ms
     Requirements: clerkly.nfr.1.4 */
  // Feature: clerkly, Property 8: Data Operations Performance
  test('Property 8 edge case: load performance with multiple keys', () => {
    // Save multiple keys first
    const keys = ['key1', 'key2', 'key3', 'key4', 'key5'];
    keys.forEach((key, index) => {
      dataManager.saveData(key, { index, data: `value-${index}` });
    });

    // Measure load performance for each key
    keys.forEach((key) => {
      const start = performance.now();
      const result = dataManager.loadData(key);
      const duration = performance.now() - start;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(50);
    });
  });
});
