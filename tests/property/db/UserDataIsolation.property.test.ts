// Requirements: user-data-isolation.6.3, user-data-isolation.4.4
// tests/property/db/UserDataIsolation.property.test.ts
// Property-based tests for user data isolation

import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../src/main/db/schema';
import { SettingsRepository } from '../../../src/main/db/repositories/SettingsRepository';
import { AgentsRepository } from '../../../src/main/db/repositories/AgentsRepository';
import { MessagesRepository } from '../../../src/main/db/repositories/MessagesRepository';

describe('User Data Isolation Properties', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
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
        payload_json TEXT NOT NULL
      );
    `);
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
  });

  /* Property: Data from user A is never visible to user B
     For any key, value, userA, userB where userA != userB:
     When userA saves data, userB cannot see it
     Requirements: user-data-isolation.6.3, user-data-isolation.4.4 */
  it('should never expose data from one user to another', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }), // key
        fc.string({ minLength: 1, maxLength: 1000 }), // value
        fc.string({ minLength: 10, maxLength: 10 }), // userA
        fc.string({ minLength: 10, maxLength: 10 }), // userB
        (key, value, userA, userB) => {
          fc.pre(userA !== userB); // Different users

          // User A saves data
          const repoA = new SettingsRepository(db, () => userA);
          repoA.set(key, value);

          // User B tries to read
          const repoB = new SettingsRepository(db, () => userB);
          const result = repoB.get(key);

          // User B should NOT see User A's data
          expect(result).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Property: User always sees their own data
     For any key, value, userId:
     When user saves data, they can always retrieve it
     Requirements: user-data-isolation.6.3 */
  it('should always return user own data', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }), // key
        fc.string({ minLength: 1, maxLength: 1000 }), // value
        fc.string({ minLength: 10, maxLength: 10 }), // userId
        (key, value, userId) => {
          const repo = new SettingsRepository(db, () => userId);

          repo.set(key, value);
          const result = repo.get(key);

          expect(result?.value).toBe(value);
          expect(result?.userId).toBe(userId);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Property: Deleting data from one user does not affect others
     For any key, userA, userB where userA != userB:
     When both users have data with same key, deleting userA's data
     should not affect userB's data
     Requirements: user-data-isolation.6.3 */
  it('should not affect other users when deleting data', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }), // key
        fc.string({ minLength: 10, maxLength: 10 }), // userA
        fc.string({ minLength: 10, maxLength: 10 }), // userB
        (key, userA, userB) => {
          fc.pre(userA !== userB);

          // Both users save same key
          const repoA = new SettingsRepository(db, () => userA);
          const repoB = new SettingsRepository(db, () => userB);

          repoA.set(key, 'valueA');
          repoB.set(key, 'valueB');

          // User A deletes
          repoA.delete(key);

          // User B's data should still exist
          expect(repoB.get(key)?.value).toBe('valueB');
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Agent Access Control Properties', () => {
  /* Property: User cannot access other users' agents
     For any userA, userB where userA != userB:
     Agents created by userA are not visible to userB
     Requirements: user-data-isolation.6.3 */
  it('should never allow access to other users agents', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 10 }), // userA
        fc.string({ minLength: 10, maxLength: 10 }), // userB
        (userA, userB) => {
          fc.pre(userA !== userB);

          const sqlite = new Database(':memory:');
          sqlite.exec(`
            CREATE TABLE IF NOT EXISTS agents (
              agent_id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              name TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              archived_at TEXT
            );
          `);
          const db = drizzle(sqlite, { schema });

          // User A creates agent
          const repoA = new AgentsRepository(db, () => userA);
          const agent = repoA.create('Secret Agent');

          // User B tries to access
          const repoB = new AgentsRepository(db, () => userB);

          expect(repoB.findById(agent.agentId)).toBeUndefined();
          expect(repoB.list()).toHaveLength(0);

          sqlite.close();
        }
      ),
      { numRuns: 50 }
    );
  });

  /* Property: Messages are only accessible to agent owner
     For any userA, userB where userA != userB:
     Messages for userA's agent are not accessible to userB
     Requirements: user-data-isolation.7.6 */
  it('should deny message access to non-owners', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 10 }), // userA
        fc.string({ minLength: 10, maxLength: 10 }), // userB
        (userA, userB) => {
          fc.pre(userA !== userB);

          const sqlite = new Database(':memory:');
          sqlite.exec(`
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
              payload_json TEXT NOT NULL
            );
          `);
          const db = drizzle(sqlite, { schema });

          // User A creates agent and message
          const agentsA = new AgentsRepository(db, () => userA);
          const messagesA = new MessagesRepository(db, () => userA, agentsA);
          const agent = agentsA.create('Agent');
          messagesA.create(agent.agentId, '{"kind":"user"}');

          // User B tries to access messages
          const agentsB = new AgentsRepository(db, () => userB);
          const messagesB = new MessagesRepository(db, () => userB, agentsB);

          expect(() => messagesB.listByAgent(agent.agentId)).toThrow('Access denied');

          sqlite.close();
        }
      ),
      { numRuns: 50 }
    );
  });
});
