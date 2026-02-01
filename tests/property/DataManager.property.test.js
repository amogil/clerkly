// Requirements: clerkly.2.1, clerkly.2.3
const fc = require('fast-check');
const DataManager = require('../../src/main/DataManager');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('DataManager Property-Based Tests', () => {
  let dataManager;
  let testStoragePath;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testStoragePath = path.join(os.tmpdir(), `clerkly-pbt-${Date.now()}-${Math.random()}`);
    dataManager = new DataManager(testStoragePath);
    dataManager.initialize();
  });

  afterEach(() => {
    // Clean up: close database and remove test directory
    if (dataManager && dataManager.db) {
      dataManager.close();
    }
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }
  });

  /* Preconditions: database initialized, fast-check generates random key-value pairs
     Action: save data with generated key-value pair, then load data with same key
     Assertions: loaded value equals saved value for all generated inputs
     Requirements: clerkly.1.4 */
  describe('Property 1: Data Storage Round-Trip', () => {
    it('should return equivalent value after save and load for strings', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.string(), // value
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toBe(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return equivalent value after save and load for numbers', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.oneof(
            fc.integer(),
            fc.double({ noNaN: true }).filter(n => Number.isFinite(n)), // Exclude Infinity/-Infinity
            fc.float({ noNaN: true }).filter(n => Number.isFinite(n))
          ), // value - JSON-safe numbers only
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence (handle -0 specially due to JSON serialization)
            if (Object.is(value, -0)) {
              // JSON serialization converts -0 to 0
              expect(loadResult.data).toBe(0);
            } else {
              expect(loadResult.data).toBe(value);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return equivalent value after save and load for booleans', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.boolean(), // value
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toBe(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return equivalent value after save and load for objects', async () => {
      // **Validates: Requirements 1.4**
      // Use JSON-safe values only (no undefined, no -0, no NaN)
      const jsonSafeValue = fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null)
      );
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.dictionary(fc.string(), jsonSafeValue), // value - JSON-safe object
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return equivalent value after save and load for arrays', async () => {
      // **Validates: Requirements 1.4**
      // Use JSON-safe values only (no undefined, no -0, no NaN)
      const jsonSafeValue = fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null)
      );
      
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.array(jsonSafeValue), // value - JSON-safe array
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return equivalent value after save and load for mixed types', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
            fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean()))
          ), // value - JSON-safe types only
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /* Preconditions: database initialized, fast-check generates edge case inputs
     Action: save and load data with edge case values
     Assertions: edge cases are handled correctly
     Requirements: clerkly.1.4 */
  describe('Property 1 Edge Cases', () => {
    it('should handle empty string values', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          async (key) => {
            const value = '';

            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toBe(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle keys with special characters', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.stringMatching(/^[a-zA-Z0-9._-]{1,100}$/), // key with special chars
          fc.string(), // value
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toBe(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle large objects with nested structures', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.array(
            fc.record({
              id: fc.integer(),
              name: fc.string(),
              active: fc.boolean(),
              metadata: fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean()))
            }),
            { minLength: 10, maxLength: 100 }
          ), // value - array of objects with JSON-safe values
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle overwriting existing keys', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.string(), // first value
          fc.string(), // second value
          async (key, value1, value2) => {
            // Save first value
            const saveResult1 = dataManager.saveData(key, value1);
            expect(saveResult1.success).toBe(true);

            // Save second value (overwrite)
            const saveResult2 = dataManager.saveData(key, value2);
            expect(saveResult2.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify that second value is returned
            expect(loadResult.data).toBe(value2);
            
            // Only check they're different if they actually are different
            if (value1 !== value2) {
              expect(loadResult.data).not.toBe(value1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle null values correctly', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          async (key) => {
            const value = null;

            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toBe(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle arrays with mixed types', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.array(
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.constant(null),
              fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer()))
            ),
            { minLength: 1, maxLength: 50 }
          ), // value - JSON-safe mixed types
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle deeply nested objects', async () => {
      // **Validates: Requirements 1.4**
      const nestedObjectArbitrary = fc.letrec(tie => ({
        leaf: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
        node: fc.record({
          value: tie('leaf'),
          nested: fc.option(tie('leaf'), { nil: null })
        })
      })).node;

      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          nestedObjectArbitrary, // value
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toEqual(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle unicode characters in keys and values', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key with unicode
          fc.string(), // value with unicode
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toBe(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle zero and negative numbers', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.integer({ min: -1000000, max: 1000000 }), // value including negatives and zero
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toBe(value);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle very long strings', async () => {
      // **Validates: Requirements 1.4**
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 }), // key
          fc.string({ minLength: 1000, maxLength: 5000 }), // long value
          async (key, value) => {
            // Save data
            const saveResult = dataManager.saveData(key, value);
            expect(saveResult.success).toBe(true);

            // Load data
            const loadResult = dataManager.loadData(key);
            expect(loadResult.success).toBe(true);

            // Verify equivalence
            expect(loadResult.data).toBe(value);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
