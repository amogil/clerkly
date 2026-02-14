// Requirements: database-refactoring.1, user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.6.4

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseManager } from '../../src/main/DatabaseManager';
import type { UserManager } from '../../src/main/auth/UserManager';

// Mock fs module for permission error tests
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn(originalFs.existsSync),
    mkdirSync: jest.fn(originalFs.mkdirSync),
    copyFileSync: jest.fn(originalFs.copyFileSync),
    unlinkSync: jest.fn(originalFs.unlinkSync),
    writeFileSync: jest.fn(originalFs.writeFileSync),
    readdirSync: jest.fn(originalFs.readdirSync),
    statSync: jest.fn(originalFs.statSync),
    rmdirSync: jest.fn(originalFs.rmdirSync),
  };
});

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('DatabaseManager', () => {
  let databaseManager: DatabaseManager;
  let testStoragePath: string;
  let testDbPath: string;
  let mockUserManager: jest.Mocked<UserManager>;
  const originalFs = jest.requireActual('fs');

  beforeEach(() => {
    // Reset all mocks to use original implementations
    mockedFs.existsSync.mockImplementation(originalFs.existsSync);
    mockedFs.mkdirSync.mockImplementation(originalFs.mkdirSync);
    mockedFs.copyFileSync.mockImplementation(originalFs.copyFileSync);
    mockedFs.unlinkSync.mockImplementation(originalFs.unlinkSync);
    mockedFs.writeFileSync.mockImplementation(originalFs.writeFileSync);
    mockedFs.readdirSync.mockImplementation(originalFs.readdirSync);
    mockedFs.statSync.mockImplementation(originalFs.statSync);
    mockedFs.rmdirSync.mockImplementation(originalFs.rmdirSync);

    // Create temporary storage directory
    testStoragePath = originalFs.mkdtempSync(path.join(os.tmpdir(), 'dbmanager-test-'));
    testDbPath = path.join(testStoragePath, 'clerkly.db');

    // Ensure migrations directory exists for tests
    const migrationsPath = path.join(__dirname, '..', '..', 'migrations');
    if (!originalFs.existsSync(migrationsPath)) {
      originalFs.mkdirSync(migrationsPath, { recursive: true });
    }

    // Mock UserManager for data isolation tests
    mockUserManager = {
      getCurrentUserId: jest.fn().mockReturnValue('testUserId123'),
    } as unknown as jest.Mocked<UserManager>;
  });

  afterEach(() => {
    // Clean up
    if (databaseManager) {
      try {
        databaseManager.close();
      } catch {
        // Ignore close errors in cleanup
      }
    }

    // Remove test files using original fs
    if (originalFs.existsSync(testDbPath)) {
      originalFs.unlinkSync(testDbPath);
    }

    // Remove storage directory
    if (originalFs.existsSync(testStoragePath)) {
      const files = originalFs.readdirSync(testStoragePath);
      files.forEach((file: string) => {
        const filePath = path.join(testStoragePath, file);
        if (originalFs.statSync(filePath).isFile()) {
          originalFs.unlinkSync(filePath);
        }
      });
      originalFs.rmdirSync(testStoragePath);
    }
  });

  describe('getDatabase', () => {
    /* Preconditions: DatabaseManager not initialized (no initialize() called)
       Action: call getDatabase()
       Assertions: returns null (legacy behavior)
       Requirements: database-refactoring.1.1, user-data-isolation.6.2 */
    it('should return null when database not initialized', () => {
      databaseManager = new DatabaseManager();

      expect(databaseManager.getDatabase()).toBeNull();
    });

    /* Preconditions: DatabaseManager not initialized (no initialize() called)
       Action: call getDatabaseStrict()
       Assertions: throws Error('Database not initialized')
       Requirements: database-refactoring.1.1, user-data-isolation.6.2 */
    it('should throw error when database not initialized (strict mode)', () => {
      databaseManager = new DatabaseManager();

      expect(() => databaseManager.getDatabaseStrict()).toThrow('Database not initialized');
    });

    /* Preconditions: DatabaseManager initialized with valid storage path
       Action: call getDatabase()
       Assertions: returns valid Database instance
       Requirements: database-refactoring.1.1, user-data-isolation.6.2 */
    it('should return database instance after initialization', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const db = databaseManager.getDatabase();

      expect(db).toBeDefined();
      expect(db).toBeInstanceOf(Database);
      expect(db!.open).toBe(true);
    });

    /* Preconditions: DatabaseManager created with db in constructor (legacy mode)
       Action: call getDatabase()
       Assertions: returns the db passed to constructor
       Requirements: database-refactoring.1.1, user-data-isolation.6.2 */
    it('should return database instance from constructor (legacy mode)', () => {
      // Create a test database
      const testDb = new Database(':memory:');
      databaseManager = new DatabaseManager(testDb);

      const db = databaseManager.getDatabase();

      expect(db).toBe(testDb);
      testDb.close();
    });
  });

  describe('getCurrentUserId', () => {
    /* Preconditions: DatabaseManager initialized, UserManager not set
       Action: call getCurrentUserId()
       Assertions: returns null (legacy behavior)
       Requirements: database-refactoring.1.2, user-data-isolation.6.3, user-data-isolation.6.4 */
    it('should return null when no user logged in', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);
      // UserManager NOT set

      expect(databaseManager.getCurrentUserId()).toBeNull();
    });

    /* Preconditions: DatabaseManager initialized, UserManager not set
       Action: call getCurrentUserIdStrict()
       Assertions: throws Error('No user logged in')
       Requirements: database-refactoring.1.2, user-data-isolation.6.3, user-data-isolation.6.4 */
    it('should throw error when no user logged in (strict mode)', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);
      // UserManager NOT set

      expect(() => databaseManager.getCurrentUserIdStrict()).toThrow('No user logged in');
    });

    /* Preconditions: DatabaseManager initialized, UserManager set but returns null
       Action: call getCurrentUserIdStrict()
       Assertions: throws Error('No user logged in')
       Requirements: database-refactoring.1.2, user-data-isolation.6.4 */
    it('should throw error when UserManager returns null userId (strict mode)', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const mockUserManagerNoUser = {
        getCurrentUserId: jest.fn().mockReturnValue(null),
      } as unknown as jest.Mocked<UserManager>;

      databaseManager.setUserManager(mockUserManagerNoUser);

      expect(() => databaseManager.getCurrentUserIdStrict()).toThrow('No user logged in');
    });

    /* Preconditions: DatabaseManager initialized, UserManager set with valid user
       Action: call getCurrentUserId()
       Assertions: returns correct user_id from UserManager
       Requirements: database-refactoring.1.1, user-data-isolation.6.3 */
    it('should return current user_id from UserManager', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);
      databaseManager.setUserManager(mockUserManager);

      const userId = databaseManager.getCurrentUserId();

      expect(userId).toBe('testUserId123');
      expect(mockUserManager.getCurrentUserId).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    /* Preconditions: DatabaseManager initialized with open database
       Action: call close()
       Assertions: database connection closed, subsequent getDatabase() returns null
       Requirements: database-refactoring.1.1 */
    it('should close database connection', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      // Verify database is open
      const dbBefore = databaseManager.getDatabase();
      expect(dbBefore).not.toBeNull();
      expect(dbBefore!.open).toBe(true);

      // Close database
      databaseManager.close();

      // Verify getDatabase returns null after close
      expect(databaseManager.getDatabase()).toBeNull();
    });

    /* Preconditions: DatabaseManager not initialized
       Action: call close()
       Assertions: no error thrown (safe to call on uninitialized manager)
       Requirements: database-refactoring.1.1 */
    it('should not throw when closing uninitialized database', () => {
      databaseManager = new DatabaseManager();

      expect(() => databaseManager.close()).not.toThrow();
    });

    /* Preconditions: DatabaseManager initialized, close() already called
       Action: call close() again
       Assertions: no error thrown (idempotent operation)
       Requirements: database-refactoring.1.1 */
    it('should be idempotent - multiple close calls should not throw', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      databaseManager.close();
      expect(() => databaseManager.close()).not.toThrow();
    });
  });

  describe('initialize', () => {
    /* Preconditions: storage directory does not exist, no database file exists
       Action: create DatabaseManager and call initialize()
       Assertions: returns success true, directory created, database file created, migrations run
       Requirements: database-refactoring.1.1, user-data-isolation.6.1, user-data-isolation.6.7 */
    it('should successfully initialize storage and run migrations', () => {
      databaseManager = new DatabaseManager();
      const result = databaseManager.initialize(testStoragePath);

      expect(result.success).toBe(true);
      expect(fs.existsSync(testStoragePath)).toBe(true);
      expect(fs.existsSync(testDbPath)).toBe(true);
      expect(result.migrations).toBeDefined();
      expect(result.migrations?.success).toBe(true);
    });

    /* Preconditions: storage directory exists with write permissions
       Action: create DatabaseManager and call initialize()
       Assertions: returns success true, no warning about fallback
       Requirements: database-refactoring.1.1, user-data-isolation.6.1 */
    it('should initialize successfully when directory already exists', () => {
      // Pre-create directory
      originalFs.mkdirSync(testStoragePath, { recursive: true });

      databaseManager = new DatabaseManager();
      const result = databaseManager.initialize(testStoragePath);

      expect(result.success).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    /* Preconditions: database file exists but is corrupted
       Action: create DatabaseManager and call initialize()
       Assertions: backup created, corrupted db deleted, new db created, returns success true
       Requirements: database-refactoring.1.1, user-data-isolation.6.1 */
    it('should handle corrupted database by creating backup and recreating', () => {
      // Create corrupted database file
      originalFs.mkdirSync(testStoragePath, { recursive: true });
      originalFs.writeFileSync(testDbPath, 'CORRUPTED DATA NOT A VALID SQLITE FILE');

      databaseManager = new DatabaseManager();
      const result = databaseManager.initialize(testStoragePath);

      expect(result.success).toBe(true);

      // Check backup was created
      const files = originalFs.readdirSync(testStoragePath);
      const backupFiles = files.filter((f: string) => f.startsWith('clerkly.db.backup-'));
      expect(backupFiles.length).toBe(1);

      // Check new database is valid
      expect(originalFs.existsSync(testDbPath)).toBe(true);
      const db = new Database(testDbPath);
      expect(() => db.prepare('SELECT 1').get()).not.toThrow();
      db.close();
    });

    /* Preconditions: storage directory cannot be created due to permission error (EACCES)
       Action: create DatabaseManager and call initialize()
       Assertions: falls back to temp directory, returns success with warning
       Requirements: database-refactoring.1.1, user-data-isolation.6.1 */
    it('should fallback to temp directory on EACCES permission error', () => {
      const restrictedPath = '/restricted/path/that/does/not/exist';

      // Mock existsSync to return false for restricted path
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        if (p === restrictedPath) return false;
        return originalFs.existsSync(p);
      });

      // Mock mkdirSync to throw EACCES for restricted path
      mockedFs.mkdirSync.mockImplementation(
        (p: fs.PathLike, options?: fs.Mode | fs.MakeDirectoryOptions | null) => {
          if (p === restrictedPath) {
            const error: NodeJS.ErrnoException = new Error('Permission denied');
            error.code = 'EACCES';
            throw error;
          }
          return originalFs.mkdirSync(p, options as fs.MakeDirectoryOptions);
        }
      );

      databaseManager = new DatabaseManager();
      const result = databaseManager.initialize(restrictedPath);

      expect(result.success).toBe(true);
      expect(result.warning).toBe('Using temporary directory');
      expect(result.path).toContain('clerkly-fallback');
    });

    /* Preconditions: storage directory cannot be created due to permission error (EPERM)
       Action: create DatabaseManager and call initialize()
       Assertions: falls back to temp directory, returns success with warning
       Requirements: database-refactoring.1.1, user-data-isolation.6.1 */
    it('should fallback to temp directory on EPERM permission error', () => {
      const restrictedPath = '/restricted/eperm/path';

      // Mock existsSync to return false for restricted path
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        if (p === restrictedPath) return false;
        return originalFs.existsSync(p);
      });

      // Mock mkdirSync to throw EPERM for restricted path
      mockedFs.mkdirSync.mockImplementation(
        (p: fs.PathLike, options?: fs.Mode | fs.MakeDirectoryOptions | null) => {
          if (p === restrictedPath) {
            const error: NodeJS.ErrnoException = new Error('Operation not permitted');
            error.code = 'EPERM';
            throw error;
          }
          return originalFs.mkdirSync(p, options as fs.MakeDirectoryOptions);
        }
      );

      databaseManager = new DatabaseManager();
      const result = databaseManager.initialize(restrictedPath);

      expect(result.success).toBe(true);
      expect(result.warning).toBe('Using temporary directory');
      expect(result.path).toContain('clerkly-fallback');
    });

    /* Preconditions: storage directory cannot be created due to other error (not permission)
       Action: create DatabaseManager and call initialize()
       Assertions: throws error with original message
       Requirements: database-refactoring.1.1 */
    it('should throw error on non-permission directory creation error', () => {
      const badPath = '/some/bad/path';

      // Mock existsSync to return false
      mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
        if (p === badPath) return false;
        return originalFs.existsSync(p);
      });

      // Mock mkdirSync to throw generic error
      mockedFs.mkdirSync.mockImplementation(
        (p: fs.PathLike, _options?: fs.Mode | fs.MakeDirectoryOptions | null) => {
          if (p === badPath) {
            const error: NodeJS.ErrnoException = new Error('Some other error');
            error.code = 'ENOENT';
            throw error;
          }
          return originalFs.mkdirSync(p);
        }
      );

      databaseManager = new DatabaseManager();

      expect(() => databaseManager.initialize(badPath)).toThrow('Failed to initialize storage');
    });
  });

  describe('setUserManager', () => {
    /* Preconditions: DatabaseManager initialized
       Action: call setUserManager with valid UserManager
       Assertions: subsequent getCurrentUserId() returns user_id from UserManager
       Requirements: database-refactoring.1.1 */
    it('should set UserManager for data isolation', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      databaseManager.setUserManager(mockUserManager);

      const userId = databaseManager.getCurrentUserId();
      expect(userId).toBe('testUserId123');
    });
  });

  describe('setDatabase', () => {
    /* Preconditions: DatabaseManager created without db
       Action: call setDatabase with valid Database instance
       Assertions: subsequent getDatabase() returns the set database
       Requirements: database-refactoring.1.1 */
    it('should set database instance (legacy mode)', () => {
      databaseManager = new DatabaseManager();
      const testDb = new Database(':memory:');

      databaseManager.setDatabase(testDb);

      expect(databaseManager.getDatabase()).toBe(testDb);
      testDb.close();
    });

    /* Preconditions: DatabaseManager with existing db
       Action: call setDatabase with null
       Assertions: subsequent getDatabase() returns null
       Requirements: database-refactoring.1.1 */
    it('should allow setting database to null', () => {
      const testDb = new Database(':memory:');
      databaseManager = new DatabaseManager(testDb);

      databaseManager.setDatabase(null);

      expect(databaseManager.getDatabase()).toBeNull();
      testDb.close();
    });
  });

  describe('getDatabaseStrict', () => {
    /* Preconditions: DatabaseManager initialized with valid storage path
       Action: call getDatabaseStrict()
       Assertions: returns valid Database instance
       Requirements: database-refactoring.1.1, user-data-isolation.6.2 */
    it('should return database instance after initialization', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const db = databaseManager.getDatabaseStrict();

      expect(db).toBeDefined();
      expect(db).toBeInstanceOf(Database);
      expect(db.open).toBe(true);
    });
  });

  describe('getCurrentUserIdStrict', () => {
    /* Preconditions: DatabaseManager initialized, UserManager set with valid user
       Action: call getCurrentUserIdStrict()
       Assertions: returns correct user_id from UserManager
       Requirements: database-refactoring.1.1, user-data-isolation.6.3 */
    it('should return current user_id from UserManager', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);
      databaseManager.setUserManager(mockUserManager);

      const userId = databaseManager.getCurrentUserIdStrict();

      expect(userId).toBe('testUserId123');
    });
  });

  describe('getStoragePath', () => {
    /* Preconditions: DatabaseManager not initialized
       Action: call getStoragePath()
       Assertions: returns null
       Requirements: database-refactoring.1.1 */
    it('should return null when not initialized', () => {
      databaseManager = new DatabaseManager();

      expect(databaseManager.getStoragePath()).toBeNull();
    });

    /* Preconditions: DatabaseManager initialized with specific path
       Action: call getStoragePath()
       Assertions: returns the path provided in initialize()
       Requirements: database-refactoring.1.1 */
    it('should return storage path after initialization', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      expect(databaseManager.getStoragePath()).toBe(testStoragePath);
    });
  });

  describe('getMigrationRunner', () => {
    /* Preconditions: DatabaseManager not initialized
       Action: call getMigrationRunner()
       Assertions: throws Error('Database not initialized')
       Requirements: database-refactoring.1.1 */
    it('should throw error when database not initialized', () => {
      databaseManager = new DatabaseManager();

      expect(() => databaseManager.getMigrationRunner()).toThrow('Database not initialized');
    });

    /* Preconditions: DatabaseManager initialized
       Action: call getMigrationRunner()
       Assertions: returns MigrationRunner instance
       Requirements: database-refactoring.1.1 */
    it('should return MigrationRunner after initialization', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const runner = databaseManager.getMigrationRunner();

      expect(runner).toBeDefined();
      expect(typeof runner.runMigrations).toBe('function');
    });

    /* Preconditions: DatabaseManager created with db in constructor (legacy mode), no initialize called
       Action: call getMigrationRunner()
       Assertions: creates and returns new MigrationRunner instance
       Requirements: database-refactoring.1.1 */
    it('should create MigrationRunner when not initialized via initialize() (legacy mode)', () => {
      // Create a test database with migrations table
      const testDb = new Database(':memory:');
      testDb.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY,
          version INTEGER NOT NULL UNIQUE,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `);

      databaseManager = new DatabaseManager(testDb);

      const runner = databaseManager.getMigrationRunner();

      expect(runner).toBeDefined();
      expect(typeof runner.runMigrations).toBe('function');
      testDb.close();
    });

    /* Preconditions: DatabaseManager initialized, getMigrationRunner called twice
       Action: call getMigrationRunner() twice
       Assertions: returns same MigrationRunner instance (cached)
       Requirements: database-refactoring.1.1 */
    it('should return cached MigrationRunner on subsequent calls', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const runner1 = databaseManager.getMigrationRunner();
      const runner2 = databaseManager.getMigrationRunner();

      expect(runner1).toBe(runner2);
    });
  });
});

// ============================================
// Phase 3: Query API Tests
// Requirements: user-data-isolation.6.3, user-data-isolation.6.4, user-data-isolation.6.5, user-data-isolation.6.6, user-data-isolation.6.10
// ============================================

describe('DatabaseManager Query API', () => {
  let databaseManager: DatabaseManager;
  let mockUserManager: jest.Mocked<UserManager>;

  beforeEach(() => {
    // Create in-memory database for Query API tests
    const testDb = new Database(':memory:');

    // Create test table for user data
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS user_data (
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (key, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_user_id ON user_data(user_id);
    `);

    // Create test table for global data (window_state)
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS window_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    databaseManager = new DatabaseManager(testDb);

    // Mock UserManager
    mockUserManager = {
      getCurrentUserId: jest.fn().mockReturnValue('user123'),
    } as unknown as jest.Mocked<UserManager>;
  });

  afterEach(() => {
    if (databaseManager) {
      try {
        databaseManager.close();
      } catch {
        // Ignore close errors in cleanup
      }
    }
  });

  // ============================================
  // 3.1. Tests for methods with user_id
  // Requirements: user-data-isolation.6.3, user-data-isolation.6.5, user-data-isolation.6.6
  // ============================================

  describe('runUserQuery', () => {
    /* Preconditions: DatabaseManager initialized with UserManager, empty user_data table
       Action: call runUserQuery with INSERT statement
       Assertions: user_id is prepended to params, data inserted with correct user_id
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should prepend user_id to params', () => {
      databaseManager.setUserManager(mockUserManager);
      const now = Date.now();

      // SQL expects: user_id (1st), key (2nd), value (3rd), created_at (4th), updated_at (5th)
      // Params: [key, value, created_at, updated_at] - user_id will be prepended
      databaseManager.runUserQuery(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['testKey', 'testValue', now, now]
      );

      // Verify data was inserted with correct user_id
      const db = databaseManager.getDatabase()!;
      const row = db.prepare('SELECT * FROM user_data WHERE key = ?').get('testKey') as {
        key: string;
        value: string;
        user_id: string;
      };

      expect(row).toBeDefined();
      expect(row.user_id).toBe('user123');
      expect(row.key).toBe('testKey');
      expect(row.value).toBe('testValue');
    });

    /* Preconditions: DatabaseManager initialized with UserManager, empty user_data table
       Action: call runUserQuery with INSERT statement
       Assertions: INSERT executes successfully, returns RunResult with changes = 1
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should execute INSERT with user_id', () => {
      databaseManager.setUserManager(mockUserManager);
      const now = Date.now();

      const result = databaseManager.runUserQuery(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        ['insertKey', 'insertValue', now, now]
      );

      expect(result.changes).toBe(1);

      // Verify data exists
      const db = databaseManager.getDatabase()!;
      const row = db.prepare('SELECT * FROM user_data WHERE key = ?').get('insertKey');
      expect(row).toBeDefined();
    });

    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with existing row
       Action: call runUserQuery with UPDATE statement
       Assertions: UPDATE executes successfully, data updated for correct user_id
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should execute UPDATE with user_id', () => {
      databaseManager.setUserManager(mockUserManager);
      const db = databaseManager.getDatabase()!;
      const now = Date.now();

      // Insert initial data
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('user123', 'updateKey', 'oldValue', now, now);

      // Update using runUserQuery
      // Note: user_id is prepended as FIRST parameter
      // SQL must have user_id placeholder FIRST in WHERE clause
      // For UPDATE, we embed SET values in SQL to keep user_id as first placeholder
      const result = databaseManager.runUserQuery(
        `UPDATE user_data SET value = 'newValue', updated_at = ${now} WHERE user_id = ? AND key = ?`,
        ['updateKey']
      );

      expect(result.changes).toBe(1);

      // Verify data was updated
      const row = db.prepare('SELECT * FROM user_data WHERE key = ?').get('updateKey') as {
        value: string;
      };
      expect(row.value).toBe('newValue');
    });

    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with existing row
       Action: call runUserQuery with DELETE statement
       Assertions: DELETE executes successfully, data deleted for correct user_id
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should execute DELETE with user_id', () => {
      databaseManager.setUserManager(mockUserManager);
      const db = databaseManager.getDatabase()!;
      const now = Date.now();

      // Insert initial data
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('user123', 'deleteKey', 'deleteValue', now, now);

      // Delete using runUserQuery - user_id is prepended as FIRST parameter
      const result = databaseManager.runUserQuery(
        'DELETE FROM user_data WHERE user_id = ? AND key = ?',
        ['deleteKey']
      );

      expect(result.changes).toBe(1);

      // Verify data was deleted
      const row = db.prepare('SELECT * FROM user_data WHERE key = ?').get('deleteKey');
      expect(row).toBeUndefined();
    });

    /* Preconditions: DatabaseManager initialized, UserManager NOT set
       Action: call runUserQuery
       Assertions: throws Error('No user logged in')
       Requirements: user-data-isolation.6.6 */
    it('should throw "No user logged in" when no user', () => {
      // UserManager NOT set

      expect(() =>
        databaseManager.runUserQuery(
          'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          ['key', 'value', Date.now(), Date.now()]
        )
      ).toThrow('No user logged in');
    });
  });

  describe('getUserRow', () => {
    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with data
       Action: call getUserRow with SELECT statement
       Assertions: user_id is prepended to params, returns row filtered by user_id
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should prepend user_id to params', () => {
      databaseManager.setUserManager(mockUserManager);
      const db = databaseManager.getDatabase()!;
      const now = Date.now();

      // Insert data for user123
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('user123', 'rowKey', 'rowValue', now, now);

      // Query using getUserRow - user_id is prepended as FIRST parameter
      const row = databaseManager.getUserRow<{ key: string; value: string; user_id: string }>(
        'SELECT * FROM user_data WHERE user_id = ? AND key = ?',
        ['rowKey']
      );

      expect(row).toBeDefined();
      expect(row!.user_id).toBe('user123');
      expect(row!.key).toBe('rowKey');
      expect(row!.value).toBe('rowValue');
    });

    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with data for user123
       Action: call getUserRow with SELECT statement
       Assertions: returns single row filtered by user_id
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should return single row filtered by user_id', () => {
      databaseManager.setUserManager(mockUserManager);
      const db = databaseManager.getDatabase()!;
      const now = Date.now();

      // Insert data for user123
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('user123', 'singleKey', 'singleValue', now, now);

      // Insert data for different user
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('otherUser', 'singleKey', 'otherValue', now, now);

      // Query using getUserRow - should only return user123's data
      const row = databaseManager.getUserRow<{ value: string }>(
        'SELECT value FROM user_data WHERE user_id = ? AND key = ?',
        ['singleKey']
      );

      expect(row).toBeDefined();
      expect(row!.value).toBe('singleValue');
    });

    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with no matching data
       Action: call getUserRow with SELECT statement for non-existent key
       Assertions: returns undefined
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should return undefined when no match', () => {
      databaseManager.setUserManager(mockUserManager);

      const row = databaseManager.getUserRow<{ value: string }>(
        'SELECT value FROM user_data WHERE user_id = ? AND key = ?',
        ['nonExistentKey']
      );

      expect(row).toBeUndefined();
    });

    /* Preconditions: DatabaseManager initialized, UserManager NOT set
       Action: call getUserRow
       Assertions: throws Error('No user logged in')
       Requirements: user-data-isolation.6.6 */
    it('should throw "No user logged in" when no user', () => {
      // UserManager NOT set

      expect(() =>
        databaseManager.getUserRow<{ value: string }>(
          'SELECT value FROM user_data WHERE user_id = ? AND key = ?',
          ['key']
        )
      ).toThrow('No user logged in');
    });
  });

  describe('getUserRows', () => {
    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with multiple rows
       Action: call getUserRows with SELECT statement
       Assertions: user_id is prepended to params, returns all rows filtered by user_id
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should prepend user_id to params', () => {
      databaseManager.setUserManager(mockUserManager);
      const db = databaseManager.getDatabase()!;
      const now = Date.now();

      // Insert multiple rows for user123
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('user123', 'key1', 'value1', now, now);
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('user123', 'key2', 'value2', now, now);

      // Query using getUserRows - user_id is prepended as FIRST parameter
      const rows = databaseManager.getUserRows<{ key: string; value: string; user_id: string }>(
        'SELECT * FROM user_data WHERE user_id = ?',
        []
      );

      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.user_id === 'user123')).toBe(true);
    });

    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with data for multiple users
       Action: call getUserRows with SELECT statement
       Assertions: returns all rows filtered by user_id (only user123's data)
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should return all rows filtered by user_id', () => {
      databaseManager.setUserManager(mockUserManager);
      const db = databaseManager.getDatabase()!;
      const now = Date.now();

      // Insert rows for user123
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('user123', 'userKey1', 'userValue1', now, now);
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('user123', 'userKey2', 'userValue2', now, now);

      // Insert rows for different user
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('otherUser', 'otherKey1', 'otherValue1', now, now);

      // Query using getUserRows - should only return user123's data
      const rows = databaseManager.getUserRows<{ key: string; value: string }>(
        'SELECT key, value FROM user_data WHERE user_id = ?',
        []
      );

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.key).sort()).toEqual(['userKey1', 'userKey2']);
    });

    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with no data for user123
       Action: call getUserRows with SELECT statement
       Assertions: returns empty array
       Requirements: user-data-isolation.6.3, user-data-isolation.6.5 */
    it('should return empty array when no matches', () => {
      databaseManager.setUserManager(mockUserManager);
      const db = databaseManager.getDatabase()!;
      const now = Date.now();

      // Insert data for different user only
      db.prepare(
        'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('otherUser', 'otherKey', 'otherValue', now, now);

      // Query using getUserRows - should return empty array for user123
      const rows = databaseManager.getUserRows<{ key: string; value: string }>(
        'SELECT key, value FROM user_data WHERE user_id = ?',
        []
      );

      expect(rows).toEqual([]);
    });

    /* Preconditions: DatabaseManager initialized, UserManager NOT set
       Action: call getUserRows
       Assertions: throws Error('No user logged in')
       Requirements: user-data-isolation.6.6 */
    it('should throw "No user logged in" when no user', () => {
      // UserManager NOT set

      expect(() =>
        databaseManager.getUserRows<{ value: string }>(
          'SELECT value FROM user_data WHERE user_id = ?',
          []
        )
      ).toThrow('No user logged in');
    });
  });

  // ============================================
  // 3.2. Tests for global methods (without user_id)
  // Requirements: user-data-isolation.6.4, user-data-isolation.6.10
  // ============================================

  describe('runQuery', () => {
    /* Preconditions: DatabaseManager initialized (UserManager NOT required), empty window_state table
       Action: call runQuery with INSERT statement
       Assertions: INSERT executes successfully without requiring user_id
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should not require user_id', () => {
      // Note: UserManager NOT set - global queries should work without it

      const result = databaseManager.runQuery(
        'INSERT INTO window_state (key, value) VALUES (?, ?)',
        ['globalKey', 'globalValue']
      );

      expect(result.changes).toBe(1);

      // Verify data exists
      const db = databaseManager.getDatabase()!;
      const row = db.prepare('SELECT * FROM window_state WHERE key = ?').get('globalKey');
      expect(row).toBeDefined();
    });

    /* Preconditions: DatabaseManager initialized, empty window_state table
       Action: call runQuery with INSERT statement
       Assertions: INSERT executes successfully, returns RunResult with changes = 1
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should execute INSERT without user_id', () => {
      const result = databaseManager.runQuery(
        'INSERT INTO window_state (key, value) VALUES (?, ?)',
        ['insertGlobalKey', JSON.stringify({ width: 800, height: 600 })]
      );

      expect(result.changes).toBe(1);
    });

    /* Preconditions: DatabaseManager initialized, window_state table with existing row
       Action: call runQuery with UPDATE statement
       Assertions: UPDATE executes successfully, data updated
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should execute UPDATE without user_id', () => {
      const db = databaseManager.getDatabase()!;

      // Insert initial data
      db.prepare('INSERT INTO window_state (key, value) VALUES (?, ?)').run(
        'updateGlobalKey',
        'oldValue'
      );

      // Update using runQuery
      const result = databaseManager.runQuery('UPDATE window_state SET value = ? WHERE key = ?', [
        'newValue',
        'updateGlobalKey',
      ]);

      expect(result.changes).toBe(1);

      // Verify data was updated
      const row = db.prepare('SELECT * FROM window_state WHERE key = ?').get('updateGlobalKey') as {
        value: string;
      };
      expect(row.value).toBe('newValue');
    });

    /* Preconditions: DatabaseManager initialized, window_state table with existing row
       Action: call runQuery with DELETE statement
       Assertions: DELETE executes successfully, data deleted
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should execute DELETE without user_id', () => {
      const db = databaseManager.getDatabase()!;

      // Insert initial data
      db.prepare('INSERT INTO window_state (key, value) VALUES (?, ?)').run(
        'deleteGlobalKey',
        'deleteValue'
      );

      // Delete using runQuery
      const result = databaseManager.runQuery('DELETE FROM window_state WHERE key = ?', [
        'deleteGlobalKey',
      ]);

      expect(result.changes).toBe(1);

      // Verify data was deleted
      const row = db.prepare('SELECT * FROM window_state WHERE key = ?').get('deleteGlobalKey');
      expect(row).toBeUndefined();
    });
  });

  describe('getRow', () => {
    /* Preconditions: DatabaseManager initialized (UserManager NOT required), window_state table with data
       Action: call getRow with SELECT statement
       Assertions: returns row without requiring user_id
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should not require user_id', () => {
      const db = databaseManager.getDatabase()!;

      // Insert data
      db.prepare('INSERT INTO window_state (key, value) VALUES (?, ?)').run(
        'globalRowKey',
        'globalRowValue'
      );

      // Note: UserManager NOT set - global queries should work without it
      const row = databaseManager.getRow<{ key: string; value: string }>(
        'SELECT * FROM window_state WHERE key = ?',
        ['globalRowKey']
      );

      expect(row).toBeDefined();
      expect(row!.key).toBe('globalRowKey');
      expect(row!.value).toBe('globalRowValue');
    });

    /* Preconditions: DatabaseManager initialized, window_state table with data
       Action: call getRow with SELECT statement
       Assertions: returns single row without user_id filter
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should return single row without user_id filter', () => {
      const db = databaseManager.getDatabase()!;

      // Insert data
      db.prepare('INSERT INTO window_state (key, value) VALUES (?, ?)').run(
        'singleGlobalKey',
        JSON.stringify({ maximized: true })
      );

      const row = databaseManager.getRow<{ key: string; value: string }>(
        'SELECT * FROM window_state WHERE key = ?',
        ['singleGlobalKey']
      );

      expect(row).toBeDefined();
      expect(row!.key).toBe('singleGlobalKey');
      expect(JSON.parse(row!.value)).toEqual({ maximized: true });
    });

    /* Preconditions: DatabaseManager initialized, window_state table with no matching data
       Action: call getRow with SELECT statement for non-existent key
       Assertions: returns undefined
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should return undefined when no match', () => {
      const row = databaseManager.getRow<{ value: string }>(
        'SELECT value FROM window_state WHERE key = ?',
        ['nonExistentGlobalKey']
      );

      expect(row).toBeUndefined();
    });
  });

  describe('getRows', () => {
    /* Preconditions: DatabaseManager initialized (UserManager NOT required), window_state table with multiple rows
       Action: call getRows with SELECT statement
       Assertions: returns all rows without requiring user_id
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should not require user_id', () => {
      const db = databaseManager.getDatabase()!;

      // Insert multiple rows
      db.prepare('INSERT INTO window_state (key, value) VALUES (?, ?)').run(
        'globalKey1',
        'globalValue1'
      );
      db.prepare('INSERT INTO window_state (key, value) VALUES (?, ?)').run(
        'globalKey2',
        'globalValue2'
      );

      // Note: UserManager NOT set - global queries should work without it
      const rows = databaseManager.getRows<{ key: string; value: string }>(
        'SELECT * FROM window_state',
        []
      );

      expect(rows).toHaveLength(2);
    });

    /* Preconditions: DatabaseManager initialized, window_state table with multiple rows
       Action: call getRows with SELECT statement
       Assertions: returns all rows without user_id filter
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should return all rows without user_id filter', () => {
      const db = databaseManager.getDatabase()!;

      // Insert multiple rows
      db.prepare('INSERT INTO window_state (key, value) VALUES (?, ?)').run(
        'allGlobalKey1',
        'allGlobalValue1'
      );
      db.prepare('INSERT INTO window_state (key, value) VALUES (?, ?)').run(
        'allGlobalKey2',
        'allGlobalValue2'
      );
      db.prepare('INSERT INTO window_state (key, value) VALUES (?, ?)').run(
        'allGlobalKey3',
        'allGlobalValue3'
      );

      const rows = databaseManager.getRows<{ key: string; value: string }>(
        "SELECT * FROM window_state WHERE key LIKE 'allGlobal%'",
        []
      );

      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.key).sort()).toEqual([
        'allGlobalKey1',
        'allGlobalKey2',
        'allGlobalKey3',
      ]);
    });

    /* Preconditions: DatabaseManager initialized, window_state table with no data
       Action: call getRows with SELECT statement
       Assertions: returns empty array
       Requirements: user-data-isolation.6.4, user-data-isolation.6.10 */
    it('should return empty array when no matches', () => {
      const rows = databaseManager.getRows<{ key: string; value: string }>(
        "SELECT * FROM window_state WHERE key LIKE 'nonExistent%'",
        []
      );

      expect(rows).toEqual([]);
    });
  });
});
