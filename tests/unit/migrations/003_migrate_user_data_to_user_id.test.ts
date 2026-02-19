// Requirements: user-data-isolation.2.1, user-data-isolation.2.2, user-data-isolation.5.1, user-data-isolation.5.2, user-data-isolation.5.3, user-data-isolation.5.4

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MigrationRunner } from '../../../src/main/MigrationRunner';

describe('Migration 003_migrate_user_data_to_user_id', () => {
  let db: Database.Database;
  let testDbPath: string;
  let testMigrationsPath: string;
  let migrationRunner: MigrationRunner;
  let tempDir: string;

  beforeEach(() => {
    // Create temporary database and migrations directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-003-test-'));
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

  // Helper to apply only migrations 001 and 002 (before 003)
  const applyMigrationsUpTo002 = () => {
    // Initialize schema_migrations table first
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `);

    // Apply migration 001
    const migration001 = fs.readFileSync(
      path.join(testMigrationsPath, '001_initial_schema.sql'),
      'utf-8'
    );
    const up001 = migration001.split('-- DOWN')[0].replace('-- UP', '').trim();
    db.exec(up001);
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      1,
      'initial_schema',
      Date.now()
    );

    // Apply migration 002
    const migration002 = fs.readFileSync(
      path.join(testMigrationsPath, '002_create_users_table.sql'),
      'utf-8'
    );
    const up002 = migration002.split('-- DOWN')[0].replace('-- UP', '').trim();
    db.exec(up002);
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      2,
      'create_users_table',
      Date.now()
    );
  };

  // Helper to insert test data in old schema (with user_email)
  const insertOldSchemaData = (
    key: string,
    value: string,
    userEmail: string,
    timestamp?: number
  ) => {
    const ts = timestamp || Date.now();
    db.prepare(
      `
      INSERT INTO user_data (key, value, user_email, timestamp, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(key, value, userEmail, ts, ts, ts);
  };

  describe('UP migration', () => {
    /* Preconditions: migrations 001 and 002 applied, user_data has records with user_email
       Action: run migration 003
       Assertions: users records created for each unique email with 10-char hex user_id
       Requirements: user-data-isolation.5.1, user-data-isolation.5.2 */
    it('should create users records for each unique email', () => {
      // Setup: apply migrations 001 and 002
      applyMigrationsUpTo002();

      // Insert test data with different emails
      insertOldSchemaData('key1', '"value1"', 'user1@example.com');
      insertOldSchemaData('key2', '"value2"', 'user2@example.com');
      insertOldSchemaData('key3', '"value3"', 'user1@example.com'); // Same email as key1

      // Run migration 003
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Verify users table has 2 records (one per unique email)
      const users = db.prepare('SELECT * FROM users ORDER BY email').all() as Array<{
        user_id: string;
        name: string | null;
        email: string;
      }>;

      expect(users).toHaveLength(2);
      expect(users[0].email).toBe('user1@example.com');
      expect(users[1].email).toBe('user2@example.com');

      // Verify user_id is 10-character hex string
      expect(users[0].user_id).toMatch(/^[0-9A-F]{10}$/);
      expect(users[1].user_id).toMatch(/^[0-9A-F]{10}$/);

      // Verify name is NULL (not available from old data)
      expect(users[0].name).toBeNull();
      expect(users[1].name).toBeNull();
    });

    /* Preconditions: migrations 001 and 002 applied, user_data has records with user_email
       Action: run migration 003
       Assertions: user_data table has user_id column instead of user_email
       Requirements: user-data-isolation.2.1, user-data-isolation.5.3 */
    it('should migrate user_data from user_email to user_id', () => {
      // Setup: apply migrations 001 and 002
      applyMigrationsUpTo002();

      // Insert test data
      insertOldSchemaData('key1', '"value1"', 'user1@example.com');
      insertOldSchemaData('key2', '"value2"', 'user2@example.com');

      // Run migration 003
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Verify user_data table structure
      const columns = db.prepare('PRAGMA table_info(user_data)').all() as Array<{
        name: string;
        type: string;
      }>;

      const columnNames = columns.map((c) => c.name);
      expect(columnNames).toContain('user_id');
      expect(columnNames).not.toContain('user_email');
      expect(columnNames).not.toContain('timestamp');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    /* Preconditions: migrations 001 and 002 applied, user_data has records
       Action: run migration 003
       Assertions: data is preserved with correct user_id mapping
       Requirements: user-data-isolation.5.1, user-data-isolation.5.3, user-data-isolation.5.4 */
    it('should preserve data with correct user_id mapping', () => {
      // Setup: apply migrations 001 and 002
      applyMigrationsUpTo002();

      // Insert test data
      const timestamp1 = Date.now() - 1000;
      const timestamp2 = Date.now();
      insertOldSchemaData('key1', '"value1"', 'user1@example.com', timestamp1);
      insertOldSchemaData('key2', '"value2"', 'user1@example.com', timestamp2);
      insertOldSchemaData('key3', '"value3"', 'user2@example.com', timestamp2);

      // Run migration 003
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Get user_id for user1@example.com
      const user1 = db
        .prepare('SELECT user_id FROM users WHERE email = ?')
        .get('user1@example.com') as { user_id: string };

      // Verify data for user1
      const user1Data = db
        .prepare('SELECT * FROM user_data WHERE user_id = ? ORDER BY key')
        .all(user1.user_id) as Array<{
        key: string;
        value: string;
        user_id: string;
        created_at: number;
        updated_at: number;
      }>;

      expect(user1Data).toHaveLength(2);
      expect(user1Data[0].key).toBe('key1');
      expect(user1Data[0].value).toBe('"value1"');
      expect(user1Data[1].key).toBe('key2');
      expect(user1Data[1].value).toBe('"value2"');
    });

    /* Preconditions: migrations 001 and 002 applied, user_data has records
       Action: run migration 003
       Assertions: timestamp column is removed, only created_at and updated_at remain
       Requirements: user-data-isolation.2.1 */
    it('should remove timestamp column from user_data', () => {
      // Setup: apply migrations 001 and 002
      applyMigrationsUpTo002();

      // Insert test data
      insertOldSchemaData('key1', '"value1"', 'user1@example.com');

      // Verify timestamp column exists before migration
      let columns = db.prepare('PRAGMA table_info(user_data)').all() as Array<{ name: string }>;
      expect(columns.map((c) => c.name)).toContain('timestamp');

      // Run migration 003
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Verify timestamp column is removed
      columns = db.prepare('PRAGMA table_info(user_data)').all() as Array<{ name: string }>;
      expect(columns.map((c) => c.name)).not.toContain('timestamp');
      expect(columns.map((c) => c.name)).toContain('created_at');
      expect(columns.map((c) => c.name)).toContain('updated_at');
    });

    /* Preconditions: migrations 001 and 002 applied, user_data has records
       Action: run migration 003
       Assertions: PRIMARY KEY is (key, user_id)
       Requirements: user-data-isolation.2.2 */
    it('should have composite PRIMARY KEY (key, user_id)', () => {
      // Setup: apply migrations 001 and 002
      applyMigrationsUpTo002();

      // Insert test data
      insertOldSchemaData('key1', '"value1"', 'user1@example.com');

      // Run migration 003
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Verify PRIMARY KEY by trying to insert duplicate (key, user_id)
      const user1 = db
        .prepare('SELECT user_id FROM users WHERE email = ?')
        .get('user1@example.com') as { user_id: string };

      // Insert should succeed for same key with different user_id
      expect(() => {
        db.prepare(
          'INSERT INTO user_data (key, value, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run('key1', '"new_value"', 'DIFFERENTID', Date.now(), Date.now());
      }).not.toThrow();

      // Insert should fail for same (key, user_id)
      expect(() => {
        db.prepare(
          'INSERT INTO user_data (key, value, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run('key1', '"duplicate"', user1.user_id, Date.now(), Date.now());
      }).toThrow(/UNIQUE constraint failed|PRIMARY KEY/);
    });

    /* Preconditions: migrations 001 and 002 applied, user_data has records
       Action: run migration 003
       Assertions: idx_user_id index is created
       Requirements: user-data-isolation.2.1 */
    it('should create idx_user_id index', () => {
      // Setup: apply migrations 001 and 002
      applyMigrationsUpTo002();

      // Insert test data
      insertOldSchemaData('key1', '"value1"', 'user1@example.com');

      // Run migration 003
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Verify index exists
      const indexExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_user_id'")
        .get();
      expect(indexExists).toBeDefined();
    });

    /* Preconditions: migrations 001 and 002 applied, user_data is empty
       Action: run migration 003
       Assertions: migration succeeds with empty data
       Requirements: user-data-isolation.5.4 */
    it('should handle empty user_data table', () => {
      // Setup: apply migrations 001 and 002
      applyMigrationsUpTo002();

      // Run migration 003 with empty user_data
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Verify tables exist with correct structure
      const columns = db.prepare('PRAGMA table_info(user_data)').all() as Array<{ name: string }>;
      expect(columns.map((c) => c.name)).toContain('user_id');
      expect(columns.map((c) => c.name)).not.toContain('user_email');
    });
  });

  describe('DOWN migration', () => {
    /* Preconditions: all migrations applied including 003
       Action: rollback migration 003
       Assertions: user_email column restored, timestamp column restored
       Requirements: user-data-isolation.5.4 */
    it('should restore user_email and timestamp columns on rollback', () => {
      // Setup: apply all migrations
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Insert test data in new schema
      db.prepare(
        'INSERT INTO users (user_id, name, email, google_id, locale, last_synced) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('ABCDEF1234', 'Test User', 'test@example.com', 'google123', 'en', Date.now());
      const now = Date.now();
      db.prepare(
        'INSERT INTO user_data (key, value, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('test_key', '"test_value"', 'ABCDEF1234', now, now);

      // Rollback migration 005 first
      let rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Rollback migration 004
      rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Rollback migration 003
      rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Verify user_email column is restored
      const columns = db.prepare('PRAGMA table_info(user_data)').all() as Array<{ name: string }>;
      expect(columns.map((c) => c.name)).toContain('user_email');
      expect(columns.map((c) => c.name)).toContain('timestamp');
      expect(columns.map((c) => c.name)).not.toContain('user_id');
    });

    /* Preconditions: all migrations applied including 003, data exists
       Action: rollback migration 003
       Assertions: data preserved with user_email populated from users table
       Requirements: user-data-isolation.5.4 */
    it('should preserve data with user_email on rollback', () => {
      // Setup: apply all migrations
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Insert test data in new schema
      db.prepare(
        'INSERT INTO users (user_id, name, email, google_id, locale, last_synced) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('ABCDEF1234', 'Test User', 'test@example.com', 'google123', 'en', Date.now());
      const now = Date.now();
      db.prepare(
        'INSERT INTO user_data (key, value, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run('test_key', '"test_value"', 'ABCDEF1234', now, now);

      // Rollback migration 005 first
      let rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Rollback migration 004
      rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Rollback migration 003
      rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Verify data is preserved with user_email
      const data = db.prepare('SELECT * FROM user_data WHERE key = ?').get('test_key') as {
        key: string;
        value: string;
        user_email: string;
        timestamp: number;
      };

      expect(data).toBeDefined();
      expect(data.key).toBe('test_key');
      expect(data.value).toBe('"test_value"');
      expect(data.user_email).toBe('test@example.com');
      expect(data.timestamp).toBe(now);
    });

    /* Preconditions: all migrations applied including 003
       Action: rollback migration 003
       Assertions: old indexes restored (idx_timestamp, idx_user_email)
       Requirements: user-data-isolation.5.4 */
    it('should restore old indexes on rollback', () => {
      // Setup: apply all migrations
      const result = migrationRunner.runMigrations();
      expect(result.success).toBe(true);

      // Rollback migration 005 first
      let rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Rollback migration 004
      rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Rollback migration 003
      rollbackResult = migrationRunner.rollbackLastMigration();
      expect(rollbackResult.success).toBe(true);

      // Verify old indexes are restored
      const idxTimestamp = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_timestamp'")
        .get();
      expect(idxTimestamp).toBeDefined();

      const idxUserEmail = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_user_email'")
        .get();
      expect(idxUserEmail).toBeDefined();

      // Verify idx_user_id is dropped
      const idxUserId = db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_user_id'")
        .get();
      expect(idxUserId).toBeUndefined();
    });
  });

  describe('Migration idempotency', () => {
    /* Preconditions: all migrations already applied
       Action: run migrations again
       Assertions: no error, appliedCount is 0
       Requirements: user-data-isolation.5.4 */
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
