// Requirements: database-refactoring.1, user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.6.4

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseManager } from '../../src/main/DatabaseManager';
import type { UserManager } from '../../src/main/auth/UserManager';
import { NO_USER_LOGGED_IN_ERROR } from '../../src/shared/errors/userErrors';

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

      expect(() => databaseManager.getCurrentUserIdStrict()).toThrow(NO_USER_LOGGED_IN_ERROR);
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

      expect(() => databaseManager.getCurrentUserIdStrict()).toThrow(NO_USER_LOGGED_IN_ERROR);
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

    /* Preconditions: database file exists with corrupted content
       Action: initialize DatabaseManager
       Assertions: backup preserves original corrupted content
       Requirements: clerkly.nfr.2.4, clerkly.2.6, clerkly.2.8, clerkly.nfr.4.4 */
    it('should preserve corrupted database content in backup file', () => {
      const corruptedContent = 'This is corrupted content that should be preserved';

      originalFs.mkdirSync(testStoragePath, { recursive: true });
      originalFs.writeFileSync(testDbPath, corruptedContent);

      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const files = originalFs.readdirSync(testStoragePath);
      const backupFiles = files.filter((f: string) => f.startsWith('clerkly.db.backup-'));
      expect(backupFiles.length).toBe(1);

      const backupPath = path.join(testStoragePath, backupFiles[0]);
      const backupContent = originalFs.readFileSync(backupPath, 'utf8');
      expect(backupContent).toBe(corruptedContent);
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
// Phase 4: Repository Accessor Tests
// Requirements: user-data-isolation.6.2
// ============================================

describe('DatabaseManager Repository Accessors', () => {
  let databaseManager: DatabaseManager;
  let testStoragePath: string;
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
    testStoragePath = originalFs.mkdtempSync(path.join(os.tmpdir(), 'dbmanager-repo-test-'));

    // Mock UserManager
    mockUserManager = {
      getCurrentUserId: jest.fn().mockReturnValue('testUserId123'),
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

    // Remove test files using original fs
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

  describe('settings', () => {
    /* Preconditions: DatabaseManager not initialized
       Action: Access settings property
       Assertions: Throws "Database not initialized"
       Requirements: user-data-isolation.6.2 */
    it('should throw error when database not initialized', () => {
      databaseManager = new DatabaseManager();
      expect(() => databaseManager.settings).toThrow('Database not initialized');
    });

    /* Preconditions: DatabaseManager initialized
       Action: Access settings property
       Assertions: Returns SettingsRepository instance
       Requirements: user-data-isolation.6.2 */
    it('should return SettingsRepository after initialization', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const settings = databaseManager.settings;
      expect(settings).toBeDefined();
      expect(typeof settings.get).toBe('function');
      expect(typeof settings.set).toBe('function');
      expect(typeof settings.delete).toBe('function');
      expect(typeof settings.getAll).toBe('function');
    });
  });

  describe('agents', () => {
    /* Preconditions: DatabaseManager not initialized
       Action: Access agents property
       Assertions: Throws "Database not initialized"
       Requirements: user-data-isolation.6.2 */
    it('should throw error when database not initialized', () => {
      databaseManager = new DatabaseManager();
      expect(() => databaseManager.agents).toThrow('Database not initialized');
    });

    /* Preconditions: DatabaseManager initialized
       Action: Access agents property
       Assertions: Returns AgentsRepository instance
       Requirements: user-data-isolation.6.2 */
    it('should return AgentsRepository after initialization', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const agents = databaseManager.agents;
      expect(agents).toBeDefined();
      expect(typeof agents.list).toBe('function');
      expect(typeof agents.findById).toBe('function');
      expect(typeof agents.create).toBe('function');
      expect(typeof agents.update).toBe('function');
      expect(typeof agents.archive).toBe('function');
    });
  });

  describe('messages', () => {
    /* Preconditions: DatabaseManager not initialized
       Action: Access messages property
       Assertions: Throws "Database not initialized"
       Requirements: user-data-isolation.6.2 */
    it('should throw error when database not initialized', () => {
      databaseManager = new DatabaseManager();
      expect(() => databaseManager.messages).toThrow('Database not initialized');
    });

    /* Preconditions: DatabaseManager initialized
       Action: Access messages property
       Assertions: Returns MessagesRepository instance
       Requirements: user-data-isolation.6.2 */
    it('should return MessagesRepository after initialization', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const messages = databaseManager.messages;
      expect(messages).toBeDefined();
      expect(typeof messages.listByAgent).toBe('function');
      expect(typeof messages.create).toBe('function');
      expect(typeof messages.update).toBe('function');
    });
  });

  describe('users', () => {
    /* Preconditions: DatabaseManager not initialized
       Action: Access users property
       Assertions: Throws "Database not initialized"
       Requirements: user-data-isolation.6.2 */
    it('should throw error when database not initialized', () => {
      databaseManager = new DatabaseManager();
      expect(() => databaseManager.users).toThrow('Database not initialized');
    });

    /* Preconditions: DatabaseManager initialized
       Action: Access users property
       Assertions: Returns UsersRepository instance
       Requirements: user-data-isolation.6.2 */
    it('should return UsersRepository after initialization', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const users = databaseManager.users;
      expect(users).toBeDefined();
      expect(typeof users.findByEmail).toBe('function');
      expect(typeof users.findById).toBe('function');
      expect(typeof users.findOrCreate).toBe('function');
      expect(typeof users.update).toBe('function');
    });
  });

  describe('global', () => {
    /* Preconditions: DatabaseManager not initialized
       Action: Access global property
       Assertions: Throws "Database not initialized"
       Requirements: user-data-isolation.6.2 */
    it('should throw error when database not initialized', () => {
      databaseManager = new DatabaseManager();
      expect(() => databaseManager.global).toThrow('Database not initialized');
    });

    /* Preconditions: DatabaseManager initialized
       Action: Access global property
       Assertions: Returns GlobalRepository instance
       Requirements: user-data-isolation.6.2 */
    it('should return GlobalRepository after initialization', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);

      const global = databaseManager.global;
      expect(global).toBeDefined();
      expect(global.windowState).toBeDefined();
      expect(typeof global.windowState.get).toBe('function');
      expect(typeof global.windowState.set).toBe('function');
    });
  });

  describe('Repository Integration', () => {
    /* Preconditions: DatabaseManager initialized with UserManager
       Action: Use settings repository to save and load data
       Assertions: Data is saved and loaded correctly
       Requirements: user-data-isolation.6.2, user-data-isolation.6.3 */
    it('should allow saving and loading data through settings repository', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);
      databaseManager.setUserManager(mockUserManager);

      // Save data
      databaseManager.settings.set('testKey', 'testValue');

      // Load data
      const result = databaseManager.settings.get('testKey');
      expect(result).toBeDefined();
      expect(result!.value).toBe('testValue');
      expect(result!.userId).toBe('testUserId123');
    });

    /* Preconditions: DatabaseManager initialized without UserManager
       Action: Use settings repository
       Assertions: Throws "No user logged in"
       Requirements: user-data-isolation.6.4 */
    it('should throw error when using settings without user logged in', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);
      // UserManager NOT set

      expect(() => databaseManager.settings.get('testKey')).toThrow(NO_USER_LOGGED_IN_ERROR);
    });

    /* Preconditions: DatabaseManager initialized
       Action: Use global repository to save and load window state
       Assertions: Window state is saved and loaded correctly
       Requirements: user-data-isolation.6.2, user-data-isolation.7.8 */
    it('should allow saving and loading window state through global repository', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);
      // Note: global repository does NOT require UserManager

      const windowState = {
        x: 100,
        y: 200,
        width: 800,
        height: 600,
        isMaximized: false,
      };

      // Save window state
      databaseManager.global.windowState.set(windowState);

      // Load window state
      const result = databaseManager.global.windowState.get();
      expect(result).toEqual(windowState);
    });

    /* Preconditions: DatabaseManager initialized with UserManager
       Action: Use users repository to create user
       Assertions: User is created correctly
       Requirements: user-data-isolation.6.2, user-data-isolation.7.7 */
    it('should allow creating users through users repository', () => {
      databaseManager = new DatabaseManager();
      databaseManager.initialize(testStoragePath);
      // Note: users repository does NOT require UserManager

      const user = databaseManager.users.findOrCreate('test@example.com', 'Test User');
      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.userId).toHaveLength(10);
    });
  });

  describe('Legacy Mode with Repositories', () => {
    /* Preconditions: DatabaseManager created with db in constructor (legacy mode)
       Action: Access repositories
       Assertions: Repositories are available
       Requirements: user-data-isolation.6.2 */
    it('should initialize repositories in legacy mode', () => {
      const testDb = new Database(':memory:');

      // Create required tables
      testDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
          user_id TEXT PRIMARY KEY,
          name TEXT,
          email TEXT NOT NULL UNIQUE,
          google_id TEXT,
          locale TEXT,
          last_synced INTEGER
        );
        CREATE TABLE IF NOT EXISTS user_data (
          key TEXT NOT NULL,
          user_id TEXT NOT NULL,
          value TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (key, user_id)
        );
        CREATE TABLE IF NOT EXISTS agents (
          agent_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          archived_at TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          agent_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          usage_json TEXT,
          kind TEXT NOT NULL DEFAULT 'user',
          hidden INTEGER NOT NULL DEFAULT 0
        );
      `);

      databaseManager = new DatabaseManager(testDb);

      // All repositories should be available
      expect(() => databaseManager.settings).not.toThrow();
      expect(() => databaseManager.agents).not.toThrow();
      expect(() => databaseManager.messages).not.toThrow();
      expect(() => databaseManager.users).not.toThrow();
      expect(() => databaseManager.global).not.toThrow();

      testDb.close();
    });
  });
});
