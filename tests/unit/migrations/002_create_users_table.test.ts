// Requirements: user-data-isolation.0.1, user-data-isolation.0.5

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MigrationRunner } from '../../../src/main/MigrationRunner';

describe('Migration 002_create_users_table', () => {
  let db: Database.Database;
  let testDbPath: string;
  let testMigrationsPath: string;
  let migrationRunner: MigrationRunner;
  let tempDir: string;

  beforeEach(() => {
    // Create temporary database and migrations directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-002-test-'));
    testDbPath = path.join(tempDir, 'test.db');
    testMigrationsPath = path.join(tempDir, 'migrations');

    // Create migrations directory
    fs.mkdirSync(testMigrationsPath, { recursive: true });

    // Copy migration files from project
    const projectMigrationsPath = path.join(__dirname, '..', '..', '..', 'migrations');
    const migrationFiles = fs.readdirSync(projectMigrationsPath);

    for (const file of migrationFiles) {
      if (file.endsWith('.sql')) {
        const content = fs.readFileSync(path.join(projectMigrationsPath, file), 'utf-8');
        fs.writeFileSync(path.join(testMigrationsPath, file), content);
      }
    }

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
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('UP migration', () => {
    /* Preconditions: database is empty, migrations not applied
       Action: run all migrations
       Assertions: users table is created with correct structure (user_id, name, email)
       Requirements: user-data-isolation.0.1 */
    it('should create users table with correct structure', () => {
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Verify table exists
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      expect(tableExists).toBeDefined();
      expect(tableExists).toHaveProperty('name', 'users');

      // Verify table structure - check minimum required columns
      const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }>;

      // At least 3 columns from migration 002 (may have more from later migrations)
      expect(columns.length).toBeGreaterThanOrEqual(3);

      // Check user_id column
      const userIdCol = columns.find((c) => c.name === 'user_id');
      expect(userIdCol).toBeDefined();
      expect(userIdCol?.type).toBe('TEXT');
      expect(userIdCol?.pk).toBe(1); // Primary key

      // Check name column
      const nameCol = columns.find((c) => c.name === 'name');
      expect(nameCol).toBeDefined();
      expect(nameCol?.type).toBe('TEXT');
      expect(nameCol?.notnull).toBe(0); // Can be NULL

      // Check email column
      const emailCol = columns.find((c) => c.name === 'email');
      expect(emailCol).toBeDefined();
      expect(emailCol?.type).toBe('TEXT');
      expect(emailCol?.notnull).toBe(1); // NOT NULL
    });

    /* Preconditions: database is empty, migrations not applied
       Action: run all migrations
       Assertions: idx_users_email index is created on email column
       Requirements: user-data-isolation.0.5 */
    it('should create idx_users_email index on email column', () => {
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Verify index exists
      const indexExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_email'")
        .get();
      expect(indexExists).toBeDefined();
      expect(indexExists).toHaveProperty('name', 'idx_users_email');

      // Verify index is on users table
      const indexInfo = db.prepare('PRAGMA index_info(idx_users_email)').all() as Array<{
        seqno: number;
        cid: number;
        name: string;
      }>;
      expect(indexInfo).toHaveLength(1);
      expect(indexInfo[0].name).toBe('email');
    });

    /* Preconditions: database is empty, migrations not applied
       Action: run all migrations
       Assertions: email column has UNIQUE constraint
       Requirements: user-data-isolation.0.1 */
    it('should enforce UNIQUE constraint on email column', () => {
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Insert first user
      db.prepare('INSERT INTO users (user_id, name, email) VALUES (?, ?, ?)').run(
        'abc123xyz0',
        'Test User',
        'test@example.com'
      );

      // Try to insert duplicate email - should fail
      expect(() => {
        db.prepare('INSERT INTO users (user_id, name, email) VALUES (?, ?, ?)').run(
          'def456uvw1',
          'Another User',
          'test@example.com'
        );
      }).toThrow(/UNIQUE constraint failed/);
    });

    /* Preconditions: database is empty, migrations not applied
       Action: run all migrations
       Assertions: name column allows NULL values
       Requirements: user-data-isolation.0.1 */
    it('should allow NULL values for name column', () => {
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Insert user with NULL name - should succeed
      expect(() => {
        db.prepare('INSERT INTO users (user_id, name, email) VALUES (?, ?, ?)').run(
          'abc123xyz0',
          null,
          'test@example.com'
        );
      }).not.toThrow();

      // Verify user was inserted
      const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get('abc123xyz0') as {
        user_id: string;
        name: string | null;
        email: string;
      };
      expect(user).toBeDefined();
      expect(user.name).toBeNull();
    });
  });

  describe('DOWN migration', () => {
    /* Preconditions: migrations applied, users table exists
       Action: rollback migration 002
       Assertions: users table is dropped
       Requirements: user-data-isolation.0.1 */
    it('should drop users table on rollback', () => {
      // Apply migrations
      const applyResult = migrationRunner.runMigrations();
      expect(applyResult.success).toBe(true);

      // Verify table exists before rollback
      let tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      expect(tableExists).toBeDefined();

      // Rollback all migrations after 002 (004, 003)
      let rollbackResult = migrationRunner.rollbackLastMigration(); // 004
      expect(rollbackResult.success).toBe(true);
      rollbackResult = migrationRunner.rollbackLastMigration(); // 003
      expect(rollbackResult.success).toBe(true);

      // Rollback migration 002
      rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Verify table is dropped
      tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        .get();
      expect(tableExists).toBeUndefined();
    });

    /* Preconditions: migrations applied, idx_users_email index exists
       Action: rollback migration 002
       Assertions: idx_users_email index is dropped
       Requirements: user-data-isolation.0.5 */
    it('should drop idx_users_email index on rollback', () => {
      // Apply migrations
      const applyResult = migrationRunner.runMigrations();
      expect(applyResult.success).toBe(true);

      // Verify index exists before rollback
      let indexExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_email'")
        .get();
      expect(indexExists).toBeDefined();

      // Rollback all migrations after 002 (004, 003)
      let rollbackResult = migrationRunner.rollbackLastMigration(); // 004
      expect(rollbackResult.success).toBe(true);
      rollbackResult = migrationRunner.rollbackLastMigration(); // 003
      expect(rollbackResult.success).toBe(true);

      // Rollback migration 002
      rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Verify index is dropped
      indexExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_users_email'")
        .get();
      expect(indexExists).toBeUndefined();
    });
  });

  describe('Migration idempotency', () => {
    /* Preconditions: migrations already applied
       Action: run migrations again
       Assertions: no error, appliedCount is 0
       Requirements: user-data-isolation.0.1 */
    it('should be idempotent - running twice does not cause errors', () => {
      // Apply migrations first time
      const firstResult = migrationRunner.runMigrations();
      expect(firstResult.success).toBe(true);

      // Apply migrations second time
      const secondResult = migrationRunner.runMigrations();
      expect(secondResult.success).toBe(true);
      expect(secondResult.appliedCount).toBe(0);
      expect(secondResult.message).toContain('All migrations already applied');
    });
  });
});
