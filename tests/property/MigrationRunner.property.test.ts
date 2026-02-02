// Requirements: clerkly.1.4, clerkly.nfr.2.1, clerkly.2.6, clerkly.2.8
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MigrationRunner } from '../../src/main/MigrationRunner';

describe('Property Tests - Migration Runner', () => {
  let db: Database.Database;
  let testDbPath: string;
  let testMigrationsPath: string;
  let migrationRunner: MigrationRunner;
  let tempDir: string;

  beforeEach(() => {
    // Create temporary database and migrations directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-property-test-'));
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

    // Remove temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  /* Preconditions: database is empty, random set of migration files created
     Action: apply migrations, record database state, attempt to apply migrations again
     Assertions: for all migration sets, version and database state unchanged after second application
     Requirements: clerkly.1.4, clerkly.nfr.2.1, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 5
  test('Property 5: Migration Idempotence - applying migrations twice does not change database state', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random number of migrations (1-5)
        fc.integer({ min: 1, max: 5 }),
        async (migrationCount: number) => {
          // Clean up any existing migration files from previous iterations
          if (fs.existsSync(testMigrationsPath)) {
            const existingFiles = fs.readdirSync(testMigrationsPath);
            existingFiles.forEach((file) => {
              if (file.endsWith('.sql')) {
                fs.unlinkSync(path.join(testMigrationsPath, file));
              }
            });
          }

          // Close and recreate database for clean state
          if (db && db.open) {
            db.close();
          }
          if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
          }
          db = new Database(testDbPath);
          migrationRunner = new MigrationRunner(db, testMigrationsPath);

          // Create migration files
          for (let i = 1; i <= migrationCount; i++) {
            const migrationContent = `-- UP
CREATE TABLE test_table_${i} (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_test_table_${i}_name ON test_table_${i}(name);

-- DOWN
DROP INDEX idx_test_table_${i}_name;
DROP TABLE test_table_${i};`;

            fs.writeFileSync(
              path.join(testMigrationsPath, `${String(i).padStart(3, '0')}_create_table_${i}.sql`),
              migrationContent
            );
          }

          // Apply migrations first time
          const firstResult = migrationRunner.runMigrations();

          // Verify first application succeeded
          expect(firstResult.success).toBe(true);
          expect(firstResult.appliedCount).toBe(migrationCount);

          // Record database state after first application
          const versionAfterFirst = migrationRunner.getCurrentVersion();
          const appliedAfterFirst = migrationRunner.getAppliedMigrations();
          const statusAfterFirst = migrationRunner.getStatus();

          // Get list of tables created
          const tablesAfterFirst = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .all() as Array<{ name: string }>;

          // Get list of indexes created
          const indexesAfterFirst = db
            .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
            .all() as Array<{ name: string }>;

          // Attempt to apply migrations again (should be idempotent)
          const secondResult = migrationRunner.runMigrations();

          // Verify second application reports no changes
          expect(secondResult.success).toBe(true);
          expect(secondResult.appliedCount).toBe(0);
          expect(secondResult.message).toContain('All migrations already applied');

          // Verify database state unchanged
          const versionAfterSecond = migrationRunner.getCurrentVersion();
          const appliedAfterSecond = migrationRunner.getAppliedMigrations();
          const statusAfterSecond = migrationRunner.getStatus();

          // Version should be unchanged
          expect(versionAfterSecond).toBe(versionAfterFirst);

          // Applied migrations list should be unchanged
          expect(appliedAfterSecond).toEqual(appliedAfterFirst);

          // Status should be unchanged
          expect(statusAfterSecond.currentVersion).toBe(statusAfterFirst.currentVersion);
          expect(statusAfterSecond.appliedMigrations).toBe(statusAfterFirst.appliedMigrations);
          expect(statusAfterSecond.pendingMigrations).toBe(0);
          expect(statusAfterSecond.pending).toEqual([]);

          // Tables should be unchanged
          const tablesAfterSecond = db
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .all() as Array<{ name: string }>;
          expect(tablesAfterSecond).toEqual(tablesAfterFirst);

          // Indexes should be unchanged
          const indexesAfterSecond = db
            .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
            .all() as Array<{ name: string }>;
          expect(indexesAfterSecond).toEqual(indexesAfterFirst);

          // Verify all expected tables exist
          const tableNames = tablesAfterSecond.map((t) => t.name);
          for (let i = 1; i <= migrationCount; i++) {
            expect(tableNames).toContain(`test_table_${i}`);
          }

          // Verify all expected indexes exist
          const indexNames = indexesAfterSecond.map((idx) => idx.name);
          for (let i = 1; i <= migrationCount; i++) {
            expect(indexNames).toContain(`idx_test_table_${i}_name`);
          }
        }
      ),
      { numRuns: 100 }
    );
  }, 30000); // 30 second Jest timeout for property test

  /* Preconditions: database is empty, no migration files exist
     Action: attempt to apply migrations twice
     Assertions: both applications return success with 0 applied count, database remains empty
     Requirements: clerkly.1.4, clerkly.nfr.2.1, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 5
  test('Property 5 edge case: empty database with no migrations is idempotent', () => {
    // First application
    const firstResult = migrationRunner.runMigrations();
    expect(firstResult.success).toBe(true);
    expect(firstResult.appliedCount).toBe(0);
    expect(firstResult.message).toContain('No migrations found');

    const versionAfterFirst = migrationRunner.getCurrentVersion();
    expect(versionAfterFirst).toBe(0);

    // Second application
    const secondResult = migrationRunner.runMigrations();
    expect(secondResult.success).toBe(true);
    expect(secondResult.appliedCount).toBe(0);

    const versionAfterSecond = migrationRunner.getCurrentVersion();
    expect(versionAfterSecond).toBe(0);

    // Verify no tables created (except schema_migrations)
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != 'schema_migrations'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(0);
  });

  /* Preconditions: database has partially applied migrations
     Action: add new migrations, apply all, attempt to apply again
     Assertions: only new migrations applied first time, no changes second time
     Requirements: clerkly.1.4, clerkly.nfr.2.1, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 5
  test('Property 5 edge case: partially applied migrations remain idempotent', () => {
    // Create and apply first migration
    fs.writeFileSync(
      path.join(testMigrationsPath, '001_first.sql'),
      `-- UP
CREATE TABLE first_table (id INTEGER PRIMARY KEY);

-- DOWN
DROP TABLE first_table;`
    );

    const firstResult = migrationRunner.runMigrations();
    expect(firstResult.success).toBe(true);
    expect(firstResult.appliedCount).toBe(1);

    const versionAfterFirst = migrationRunner.getCurrentVersion();
    expect(versionAfterFirst).toBe(1);

    // Add second migration
    fs.writeFileSync(
      path.join(testMigrationsPath, '002_second.sql'),
      `-- UP
CREATE TABLE second_table (id INTEGER PRIMARY KEY);

-- DOWN
DROP TABLE second_table;`
    );

    // Apply new migration
    const secondResult = migrationRunner.runMigrations();
    expect(secondResult.success).toBe(true);
    expect(secondResult.appliedCount).toBe(1); // Only new migration

    const versionAfterSecond = migrationRunner.getCurrentVersion();
    expect(versionAfterSecond).toBe(2);

    // Attempt to apply again (should be idempotent)
    const thirdResult = migrationRunner.runMigrations();
    expect(thirdResult.success).toBe(true);
    expect(thirdResult.appliedCount).toBe(0);
    expect(thirdResult.message).toContain('All migrations already applied');

    const versionAfterThird = migrationRunner.getCurrentVersion();
    expect(versionAfterThird).toBe(2);

    // Verify both tables exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name != 'schema_migrations' ORDER BY name"
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(2);
    expect(tables[0].name).toBe('first_table');
    expect(tables[1].name).toBe('second_table');
  });

  /* Preconditions: all migrations already applied
     Action: attempt to apply migrations multiple times
     Assertions: all attempts return success with 0 applied count, database unchanged
     Requirements: clerkly.1.4, clerkly.nfr.2.1, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 5
  test('Property 5 edge case: fully applied migrations remain idempotent across multiple attempts', () => {
    // Create migrations
    fs.writeFileSync(
      path.join(testMigrationsPath, '001_first.sql'),
      `-- UP
CREATE TABLE first_table (id INTEGER PRIMARY KEY);

-- DOWN
DROP TABLE first_table;`
    );
    fs.writeFileSync(
      path.join(testMigrationsPath, '002_second.sql'),
      `-- UP
CREATE TABLE second_table (id INTEGER PRIMARY KEY);

-- DOWN
DROP TABLE second_table;`
    );

    // Apply all migrations
    const firstResult = migrationRunner.runMigrations();
    expect(firstResult.success).toBe(true);
    expect(firstResult.appliedCount).toBe(2);

    const versionAfterFirst = migrationRunner.getCurrentVersion();
    const appliedAfterFirst = migrationRunner.getAppliedMigrations();

    // Attempt to apply 5 more times
    for (let i = 0; i < 5; i++) {
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);
      expect(result.appliedCount).toBe(0);
      expect(result.message).toContain('All migrations already applied');

      // Verify state unchanged
      const currentVersion = migrationRunner.getCurrentVersion();
      const currentApplied = migrationRunner.getAppliedMigrations();

      expect(currentVersion).toBe(versionAfterFirst);
      expect(currentApplied).toEqual(appliedAfterFirst);
    }

    // Verify tables still exist
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name != 'schema_migrations' ORDER BY name"
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(2);
  });

  /* Preconditions: migrations with complex schema changes (indexes, constraints)
     Action: apply migrations, verify schema, attempt to apply again
     Assertions: schema unchanged after second application, no errors
     Requirements: clerkly.1.4, clerkly.nfr.2.1, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 5
  test('Property 5 edge case: complex migrations with indexes and constraints are idempotent', () => {
    // Create complex migration
    fs.writeFileSync(
      path.join(testMigrationsPath, '001_complex.sql'),
      `-- UP
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at);

-- DOWN
DROP INDEX idx_posts_created_at;
DROP INDEX idx_posts_user_id;
DROP TABLE posts;
DROP INDEX idx_users_created_at;
DROP INDEX idx_users_email;
DROP TABLE users;`
    );

    // Apply migration
    const firstResult = migrationRunner.runMigrations();
    expect(firstResult.success).toBe(true);
    expect(firstResult.appliedCount).toBe(1);

    // Record schema state
    const tablesAfterFirst = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const indexesAfterFirst = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
      .all() as Array<{ name: string }>;

    // Attempt to apply again
    const secondResult = migrationRunner.runMigrations();
    expect(secondResult.success).toBe(true);
    expect(secondResult.appliedCount).toBe(0);

    // Verify schema unchanged
    const tablesAfterSecond = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const indexesAfterSecond = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name")
      .all() as Array<{ name: string }>;

    expect(tablesAfterSecond).toEqual(tablesAfterFirst);
    expect(indexesAfterSecond).toEqual(indexesAfterFirst);

    // Verify expected tables exist
    const tableNames = tablesAfterSecond.map((t) => t.name);
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('posts');

    // Verify expected indexes exist
    const indexNames = indexesAfterSecond.map((idx) => idx.name);
    expect(indexNames).toContain('idx_users_email');
    expect(indexNames).toContain('idx_users_created_at');
    expect(indexNames).toContain('idx_posts_user_id');
    expect(indexNames).toContain('idx_posts_created_at');
  });

  /* Preconditions: migrations applied, then rolled back, then reapplied
     Action: apply, rollback, apply again, attempt to apply once more
     Assertions: final state matches first application, idempotent after reapplication
     Requirements: clerkly.1.4, clerkly.nfr.2.1, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 5
  test('Property 5 edge case: migrations remain idempotent after rollback and reapplication', () => {
    // Create migration
    fs.writeFileSync(
      path.join(testMigrationsPath, '001_test.sql'),
      `-- UP
CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT);

-- DOWN
DROP TABLE test_table;`
    );

    // Apply migration
    const firstResult = migrationRunner.runMigrations();
    expect(firstResult.success).toBe(true);
    expect(firstResult.appliedCount).toBe(1);

    const versionAfterFirst = migrationRunner.getCurrentVersion();
    expect(versionAfterFirst).toBe(1);

    // Rollback migration
    const rollbackResult = migrationRunner.rollbackLastMigration();
    expect(rollbackResult.success).toBe(true);

    const versionAfterRollback = migrationRunner.getCurrentVersion();
    expect(versionAfterRollback).toBe(0);

    // Reapply migration
    const reapplyResult = migrationRunner.runMigrations();
    expect(reapplyResult.success).toBe(true);
    expect(reapplyResult.appliedCount).toBe(1);

    const versionAfterReapply = migrationRunner.getCurrentVersion();
    expect(versionAfterReapply).toBe(1);

    // Attempt to apply again (should be idempotent)
    const finalResult = migrationRunner.runMigrations();
    expect(finalResult.success).toBe(true);
    expect(finalResult.appliedCount).toBe(0);
    expect(finalResult.message).toContain('All migrations already applied');

    const versionAfterFinal = migrationRunner.getCurrentVersion();
    expect(versionAfterFinal).toBe(1);

    // Verify table exists
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  /* Preconditions: migrations with data insertion
     Action: apply migrations with INSERT statements, verify data, attempt to apply again
     Assertions: data unchanged after second application, no duplicate inserts
     Requirements: clerkly.1.4, clerkly.nfr.2.1, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 5
  test('Property 5 edge case: migrations with data insertion are idempotent', () => {
    // Create migration with data insertion
    fs.writeFileSync(
      path.join(testMigrationsPath, '001_with_data.sql'),
      `-- UP
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO config (key, value) VALUES ('version', '1.0.0');
INSERT INTO config (key, value) VALUES ('app_name', 'Clerkly');
INSERT INTO config (key, value) VALUES ('initialized', '1');

-- DOWN
DROP TABLE config;`
    );

    // Apply migration
    const firstResult = migrationRunner.runMigrations();
    expect(firstResult.success).toBe(true);
    expect(firstResult.appliedCount).toBe(1);

    // Verify data inserted
    const dataAfterFirst = db.prepare('SELECT * FROM config ORDER BY key').all() as Array<{
      key: string;
      value: string;
    }>;
    expect(dataAfterFirst).toHaveLength(3);
    expect(dataAfterFirst[0]).toEqual({ key: 'app_name', value: 'Clerkly' });
    expect(dataAfterFirst[1]).toEqual({ key: 'initialized', value: '1' });
    expect(dataAfterFirst[2]).toEqual({ key: 'version', value: '1.0.0' });

    // Attempt to apply again
    const secondResult = migrationRunner.runMigrations();
    expect(secondResult.success).toBe(true);
    expect(secondResult.appliedCount).toBe(0);

    // Verify data unchanged (no duplicates)
    const dataAfterSecond = db.prepare('SELECT * FROM config ORDER BY key').all() as Array<{
      key: string;
      value: string;
    }>;
    expect(dataAfterSecond).toEqual(dataAfterFirst);
    expect(dataAfterSecond).toHaveLength(3);
  });

  /* Preconditions: schema_migrations table manually corrupted
     Action: manually delete migration record, attempt to apply migrations
     Assertions: system detects and handles corruption gracefully
     Requirements: clerkly.1.4, clerkly.nfr.2.1, clerkly.2.6, clerkly.2.8 */
  // Feature: clerkly, Property 5
  test('Property 5 edge case: system handles schema_migrations table corruption', () => {
    // Create and apply migration
    fs.writeFileSync(
      path.join(testMigrationsPath, '001_test.sql'),
      `-- UP
CREATE TABLE test_table (id INTEGER PRIMARY KEY);

-- DOWN
DROP TABLE test_table;`
    );

    const firstResult = migrationRunner.runMigrations();
    expect(firstResult.success).toBe(true);
    expect(firstResult.appliedCount).toBe(1);

    // Manually corrupt schema_migrations table (delete record but keep table)
    db.prepare('DELETE FROM schema_migrations WHERE version = 1').run();

    // Verify version is now 0
    const versionAfterCorruption = migrationRunner.getCurrentVersion();
    expect(versionAfterCorruption).toBe(0);

    // Attempt to apply migrations again
    // This should fail because table already exists
    const secondResult = migrationRunner.runMigrations();
    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toBeDefined();
    expect(secondResult.error).toContain('already exists');

    // This demonstrates that the system detects inconsistencies
    // In production, this would trigger backup and recovery procedures
  });
});
