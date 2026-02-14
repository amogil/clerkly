// Requirements: user-data-isolation.6.5, user-data-isolation.4.4
/**
 * Property-based tests for DatabaseManager Query API
 * Tests user_id injection and data isolation properties
 */

import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { DatabaseManager } from '../../src/main/DatabaseManager';
import type { UserManager } from '../../src/main/auth/UserManager';

describe('Property Tests - DatabaseManager Query API', () => {
  // ============================================
  // 4.1. Property Test: User ID Injection
  // Requirements: user-data-isolation.6.5
  // ============================================

  describe('User ID Injection Properties', () => {
    let databaseManager: DatabaseManager;
    let mockUserManager: jest.Mocked<UserManager>;
    let testDb: Database.Database;

    // Arbitrary for generating valid user IDs (10-character alphanumeric)
    const userIdArb = fc.stringOf(
      fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')
      ),
      { minLength: 10, maxLength: 10 }
    );

    // Arbitrary for generating valid keys (non-empty alphanumeric strings)
    const keyArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
      { minLength: 1, maxLength: 50 }
    );

    // Arbitrary for generating valid values (any JSON-serializable string)
    const valueArb = fc.string({ minLength: 1, maxLength: 100 });

    beforeEach(() => {
      // Create in-memory database for each test
      testDb = new Database(':memory:');

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

      databaseManager = new DatabaseManager(testDb);
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

    /* Preconditions: DatabaseManager initialized with UserManager, empty user_data table
       Action: call runUserQuery with INSERT for any user_id and params
       Assertions: user_id is always prepended as first param, data inserted with correct user_id
       Requirements: user-data-isolation.6.5
       **Validates: Requirements user-data-isolation.6.5** */
    it('runUserQuery should always prepend user_id as first param for any SQL and params', () => {
      fc.assert(
        fc.property(userIdArb, keyArb, valueArb, (userId, key, value) => {
          // Reset database state for each iteration
          testDb.exec('DELETE FROM user_data');

          // Setup mock UserManager with generated userId
          mockUserManager = {
            getCurrentUserId: jest.fn().mockReturnValue(userId),
          } as unknown as jest.Mocked<UserManager>;
          databaseManager.setUserManager(mockUserManager);

          const now = Date.now();

          // Execute runUserQuery - user_id should be prepended as FIRST parameter
          // SQL expects: user_id (1st), key (2nd), value (3rd), created_at (4th), updated_at (5th)
          databaseManager.runUserQuery(
            'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [key, value, now, now]
          );

          // Verify data was inserted with correct user_id
          const row = testDb
            .prepare('SELECT * FROM user_data WHERE key = ? AND user_id = ?')
            .get(key, userId) as
            | {
                key: string;
                value: string;
                user_id: string;
              }
            | undefined;

          // Property: user_id must be prepended correctly
          expect(row).toBeDefined();
          expect(row!.user_id).toBe(userId);
          expect(row!.key).toBe(key);
          expect(row!.value).toBe(value);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with data
       Action: call getUserRow with SELECT for any user_id and key
       Assertions: user_id is always prepended as first param, returns correct row
       Requirements: user-data-isolation.6.5
       **Validates: Requirements user-data-isolation.6.5** */
    it('getUserRow should always prepend user_id as first param', () => {
      fc.assert(
        fc.property(userIdArb, keyArb, valueArb, (userId, key, value) => {
          // Reset database state for each iteration
          testDb.exec('DELETE FROM user_data');

          // Setup mock UserManager with generated userId
          mockUserManager = {
            getCurrentUserId: jest.fn().mockReturnValue(userId),
          } as unknown as jest.Mocked<UserManager>;
          databaseManager.setUserManager(mockUserManager);

          const now = Date.now();

          // Insert test data directly
          testDb
            .prepare(
              'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
            )
            .run(userId, key, value, now, now);

          // Execute getUserRow - user_id should be prepended as FIRST parameter
          const row = databaseManager.getUserRow<{ key: string; value: string; user_id: string }>(
            'SELECT * FROM user_data WHERE user_id = ? AND key = ?',
            [key]
          );

          // Property: user_id must be prepended correctly, returning the correct row
          expect(row).toBeDefined();
          expect(row!.user_id).toBe(userId);
          expect(row!.key).toBe(key);
          expect(row!.value).toBe(value);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: DatabaseManager initialized with UserManager, user_data table with multiple rows
       Action: call getUserRows with SELECT for any user_id
       Assertions: user_id is always prepended as first param, returns all rows for user
       Requirements: user-data-isolation.6.5
       **Validates: Requirements user-data-isolation.6.5** */
    it('getUserRows should always prepend user_id as first param', () => {
      fc.assert(
        fc.property(
          userIdArb,
          fc.array(fc.tuple(keyArb, valueArb), { minLength: 1, maxLength: 5 }),
          (userId, keyValuePairs) => {
            // Reset database state for each iteration
            testDb.exec('DELETE FROM user_data');

            // Setup mock UserManager with generated userId
            mockUserManager = {
              getCurrentUserId: jest.fn().mockReturnValue(userId),
            } as unknown as jest.Mocked<UserManager>;
            databaseManager.setUserManager(mockUserManager);

            const now = Date.now();

            // Deduplicate keys to avoid PRIMARY KEY conflicts
            const uniqueKeyValuePairs = new Map<string, string>();
            for (const [key, value] of keyValuePairs) {
              uniqueKeyValuePairs.set(key, value);
            }

            // Insert test data directly
            for (const [key, value] of uniqueKeyValuePairs) {
              testDb
                .prepare(
                  'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
                )
                .run(userId, key, value, now, now);
            }

            // Execute getUserRows - user_id should be prepended as FIRST parameter
            const rows = databaseManager.getUserRows<{
              key: string;
              value: string;
              user_id: string;
            }>('SELECT * FROM user_data WHERE user_id = ?', []);

            // Property: user_id must be prepended correctly, returning all rows for user
            expect(rows).toHaveLength(uniqueKeyValuePairs.size);
            expect(rows.every((r) => r.user_id === userId)).toBe(true);

            // Verify all keys are present
            const returnedKeys = new Set(rows.map((r) => r.key));
            for (const key of uniqueKeyValuePairs.keys()) {
              expect(returnedKeys.has(key)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // ============================================
  // 4.2. Property Test: Data Isolation
  // Requirements: user-data-isolation.4.4
  // ============================================

  describe('Data Isolation Properties', () => {
    let databaseManager: DatabaseManager;
    let mockUserManager: jest.Mocked<UserManager>;
    let testDb: Database.Database;

    // Arbitrary for generating valid user IDs (10-character alphanumeric)
    const userIdArb = fc.stringOf(
      fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')
      ),
      { minLength: 10, maxLength: 10 }
    );

    // Arbitrary for generating valid keys (non-empty alphanumeric strings)
    const keyArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
      { minLength: 1, maxLength: 50 }
    );

    // Arbitrary for generating valid values (any JSON-serializable string)
    const valueArb = fc.string({ minLength: 1, maxLength: 100 });

    beforeEach(() => {
      // Create in-memory database for each test
      testDb = new Database(':memory:');

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

      databaseManager = new DatabaseManager(testDb);
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

    /* Preconditions: DatabaseManager initialized, user_data table empty
       Action: save data with runUserQuery for userA, then query with getUserRow/getUserRows as userA
       Assertions: data saved by userA is visible to userA via getUserRow and getUserRows
       Requirements: user-data-isolation.4.4
       **Validates: Requirements user-data-isolation.4.4** */
    it('data saved with runUserQuery should only be visible to same user via getUserRow/getUserRows', () => {
      fc.assert(
        fc.property(userIdArb, keyArb, valueArb, (userId, key, value) => {
          // Reset database state for each iteration
          testDb.exec('DELETE FROM user_data');

          // Setup mock UserManager with generated userId
          mockUserManager = {
            getCurrentUserId: jest.fn().mockReturnValue(userId),
          } as unknown as jest.Mocked<UserManager>;
          databaseManager.setUserManager(mockUserManager);

          const now = Date.now();

          // Save data using runUserQuery
          databaseManager.runUserQuery(
            'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [key, value, now, now]
          );

          // Verify data is visible via getUserRow
          const row = databaseManager.getUserRow<{ key: string; value: string; user_id: string }>(
            'SELECT * FROM user_data WHERE user_id = ? AND key = ?',
            [key]
          );

          expect(row).toBeDefined();
          expect(row!.user_id).toBe(userId);
          expect(row!.key).toBe(key);
          expect(row!.value).toBe(value);

          // Verify data is visible via getUserRows
          const rows = databaseManager.getUserRows<{ key: string; value: string; user_id: string }>(
            'SELECT * FROM user_data WHERE user_id = ?',
            []
          );

          expect(rows).toHaveLength(1);
          expect(rows[0].user_id).toBe(userId);
          expect(rows[0].key).toBe(key);
          expect(rows[0].value).toBe(value);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: DatabaseManager initialized, user_data table empty
       Action: save data with runUserQuery for userA, then query with getUserRow/getUserRows as userB
       Assertions: data saved by userA is NOT visible to userB (different users cannot see each other's data)
       Requirements: user-data-isolation.4.4
       **Validates: Requirements user-data-isolation.4.4** */
    it("different users should not see each other's data", () => {
      fc.assert(
        fc.property(userIdArb, userIdArb, keyArb, valueArb, (userIdA, userIdB, key, value) => {
          // Skip if userIds are the same (we need different users for this test)
          fc.pre(userIdA !== userIdB);

          // Reset database state for each iteration
          testDb.exec('DELETE FROM user_data');

          const now = Date.now();

          // Setup mock UserManager for userA
          mockUserManager = {
            getCurrentUserId: jest.fn().mockReturnValue(userIdA),
          } as unknown as jest.Mocked<UserManager>;
          databaseManager.setUserManager(mockUserManager);

          // Save data as userA using runUserQuery
          databaseManager.runUserQuery(
            'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [key, value, now, now]
          );

          // Verify data exists in database for userA
          const directRow = testDb
            .prepare('SELECT * FROM user_data WHERE user_id = ? AND key = ?')
            .get(userIdA, key);
          expect(directRow).toBeDefined();

          // Switch to userB
          mockUserManager.getCurrentUserId.mockReturnValue(userIdB);

          // Property: userB should NOT see userA's data via getUserRow
          const rowAsUserB = databaseManager.getUserRow<{
            key: string;
            value: string;
            user_id: string;
          }>('SELECT * FROM user_data WHERE user_id = ? AND key = ?', [key]);

          expect(rowAsUserB).toBeUndefined();

          // Property: userB should NOT see userA's data via getUserRows
          const rowsAsUserB = databaseManager.getUserRows<{
            key: string;
            value: string;
            user_id: string;
          }>('SELECT * FROM user_data WHERE user_id = ?', []);

          expect(rowsAsUserB).toHaveLength(0);

          // Verify userA can still see their own data
          mockUserManager.getCurrentUserId.mockReturnValue(userIdA);

          const rowAsUserA = databaseManager.getUserRow<{
            key: string;
            value: string;
            user_id: string;
          }>('SELECT * FROM user_data WHERE user_id = ? AND key = ?', [key]);

          expect(rowAsUserA).toBeDefined();
          expect(rowAsUserA!.user_id).toBe(userIdA);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: DatabaseManager initialized, user_data table empty
       Action: save data with same key for userA and userB, query each user's data
       Assertions: each user sees only their own data, even with same key
       Requirements: user-data-isolation.4.4
       **Validates: Requirements user-data-isolation.4.4** */
    it('users with same key should see only their own data', () => {
      fc.assert(
        fc.property(
          userIdArb,
          userIdArb,
          keyArb,
          valueArb,
          valueArb,
          (userIdA, userIdB, key, valueA, valueB) => {
            // Skip if userIds are the same
            fc.pre(userIdA !== userIdB);
            // Skip if values are the same (we want to distinguish them)
            fc.pre(valueA !== valueB);

            // Reset database state for each iteration
            testDb.exec('DELETE FROM user_data');

            const now = Date.now();

            // Save data as userA
            mockUserManager = {
              getCurrentUserId: jest.fn().mockReturnValue(userIdA),
            } as unknown as jest.Mocked<UserManager>;
            databaseManager.setUserManager(mockUserManager);

            databaseManager.runUserQuery(
              'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
              [key, valueA, now, now]
            );

            // Save data as userB with SAME key but different value
            mockUserManager.getCurrentUserId.mockReturnValue(userIdB);

            databaseManager.runUserQuery(
              'INSERT INTO user_data (user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
              [key, valueB, now, now]
            );

            // Verify both records exist in database
            const allRows = testDb
              .prepare('SELECT * FROM user_data WHERE key = ?')
              .all(key) as Array<{
              user_id: string;
              value: string;
            }>;
            expect(allRows).toHaveLength(2);

            // Property: userA sees only their value
            mockUserManager.getCurrentUserId.mockReturnValue(userIdA);
            const rowAsUserA = databaseManager.getUserRow<{ value: string; user_id: string }>(
              'SELECT * FROM user_data WHERE user_id = ? AND key = ?',
              [key]
            );

            expect(rowAsUserA).toBeDefined();
            expect(rowAsUserA!.user_id).toBe(userIdA);
            expect(rowAsUserA!.value).toBe(valueA);

            // Property: userB sees only their value
            mockUserManager.getCurrentUserId.mockReturnValue(userIdB);
            const rowAsUserB = databaseManager.getUserRow<{ value: string; user_id: string }>(
              'SELECT * FROM user_data WHERE user_id = ? AND key = ?',
              [key]
            );

            expect(rowAsUserB).toBeDefined();
            expect(rowAsUserB!.user_id).toBe(userIdB);
            expect(rowAsUserB!.value).toBe(valueB);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
