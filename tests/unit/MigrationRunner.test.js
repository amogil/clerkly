// Requirements: clerkly.2.1, clerkly.2.3
const MigrationRunner = require('../../src/main/MigrationRunner');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('MigrationRunner', () => {
  let db;
  let testDbPath;
  let testMigrationsPath;
  let migrationRunner;

  beforeEach(() => {
    // Create temporary database
    testDbPath = path.join(os.tmpdir(), `test-migrations-${Date.now()}-${Math.random()}.db`);
    db = new Database(testDbPath);

    // Create temporary migrations directory
    testMigrationsPath = path.join(os.tmpdir(), `test-migrations-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(testMigrationsPath, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testMigrationsPath)) {
      fs.rmSync(testMigrationsPath, { recursive: true, force: true });
    }
  });

  describe('Constructor', () => {
    /* Preconditions: Database instance and migrations path available
       Action: create MigrationRunner instance with valid parameters
       Assertions: instance is created with correct properties
       Requirements: clerkly.1.4 */
    it('should create instance with valid parameters', () => {
      migrationRunner = new MigrationRunner(db, testMigrationsPath);
      
      expect(migrationRunner).toBeDefined();
      expect(migrationRunner.db).toBe(db);
      expect(migrationRunner.migrationsPath).toBe(testMigrationsPath);
    });

    /* Preconditions: MigrationRunner class available
       Action: attempt to create instance without database
       Assertions: throws error about missing database
       Requirements: clerkly.1.4 */
    it('should reject missing database', () => {
      expect(() => new MigrationRunner(null, testMigrationsPath))
        .toThrow('Database instance is required');
    });

    /* Preconditions: MigrationRunner class available
       Action: attempt to create instance with empty migrations path
       Assertions: throws error about invalid migrations path
       Requirements: clerkly.1.4 */
    it('should reject empty migrations path', () => {
      expect(() => new MigrationRunner(db, ''))
        .toThrow('Invalid migrationsPath: must be non-empty string');
    });

    /* Preconditions: MigrationRunner class available
       Action: attempt to create instance with null migrations path
       Assertions: throws error about invalid migrations path
       Requirements: clerkly.1.4 */
    it('should reject null migrations path', () => {
      expect(() => new MigrationRunner(db, null))
        .toThrow('Invalid migrationsPath: must be non-empty string');
    });
  });

  describe('initializeMigrationTable()', () => {
    beforeEach(() => {
      migrationRunner = new MigrationRunner(db, testMigrationsPath);
    });

    /* Preconditions: database initialized, no schema_migrations table
       Action: call initializeMigrationTable()
       Assertions: creates schema_migrations table with correct schema
       Requirements: clerkly.1.4 */
    it('should create schema_migrations table', () => {
      migrationRunner.initializeMigrationTable();

      const tableInfo = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      ).get();

      expect(tableInfo).toBeDefined();
      expect(tableInfo.name).toBe('schema_migrations');
    });

    /* Preconditions: schema_migrations table already exists
       Action: call initializeMigrationTable() again
       Assertions: does not throw error, table remains intact
       Requirements: clerkly.1.4 */
    it('should handle existing table gracefully', () => {
      migrationRunner.initializeMigrationTable();
      
      expect(() => migrationRunner.initializeMigrationTable()).not.toThrow();
    });
  });

  describe('getCurrentVersion()', () => {
    beforeEach(() => {
      migrationRunner = new MigrationRunner(db, testMigrationsPath);
    });

    /* Preconditions: database initialized, no migrations applied
       Action: call getCurrentVersion()
       Assertions: returns 0
       Requirements: clerkly.1.4 */
    it('should return 0 when no migrations applied', () => {
      migrationRunner.initializeMigrationTable();
      
      const version = migrationRunner.getCurrentVersion();
      
      expect(version).toBe(0);
    });

    /* Preconditions: database initialized, schema_migrations table does not exist
       Action: call getCurrentVersion()
       Assertions: returns 0 without throwing error
       Requirements: clerkly.1.4 */
    it('should return 0 when table does not exist', () => {
      const version = migrationRunner.getCurrentVersion();
      
      expect(version).toBe(0);
    });

    /* Preconditions: database initialized, migrations applied
       Action: insert migration records and call getCurrentVersion()
       Assertions: returns highest version number
       Requirements: clerkly.1.4 */
    it('should return highest version when migrations applied', () => {
      migrationRunner.initializeMigrationTable();
      
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(1, 'first_migration', Date.now());
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(2, 'second_migration', Date.now());
      
      const version = migrationRunner.getCurrentVersion();
      
      expect(version).toBe(2);
    });
  });

  describe('getAppliedMigrations()', () => {
    beforeEach(() => {
      migrationRunner = new MigrationRunner(db, testMigrationsPath);
    });

    /* Preconditions: database initialized, no migrations applied
       Action: call getAppliedMigrations()
       Assertions: returns empty array
       Requirements: clerkly.1.4 */
    it('should return empty array when no migrations applied', () => {
      migrationRunner.initializeMigrationTable();
      
      const applied = migrationRunner.getAppliedMigrations();
      
      expect(applied).toEqual([]);
    });

    /* Preconditions: database initialized, schema_migrations table does not exist
       Action: call getAppliedMigrations()
       Assertions: returns empty array without throwing error
       Requirements: clerkly.1.4 */
    it('should return empty array when table does not exist', () => {
      const applied = migrationRunner.getAppliedMigrations();
      
      expect(applied).toEqual([]);
    });

    /* Preconditions: database initialized, multiple migrations applied
       Action: insert migration records and call getAppliedMigrations()
       Assertions: returns sorted array of version numbers
       Requirements: clerkly.1.4 */
    it('should return sorted array of applied versions', () => {
      migrationRunner.initializeMigrationTable();
      
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(2, 'second_migration', Date.now());
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(1, 'first_migration', Date.now());
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(3, 'third_migration', Date.now());
      
      const applied = migrationRunner.getAppliedMigrations();
      
      expect(applied).toEqual([1, 2, 3]);
    });
  });

  describe('loadMigrations()', () => {
    beforeEach(() => {
      migrationRunner = new MigrationRunner(db, testMigrationsPath);
    });

    /* Preconditions: migrations directory does not exist
       Action: call loadMigrations()
       Assertions: throws error about missing directory
       Requirements: clerkly.1.4 */
    it('should throw error when migrations directory does not exist', () => {
      fs.rmSync(testMigrationsPath, { recursive: true, force: true });
      
      expect(() => migrationRunner.loadMigrations())
        .toThrow('Migrations directory not found');
    });

    /* Preconditions: migrations directory is empty
       Action: call loadMigrations()
       Assertions: returns empty array
       Requirements: clerkly.1.4 */
    it('should return empty array when no migration files exist', () => {
      const migrations = migrationRunner.loadMigrations();
      
      expect(migrations).toEqual([]);
    });

    /* Preconditions: valid migration file exists
       Action: create migration file and call loadMigrations()
       Assertions: returns array with migration object
       Requirements: clerkly.1.4 */
    it('should load valid migration files', () => {
      const migrationContent = `
        module.exports = {
          version: 1,
          name: 'test_migration',
          description: 'Test migration',
          up(db) { db.exec('CREATE TABLE test (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE test'); }
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_test.js'), migrationContent);
      
      const migrations = migrationRunner.loadMigrations();
      
      expect(migrations).toHaveLength(1);
      expect(migrations[0].version).toBe(1);
      expect(migrations[0].name).toBe('test_migration');
    });

    /* Preconditions: multiple migration files exist
       Action: create multiple migration files and call loadMigrations()
       Assertions: returns sorted array by version
       Requirements: clerkly.1.4 */
    it('should load and sort multiple migrations by version', () => {
      const migration1 = `
        module.exports = {
          version: 2,
          name: 'second_migration',
          up(db) {},
          down(db) {}
        };
      `;
      const migration2 = `
        module.exports = {
          version: 1,
          name: 'first_migration',
          up(db) {},
          down(db) {}
        };
      `;
      
      fs.writeFileSync(path.join(testMigrationsPath, '002_second.js'), migration1);
      fs.writeFileSync(path.join(testMigrationsPath, '001_first.js'), migration2);
      
      const migrations = migrationRunner.loadMigrations();
      
      expect(migrations).toHaveLength(2);
      expect(migrations[0].version).toBe(1);
      expect(migrations[1].version).toBe(2);
    });

    /* Preconditions: migration file with missing version
       Action: create invalid migration file and call loadMigrations()
       Assertions: throws error about invalid migration
       Requirements: clerkly.1.4 */
    it('should reject migration without version', () => {
      const invalidMigration = `
        module.exports = {
          name: 'invalid_migration',
          up(db) {},
          down(db) {}
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_invalid.js'), invalidMigration);
      
      expect(() => migrationRunner.loadMigrations())
        .toThrow('missing or invalid version');
    });

    /* Preconditions: migration file with missing name
       Action: create invalid migration file and call loadMigrations()
       Assertions: throws error about invalid migration
       Requirements: clerkly.1.4 */
    it('should reject migration without name', () => {
      const invalidMigration = `
        module.exports = {
          version: 1,
          up(db) {},
          down(db) {}
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_invalid.js'), invalidMigration);
      
      expect(() => migrationRunner.loadMigrations())
        .toThrow('missing or invalid name');
    });

    /* Preconditions: migration file with missing up function
       Action: create invalid migration file and call loadMigrations()
       Assertions: throws error about missing up function
       Requirements: clerkly.1.4 */
    it('should reject migration without up function', () => {
      const invalidMigration = `
        module.exports = {
          version: 1,
          name: 'invalid_migration',
          down(db) {}
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_invalid.js'), invalidMigration);
      
      expect(() => migrationRunner.loadMigrations())
        .toThrow('missing up() function');
    });

    /* Preconditions: migration file with missing down function
       Action: create invalid migration file and call loadMigrations()
       Assertions: throws error about missing down function
       Requirements: clerkly.1.4 */
    it('should reject migration without down function', () => {
      const invalidMigration = `
        module.exports = {
          version: 1,
          name: 'invalid_migration',
          up(db) {}
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_invalid.js'), invalidMigration);
      
      expect(() => migrationRunner.loadMigrations())
        .toThrow('missing down() function');
    });
  });

  describe('runMigrations()', () => {
    beforeEach(() => {
      migrationRunner = new MigrationRunner(db, testMigrationsPath);
    });

    /* Preconditions: no migration files exist
       Action: call runMigrations()
       Assertions: returns success with 0 applied migrations
       Requirements: clerkly.1.4 */
    it('should handle no pending migrations', () => {
      const result = migrationRunner.runMigrations();
      
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
      expect(result.message).toContain('No pending migrations');
    });

    /* Preconditions: valid migration file exists, not yet applied
       Action: call runMigrations()
       Assertions: applies migration, records in tracking table, returns success
       Requirements: clerkly.1.4 */
    it('should apply pending migrations', () => {
      const migrationContent = `
        module.exports = {
          version: 1,
          name: 'test_migration',
          description: 'Test migration',
          up(db) { 
            db.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY)'); 
          },
          down(db) { 
            db.exec('DROP TABLE test_table'); 
          }
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_test.js'), migrationContent);
      
      const result = migrationRunner.runMigrations();
      
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(1);
      
      // Verify table was created
      const tableInfo = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'"
      ).get();
      expect(tableInfo).toBeDefined();
      
      // Verify migration was recorded
      const migrationRecord = db.prepare(
        'SELECT * FROM schema_migrations WHERE version = 1'
      ).get();
      expect(migrationRecord).toBeDefined();
      expect(migrationRecord.name).toBe('test_migration');
    });

    /* Preconditions: multiple migration files exist, none applied
       Action: call runMigrations()
       Assertions: applies all migrations in order
       Requirements: clerkly.1.4 */
    it('should apply multiple pending migrations in order', () => {
      const migration1 = `
        module.exports = {
          version: 1,
          name: 'first_migration',
          up(db) { db.exec('CREATE TABLE table1 (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE table1'); }
        };
      `;
      const migration2 = `
        module.exports = {
          version: 2,
          name: 'second_migration',
          up(db) { db.exec('CREATE TABLE table2 (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE table2'); }
        };
      `;
      
      fs.writeFileSync(path.join(testMigrationsPath, '001_first.js'), migration1);
      fs.writeFileSync(path.join(testMigrationsPath, '002_second.js'), migration2);
      
      const result = migrationRunner.runMigrations();
      
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(2);
      
      // Verify both tables were created
      const table1 = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='table1'"
      ).get();
      const table2 = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='table2'"
      ).get();
      expect(table1).toBeDefined();
      expect(table2).toBeDefined();
    });

    /* Preconditions: migration already applied
       Action: call runMigrations() again
       Assertions: skips already applied migration
       Requirements: clerkly.1.4 */
    it('should skip already applied migrations', () => {
      const migrationContent = `
        module.exports = {
          version: 1,
          name: 'test_migration',
          up(db) { db.exec('CREATE TABLE test_table (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE test_table'); }
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_test.js'), migrationContent);
      
      // Apply migration first time
      const result1 = migrationRunner.runMigrations();
      expect(result1.success).toBe(true);
      expect(result1.appliedCount).toBe(1);
      
      // Try to apply again
      const result2 = migrationRunner.runMigrations();
      expect(result2.success).toBe(true);
      expect(result2.appliedCount).toBe(0);
      expect(result2.message).toContain('No pending migrations');
    });

    /* Preconditions: migration file with error in up function
       Action: call runMigrations()
       Assertions: returns failure with error message
       Requirements: clerkly.1.4 */
    it('should handle migration errors', () => {
      const invalidMigration = `
        module.exports = {
          version: 1,
          name: 'failing_migration',
          up(db) { 
            throw new Error('Migration failed intentionally'); 
          },
          down(db) {}
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_failing.js'), invalidMigration);
      
      const result = migrationRunner.runMigrations();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration failed intentionally');
    });
  });

  describe('rollbackLastMigration()', () => {
    beforeEach(() => {
      migrationRunner = new MigrationRunner(db, testMigrationsPath);
    });

    /* Preconditions: no migrations applied
       Action: call rollbackLastMigration()
       Assertions: returns failure with message about no migrations to rollback
       Requirements: clerkly.1.4 */
    it('should handle no migrations to rollback', () => {
      migrationRunner.initializeMigrationTable();
      
      const result = migrationRunner.rollbackLastMigration();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No migrations to rollback');
    });

    /* Preconditions: migration applied
       Action: call rollbackLastMigration()
       Assertions: reverts migration, removes from tracking table
       Requirements: clerkly.1.4 */
    it('should rollback last migration', () => {
      const migrationContent = `
        module.exports = {
          version: 1,
          name: 'test_migration',
          up(db) { db.exec('CREATE TABLE test_table (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE test_table'); }
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_test.js'), migrationContent);
      
      // Apply migration
      migrationRunner.runMigrations();
      
      // Verify table exists
      let tableInfo = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'"
      ).get();
      expect(tableInfo).toBeDefined();
      
      // Rollback
      const result = migrationRunner.rollbackLastMigration();
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Rolled back migration test_migration');
      
      // Verify table was dropped
      tableInfo = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'"
      ).get();
      expect(tableInfo).toBeUndefined();
      
      // Verify migration record was removed
      const migrationRecord = db.prepare(
        'SELECT * FROM schema_migrations WHERE version = 1'
      ).get();
      expect(migrationRecord).toBeUndefined();
    });

    /* Preconditions: multiple migrations applied
       Action: call rollbackLastMigration()
       Assertions: rolls back only the most recent migration
       Requirements: clerkly.1.4 */
    it('should rollback only the last migration', () => {
      const migration1 = `
        module.exports = {
          version: 1,
          name: 'first_migration',
          up(db) { db.exec('CREATE TABLE table1 (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE table1'); }
        };
      `;
      const migration2 = `
        module.exports = {
          version: 2,
          name: 'second_migration',
          up(db) { db.exec('CREATE TABLE table2 (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE table2'); }
        };
      `;
      
      fs.writeFileSync(path.join(testMigrationsPath, '001_first.js'), migration1);
      fs.writeFileSync(path.join(testMigrationsPath, '002_second.js'), migration2);
      
      // Apply both migrations
      migrationRunner.runMigrations();
      
      // Rollback last one
      const result = migrationRunner.rollbackLastMigration();
      
      expect(result.success).toBe(true);
      
      // Verify table2 was dropped but table1 still exists
      const table1 = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='table1'"
      ).get();
      const table2 = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='table2'"
      ).get();
      expect(table1).toBeDefined();
      expect(table2).toBeUndefined();
      
      // Verify current version is 1
      expect(migrationRunner.getCurrentVersion()).toBe(1);
    });

    /* Preconditions: migration applied but file deleted
       Action: call rollbackLastMigration()
       Assertions: returns failure about missing migration file
       Requirements: clerkly.1.4 */
    it('should handle missing migration file', () => {
      const migrationContent = `
        module.exports = {
          version: 1,
          name: 'test_migration',
          up(db) { db.exec('CREATE TABLE test_table (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE test_table'); }
        };
      `;
      const migrationPath = path.join(testMigrationsPath, '001_test.js');
      fs.writeFileSync(migrationPath, migrationContent);
      
      // Apply migration
      migrationRunner.runMigrations();
      
      // Delete migration file
      fs.unlinkSync(migrationPath);
      
      // Try to rollback
      const result = migrationRunner.rollbackLastMigration();
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Migration file not found');
    });
  });

  describe('getStatus()', () => {
    beforeEach(() => {
      migrationRunner = new MigrationRunner(db, testMigrationsPath);
    });

    /* Preconditions: no migrations exist
       Action: call getStatus()
       Assertions: returns status with version 0 and no migrations
       Requirements: clerkly.1.4 */
    it('should return status with no migrations', () => {
      migrationRunner.initializeMigrationTable();
      
      const status = migrationRunner.getStatus();
      
      expect(status.currentVersion).toBe(0);
      expect(status.appliedMigrations).toBe(0);
      expect(status.pendingMigrations).toBe(0);
      expect(status.totalMigrations).toBe(0);
      expect(status.pending).toEqual([]);
    });

    /* Preconditions: migrations exist but not applied
       Action: call getStatus()
       Assertions: returns status with pending migrations
       Requirements: clerkly.1.4 */
    it('should return status with pending migrations', () => {
      migrationRunner.initializeMigrationTable();
      
      const migrationContent = `
        module.exports = {
          version: 1,
          name: 'test_migration',
          description: 'Test migration description',
          up(db) {},
          down(db) {}
        };
      `;
      fs.writeFileSync(path.join(testMigrationsPath, '001_test.js'), migrationContent);
      
      const status = migrationRunner.getStatus();
      
      expect(status.currentVersion).toBe(0);
      expect(status.appliedMigrations).toBe(0);
      expect(status.pendingMigrations).toBe(1);
      expect(status.totalMigrations).toBe(1);
      expect(status.pending).toHaveLength(1);
      expect(status.pending[0].version).toBe(1);
      expect(status.pending[0].name).toBe('test_migration');
      expect(status.pending[0].description).toBe('Test migration description');
    });

    /* Preconditions: some migrations applied, some pending
       Action: call getStatus()
       Assertions: returns accurate status of applied and pending
       Requirements: clerkly.1.4 */
    it('should return status with mixed applied and pending migrations', () => {
      const migration1 = `
        module.exports = {
          version: 1,
          name: 'first_migration',
          description: 'First',
          up(db) { db.exec('CREATE TABLE table1 (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE table1'); }
        };
      `;
      const migration2 = `
        module.exports = {
          version: 2,
          name: 'second_migration',
          description: 'Second',
          up(db) { db.exec('CREATE TABLE table2 (id INTEGER)'); },
          down(db) { db.exec('DROP TABLE table2'); }
        };
      `;
      
      fs.writeFileSync(path.join(testMigrationsPath, '001_first.js'), migration1);
      fs.writeFileSync(path.join(testMigrationsPath, '002_second.js'), migration2);
      
      // Apply only first migration
      migrationRunner.initializeMigrationTable();
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(1, 'first_migration', Date.now());
      
      const status = migrationRunner.getStatus();
      
      expect(status.currentVersion).toBe(1);
      expect(status.appliedMigrations).toBe(1);
      expect(status.pendingMigrations).toBe(1);
      expect(status.totalMigrations).toBe(2);
      expect(status.pending).toHaveLength(1);
      expect(status.pending[0].version).toBe(2);
    });
  });
});
