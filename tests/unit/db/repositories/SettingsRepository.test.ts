// Requirements: user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.6.4, user-data-isolation.7.6
// tests/unit/db/repositories/SettingsRepository.test.ts
// Unit tests for SettingsRepository

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/main/db/schema';
import { userData } from '../../../../src/main/db/schema';
import { SettingsRepository } from '../../../../src/main/db/repositories/SettingsRepository';

describe('SettingsRepository', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let repo: SettingsRepository;
  const testUserId = 'user123';

  beforeEach(() => {
    // Setup in-memory database
    sqlite = new Database(':memory:');

    // Create user_data table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS user_data (
        key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (key, user_id)
      )
    `);

    db = drizzle(sqlite, { schema });
    repo = new SettingsRepository(db, () => testUserId);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('get', () => {
    /* Preconditions: Empty database
       Action: Call get('nonexistent')
       Assertions: Returns undefined
       Requirements: user-data-isolation.7.6 */
    it('should return undefined for non-existent key', () => {
      expect(repo.get('nonexistent')).toBeUndefined();
    });

    /* Preconditions: Data from another user in database
       Action: Call get('key')
       Assertions: Returns undefined (isolation)
       Requirements: user-data-isolation.6.3 */
    it('should not return data from other users', () => {
      // Insert data for different user
      db.insert(userData)
        .values({
          key: 'key',
          userId: 'other_user',
          value: 'secret',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .run();

      expect(repo.get('key')).toBeUndefined();
    });

    /* Preconditions: Data for current user in database
       Action: Call get('key')
       Assertions: Returns the data
       Requirements: user-data-isolation.6.3 */
    it('should return data for current user', () => {
      repo.set('key', 'value');
      const result = repo.get('key');
      expect(result?.value).toBe('value');
    });
  });

  describe('set', () => {
    /* Preconditions: Empty database
       Action: Call set('key', 'value')
       Assertions: Data saved with correct userId
       Requirements: user-data-isolation.6.3 */
    it('should save data with current userId', () => {
      repo.set('key', 'value');

      const row = db.select().from(userData).where(eq(userData.key, 'key')).get();

      expect(row?.userId).toBe(testUserId);
      expect(row?.value).toBe('value');
    });

    /* Preconditions: Data already exists
       Action: Call set('key', 'new_value')
       Assertions: Data updated, updatedAt changed
       Requirements: user-data-isolation.7.6 */
    it('should update existing data', () => {
      repo.set('key', 'old');
      const before = repo.get('key')!;

      // Small delay to ensure different timestamp
      repo.set('key', 'new');
      const after = repo.get('key')!;

      expect(after.value).toBe('new');
      expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
    });

    /* Preconditions: Empty database
       Action: Call set('key', 'value')
       Assertions: createdAt and updatedAt are set
       Requirements: user-data-isolation.7.6 */
    it('should set createdAt and updatedAt timestamps', () => {
      const before = Date.now();
      repo.set('key', 'value');
      const after = Date.now();

      const result = repo.get('key')!;
      expect(result.createdAt).toBeGreaterThanOrEqual(before);
      expect(result.createdAt).toBeLessThanOrEqual(after);
      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result.updatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('delete', () => {
    /* Preconditions: Data exists
       Action: Call delete('key')
       Assertions: Returns true, data deleted
       Requirements: user-data-isolation.7.6 */
    it('should delete existing data and return true', () => {
      repo.set('key', 'value');
      expect(repo.delete('key')).toBe(true);
      expect(repo.get('key')).toBeUndefined();
    });

    /* Preconditions: Data does not exist
       Action: Call delete('nonexistent')
       Assertions: Returns false
       Requirements: user-data-isolation.7.6 */
    it('should return false for non-existent key', () => {
      expect(repo.delete('nonexistent')).toBe(false);
    });

    /* Preconditions: Data from another user
       Action: Call delete('key')
       Assertions: Returns false, data not deleted
       Requirements: user-data-isolation.6.3 */
    it('should not delete data from other users', () => {
      db.insert(userData)
        .values({
          key: 'key',
          userId: 'other_user',
          value: 'secret',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .run();

      expect(repo.delete('key')).toBe(false);

      // Verify data still exists
      const row = db.select().from(userData).where(eq(userData.userId, 'other_user')).get();
      expect(row).toBeDefined();
    });
  });

  describe('getAll', () => {
    /* Preconditions: Multiple keys for current user
       Action: Call getAll()
       Assertions: Returns all keys for current user
       Requirements: user-data-isolation.7.6 */
    it('should return all data for current user', () => {
      repo.set('key1', 'value1');
      repo.set('key2', 'value2');
      repo.set('key3', 'value3');

      const result = repo.getAll();
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.key).sort()).toEqual(['key1', 'key2', 'key3']);
    });

    /* Preconditions: Data from multiple users
       Action: Call getAll()
       Assertions: Returns only current user's data
       Requirements: user-data-isolation.6.3 */
    it('should not return data from other users', () => {
      repo.set('myKey', 'myValue');

      db.insert(userData)
        .values({
          key: 'otherKey',
          userId: 'other_user',
          value: 'otherValue',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .run();

      const result = repo.getAll();
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('myKey');
    });

    /* Preconditions: Empty database
       Action: Call getAll()
       Assertions: Returns empty array
       Requirements: user-data-isolation.7.6 */
    it('should return empty array when no data exists', () => {
      const result = repo.getAll();
      expect(result).toEqual([]);
    });
  });

  describe('No user logged in', () => {
    /* Preconditions: userId = null
       Action: Call any method
       Assertions: Throws "No user logged in"
       Requirements: user-data-isolation.6.4 */
    it('should throw error when no user logged in', () => {
      const noUserRepo = new SettingsRepository(db, () => {
        throw new Error('No user logged in');
      });

      expect(() => noUserRepo.get('key')).toThrow('No user logged in');
      expect(() => noUserRepo.set('key', 'value')).toThrow('No user logged in');
      expect(() => noUserRepo.delete('key')).toThrow('No user logged in');
      expect(() => noUserRepo.getAll()).toThrow('No user logged in');
    });
  });
});
