// Requirements: clerkly.2

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MigrationRunner } from '../../src/main/MigrationRunner';

describe('MigrationRunner', () => {
  let db: Database.Database;
  let testDbPath: string;
  let testMigrationsPath: string;
  let migrationRunner: MigrationRunner;

  beforeEach(() => {
    // Create temporary database and migrations directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-test-'));
    testDbPath = path.join(tempDir, 'test.db');
    testMigrationsPath = path.join(tempDir, 'migrations');

    // Create migrations directory
    fs.mkdirSync(testMigrationsPath, { recursive: true });

    // Initialize database
    db = new Database(testDbPath);
    migrationRunner = new MigrationRunner(db, testMigrationsPath);
  });

  afterEach(() => {
    // Clean up
    if (db && db.open) {
      db.close();
    }

    // Remove test files
    if (testDbPath && fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Remove migrations directory
    if (testMigrationsPath && fs.existsSync(testMigrationsPath)) {
      const files = fs.readdirSync(testMigrationsPath);
      files.forEach((file) => {
        fs.unlinkSync(path.join(testMigrationsPath, file));
      });
      fs.rmdirSync(testMigrationsPath);
    }
  });

  describe('initializeMigrationTable', () => {
    /* Preconditions: database is empty, no schema_migrations table exists
       Action: call initializeMigrationTable()
       Assertions: schema_migrations table is created with correct structure
       Requirements: clerkly.2*/
    it('should create schema_migrations table', () => {
      migrationRunner.initializeMigrationTable();

      // Verify table exists
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        .get();

      expect(tableExists).toBeDefined();
      expect(tableExists).toHaveProperty('name', 'schema_migrations');

      // Verify table structure
      const columns = db.prepare('PRAGMA table_info(schema_migrations)').all();
      expect(columns).toHaveLength(3);

      const columnNames = columns.map((col: any) => col.name);
      expect(columnNames).toContain('version');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('applied_at');
    });

    /* Preconditions: schema_migrations table already exists
       Action: call initializeMigrationTable() again
       Assertions: no error thrown, table remains unchanged (idempotent)
       Requirements: clerkly.2*/
    it('should be idempotent - calling multiple times does not cause errors', () => {
      migrationRunner.initializeMigrationTable();

      // Call again - should not throw
      expect(() => {
        migrationRunner.initializeMigrationTable();
      }).not.toThrow();

      // Verify table still exists and is correct
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
        .get();

      expect(tableExists).toBeDefined();
    });
  });

  describe('getCurrentVersion', () => {
    /* Preconditions: database is empty, no migrations applied
       Action: call getCurrentVersion()
       Assertions: returns 0 (no migrations applied yet)
       Requirements: clerkly.2*/
    it('should return 0 when no migrations have been applied', () => {
      const version = migrationRunner.getCurrentVersion();
      expect(version).toBe(0);
    });

    /* Preconditions: schema_migrations table has one migration record (version 1)
       Action: call getCurrentVersion()
       Assertions: returns 1 (highest version number)
       Requirements: clerkly.2*/
    it('should return highest version number when migrations exist', () => {
      migrationRunner.initializeMigrationTable();

      // Insert test migration records
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        1,
        'initial_schema',
        Date.now()
      );

      const version = migrationRunner.getCurrentVersion();
      expect(version).toBe(1);
    });

    /* Preconditions: schema_migrations table has multiple migration records
       Action: call getCurrentVersion()
       Assertions: returns highest version number (3)
       Requirements: clerkly.2*/
    it('should return highest version when multiple migrations exist', () => {
      migrationRunner.initializeMigrationTable();

      // Insert multiple migration records
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        1,
        'initial_schema',
        Date.now()
      );
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        3,
        'add_users',
        Date.now()
      );
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        2,
        'add_settings',
        Date.now()
      );

      const version = migrationRunner.getCurrentVersion();
      expect(version).toBe(3);
    });
  });

  describe('getAppliedMigrations', () => {
    /* Preconditions: database is empty, no migrations applied
       Action: call getAppliedMigrations()
       Assertions: returns empty array
       Requirements: clerkly.2*/
    it('should return empty array when no migrations applied', () => {
      const applied = migrationRunner.getAppliedMigrations();
      expect(applied).toEqual([]);
    });

    /* Preconditions: schema_migrations table has multiple migration records
       Action: call getAppliedMigrations()
       Assertions: returns array of version numbers sorted in ascending order
       Requirements: clerkly.2*/
    it('should return sorted array of applied migration versions', () => {
      migrationRunner.initializeMigrationTable();

      // Insert migrations in non-sequential order
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        3,
        'add_users',
        Date.now()
      );
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        1,
        'initial_schema',
        Date.now()
      );
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        2,
        'add_settings',
        Date.now()
      );

      const applied = migrationRunner.getAppliedMigrations();
      expect(applied).toEqual([1, 2, 3]);
    });
  });

  describe('loadMigrations', () => {
    /* Preconditions: migrations directory is empty
       Action: call loadMigrations()
       Assertions: returns empty array
       Requirements: clerkly.2*/
    it('should return empty array when no migration files exist', () => {
      const migrations = migrationRunner.loadMigrations();
      expect(migrations).toEqual([]);
    });

    /* Preconditions: migrations directory does not exist
       Action: call loadMigrations()
       Assertions: returns empty array without throwing error
       Requirements: clerkly.2*/
    it('should return empty array when migrations directory does not exist', () => {
      // Remove migrations directory
      fs.rmdirSync(testMigrationsPath);

      const migrations = migrationRunner.loadMigrations();
      expect(migrations).toEqual([]);
    });

    /* Preconditions: migrations directory contains valid migration file
       Action: call loadMigrations()
       Assertions: returns array with one migration object containing version, name, up, down
       Requirements: clerkly.2*/
    it('should load valid migration file', () => {
      // Create test migration file
      const migrationContent = `-- UP
CREATE TABLE test_table (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

-- DOWN
DROP TABLE test_table;`;

      fs.writeFileSync(path.join(testMigrationsPath, '001_initial_schema.sql'), migrationContent);

      const migrations = migrationRunner.loadMigrations();

      expect(migrations).toHaveLength(1);
      expect(migrations[0]).toMatchObject({
        version: 1,
        name: 'initial_schema',
      });
      expect(migrations[0].up).toContain('CREATE TABLE test_table');
      expect(migrations[0].down).toContain('DROP TABLE test_table');
    });

    /* Preconditions: migrations directory contains multiple migration files
       Action: call loadMigrations()
       Assertions: returns array sorted by version in ascending order
       Requirements: clerkly.2*/
    it('should load and sort multiple migration files by version', () => {
      // Create multiple migration files
      fs.writeFileSync(
        path.join(testMigrationsPath, '003_add_users.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER);\n-- DOWN\nDROP TABLE users;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_initial.sql'),
        '-- UP\nCREATE TABLE settings (id INTEGER);\n-- DOWN\nDROP TABLE settings;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '002_add_data.sql'),
        '-- UP\nCREATE TABLE data (id INTEGER);\n-- DOWN\nDROP TABLE data;'
      );

      const migrations = migrationRunner.loadMigrations();

      expect(migrations).toHaveLength(3);
      expect(migrations[0].version).toBe(1);
      expect(migrations[1].version).toBe(2);
      expect(migrations[2].version).toBe(3);
    });

    /* Preconditions: migrations directory contains file with invalid name format
       Action: call loadMigrations()
       Assertions: invalid file is skipped, warning logged, no error thrown
       Requirements: clerkly.2*/
    it('should skip files with invalid naming format', () => {
      // Create valid and invalid migration files
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_valid.sql'),
        '-- UP\nCREATE TABLE test (id INTEGER);\n-- DOWN\nDROP TABLE test;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, 'invalid_name.sql'),
        '-- UP\nCREATE TABLE invalid (id INTEGER);\n-- DOWN\nDROP TABLE invalid;'
      );

      const migrations = migrationRunner.loadMigrations();

      // Only valid migration should be loaded
      expect(migrations).toHaveLength(1);
      expect(migrations[0].version).toBe(1);
    });

    /* Preconditions: migrations directory contains .gitkeep file
       Action: call loadMigrations()
       Assertions: .gitkeep file is ignored, no error thrown
       Requirements: clerkly.2*/
    it('should ignore .gitkeep files', () => {
      fs.writeFileSync(path.join(testMigrationsPath, '.gitkeep'), '');
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_test.sql'),
        '-- UP\nCREATE TABLE test (id INTEGER);\n-- DOWN\nDROP TABLE test;'
      );

      const migrations = migrationRunner.loadMigrations();

      expect(migrations).toHaveLength(1);
      expect(migrations[0].version).toBe(1);
    });

    /* Preconditions: migrations directory contains migration file with empty UP section
       Action: call loadMigrations()
       Assertions: throws error indicating empty UP section
       Requirements: clerkly.2*/
    it('should throw error for migration with empty UP section', () => {
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_empty_up.sql'),
        '-- UP\n\n-- DOWN\nDROP TABLE test;'
      );

      expect(() => {
        migrationRunner.loadMigrations();
      }).toThrow('empty UP section');
    });

    /* Preconditions: migrations directory contains files with duplicate version numbers
       Action: call loadMigrations()
       Assertions: throws error indicating duplicate versions
       Requirements: clerkly.2*/
    it('should throw error for duplicate migration versions', () => {
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_first.sql'),
        '-- UP\nCREATE TABLE first (id INTEGER);\n-- DOWN\nDROP TABLE first;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_duplicate.sql'),
        '-- UP\nCREATE TABLE duplicate (id INTEGER);\n-- DOWN\nDROP TABLE duplicate;'
      );

      expect(() => {
        migrationRunner.loadMigrations();
      }).toThrow('Duplicate migration versions');
    });
  });

  describe('runMigrations', () => {
    /* Preconditions: database is empty, no migration files exist
       Action: call runMigrations()
       Assertions: returns success true, appliedCount 0, message "No migrations found"
       Requirements: clerkly.2*/
    it('should return success with no migrations when directory is empty', () => {
      const result = migrationRunner.runMigrations();

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
      expect(result.message).toContain('No migrations found');
    });

    /* Preconditions: database is empty, one valid migration file exists
       Action: call runMigrations()
       Assertions: migration is applied, table created, schema_migrations updated, returns success true
       Requirements: clerkly.2*/
    it('should apply single pending migration', () => {
      // Create migration file
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_create_users.sql'),
        `-- UP
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

-- DOWN
DROP TABLE users;`
      );

      const result = migrationRunner.runMigrations();

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
      expect(result.message).toContain('Successfully applied 1 migration');

      // Verify table was created
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      expect(tableExists).toBeDefined();

      // Verify migration was recorded
      const currentVersion = migrationRunner.getCurrentVersion();
      expect(currentVersion).toBe(1);
    });

    /* Preconditions: database is empty, multiple migration files exist
       Action: call runMigrations()
       Assertions: all migrations applied in order, all tables created, returns success true
       Requirements: clerkly.2*/
    it('should apply multiple pending migrations in order', () => {
      // Create multiple migration files
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_create_users.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER PRIMARY KEY);\n-- DOWN\nDROP TABLE users;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '002_create_settings.sql'),
        '-- UP\nCREATE TABLE settings (key TEXT PRIMARY KEY);\n-- DOWN\nDROP TABLE settings;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '003_create_data.sql'),
        '-- UP\nCREATE TABLE data (id INTEGER PRIMARY KEY);\n-- DOWN\nDROP TABLE data;'
      );

      const result = migrationRunner.runMigrations();

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(3);

      // Verify all tables were created
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('settings');
      expect(tableNames).toContain('data');

      // Verify current version
      expect(migrationRunner.getCurrentVersion()).toBe(3);
    });

    /* Preconditions: some migrations already applied, new migration files added
       Action: call runMigrations()
       Assertions: only new migrations applied, existing migrations skipped
       Requirements: clerkly.2*/
    it('should only apply pending migrations, skip already applied', () => {
      // Create and apply first migration
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_create_users.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER PRIMARY KEY);\n-- DOWN\nDROP TABLE users;'
      );

      let result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);

      // Add new migration
      fs.writeFileSync(
        path.join(testMigrationsPath, '002_create_settings.sql'),
        '-- UP\nCREATE TABLE settings (key TEXT PRIMARY KEY);\n-- DOWN\nDROP TABLE settings;'
      );

      // Run migrations again
      result = migrationRunner.runMigrations();

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1); // Only new migration applied
      expect(migrationRunner.getCurrentVersion()).toBe(2);
    });

    /* Preconditions: all migrations already applied
       Action: call runMigrations()
       Assertions: returns success true, appliedCount 0, message "All migrations already applied"
       Requirements: clerkly.2*/
    it('should return success when all migrations already applied', () => {
      // Create and apply migration
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_create_users.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER PRIMARY KEY);\n-- DOWN\nDROP TABLE users;'
      );

      migrationRunner.runMigrations();

      // Run again
      const result = migrationRunner.runMigrations();

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
      expect(result.message).toContain('All migrations already applied');
    });

    /* Preconditions: migration file contains invalid SQL
       Action: call runMigrations()
       Assertions: returns success false, error message contains migration name and SQL error
       Requirements: clerkly.2*/
    it('should handle migration with invalid SQL', () => {
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_invalid.sql'),
        '-- UP\nINVALID SQL STATEMENT;\n-- DOWN\nDROP TABLE test;'
      );

      const result = migrationRunner.runMigrations();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('1_invalid');
    });

    /* Preconditions: first migration succeeds, second migration fails
       Action: call runMigrations()
       Assertions: first migration applied, second fails, returns error, appliedCount 1
       Requirements: clerkly.2*/
    it('should stop on first failed migration and report partial success', () => {
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_valid.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER PRIMARY KEY);\n-- DOWN\nDROP TABLE users;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '002_invalid.sql'),
        '-- UP\nINVALID SQL;\n-- DOWN\nDROP TABLE test;'
      );

      const result = migrationRunner.runMigrations();

      expect(result.success).toBe(false);
      expect(result.appliedCount).toBe(1); // First migration succeeded
      expect(result.error).toContain('2_invalid');

      // Verify first migration was applied
      expect(migrationRunner.getCurrentVersion()).toBe(1);
    });
  });

  describe('rollbackLastMigration', () => {
    /* Preconditions: no migrations applied
       Action: call rollbackLastMigration()
       Assertions: returns success false, error "No migrations to rollback"
       Requirements: clerkly.2*/
    it('should return error when no migrations to rollback', () => {
      const result = migrationRunner.rollbackLastMigration();

      expect(result.success).toBe(false);
      expect(result.error).toContain('No migrations to rollback');
    });

    /* Preconditions: one migration applied with valid DOWN section
       Action: call rollbackLastMigration()
       Assertions: migration rolled back, table dropped, schema_migrations updated, returns success true
       Requirements: clerkly.2*/
    it('should rollback last applied migration', () => {
      // Create and apply migration
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_create_users.sql'),
        `-- UP
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

-- DOWN
DROP TABLE users;`
      );

      migrationRunner.runMigrations();

      // Verify table exists
      let tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      expect(tableExists).toBeDefined();

      // Rollback
      const result = migrationRunner.rollbackLastMigration();

      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
      expect(result.message).toContain('Successfully rolled back');

      // Verify table was dropped
      tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      expect(tableExists).toBeUndefined();

      // Verify version updated
      expect(migrationRunner.getCurrentVersion()).toBe(0);
    });

    /* Preconditions: multiple migrations applied
       Action: call rollbackLastMigration()
       Assertions: only last migration rolled back, earlier migrations remain
       Requirements: clerkly.2*/
    it('should rollback only the last migration when multiple exist', () => {
      // Create and apply multiple migrations
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_create_users.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER PRIMARY KEY);\n-- DOWN\nDROP TABLE users;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '002_create_settings.sql'),
        '-- UP\nCREATE TABLE settings (key TEXT PRIMARY KEY);\n-- DOWN\nDROP TABLE settings;'
      );

      migrationRunner.runMigrations();
      expect(migrationRunner.getCurrentVersion()).toBe(2);

      // Rollback last migration
      const result = migrationRunner.rollbackLastMigration();

      expect(result.success).toBe(true);
      expect(migrationRunner.getCurrentVersion()).toBe(1);

      // Verify first table still exists
      const usersExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      expect(usersExists).toBeDefined();

      // Verify second table was dropped
      const settingsExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'")
        .get();
      expect(settingsExists).toBeUndefined();
    });

    /* Preconditions: migration applied but has no DOWN section
       Action: call rollbackLastMigration()
       Assertions: returns success false, error "has no DOWN section"
       Requirements: clerkly.2*/
    it('should return error when migration has no DOWN section', () => {
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_no_down.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER PRIMARY KEY);'
      );

      migrationRunner.runMigrations();

      const result = migrationRunner.rollbackLastMigration();

      expect(result.success).toBe(false);
      expect(result.error).toContain('has no DOWN section');
    });

    /* Preconditions: migration applied but migration file deleted
       Action: call rollbackLastMigration()
       Assertions: returns success false, error "Migration file not found"
       Requirements: clerkly.2*/
    it('should return error when migration file not found', () => {
      // Create and apply migration
      const migrationPath = path.join(testMigrationsPath, '001_test.sql');
      fs.writeFileSync(
        migrationPath,
        '-- UP\nCREATE TABLE users (id INTEGER PRIMARY KEY);\n-- DOWN\nDROP TABLE users;'
      );

      migrationRunner.runMigrations();

      // Delete migration file
      fs.unlinkSync(migrationPath);

      const result = migrationRunner.rollbackLastMigration();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration file not found');
    });

    /* Preconditions: migration applied, DOWN section contains invalid SQL
       Action: call rollbackLastMigration()
       Assertions: returns success false, error contains migration name and SQL error
       Requirements: clerkly.2*/
    it('should handle invalid SQL in DOWN section', () => {
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_invalid_down.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER PRIMARY KEY);\n-- DOWN\nINVALID SQL;'
      );

      migrationRunner.runMigrations();

      const result = migrationRunner.rollbackLastMigration();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('1_invalid_down');
    });
  });

  describe('getStatus', () => {
    /* Preconditions: database is empty, no migrations exist
       Action: call getStatus()
       Assertions: returns currentVersion 0, all counts 0, empty pending array
       Requirements: clerkly.2*/
    it('should return correct status when no migrations exist', () => {
      const status = migrationRunner.getStatus();

      expect(status.currentVersion).toBe(0);
      expect(status.appliedMigrations).toBe(0);
      expect(status.pendingMigrations).toBe(0);
      expect(status.totalMigrations).toBe(0);
      expect(status.pending).toEqual([]);
    });

    /* Preconditions: migration files exist but none applied
       Action: call getStatus()
       Assertions: currentVersion 0, appliedMigrations 0, pendingMigrations equals totalMigrations
       Requirements: clerkly.2*/
    it('should return correct status with pending migrations', () => {
      // Create migration files
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_create_users.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER);\n-- DOWN\nDROP TABLE users;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '002_create_settings.sql'),
        '-- UP\nCREATE TABLE settings (id INTEGER);\n-- DOWN\nDROP TABLE settings;'
      );

      const status = migrationRunner.getStatus();

      expect(status.currentVersion).toBe(0);
      expect(status.appliedMigrations).toBe(0);
      expect(status.pendingMigrations).toBe(2);
      expect(status.totalMigrations).toBe(2);
      expect(status.pending).toHaveLength(2);
      expect(status.pending[0]).toMatchObject({ version: 1, name: 'create_users' });
      expect(status.pending[1]).toMatchObject({ version: 2, name: 'create_settings' });
    });

    /* Preconditions: some migrations applied, some pending
       Action: call getStatus()
       Assertions: correct counts, pending array contains only unapplied migrations
       Requirements: clerkly.2*/
    it('should return correct status with mixed applied and pending migrations', () => {
      // Create migrations
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_create_users.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER);\n-- DOWN\nDROP TABLE users;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '002_create_settings.sql'),
        '-- UP\nCREATE TABLE settings (id INTEGER);\n-- DOWN\nDROP TABLE settings;'
      );

      // Apply first migration only
      migrationRunner.runMigrations();

      // Add new migration
      fs.writeFileSync(
        path.join(testMigrationsPath, '003_create_data.sql'),
        '-- UP\nCREATE TABLE data (id INTEGER);\n-- DOWN\nDROP TABLE data;'
      );

      const status = migrationRunner.getStatus();

      expect(status.currentVersion).toBe(2);
      expect(status.appliedMigrations).toBe(2);
      expect(status.pendingMigrations).toBe(1);
      expect(status.totalMigrations).toBe(3);
      expect(status.pending).toHaveLength(1);
      expect(status.pending[0]).toMatchObject({ version: 3, name: 'create_data' });
    });

    /* Preconditions: all migrations applied
       Action: call getStatus()
       Assertions: pendingMigrations 0, empty pending array, appliedMigrations equals totalMigrations
       Requirements: clerkly.2*/
    it('should return correct status when all migrations applied', () => {
      // Create and apply migrations
      fs.writeFileSync(
        path.join(testMigrationsPath, '001_create_users.sql'),
        '-- UP\nCREATE TABLE users (id INTEGER);\n-- DOWN\nDROP TABLE users;'
      );
      fs.writeFileSync(
        path.join(testMigrationsPath, '002_create_settings.sql'),
        '-- UP\nCREATE TABLE settings (id INTEGER);\n-- DOWN\nDROP TABLE settings;'
      );

      migrationRunner.runMigrations();

      const status = migrationRunner.getStatus();

      expect(status.currentVersion).toBe(2);
      expect(status.appliedMigrations).toBe(2);
      expect(status.pendingMigrations).toBe(0);
      expect(status.totalMigrations).toBe(2);
      expect(status.pending).toEqual([]);
    });
  });
});
