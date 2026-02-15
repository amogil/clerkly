// Requirements: user-data-isolation.7.7
// tests/unit/db/repositories/UsersRepository.test.ts
// Unit tests for UsersRepository

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../../src/main/db/schema';
import { UsersRepository } from '../../../../src/main/db/repositories/UsersRepository';

describe('UsersRepository', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let repo: UsersRepository;

  beforeEach(() => {
    // Setup in-memory database
    sqlite = new Database(':memory:');

    // Create users table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT NOT NULL UNIQUE,
        google_id TEXT,
        locale TEXT,
        last_synced INTEGER
      )
    `);

    db = drizzle(sqlite, { schema });
    repo = new UsersRepository(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('findByEmail', () => {
    /* Preconditions: User exists in database
       Action: Call findByEmail(email)
       Assertions: Returns the user
       Requirements: user-data-isolation.7.7 */
    it('should find user by email', () => {
      repo.findOrCreate('test@example.com', 'Test User');

      const user = repo.findByEmail('test@example.com');
      expect(user).toBeDefined();
      expect(user?.email).toBe('test@example.com');
      expect(user?.name).toBe('Test User');
    });

    /* Preconditions: User does not exist
       Action: Call findByEmail(email)
       Assertions: Returns undefined
       Requirements: user-data-isolation.7.7 */
    it('should return undefined for non-existent email', () => {
      const user = repo.findByEmail('nonexistent@example.com');
      expect(user).toBeUndefined();
    });
  });

  describe('findById', () => {
    /* Preconditions: User exists in database
       Action: Call findById(userId)
       Assertions: Returns the user
       Requirements: user-data-isolation.7.7 */
    it('should find user by id', () => {
      const created = repo.findOrCreate('test@example.com', 'Test User');

      const user = repo.findById(created.userId);
      expect(user).toBeDefined();
      expect(user?.userId).toBe(created.userId);
      expect(user?.email).toBe('test@example.com');
    });

    /* Preconditions: User does not exist
       Action: Call findById(userId)
       Assertions: Returns undefined
       Requirements: user-data-isolation.7.7 */
    it('should return undefined for non-existent id', () => {
      const user = repo.findById('nonexistent');
      expect(user).toBeUndefined();
    });
  });

  describe('findOrCreate', () => {
    /* Preconditions: User does not exist
       Action: Call findOrCreate(email, name)
       Assertions: Creates new user with generated userId
       Requirements: user-data-isolation.7.7 */
    it('should create new user when not exists', () => {
      const user = repo.findOrCreate('new@example.com', 'New User');

      expect(user.email).toBe('new@example.com');
      expect(user.name).toBe('New User');
      expect(user.userId).toHaveLength(10);
      expect(user.userId).toMatch(/^[A-Za-z0-9]+$/);
    });

    /* Preconditions: User exists
       Action: Call findOrCreate(email, name)
       Assertions: Returns existing user
       Requirements: user-data-isolation.7.7 */
    it('should return existing user when exists', () => {
      const created = repo.findOrCreate('test@example.com', 'Test User');
      const found = repo.findOrCreate('test@example.com', 'Test User');

      expect(found.userId).toBe(created.userId);
      expect(found.email).toBe(created.email);
    });

    /* Preconditions: User exists with different name
       Action: Call findOrCreate(email, newName)
       Assertions: Updates name and returns user
       Requirements: user-data-isolation.7.7 */
    it('should update name when changed on re-login', () => {
      const created = repo.findOrCreate('test@example.com', 'Old Name');
      const updated = repo.findOrCreate('test@example.com', 'New Name');

      expect(updated.userId).toBe(created.userId);
      expect(updated.name).toBe('New Name');

      // Verify in database
      const fromDb = repo.findByEmail('test@example.com');
      expect(fromDb?.name).toBe('New Name');
    });

    /* Preconditions: User exists
       Action: Call findOrCreate(email, null)
       Assertions: Does not update name when null
       Requirements: user-data-isolation.7.7 */
    it('should not update name when null', () => {
      repo.findOrCreate('test@example.com', 'Original Name');
      const updated = repo.findOrCreate('test@example.com', null);

      expect(updated.name).toBe('Original Name');
    });

    /* Preconditions: User exists with same name
       Action: Call findOrCreate(email, sameName)
       Assertions: Does not trigger update
       Requirements: user-data-isolation.7.7 */
    it('should not update when name is the same', () => {
      const created = repo.findOrCreate('test@example.com', 'Same Name');
      const found = repo.findOrCreate('test@example.com', 'Same Name');

      expect(found.userId).toBe(created.userId);
      expect(found.name).toBe('Same Name');
    });
  });

  describe('update', () => {
    /* Preconditions: User exists
       Action: Call update(userId, { name: 'New Name' })
       Assertions: Name is updated
       Requirements: user-data-isolation.7.7 */
    it('should update user name', () => {
      const user = repo.findOrCreate('test@example.com', 'Old Name');
      repo.update(user.userId, { name: 'New Name' });

      const updated = repo.findById(user.userId);
      expect(updated?.name).toBe('New Name');
    });

    /* Preconditions: User exists
       Action: Call update(userId, { googleId: 'google123' })
       Assertions: googleId is updated
       Requirements: user-data-isolation.7.7 */
    it('should update user googleId', () => {
      const user = repo.findOrCreate('test@example.com', 'Test');
      repo.update(user.userId, { googleId: 'google123' });

      const updated = repo.findById(user.userId);
      expect(updated?.googleId).toBe('google123');
    });

    /* Preconditions: User exists
       Action: Call update(userId, { locale: 'ru' })
       Assertions: locale is updated
       Requirements: user-data-isolation.7.7 */
    it('should update user locale', () => {
      const user = repo.findOrCreate('test@example.com', 'Test');
      repo.update(user.userId, { locale: 'ru' });

      const updated = repo.findById(user.userId);
      expect(updated?.locale).toBe('ru');
    });

    /* Preconditions: User exists
       Action: Call update(userId, { lastSynced: timestamp })
       Assertions: lastSynced is updated
       Requirements: user-data-isolation.7.7 */
    it('should update user lastSynced', () => {
      const user = repo.findOrCreate('test@example.com', 'Test');
      const now = Date.now();
      repo.update(user.userId, { lastSynced: now });

      const updated = repo.findById(user.userId);
      expect(updated?.lastSynced).toBe(now);
    });

    /* Preconditions: User exists
       Action: Call update(userId, { multiple fields })
       Assertions: All fields are updated
       Requirements: user-data-isolation.7.7 */
    it('should update multiple fields at once', () => {
      const user = repo.findOrCreate('test@example.com', 'Test');
      const now = Date.now();
      repo.update(user.userId, {
        name: 'Updated Name',
        googleId: 'google456',
        locale: 'en',
        lastSynced: now,
      });

      const updated = repo.findById(user.userId);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.googleId).toBe('google456');
      expect(updated?.locale).toBe('en');
      expect(updated?.lastSynced).toBe(now);
    });
  });
});
