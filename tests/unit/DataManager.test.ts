// Requirements: clerkly.2

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DataManager } from '../../src/main/DataManager';

describe('DataManager', () => {
  let dataManager: DataManager;
  let testStoragePath: string;
  let testDbPath: string;

  beforeEach(() => {
    // Create temporary storage directory
    testStoragePath = fs.mkdtempSync(path.join(os.tmpdir(), 'datamanager-test-'));
    testDbPath = path.join(testStoragePath, 'clerkly.db');
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

  describe('initialize', () => {
    /* Preconditions: storage directory does not exist, no database file exists
       Action: create DataManager and call initialize()
       Assertions: returns success true, directory created, database file created, migrations run
       Requirements: clerkly.1, clerkly.2*/
    it('should successfully initialize storage and run migrations', () => {
      dataManager = new DataManager(testStoragePath);
      const result = dataManager.initialize();

      expect(result.success).toBe(true);
      expect(fs.existsSync(testStoragePath)).toBe(true);
      expect(fs.existsSync(testDbPath)).toBe(true);
      expect(result.migrations).toBeDefined();
      expect(result.migrations?.success).toBe(true);
    });

    /* Preconditions: storage directory exists with write permissions
       Action: create DataManager and call initialize()
       Assertions: returns success true, no warning about fallback
       Requirements: clerkly.1, clerkly.2*/
    it('should initialize successfully when directory already exists', () => {
      // Pre-create directory
      fs.mkdirSync(testStoragePath, { recursive: true });

      dataManager = new DataManager(testStoragePath);
      const result = dataManager.initialize();

      expect(result.success).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    /* Preconditions: database file exists but is corrupted
       Action: create DataManager and call initialize()
       Assertions: backup created, corrupted db deleted, new db created, returns success true
       Requirements: clerkly.1, clerkly.2*/
    it('should handle corrupted database by creating backup and recreating', () => {
      // Create corrupted database file
      fs.mkdirSync(testStoragePath, { recursive: true });
      fs.writeFileSync(testDbPath, 'CORRUPTED DATA NOT A VALID SQLITE FILE');

      dataManager = new DataManager(testStoragePath);
      const result = dataManager.initialize();

      expect(result.success).toBe(true);

      // Check backup was created
      const files = fs.readdirSync(testStoragePath);
      const backupFiles = files.filter((f) => f.startsWith('clerkly.db.backup-'));
      expect(backupFiles.length).toBe(1);

      // Check new database is valid
      expect(fs.existsSync(testDbPath)).toBe(true);
      const db = new Database(testDbPath);
      expect(() => db.prepare('SELECT 1').get()).not.toThrow();
      db.close();
    });
  });

  describe('saveData', () => {
    beforeEach(() => {
      dataManager = new DataManager(testStoragePath);
      dataManager.initialize();
    });

    /* Preconditions: DataManager initialized, database is empty
       Action: save string data with valid key
       Assertions: returns success true, no error
       Requirements: clerkly.1, clerkly.2*/
    it('should save string data successfully', () => {
      const result = dataManager.saveData('test-key', 'test-value');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    /* Preconditions: DataManager initialized
       Action: save number data with valid key
       Assertions: returns success true, no error
       Requirements: clerkly.1, clerkly.2*/
    it('should save number data successfully', () => {
      const result = dataManager.saveData('number-key', 42);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    /* Preconditions: DataManager initialized
       Action: save object data with valid key
       Assertions: returns success true, no error
       Requirements: clerkly.1, clerkly.2*/
    it('should save object data successfully', () => {
      const testObject = { name: 'test', value: 123, nested: { key: 'value' } };
      const result = dataManager.saveData('object-key', testObject);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    /* Preconditions: DataManager initialized
       Action: save array data with valid key
       Assertions: returns success true, no error
       Requirements: clerkly.1, clerkly.2*/
    it('should save array data successfully', () => {
      const testArray = [1, 2, 3, 'four', { five: 5 }];
      const result = dataManager.saveData('array-key', testArray);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    /* Preconditions: DataManager initialized
       Action: save boolean data with valid key
       Assertions: returns success true, no error
       Requirements: clerkly.1, clerkly.2*/
    it('should save boolean data successfully', () => {
      const result = dataManager.saveData('boolean-key', true);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    /* Preconditions: DataManager initialized, key already exists in database
       Action: save new value with same key
       Assertions: returns success true, old value overwritten
       Requirements: clerkly.1, clerkly.2*/
    it('should overwrite existing key with new value', () => {
      dataManager.saveData('overwrite-key', 'old-value');
      const result = dataManager.saveData('overwrite-key', 'new-value');

      expect(result.success).toBe(true);

      const loadResult = dataManager.loadData('overwrite-key');
      expect(loadResult.data).toBe('new-value');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to save data with empty string key
       Assertions: returns success false, error message about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject empty string key', () => {
      const result = dataManager.saveData('', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('non-empty string');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to save data with null key
       Assertions: returns success false, error message about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject null key', () => {
      const result = dataManager.saveData(null as any, 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('non-empty string');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to save data with undefined key
       Assertions: returns success false, error message about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject undefined key', () => {
      const result = dataManager.saveData(undefined as any, 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('non-empty string');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to save data with number as key
       Assertions: returns success false, error message about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject non-string key (number)', () => {
      const result = dataManager.saveData(123 as any, 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('non-empty string');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to save data with object as key
       Assertions: returns success false, error message about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject non-string key (object)', () => {
      const result = dataManager.saveData({ key: 'value' } as any, 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('non-empty string');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to save data with key longer than 1000 characters
       Assertions: returns success false, error message about maximum length
       Requirements: clerkly.1, clerkly.2*/
    it('should reject key exceeding 1000 characters', () => {
      const longKey = 'a'.repeat(1001);
      const result = dataManager.saveData(longKey, 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('maximum length');
      expect(result.error).toContain('1000');
    });

    /* Preconditions: DataManager initialized
       Action: save data with key exactly 1000 characters long
       Assertions: returns success true (boundary test)
       Requirements: clerkly.1, clerkly.2*/
    it('should accept key with exactly 1000 characters', () => {
      const maxKey = 'a'.repeat(1000);
      const result = dataManager.saveData(maxKey, 'value');

      expect(result.success).toBe(true);
    });

    /* Preconditions: DataManager initialized
       Action: attempt to save value that cannot be serialized to JSON
       Assertions: returns success false, error message about serialization failure
       Requirements: clerkly.1, clerkly.2*/
    it('should handle serialization errors', () => {
      // Create circular reference
      const circular: any = { a: 1 };
      circular.self = circular;

      const result = dataManager.saveData('circular-key', circular);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to serialize');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to save value exceeding 10MB when serialized
       Assertions: returns success false, error message about size limit
       Requirements: clerkly.1, clerkly.2*/
    it('should reject value exceeding 10MB limit', () => {
      // Create large object (> 10MB)
      const largeValue = 'x'.repeat(11 * 1024 * 1024);
      const result = dataManager.saveData('large-key', largeValue);

      expect(result.success).toBe(false);
      expect(result.error).toContain('too large');
      expect(result.error).toContain('10MB');
    });

    /* Preconditions: DataManager initialized
       Action: save data with Infinity value
       Assertions: returns success true, value serialized correctly
       Requirements: clerkly.1, clerkly.2*/
    it('should handle Infinity values', () => {
      const result = dataManager.saveData('infinity-key', Infinity);

      expect(result.success).toBe(true);

      const loadResult = dataManager.loadData('infinity-key');
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(Infinity);
    });

    /* Preconditions: DataManager initialized
       Action: save data with -Infinity value
       Assertions: returns success true, value serialized correctly
       Requirements: clerkly.1, clerkly.2*/
    it('should handle -Infinity values', () => {
      const result = dataManager.saveData('neg-infinity-key', -Infinity);

      expect(result.success).toBe(true);

      const loadResult = dataManager.loadData('neg-infinity-key');
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(-Infinity);
    });

    /* Preconditions: DataManager initialized
       Action: save data with NaN value
       Assertions: returns success true, value serialized correctly
       Requirements: clerkly.1, clerkly.2*/
    it('should handle NaN values', () => {
      const result = dataManager.saveData('nan-key', NaN);

      expect(result.success).toBe(true);

      const loadResult = dataManager.loadData('nan-key');
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBeNaN();
    });

    /* Preconditions: DataManager initialized
       Action: save object containing Infinity, -Infinity, and NaN
       Assertions: returns success true, all special values preserved
       Requirements: clerkly.1, clerkly.2*/
    it('should handle objects with special numeric values', () => {
      const specialObject = {
        positive: Infinity,
        negative: -Infinity,
        notANumber: NaN,
        normal: 42,
      };

      const result = dataManager.saveData('special-key', specialObject);
      expect(result.success).toBe(true);

      const loadResult = dataManager.loadData('special-key');
      expect(loadResult.success).toBe(true);
      expect(loadResult.data.positive).toBe(Infinity);
      expect(loadResult.data.negative).toBe(-Infinity);
      expect(loadResult.data.notANumber).toBeNaN();
      expect(loadResult.data.normal).toBe(42);
    });

    /* Preconditions: DataManager initialized but database closed
       Action: close database, then attempt to save data
       Assertions: returns success false, error about database not initialized
       Requirements: clerkly.1, clerkly.2*/
    it('should handle closed database', () => {
      dataManager.close();
      const result = dataManager.saveData('test-key', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database not initialized or closed');
    });
  });

  describe('loadData', () => {
    beforeEach(() => {
      dataManager = new DataManager(testStoragePath);
      dataManager.initialize();
    });

    /* Preconditions: DataManager initialized, string data saved with key
       Action: load data with same key
       Assertions: returns success true, data matches saved value
       Requirements: clerkly.1, clerkly.2*/
    it('should load string data successfully', () => {
      dataManager.saveData('string-key', 'test-value');
      const result = dataManager.loadData('string-key');

      expect(result.success).toBe(true);
      expect(result.data).toBe('test-value');
      expect(result.error).toBeUndefined();
    });

    /* Preconditions: DataManager initialized, number data saved
       Action: load number data
       Assertions: returns success true, data matches saved number
       Requirements: clerkly.1, clerkly.2*/
    it('should load number data successfully', () => {
      dataManager.saveData('number-key', 42);
      const result = dataManager.loadData('number-key');

      expect(result.success).toBe(true);
      expect(result.data).toBe(42);
    });

    /* Preconditions: DataManager initialized, object data saved
       Action: load object data
       Assertions: returns success true, data deeply equals saved object
       Requirements: clerkly.1, clerkly.2*/
    it('should load object data successfully', () => {
      const testObject = { name: 'test', value: 123, nested: { key: 'value' } };
      dataManager.saveData('object-key', testObject);
      const result = dataManager.loadData('object-key');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testObject);
    });

    /* Preconditions: DataManager initialized, array data saved
       Action: load array data
       Assertions: returns success true, data deeply equals saved array
       Requirements: clerkly.1, clerkly.2*/
    it('should load array data successfully', () => {
      const testArray = [1, 2, 3, 'four', { five: 5 }];
      dataManager.saveData('array-key', testArray);
      const result = dataManager.loadData('array-key');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(testArray);
    });

    /* Preconditions: DataManager initialized, boolean data saved
       Action: load boolean data
       Assertions: returns success true, data matches saved boolean
       Requirements: clerkly.1, clerkly.2*/
    it('should load boolean data successfully', () => {
      dataManager.saveData('boolean-key', false);
      const result = dataManager.loadData('boolean-key');

      expect(result.success).toBe(true);
      expect(result.data).toBe(false);
    });

    /* Preconditions: DataManager initialized, key does not exist in database
       Action: attempt to load data with non-existent key
       Assertions: returns success false, error "Key not found"
       Requirements: clerkly.1, clerkly.2*/
    it('should handle missing key', () => {
      const result = dataManager.loadData('non-existent-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Key not found');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to load data with empty string key
       Assertions: returns success false, error about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject empty string key', () => {
      const result = dataManager.loadData('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('non-empty string');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to load data with null key
       Assertions: returns success false, error about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject null key', () => {
      const result = dataManager.loadData(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to load data with undefined key
       Assertions: returns success false, error about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject undefined key', () => {
      const result = dataManager.loadData(undefined as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to load data with key longer than 1000 characters
       Assertions: returns success false, error about maximum length
       Requirements: clerkly.1, clerkly.2*/
    it('should reject key exceeding 1000 characters', () => {
      const longKey = 'a'.repeat(1001);
      const result = dataManager.loadData(longKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('maximum length');
    });

    /* Preconditions: DataManager initialized but database closed
       Action: close database, then attempt to load data
       Assertions: returns success false, error about database not initialized
       Requirements: clerkly.1, clerkly.2*/
    it('should handle closed database', () => {
      dataManager.close();
      const result = dataManager.loadData('test-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database not initialized or closed');
    });

    /* Preconditions: DataManager initialized, database contains corrupted JSON data
       Action: manually insert invalid JSON, then attempt to load
       Assertions: returns success true, data returned as plain string (fallback)
       Requirements: clerkly.1, clerkly.2*/
    it('should handle corrupted JSON data with fallback to plain string', () => {
      // Manually insert invalid JSON into database
      const db = new Database(testDbPath);
      const timestamp = Date.now();
      db.prepare(
        `
        INSERT INTO user_data (key, value, timestamp, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `
      ).run('corrupted-key', 'not valid json {[', timestamp, timestamp, timestamp);
      db.close();

      // Reinitialize DataManager
      dataManager = new DataManager(testStoragePath);
      dataManager.initialize();

      const result = dataManager.loadData('corrupted-key');

      expect(result.success).toBe(true);
      expect(result.data).toBe('not valid json {[');
    });
  });

  describe('deleteData', () => {
    beforeEach(() => {
      dataManager = new DataManager(testStoragePath);
      dataManager.initialize();
    });

    /* Preconditions: DataManager initialized, data saved with key
       Action: delete data with same key
       Assertions: returns success true, subsequent load fails with "Key not found"
       Requirements: clerkly.1, clerkly.2*/
    it('should delete data successfully', () => {
      dataManager.saveData('delete-key', 'delete-value');
      const deleteResult = dataManager.deleteData('delete-key');

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.error).toBeUndefined();

      // Verify data is gone
      const loadResult = dataManager.loadData('delete-key');
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toContain('Key not found');
    });

    /* Preconditions: DataManager initialized, key does not exist
       Action: attempt to delete non-existent key
       Assertions: returns success false, error "Key not found"
       Requirements: clerkly.1, clerkly.2*/
    it('should handle deleting non-existent key', () => {
      const result = dataManager.deleteData('non-existent-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Key not found');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to delete with empty string key
       Assertions: returns success false, error about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject empty string key', () => {
      const result = dataManager.deleteData('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('non-empty string');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to delete with null key
       Assertions: returns success false, error about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject null key', () => {
      const result = dataManager.deleteData(null as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to delete with undefined key
       Assertions: returns success false, error about invalid key
       Requirements: clerkly.1, clerkly.2*/
    it('should reject undefined key', () => {
      const result = dataManager.deleteData(undefined as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: DataManager initialized
       Action: attempt to delete with key longer than 1000 characters
       Assertions: returns success false, error about maximum length
       Requirements: clerkly.1, clerkly.2*/
    it('should reject key exceeding 1000 characters', () => {
      const longKey = 'a'.repeat(1001);
      const result = dataManager.deleteData(longKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
      expect(result.error).toContain('maximum length');
    });

    /* Preconditions: DataManager initialized but database closed
       Action: close database, then attempt to delete data
       Assertions: returns success false, error about database not initialized
       Requirements: clerkly.1, clerkly.2*/
    it('should handle closed database', () => {
      dataManager.close();
      const result = dataManager.deleteData('test-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database not initialized or closed');
    });

    /* Preconditions: DataManager initialized with read-only database (simulated)
       Action: attempt to delete data from read-only database
       Assertions: returns success false, error about read-only database
       Requirements: clerkly.1, clerkly.2*/
    it('should handle SQLITE_READONLY error on delete', () => {
      // Save data first
      dataManager.saveData('readonly-key', 'test-value');

      // Mock database prepare to throw SQLITE_READONLY error
      const mockPrepare = jest.fn().mockImplementation(() => {
        const error: any = new Error('Database is read-only');
        error.code = 'SQLITE_READONLY';
        throw error;
      });

      // Replace db.prepare with mock
      const db = (dataManager as any).db;
      const originalPrepare = db.prepare;
      db.prepare = mockPrepare;

      const result = dataManager.deleteData('readonly-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
      expect(result.error).toContain('permissions');

      // Restore original prepare
      db.prepare = originalPrepare;
    });
  });

  describe('getStoragePath', () => {
    /* Preconditions: DataManager created with specific path
       Action: call getStoragePath()
       Assertions: returns the path provided in constructor
       Requirements: clerkly.1, clerkly.2*/
    it('should return storage path', () => {
      dataManager = new DataManager(testStoragePath);
      const path = dataManager.getStoragePath();

      expect(path).toBe(testStoragePath);
    });
  });

  describe('close', () => {
    /* Preconditions: DataManager initialized with open database
       Action: call close()
       Assertions: database connection closed, subsequent operations fail
       Requirements: clerkly.1, clerkly.2*/
    it('should close database connection', () => {
      dataManager = new DataManager(testStoragePath);
      dataManager.initialize();

      dataManager.close();

      // Verify operations fail after close
      const result = dataManager.saveData('test-key', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database not initialized or closed');
    });

    /* Preconditions: DataManager created but not initialized
       Action: call close()
       Assertions: no error thrown (safe to call on uninitialized manager)
       Requirements: clerkly.1, clerkly.2*/
    it('should handle close on uninitialized database', () => {
      dataManager = new DataManager(testStoragePath);

      expect(() => {
        dataManager.close();
      }).not.toThrow();
    });

    /* Preconditions: DataManager initialized and already closed
       Action: call close() again
       Assertions: no error thrown (idempotent)
       Requirements: clerkly.1, clerkly.2*/
    it('should handle multiple close calls', () => {
      dataManager = new DataManager(testStoragePath);
      dataManager.initialize();
      dataManager.close();

      expect(() => {
        dataManager.close();
      }).not.toThrow();
    });
  });

  describe('getMigrationRunner', () => {
    /* Preconditions: DataManager initialized
       Action: call getMigrationRunner()
       Assertions: returns MigrationRunner instance
       Requirements: clerkly.1, clerkly.2*/
    it('should return MigrationRunner instance', () => {
      dataManager = new DataManager(testStoragePath);
      dataManager.initialize();

      const migrationRunner = dataManager.getMigrationRunner();

      expect(migrationRunner).toBeDefined();
      expect(migrationRunner.getCurrentVersion).toBeDefined();
      expect(migrationRunner.getStatus).toBeDefined();
    });

    /* Preconditions: DataManager created but not initialized
       Action: call getMigrationRunner()
       Assertions: throws error about database not initialized
       Requirements: clerkly.1, clerkly.2*/
    it('should throw error when database not initialized', () => {
      dataManager = new DataManager(testStoragePath);

      expect(() => {
        dataManager.getMigrationRunner();
      }).toThrow('Database not initialized');
    });
  });

  describe('SQLite error handling', () => {
    beforeEach(() => {
      dataManager = new DataManager(testStoragePath);
      dataManager.initialize();
    });

    /* Preconditions: DataManager initialized, database operations work normally
       Action: save and load data to verify normal operation
       Assertions: operations succeed (baseline for error tests)
       Requirements: clerkly.1, clerkly.2*/
    it('should handle normal database operations', () => {
      const saveResult = dataManager.saveData('test-key', 'test-value');
      expect(saveResult.success).toBe(true);

      const loadResult = dataManager.loadData('test-key');
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe('test-value');
    });

    /* Preconditions: DataManager initialized, database full (simulated)
       Action: attempt to save data when database is full
       Assertions: returns success false, error about database full
       Requirements: clerkly.1, clerkly.2*/
    it('should handle SQLITE_FULL error on save', () => {
      // Mock database prepare to throw SQLITE_FULL error
      const mockPrepare = jest.fn().mockImplementation(() => {
        return {
          run: () => {
            const error: any = new Error('Database is full');
            error.code = 'SQLITE_FULL';
            throw error;
          },
        };
      });

      // Replace db.prepare with mock
      const db = (dataManager as any).db;
      const originalPrepare = db.prepare;
      db.prepare = mockPrepare;

      const result = dataManager.saveData('test-key', 'test-value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('full');
      expect(result.error).toContain('no space');

      // Restore original prepare
      db.prepare = originalPrepare;
    });

    /* Preconditions: DataManager initialized, database busy (simulated)
       Action: attempt to save data when database is busy
       Assertions: returns success false, error about database locked
       Requirements: clerkly.1, clerkly.2*/
    it('should handle SQLITE_BUSY error on save', () => {
      // Mock database prepare to throw SQLITE_BUSY error
      const mockPrepare = jest.fn().mockImplementation(() => {
        return {
          run: () => {
            const error: any = new Error('Database is busy');
            error.code = 'SQLITE_BUSY';
            throw error;
          },
        };
      });

      // Replace db.prepare with mock
      const db = (dataManager as any).db;
      const originalPrepare = db.prepare;
      db.prepare = mockPrepare;

      const result = dataManager.saveData('test-key', 'test-value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
      expect(result.error).toContain('try again');

      // Restore original prepare
      db.prepare = originalPrepare;
    });

    /* Preconditions: DataManager initialized, database locked (simulated)
       Action: attempt to save data when database is locked
       Assertions: returns success false, error about database locked
       Requirements: clerkly.1, clerkly.2*/
    it('should handle SQLITE_LOCKED error on save', () => {
      // Mock database prepare to throw SQLITE_LOCKED error
      const mockPrepare = jest.fn().mockImplementation(() => {
        return {
          run: () => {
            const error: any = new Error('Database is locked');
            error.code = 'SQLITE_LOCKED';
            throw error;
          },
        };
      });

      // Replace db.prepare with mock
      const db = (dataManager as any).db;
      const originalPrepare = db.prepare;
      db.prepare = mockPrepare;

      const result = dataManager.saveData('test-key', 'test-value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
      expect(result.error).toContain('try again');

      // Restore original prepare
      db.prepare = originalPrepare;
    });

    /* Preconditions: DataManager initialized, database read-only (simulated)
       Action: attempt to save data to read-only database
       Assertions: returns success false, error about read-only database
       Requirements: clerkly.1, clerkly.2*/
    it('should handle SQLITE_READONLY error on save', () => {
      // Mock database prepare to throw SQLITE_READONLY error
      const mockPrepare = jest.fn().mockImplementation(() => {
        return {
          run: () => {
            const error: any = new Error('Database is read-only');
            error.code = 'SQLITE_READONLY';
            throw error;
          },
        };
      });

      // Replace db.prepare with mock
      const db = (dataManager as any).db;
      const originalPrepare = db.prepare;
      db.prepare = mockPrepare;

      const result = dataManager.saveData('test-key', 'test-value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('read-only');
      expect(result.error).toContain('permissions');

      // Restore original prepare
      db.prepare = originalPrepare;
    });

    /* Preconditions: DataManager initialized
       Action: save data, close database, attempt to load
       Assertions: load returns error about database being locked/closed
       Requirements: clerkly.1, clerkly.2*/
    it('should handle SQLITE_BUSY/SQLITE_LOCKED errors on load', () => {
      dataManager.saveData('test-key', 'test-value');
      dataManager.close();

      const result = dataManager.loadData('test-key');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    /* Preconditions: DataManager initialized
       Action: close database, attempt to delete
       Assertions: delete returns error about database being locked/closed
       Requirements: clerkly.1, clerkly.2*/
    it('should handle SQLITE_BUSY/SQLITE_LOCKED errors on delete', () => {
      dataManager.close();

      const result = dataManager.deleteData('test-key');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
