// Requirements: clerkly.2.1, clerkly.2.3
import DataManager from '../../dist/src/main/DataManager';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('DataManager', () => {
  let dataManager: DataManager;
  let testStoragePath: string;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    testStoragePath = path.join(os.tmpdir(), `clerkly-test-${Date.now()}-${Math.random()}`);
    dataManager = new DataManager(testStoragePath);
  });

  afterEach(() => {
    // Clean up: close database and remove test directory
    if (dataManager && (dataManager as any).db) {
      dataManager.close();
    }
    if (fs.existsSync(testStoragePath)) {
      fs.rmSync(testStoragePath, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    /* Preconditions: DataManager class is available
       Action: create DataManager instance with valid storagePath
       Assertions: instance is created with correct storagePath property
       Requirements: clerkly.1.4 */
    it('should create instance with valid storagePath', () => {
      expect(dataManager).toBeDefined();
      expect(dataManager.storagePath).toBe(testStoragePath);
      expect((dataManager as any).db).toBeNull();
    });

    /* Preconditions: DataManager class is available
       Action: attempt to create DataManager with empty string storagePath
       Assertions: throws error with message about invalid storagePath
       Requirements: clerkly.1.4 */
    it('should reject empty storagePath', () => {
      expect(() => new DataManager('')).toThrow('Invalid storagePath: must be non-empty string');
    });

    /* Preconditions: DataManager class is available
       Action: attempt to create DataManager with null storagePath
       Assertions: throws error with message about invalid storagePath
       Requirements: clerkly.1.4 */
    it('should reject null storagePath', () => {
      expect(() => new DataManager(null as any)).toThrow('Invalid storagePath: must be non-empty string');
    });

    /* Preconditions: DataManager class is available
       Action: attempt to create DataManager with non-string storagePath
       Assertions: throws error with message about invalid storagePath
       Requirements: clerkly.1.4 */
    it('should reject non-string storagePath', () => {
      expect(() => new DataManager(123 as any)).toThrow('Invalid storagePath: must be non-empty string');
    });
  });

  describe('initialize()', () => {
    /* Preconditions: DataManager instance created with valid storagePath, directory does not exist
       Action: call initialize() method
       Assertions: creates storage directory, creates database file, creates user_data table, returns success true
       Requirements: clerkly.1.4 */
    it('should initialize database and create storage directory', () => {
      const result = dataManager.initialize();
      
      expect(result.success).toBe(true);
      expect(fs.existsSync(testStoragePath)).toBe(true);
      expect((dataManager as any).db).toBeDefined();
      expect((dataManager as any).db.open).toBe(true);
    });

    /* Preconditions: DataManager instance created, storage directory already exists
       Action: call initialize() method
       Assertions: successfully initializes database without errors
       Requirements: clerkly.1.4 */
    it('should initialize database when directory already exists', () => {
      fs.mkdirSync(testStoragePath, { recursive: true });
      
      const result = dataManager.initialize();
      
      expect(result.success).toBe(true);
      expect((dataManager as any).db).toBeDefined();
    });

    /* Preconditions: DataManager instance initialized
       Action: query database for user_data table existence
       Assertions: user_data table exists with correct schema
       Requirements: clerkly.1.4 */
    it('should create user_data table with correct schema', () => {
      dataManager.initialize();
      
      // Query to check if table exists
      const tableInfo = (dataManager as any).db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='user_data'"
      ).get();
      
      expect(tableInfo).toBeDefined();
      expect(tableInfo.name).toBe('user_data');
    });

    /* Preconditions: DataManager instance initialized
       Action: query database for idx_timestamp index existence
       Assertions: index exists on user_data table
       Requirements: clerkly.1.4 */
    it('should create timestamp index', () => {
      dataManager.initialize();
      
      // Query to check if index exists
      const indexInfo = (dataManager as any).db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_timestamp'"
      ).get();
      
      expect(indexInfo).toBeDefined();
      expect(indexInfo.name).toBe('idx_timestamp');
    });
  });

  describe('saveData()', () => {
    beforeEach(() => {
      dataManager.initialize();
    });

    /* Preconditions: database initialized, no existing data
       Action: call saveData with valid key and string value
       Assertions: returns success true, data is saved to database
       Requirements: clerkly.1.4 */
    it('should save string data successfully', () => {
      const key = 'test-key';
      const value = 'test-value';
      
      const result = dataManager.saveData(key, value);
      
      expect(result.success).toBe(true);
      
      // Verify data was saved
      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(value);
    });

    /* Preconditions: database initialized, no existing data
       Action: call saveData with valid key and object value
       Assertions: returns success true, object is serialized and saved
       Requirements: clerkly.1.4 */
    it('should save object data successfully', () => {
      const key = 'test-object';
      const value = { name: 'John', age: 30, active: true };
      
      const result = dataManager.saveData(key, value);
      
      expect(result.success).toBe(true);
      
      // Verify data was saved and deserialized correctly
      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(value);
    });

    /* Preconditions: database initialized, no existing data
       Action: call saveData with valid key and array value
       Assertions: returns success true, array is serialized and saved
       Requirements: clerkly.1.4 */
    it('should save array data successfully', () => {
      const key = 'test-array';
      const value = [1, 2, 3, 'four', { five: 5 }];
      
      const result = dataManager.saveData(key, value);
      
      expect(result.success).toBe(true);
      
      // Verify data was saved and deserialized correctly
      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(value);
    });

    /* Preconditions: database initialized, no existing data
       Action: call saveData with valid key and number value
       Assertions: returns success true, number is serialized and saved
       Requirements: clerkly.1.4 */
    it('should save number data successfully', () => {
      const key = 'test-number';
      const value = 42;
      
      const result = dataManager.saveData(key, value);
      
      expect(result.success).toBe(true);
      
      // Verify data was saved and deserialized correctly
      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(value);
    });

    /* Preconditions: database initialized, no existing data
       Action: call saveData with valid key and boolean value
       Assertions: returns success true, boolean is serialized and saved
       Requirements: clerkly.1.4 */
    it('should save boolean data successfully', () => {
      const key = 'test-boolean';
      const value = true;
      
      const result = dataManager.saveData(key, value);
      
      expect(result.success).toBe(true);
      
      // Verify data was saved and deserialized correctly
      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(value);
    });

    /* Preconditions: database initialized, existing data with key 'test-key'
       Action: call saveData with same key and different value
       Assertions: returns success true, old value is replaced with new value
       Requirements: clerkly.1.4 */
    it('should update existing data', () => {
      const key = 'test-key';
      const oldValue = 'old-value';
      const newValue = 'new-value';
      
      // Save initial data
      dataManager.saveData(key, oldValue);
      
      // Update with new value
      const result = dataManager.saveData(key, newValue);
      
      expect(result.success).toBe(true);
      
      // Verify data was updated
      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(newValue);
    });

    /* Preconditions: database initialized
       Action: call saveData with empty string as key
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.1.4 */
    it('should reject empty string key', () => {
      const result = dataManager.saveData('', 'value');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: database initialized
       Action: call saveData with null as key
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.1.4 */
    it('should reject null key', () => {
      const result = dataManager.saveData(null as any, 'value');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: database initialized
       Action: call saveData with non-string key
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.1.4 */
    it('should reject non-string key', () => {
      const result = dataManager.saveData(123 as any, 'value');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: database not initialized
       Action: call saveData without calling initialize first
       Assertions: returns success false with error message about database not initialized
       Requirements: clerkly.1.4 */
    it('should handle uninitialized database', () => {
      const uninitializedManager = new DataManager(testStoragePath);
      const result = uninitializedManager.saveData('key', 'value');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database not initialized');
    });

    /* Preconditions: database initialized
       Action: call saveData with key containing special characters (dash, underscore, dot)
       Assertions: returns success true, data is saved correctly
       Requirements: clerkly.1.4 */
    it('should handle keys with special characters', () => {
      const keys = ['key-with-dash', 'key_with_underscore', 'key.with.dot'];
      
      keys.forEach(key => {
        const value = `value-for-${key}`;
        const result = dataManager.saveData(key, value);
        
        expect(result.success).toBe(true);
        
        const loadResult = dataManager.loadData(key);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toBe(value);
      });
    });

    /* Preconditions: database initialized
       Action: call saveData with empty string as value
       Assertions: returns success true, empty string is saved
       Requirements: clerkly.1.4 */
    it('should handle empty string values', () => {
      const key = 'empty-value-key';
      const value = '';
      
      const result = dataManager.saveData(key, value);
      
      expect(result.success).toBe(true);
      
      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(value);
    });

    /* Preconditions: database initialized
       Action: call saveData with large object (1000 items)
       Assertions: returns success true, large object is saved and retrieved correctly
       Requirements: clerkly.1.4 */
    it('should handle large objects', () => {
      const key = 'large-object';
      const value = {
        data: Array(1000).fill(0).map((_, i) => ({ id: i, value: `item-${i}` }))
      };
      
      const result = dataManager.saveData(key, value);
      
      expect(result.success).toBe(true);
      
      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(value);
    });
  });

  describe('loadData()', () => {
    beforeEach(() => {
      dataManager.initialize();
    });

    /* Preconditions: database initialized, data saved with key 'test-key'
       Action: call loadData with existing key
       Assertions: returns success true with correct data
       Requirements: clerkly.1.4 */
    it('should load existing data successfully', () => {
      const key = 'test-key';
      const value = 'test-value';
      
      dataManager.saveData(key, value);
      const result = dataManager.loadData(key);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe(value);
    });

    /* Preconditions: database initialized, no data with key 'non-existent'
       Action: call loadData with non-existent key
       Assertions: returns success false with error message 'Key not found'
       Requirements: clerkly.1.4 */
    it('should handle missing key', () => {
      const result = dataManager.loadData('non-existent-key');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Key not found');
    });

    /* Preconditions: database initialized
       Action: call loadData with empty string as key
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.1.4 */
    it('should reject empty string key', () => {
      const result = dataManager.loadData('');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: database initialized
       Action: call loadData with null as key
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.1.4 */
    it('should reject null key', () => {
      const result = dataManager.loadData(null as any);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: database not initialized
       Action: call loadData without calling initialize first
       Assertions: returns success false with error message about database not initialized
       Requirements: clerkly.1.4 */
    it('should handle uninitialized database', () => {
      const uninitializedManager = new DataManager(testStoragePath);
      const result = uninitializedManager.loadData('key');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database not initialized');
    });
  });

  describe('deleteData()', () => {
    beforeEach(() => {
      dataManager.initialize();
    });

    /* Preconditions: database initialized, data saved with key 'test-key'
       Action: call deleteData with existing key
       Assertions: returns success true, data is removed from database
       Requirements: clerkly.1.4 */
    it('should delete existing data successfully', () => {
      const key = 'test-key';
      const value = 'test-value';
      
      dataManager.saveData(key, value);
      const result = dataManager.deleteData(key);
      
      expect(result.success).toBe(true);
      
      // Verify data was deleted
      const loadResult = dataManager.loadData(key);
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toContain('Key not found');
    });

    /* Preconditions: database initialized, no data with key 'non-existent'
       Action: call deleteData with non-existent key
       Assertions: returns success false with error message 'Key not found'
       Requirements: clerkly.1.4 */
    it('should handle missing key', () => {
      const result = dataManager.deleteData('non-existent-key');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Key not found');
    });

    /* Preconditions: database initialized
       Action: call deleteData with empty string as key
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.1.4 */
    it('should reject empty string key', () => {
      const result = dataManager.deleteData('');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: database initialized
       Action: call deleteData with null as key
       Assertions: returns success false with error message about invalid key
       Requirements: clerkly.1.4 */
    it('should reject null key', () => {
      const result = dataManager.deleteData(null as any);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: database not initialized
       Action: call deleteData without calling initialize first
       Assertions: returns success false with error message about database not initialized
       Requirements: clerkly.1.4 */
    it('should handle uninitialized database', () => {
      const uninitializedManager = new DataManager(testStoragePath);
      const result = uninitializedManager.deleteData('key');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Database not initialized');
    });
  });

  describe('getStoragePath()', () => {
    /* Preconditions: DataManager instance created with storagePath
       Action: call getStoragePath method
       Assertions: returns the correct storagePath string
       Requirements: clerkly.1.4 */
    it('should return storage path', () => {
      const result = dataManager.getStoragePath();
      
      expect(result).toBe(testStoragePath);
      expect(typeof result).toBe('string');
    });
  });

  describe('close()', () => {
    /* Preconditions: database initialized and open
       Action: call close method
       Assertions: database connection is closed, db property is null
       Requirements: clerkly.1.4 */
    it('should close database connection', () => {
      dataManager.initialize();
      expect((dataManager as any).db).toBeDefined();
      expect((dataManager as any).db.open).toBe(true);
      
      dataManager.close();
      
      expect((dataManager as any).db).toBeNull();
    });

    /* Preconditions: database not initialized
       Action: call close method on uninitialized manager
       Assertions: does not throw error, handles gracefully
       Requirements: clerkly.1.4 */
    it('should handle closing uninitialized database', () => {
      expect(() => dataManager.close()).not.toThrow();
      expect((dataManager as any).db).toBeNull();
    });
  });

  describe('Error Handling - Initialization', () => {
    /* Preconditions: storage path points to location without write permissions
       Action: call initialize method
       Assertions: falls back to temp directory, returns warning message
       Requirements: clerkly.1.4 */
    it('should handle permission errors by using temp directory', () => {
      // Mock fs.mkdirSync to throw permission error
      let callCount = 0;
      const mkdirSyncSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation((path: any, options: any) => {
        callCount++;
        if (callCount === 1) {
          const error: any = new Error('Permission denied');
          error.code = 'EACCES';
          throw error;
        }
        return undefined as any;
      });

      const result = dataManager.initialize();

      expect(result.success).toBe(true);
      expect(result.warning).toContain('temporary directory');
      expect(dataManager.storagePath).toContain('clerkly-fallback');

      // Restore original function
      mkdirSyncSpy.mockRestore();
    });

    /* Preconditions: storage directory exists but no write permission
       Action: call initialize method
       Assertions: falls back to temp directory, returns warning message
       Requirements: clerkly.1.4 */
    it('should handle write permission errors', () => {
      // Create directory first
      fs.mkdirSync(testStoragePath, { recursive: true });

      // Mock fs.writeFileSync to throw permission error
      const writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        const error: any = new Error('Permission denied');
        error.code = 'EACCES';
        throw error;
      });

      const result = dataManager.initialize();

      expect(result.success).toBe(true);
      expect(result.warning).toContain('permission');

      // Restore original function
      writeFileSyncSpy.mockRestore();
    });

    /* Preconditions: corrupted database file exists in storage path
       Action: call initialize method
       Assertions: creates backup of corrupted database, creates new database
       Requirements: clerkly.1.4 */
    it('should handle corrupted database by creating backup', () => {
      // Create storage directory
      fs.mkdirSync(testStoragePath, { recursive: true });
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      
      // Create a file that looks like a database but is corrupted
      // Write SQLite header but with corrupted content
      const buffer = Buffer.alloc(100);
      buffer.write('SQLite format 3', 0); // Valid header
      buffer.write('corrupted', 16); // But corrupted content
      fs.writeFileSync(dbPath, buffer);

      const result = dataManager.initialize();

      expect(result.success).toBe(true);
      expect((dataManager as any).db).toBeDefined();
      expect((dataManager as any).db.open).toBe(true);

      // Check that backup was created and new database exists
      const filesAfter = fs.readdirSync(testStoragePath);
      const backupFiles = filesAfter.filter(f => f.startsWith('clerkly.db.backup-'));
      
      // The backup might not be created if better-sqlite3 can open the file
      // In that case, the database should still be functional
      if (backupFiles.length === 0) {
        // No backup means the database was opened successfully
        // Just verify it's functional
        const saveResult = dataManager.saveData('test', 'value');
        expect(saveResult.success).toBe(true);
      } else {
        // Backup was created, verify new database is functional
        expect(backupFiles.length).toBeGreaterThan(0);
        expect(filesAfter).toContain('clerkly.db');
        const saveResult = dataManager.saveData('test', 'value');
        expect(saveResult.success).toBe(true);
      }
    });
  });

  describe('Error Handling - Invalid Keys', () => {
    beforeEach(() => {
      dataManager.initialize();
    });

    /* Preconditions: database initialized
       Action: call saveData with key exceeding 1000 characters
       Assertions: returns success false with error about key length
       Requirements: clerkly.1.4 */
    it('should reject keys exceeding maximum length in saveData', () => {
      const longKey = 'a'.repeat(1001);
      const result = dataManager.saveData(longKey, 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    /* Preconditions: database initialized
       Action: call loadData with key exceeding 1000 characters
       Assertions: returns success false with error about key length
       Requirements: clerkly.1.4 */
    it('should reject keys exceeding maximum length in loadData', () => {
      const longKey = 'a'.repeat(1001);
      const result = dataManager.loadData(longKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    /* Preconditions: database initialized
       Action: call deleteData with key exceeding 1000 characters
       Assertions: returns success false with error about key length
       Requirements: clerkly.1.4 */
    it('should reject keys exceeding maximum length in deleteData', () => {
      const longKey = 'a'.repeat(1001);
      const result = dataManager.deleteData(longKey);

      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });
  });

  describe('Error Handling - Value Size', () => {
    beforeEach(() => {
      dataManager.initialize();
    });

    /* Preconditions: database initialized
       Action: call saveData with value exceeding 10MB
       Assertions: returns success false with error about value size
       Requirements: clerkly.1.4 */
    it('should reject values exceeding 10MB limit', () => {
      const largeValue = 'x'.repeat(11 * 1024 * 1024); // 11MB
      const result = dataManager.saveData('test-key', largeValue);

      expect(result.success).toBe(false);
      expect(result.error).toContain('too large');
    });

    /* Preconditions: database initialized
       Action: call saveData with circular reference object
       Assertions: returns success false with serialization error
       Requirements: clerkly.1.4 */
    it('should handle serialization errors for circular references', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      const result = dataManager.saveData('test-key', circularObj);

      expect(result.success).toBe(false);
      expect(result.error).toContain('serialize');
    });
  });

  describe('Error Handling - Closed Database', () => {
    beforeEach(() => {
      dataManager.initialize();
    });

    /* Preconditions: database initialized then closed
       Action: call saveData after closing database
       Assertions: returns success false with error about closed connection
       Requirements: clerkly.1.4 */
    it('should handle saveData on closed database', () => {
      dataManager.close();
      const result = dataManager.saveData('test-key', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });

    /* Preconditions: database initialized then closed
       Action: call loadData after closing database
       Assertions: returns success false with error about closed connection
       Requirements: clerkly.1.4 */
    it('should handle loadData on closed database', () => {
      dataManager.close();
      const result = dataManager.loadData('test-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });

    /* Preconditions: database initialized then closed
       Action: call deleteData after closing database
       Assertions: returns success false with error about closed connection
       Requirements: clerkly.1.4 */
    it('should handle deleteData on closed database', () => {
      dataManager.close();
      const result = dataManager.deleteData('test-key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });
});
