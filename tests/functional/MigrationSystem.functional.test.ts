// Requirements: clerkly.2
/**
 * Functional tests for migration system
 * Tests the integration of MigrationRunner with DataManager during application lifecycle
 */

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import Database from 'better-sqlite3';
import WindowManager from '../../src/main/WindowManager';
import { LifecycleManager } from '../../src/main/LifecycleManager';
import { DataManager } from '../../src/main/DataManager';
import { MigrationRunner } from '../../src/main/MigrationRunner';

// Mock Electron app and BrowserWindow
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(),
    whenReady: jest.fn(),
    on: jest.fn(),
    quit: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    once: jest.fn(),
    show: jest.fn(),
    maximize: jest.fn(),
    isMaximized: jest.fn().mockReturnValue(false),
    getBounds: jest.fn().mockReturnValue({ x: 100, y: 100, width: 1200, height: 800 }),
    removeAllListeners: jest.fn(),
    destroy: jest.fn(),
    close: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false),
    webContents: {
      on: jest.fn(),
      session: {
        webRequest: {
          onHeadersReceived: jest.fn(),
        },
      },
    },
  })),
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  screen: {
    getPrimaryDisplay: jest.fn().mockReturnValue({
      workAreaSize: { width: 1920, height: 1080 },
    }),
    getAllDisplays: jest.fn().mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      },
    ]),
  },
}));

describe('Migration System Functional Tests', () => {
  let testStoragePath: string;
  let testMigrationsPath: string;

  beforeEach(() => {
    // Create unique test storage path for each test
    testStoragePath = path.join(os.tmpdir(), `clerkly-migration-test-${Date.now()}`);
    testMigrationsPath = path.join(os.tmpdir(), `clerkly-migrations-${Date.now()}`);

    // Create test migrations directory
    fs.mkdirSync(testMigrationsPath, { recursive: true });

    // Clear all mocks
    jest.clearAllMocks();

    // Setup app.getPath mock
    (app.getPath as jest.Mock).mockReturnValue(testStoragePath);
  });

  afterEach(() => {
    // Clean up test storage
    if (fs.existsSync(testStoragePath)) {
      try {
        fs.rmSync(testStoragePath, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
      }
    }

    // Clean up test migrations
    if (fs.existsSync(testMigrationsPath)) {
      try {
        fs.rmSync(testMigrationsPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  describe('First Startup - Schema Creation Through Migrations', () => {
    /* Preconditions: application not running, no database exists, migration files exist
       Action: start application (initialize lifecycle manager)
       Assertions: database created, schema_migrations table created, initial migration applied, user_data table created
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should create database schema through migrations on first startup', async () => {
      // Create initial migration file
      const migrationContent = `-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_timestamp ON user_data(timestamp);

-- DOWN
DROP INDEX IF EXISTS idx_timestamp;
DROP TABLE IF EXISTS user_data;
`;
      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migrationContent);

      // Initialize components with test migrations path
      const dataManager = new DataManager(testStoragePath);
      const windowManager = new WindowManager(dataManager);
      const lifecycleManager = new LifecycleManager(windowManager, dataManager);

      // Override migrations path for testing
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      const db = new Database(dbPath);
      const migrationRunner = new MigrationRunner(db, testMigrationsPath);

      // Run migrations
      const migrationResult = migrationRunner.runMigrations();

      // Verify migration succeeded
      expect(migrationResult.success).toBe(true);
      expect(migrationResult.appliedCount).toBe(1);
      expect(migrationResult.message).toContain('Successfully applied 1 migration');

      // Verify schema_migrations table exists
      const tablesResult = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        .all();
      expect(tablesResult).toHaveLength(1);

      // Verify migration was recorded
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBe(1);

      const appliedMigrations = migrationRunner.getAppliedMigrations();
      expect(appliedMigrations).toEqual([1]);

      // Verify user_data table was created
      const userDataTableResult = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_data'")
        .all();
      expect(userDataTableResult).toHaveLength(1);

      // Verify index was created
      const indexResult = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_timestamp'")
        .all();
      expect(indexResult).toHaveLength(1);

      // Verify table structure
      const tableInfo = db.prepare('PRAGMA table_info(user_data)').all() as Array<{
        name: string;
        type: string;
      }>;
      const columnNames = tableInfo.map((col) => col.name);
      expect(columnNames).toContain('key');
      expect(columnNames).toContain('value');
      expect(columnNames).toContain('timestamp');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');

      // Cleanup
      db.close();
      await lifecycleManager.handleQuit();
    });

    /* Preconditions: application not running, no database exists, no migration files exist
       Action: start application
       Assertions: database created, schema_migrations table created, no migrations applied (count = 0)
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should handle first startup with no migration files', async () => {
      // Don't create any migration files

      // Initialize components
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      const db = new Database(dbPath);
      const migrationRunner = new MigrationRunner(db, testMigrationsPath);

      // Run migrations (should succeed with 0 migrations)
      const migrationResult = migrationRunner.runMigrations();

      // Verify migration succeeded but no migrations applied
      expect(migrationResult.success).toBe(true);
      expect(migrationResult.appliedCount).toBe(0);
      expect(migrationResult.message).toContain('No migrations found');

      // Verify schema_migrations table exists
      const tablesResult = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        .all();
      expect(tablesResult).toHaveLength(1);

      // Verify current version is 0
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBe(0);

      // Cleanup
      db.close();
    });

    /* Preconditions: application not running, no database exists, multiple migration files exist
       Action: start application
       Assertions: all migrations applied in order, final version correct, all tables created
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should apply multiple migrations in order on first startup', async () => {
      // Create multiple migration files
      const migration1 = `-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS user_data;
`;

      const migration2 = `-- UP
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS settings;
`;

      const migration3 = `-- UP
CREATE INDEX idx_timestamp ON user_data(timestamp);

-- DOWN
DROP INDEX IF EXISTS idx_timestamp;
`;

      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migration1);
      fs.writeFileSync(path.join(testMigrationsPath, '002_add_settings.sql'), migration2);
      fs.writeFileSync(path.join(testMigrationsPath, '003_add_index.sql'), migration3);

      // Initialize components
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      const db = new Database(dbPath);
      const migrationRunner = new MigrationRunner(db, testMigrationsPath);

      // Run migrations
      const migrationResult = migrationRunner.runMigrations();

      // Verify all migrations applied
      expect(migrationResult.success).toBe(true);
      expect(migrationResult.appliedCount).toBe(3);

      // Verify current version
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBe(3);

      // Verify all migrations recorded
      const appliedMigrations = migrationRunner.getAppliedMigrations();
      expect(appliedMigrations).toEqual([1, 2, 3]);

      // Verify all tables created
      const userDataTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_data'")
        .all();
      expect(userDataTable).toHaveLength(1);

      const settingsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        .all();
      expect(settingsTable).toHaveLength(1);

      // Verify index created
      const indexResult = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_timestamp'")
        .all();
      expect(indexResult).toHaveLength(1);

      // Cleanup
      db.close();
    });
  });

  describe('Schema Updates - Running New Migrations', () => {
    /* Preconditions: database exists with initial migration applied, new migration file added
       Action: restart application (run migrations again)
       Assertions: only new migration applied, version updated, old migrations not re-applied
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should apply only new migrations on subsequent startup', async () => {
      // Create initial migration
      const migration1 = `-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS user_data;
`;

      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migration1);

      // First startup: apply initial migration
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      let db = new Database(dbPath);
      let migrationRunner = new MigrationRunner(db, testMigrationsPath);

      const firstResult = migrationRunner.runMigrations();
      expect(firstResult.success).toBe(true);
      expect(firstResult.appliedCount).toBe(1);

      const versionAfterFirst = migrationRunner.getCurrentVersion();
      expect(versionAfterFirst).toBe(1);

      db.close();

      // Add new migration file
      const migration2 = `-- UP
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS settings;
`;

      fs.writeFileSync(path.join(testMigrationsPath, '002_add_settings.sql'), migration2);

      // Second startup: apply new migration
      db = new Database(dbPath);
      migrationRunner = new MigrationRunner(db, testMigrationsPath);

      const secondResult = migrationRunner.runMigrations();

      // Verify only new migration applied
      expect(secondResult.success).toBe(true);
      expect(secondResult.appliedCount).toBe(1);
      expect(secondResult.message).toContain('Successfully applied 1 migration');

      // Verify version updated
      const versionAfterSecond = migrationRunner.getCurrentVersion();
      expect(versionAfterSecond).toBe(2);

      // Verify both migrations recorded
      const appliedMigrations = migrationRunner.getAppliedMigrations();
      expect(appliedMigrations).toEqual([1, 2]);

      // Verify both tables exist
      const userDataTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_data'")
        .all();
      expect(userDataTable).toHaveLength(1);

      const settingsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        .all();
      expect(settingsTable).toHaveLength(1);

      // Cleanup
      db.close();
    });

    /* Preconditions: database exists with all migrations applied
       Action: restart application (run migrations again)
       Assertions: no migrations applied, version unchanged, message indicates all migrations already applied
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should not re-apply migrations that are already applied', async () => {
      // Create migration files
      const migration1 = `-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS user_data;
`;

      const migration2 = `-- UP
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS settings;
`;

      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migration1);
      fs.writeFileSync(path.join(testMigrationsPath, '002_add_settings.sql'), migration2);

      // First startup: apply all migrations
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      let db = new Database(dbPath);
      let migrationRunner = new MigrationRunner(db, testMigrationsPath);

      const firstResult = migrationRunner.runMigrations();
      expect(firstResult.success).toBe(true);
      expect(firstResult.appliedCount).toBe(2);

      const versionAfterFirst = migrationRunner.getCurrentVersion();
      expect(versionAfterFirst).toBe(2);

      db.close();

      // Second startup: no new migrations
      db = new Database(dbPath);
      migrationRunner = new MigrationRunner(db, testMigrationsPath);

      const secondResult = migrationRunner.runMigrations();

      // Verify no migrations applied
      expect(secondResult.success).toBe(true);
      expect(secondResult.appliedCount).toBe(0);
      expect(secondResult.message).toContain('All migrations already applied');

      // Verify version unchanged
      const versionAfterSecond = migrationRunner.getCurrentVersion();
      expect(versionAfterSecond).toBe(2);

      // Verify migrations still recorded
      const appliedMigrations = migrationRunner.getAppliedMigrations();
      expect(appliedMigrations).toEqual([1, 2]);

      // Cleanup
      db.close();
    });

    /* Preconditions: database exists with some migrations applied, multiple new migrations added
       Action: restart application
       Assertions: all new migrations applied in order, version updated correctly
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should apply multiple new migrations in order', async () => {
      // Create initial migration
      const migration1 = `-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS user_data;
`;

      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migration1);

      // First startup: apply initial migration
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      let db = new Database(dbPath);
      let migrationRunner = new MigrationRunner(db, testMigrationsPath);

      const firstResult = migrationRunner.runMigrations();
      expect(firstResult.success).toBe(true);
      expect(firstResult.appliedCount).toBe(1);

      db.close();

      // Add multiple new migrations
      const migration2 = `-- UP
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS settings;
`;

      const migration3 = `-- UP
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS logs;
`;

      const migration4 = `-- UP
CREATE INDEX idx_timestamp ON user_data(timestamp);

-- DOWN
DROP INDEX IF EXISTS idx_timestamp;
`;

      fs.writeFileSync(path.join(testMigrationsPath, '002_add_settings.sql'), migration2);
      fs.writeFileSync(path.join(testMigrationsPath, '003_add_logs.sql'), migration3);
      fs.writeFileSync(path.join(testMigrationsPath, '004_add_index.sql'), migration4);

      // Second startup: apply new migrations
      db = new Database(dbPath);
      migrationRunner = new MigrationRunner(db, testMigrationsPath);

      const secondResult = migrationRunner.runMigrations();

      // Verify all new migrations applied
      expect(secondResult.success).toBe(true);
      expect(secondResult.appliedCount).toBe(3);

      // Verify version updated
      const finalVersion = migrationRunner.getCurrentVersion();
      expect(finalVersion).toBe(4);

      // Verify all migrations recorded
      const appliedMigrations = migrationRunner.getAppliedMigrations();
      expect(appliedMigrations).toEqual([1, 2, 3, 4]);

      // Verify all tables and indexes created
      const userDataTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_data'")
        .all();
      expect(userDataTable).toHaveLength(1);

      const settingsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        .all();
      expect(settingsTable).toHaveLength(1);

      const logsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='logs'")
        .all();
      expect(logsTable).toHaveLength(1);

      const indexResult = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_timestamp'")
        .all();
      expect(indexResult).toHaveLength(1);

      // Cleanup
      db.close();
    });
  });

  describe('Migration System Integration with Application Lifecycle', () => {
    /* Preconditions: application not running, migration files exist
       Action: start application through lifecycle manager, verify migrations applied
       Assertions: application starts successfully, migrations applied during initialization, data can be saved and loaded
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should integrate migrations with application lifecycle', async () => {
      // Initialize components (uses real migrations directory from DataManager)
      const dataManager = new DataManager(testStoragePath);
      const windowManager = new WindowManager(dataManager);
      const lifecycleManager = new LifecycleManager(windowManager, dataManager);

      // Initialize application (this should run migrations)
      const initResult = await lifecycleManager.initialize();

      // Verify initialization succeeded
      expect(initResult.success).toBe(true);

      // Verify database was created
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      expect(fs.existsSync(dbPath)).toBe(true);

      // Verify migrations were applied
      const migrationRunner = dataManager.getMigrationRunner();
      expect(migrationRunner).toBeDefined();

      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBeGreaterThanOrEqual(1);

      const status = migrationRunner.getStatus();
      expect(status.appliedMigrations).toBeGreaterThanOrEqual(1);
      expect(status.pendingMigrations).toBe(0);

      // Verify we can save and load data (schema is working)
      const testKey = 'migration-test-key';
      const testValue = { message: 'migrations working' };

      const saveResult = dataManager.saveData(testKey, testValue);
      expect(saveResult.success).toBe(true);

      const loadResult = dataManager.loadData(testKey);
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(testValue);

      // Cleanup
      await lifecycleManager.handleQuit();
      dataManager.close();
    });

    /* Preconditions: application not running, database exists with migrations applied
       Action: restart application multiple times
       Assertions: each restart succeeds, migrations not re-applied, data persists across restarts
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should handle multiple application restarts with migrations', async () => {
      const testKey = 'restart-test-key';
      const cycles = 3;

      for (let i = 0; i < cycles; i++) {
        const dataManager = new DataManager(testStoragePath);
        const windowManager = new WindowManager(dataManager);
        const lifecycleManager = new LifecycleManager(windowManager, dataManager);

        // Initialize application
        const initResult = await lifecycleManager.initialize();
        expect(initResult.success).toBe(true);

        // Verify migrations status
        const migrationRunner = dataManager.getMigrationRunner();
        const currentVersion = migrationRunner.getCurrentVersion();
        expect(currentVersion).toBeGreaterThanOrEqual(1);

        // Save data with cycle number
        const value = `cycle-${i}`;
        const saveResult = dataManager.saveData(testKey, value);
        expect(saveResult.success).toBe(true);

        // Verify data was saved
        const loadResult = dataManager.loadData(testKey);
        expect(loadResult.success).toBe(true);
        expect(loadResult.data).toBe(value);

        // Quit application
        await lifecycleManager.handleQuit();
        dataManager.close();
      }

      // Verify final data persisted
      const finalDataManager = new DataManager(testStoragePath);
      const finalWindowManager = new WindowManager(finalDataManager);
      const finalLifecycleManager = new LifecycleManager(finalWindowManager, finalDataManager);

      await finalLifecycleManager.initialize();

      const finalLoadResult = finalDataManager.loadData(testKey);
      expect(finalLoadResult.success).toBe(true);
      expect(finalLoadResult.data).toBe(`cycle-${cycles - 1}`);

      await finalLifecycleManager.handleQuit();
      finalDataManager.close();
    });

    /* Preconditions: application not running, database exists with data
       Action: add new migration, restart application, verify data still accessible
       Assertions: new migration applied, old data preserved, new schema features available
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should preserve existing data when applying new migrations', async () => {
      // First startup: create initial schema and save data
      const migration1 = `-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS user_data;
`;

      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migration1);

      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      let db = new Database(dbPath);
      let migrationRunner = new MigrationRunner(db, testMigrationsPath);

      migrationRunner.runMigrations();

      // Save some test data
      const testData = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: 'value3' },
      ];

      const insertStmt = db.prepare(
        'INSERT INTO user_data (key, value, timestamp, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      );

      for (const item of testData) {
        const now = Date.now();
        insertStmt.run(item.key, JSON.stringify(item.value), now, now, now);
      }

      db.close();

      // Add new migration (add settings table)
      const migration2 = `-- UP
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS settings;
`;

      fs.writeFileSync(path.join(testMigrationsPath, '002_add_settings.sql'), migration2);

      // Second startup: apply new migration
      db = new Database(dbPath);
      migrationRunner = new MigrationRunner(db, testMigrationsPath);

      const migrationResult = migrationRunner.runMigrations();
      expect(migrationResult.success).toBe(true);
      expect(migrationResult.appliedCount).toBe(1);

      // Verify old data still exists
      const selectStmt = db.prepare('SELECT key, value FROM user_data');
      const rows = selectStmt.all() as Array<{ key: string; value: string }>;

      expect(rows).toHaveLength(3);
      for (const item of testData) {
        const row = rows.find((r) => r.key === item.key);
        expect(row).toBeDefined();
        expect(JSON.parse(row!.value)).toBe(item.value);
      }

      // Verify new table exists
      const settingsTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        .all();
      expect(settingsTable).toHaveLength(1);

      // Cleanup
      db.close();
    });
  });

  describe('Migration Error Handling', () => {
    /* Preconditions: database exists, migration file with invalid SQL exists
       Action: attempt to run migrations
       Assertions: migration fails, error reported, database state unchanged (rollback)
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should handle migration errors gracefully', async () => {
      // Create valid initial migration
      const migration1 = `-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS user_data;
`;

      // Create invalid migration (syntax error)
      const migration2 = `-- UP
CREATE INVALID TABLE syntax error;

-- DOWN
DROP TABLE IF EXISTS invalid_table;
`;

      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migration1);
      fs.writeFileSync(path.join(testMigrationsPath, '002_invalid_migration.sql'), migration2);

      // Initialize database
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      const db = new Database(dbPath);
      const migrationRunner = new MigrationRunner(db, testMigrationsPath);

      // Run migrations (should fail on second migration)
      const migrationResult = migrationRunner.runMigrations();

      // Verify migration failed
      expect(migrationResult.success).toBe(false);
      expect(migrationResult.error).toBeTruthy();
      expect(migrationResult.error).toContain('Failed to apply migration');

      // Verify only first migration was applied
      expect(migrationResult.appliedCount).toBe(1);

      // Verify current version is 1 (only first migration applied)
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBe(1);

      // Verify only first migration recorded
      const appliedMigrations = migrationRunner.getAppliedMigrations();
      expect(appliedMigrations).toEqual([1]);

      // Verify first table exists
      const userDataTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_data'")
        .all();
      expect(userDataTable).toHaveLength(1);

      // Verify invalid table does not exist
      const invalidTable = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='invalid_table'")
        .all();
      expect(invalidTable).toHaveLength(0);

      // Cleanup
      db.close();
    });

    /* Preconditions: database exists with migrations applied
       Action: attempt to rollback migration without DOWN section
       Assertions: rollback fails with appropriate error message
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should handle missing DOWN section in rollback', async () => {
      // Create migration without DOWN section
      const migration1 = `-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- DOWN
`;

      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migration1);

      // Initialize and apply migration
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      const db = new Database(dbPath);
      const migrationRunner = new MigrationRunner(db, testMigrationsPath);

      const applyResult = migrationRunner.runMigrations();
      expect(applyResult.success).toBe(true);

      // Attempt to rollback
      const rollbackResult = migrationRunner.rollbackLastMigration();

      // Verify rollback failed
      expect(rollbackResult.success).toBe(false);
      expect(rollbackResult.error).toBeTruthy();
      expect(rollbackResult.error).toContain('has no DOWN section');

      // Verify migration still applied
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBe(1);

      // Cleanup
      db.close();
    });
  });

  describe('Migration Status and Reporting', () => {
    /* Preconditions: database exists with some migrations applied, some pending
       Action: get migration status
       Assertions: status correctly reports current version, applied count, pending count, pending list
       Requirements: clerkly.2.2, clerkly.2.4, clerkly.2.8 */
    it('should correctly report migration status', async () => {
      // Create multiple migrations
      const migration1 = `-- UP
CREATE TABLE user_data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS user_data;
`;

      const migration2 = `-- UP
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS settings;
`;

      const migration3 = `-- UP
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

-- DOWN
DROP TABLE IF EXISTS logs;
`;

      // Create only first two migrations initially
      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migration1);
      fs.writeFileSync(path.join(testMigrationsPath, '002_add_settings.sql'), migration2);

      // Initialize and apply first two migrations
      const dbPath = path.join(testStoragePath, 'clerkly.db');
      fs.mkdirSync(testStoragePath, { recursive: true });
      const db = new Database(dbPath);

      const migrationRunner = new MigrationRunner(db, testMigrationsPath);
      const firstResult = migrationRunner.runMigrations();
      expect(firstResult.appliedCount).toBe(2); // Applied first two migrations

      // Now add third migration (pending)
      fs.writeFileSync(path.join(testMigrationsPath, '003_add_logs.sql'), migration3);

      // Get status (should show pending migration)
      const status = migrationRunner.getStatus();

      // Verify status
      expect(status.currentVersion).toBe(2);
      expect(status.appliedMigrations).toBe(2);
      expect(status.pendingMigrations).toBe(1);
      expect(status.totalMigrations).toBe(3);
      expect(status.pending).toHaveLength(1);
      expect(status.pending[0].version).toBe(3);
      expect(status.pending[0].name).toBe('add_logs');

      // Cleanup
      db.close();
    });
  });
});
