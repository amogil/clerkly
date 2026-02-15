// Requirements: user-data-isolation.7.8
// tests/unit/db/repositories/GlobalRepository.test.ts
// Unit tests for GlobalRepository

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../../src/main/db/schema';
import {
  GlobalRepository,
  WindowState,
} from '../../../../src/main/db/repositories/GlobalRepository';

describe('GlobalRepository', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let repo: GlobalRepository;

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
    repo = new GlobalRepository(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('windowState', () => {
    describe('get', () => {
      /* Preconditions: No window state saved
         Action: Call windowState.get()
         Assertions: Returns undefined
         Requirements: user-data-isolation.7.8 */
      it('should return undefined when no state saved', () => {
        const state = repo.windowState.get();
        expect(state).toBeUndefined();
      });

      /* Preconditions: Window state saved
         Action: Call windowState.get()
         Assertions: Returns the saved state
         Requirements: user-data-isolation.7.8 */
      it('should return saved window state', () => {
        const savedState: WindowState = {
          x: 100,
          y: 200,
          width: 800,
          height: 600,
          isMaximized: false,
        };
        repo.windowState.set(savedState);

        const state = repo.windowState.get();
        expect(state).toEqual(savedState);
      });
    });

    describe('set', () => {
      /* Preconditions: No window state saved
         Action: Call windowState.set(state)
         Assertions: State is saved
         Requirements: user-data-isolation.7.8 */
      it('should save window state', () => {
        const state: WindowState = {
          x: 50,
          y: 100,
          width: 1024,
          height: 768,
          isMaximized: true,
        };

        repo.windowState.set(state);

        const saved = repo.windowState.get();
        expect(saved).toEqual(state);
      });

      /* Preconditions: Window state already saved
         Action: Call windowState.set(newState)
         Assertions: State is updated
         Requirements: user-data-isolation.7.8 */
      it('should update existing window state', () => {
        const oldState: WindowState = {
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          isMaximized: false,
        };
        repo.windowState.set(oldState);

        const newState: WindowState = {
          x: 100,
          y: 100,
          width: 1200,
          height: 900,
          isMaximized: true,
        };
        repo.windowState.set(newState);

        const saved = repo.windowState.get();
        expect(saved).toEqual(newState);
      });

      /* Preconditions: Empty database
         Action: Call windowState.set(state)
         Assertions: Uses __system__ userId
         Requirements: user-data-isolation.7.8 */
      it('should use __system__ userId for storage', () => {
        const state: WindowState = {
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          isMaximized: false,
        };
        repo.windowState.set(state);

        // Verify directly in database
        const row = sqlite
          .prepare("SELECT * FROM user_data WHERE key = 'window_state' AND user_id = '__system__'")
          .get() as { value: string } | undefined;

        expect(row).toBeDefined();
        expect(JSON.parse(row!.value)).toEqual(state);
      });
    });

    describe('isolation', () => {
      /* Preconditions: Window state saved, user data saved
         Action: Get window state
         Assertions: Window state is separate from user data
         Requirements: user-data-isolation.7.8 */
      it('should not interfere with user data', () => {
        // Save window state
        const windowState: WindowState = {
          x: 0,
          y: 0,
          width: 800,
          height: 600,
          isMaximized: false,
        };
        repo.windowState.set(windowState);

        // Save user data with same key but different userId
        sqlite
          .prepare(
            `
          INSERT INTO user_data (key, user_id, value, created_at, updated_at)
          VALUES ('window_state', 'user123', '{"custom": true}', ?, ?)
        `
          )
          .run(Date.now(), Date.now());

        // Window state should still return system state
        const state = repo.windowState.get();
        expect(state).toEqual(windowState);
      });
    });
  });
});
