// Requirements: ui.12.3, ui.12.4, ui.12.5, ui.12.6, ui.12.7

import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DataManager } from '../../src/main/DataManager';
import type { UserProfileManager } from '../../src/main/auth/UserProfileManager';

// Mock electron BrowserWindow for error notifications
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

describe('DataManager User Isolation - Property-Based Tests', () => {
  let testStoragePath: string;
  let testDbPath: string;

  beforeEach(() => {
    testStoragePath = fs.mkdtempSync(path.join(os.tmpdir(), 'datamanager-prop-test-'));
    testDbPath = path.join(testStoragePath, 'clerkly.db');

    // Ensure migrations directory exists
    const migrationsPath = path.join(__dirname, '..', '..', 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    if (fs.existsSync(testStoragePath)) {
      const files = fs.readdirSync(testStoragePath);
      files.forEach((file) => {
        const filePath = path.join(testStoragePath, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      });
      fs.rmdirSync(testStoragePath);
    }
  });

  /* Preconditions: Multiple users with different emails, each saves data
     Action: For each user: save data, then load data
     Assertions: Each user sees only their own data, data of other users not visible
     Requirements: ui.12.3, ui.12.4, ui.12.6
     Property: Data isolation between users */
  it('should isolate data between different users (property-based)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            email: fc.emailAddress(),
            key: fc.string({ minLength: 1, maxLength: 50 }),
            value: fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.record({ data: fc.string() })
            ),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        (users) => {
          const dataManager = new DataManager(testStoragePath);
          dataManager.initialize();

          // Create mock profile manager for each user
          const mockProfileManager = {
            getCurrentEmail: jest.fn(),
          } as unknown as jest.Mocked<UserProfileManager>;

          dataManager.setUserProfileManager(mockProfileManager);

          // Save data for each user
          users.forEach((user) => {
            mockProfileManager.getCurrentEmail.mockReturnValue(user.email);
            dataManager.saveData(user.key, user.value);
          });

          // Verify each user can only see their own data
          users.forEach((user) => {
            mockProfileManager.getCurrentEmail.mockReturnValue(user.email);
            const result = dataManager.loadData(user.key);

            expect(result.success).toBe(true);
            expect(result.data).toEqual(user.value);
          });

          // Verify users cannot see other users' data
          for (let i = 0; i < users.length; i++) {
            for (let j = 0; j < users.length; j++) {
              if (i !== j && users[i].key === users[j].key) {
                // Same key, different users
                mockProfileManager.getCurrentEmail.mockReturnValue(users[i].email);
                const result = dataManager.loadData(users[j].key);

                // Should get user i's data, not user j's data
                expect(result.data).toEqual(users[i].value);
                expect(result.data).not.toEqual(users[j].value);
              }
            }
          }

          dataManager.close();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Multiple users, each saves and loads data (round-trip)
     Action: For each user: save data, then load data
     Assertions: Loaded data equals saved data, data of other users not affected
     Requirements: ui.12.3, ui.12.4, ui.12.7
     Property: Save/load round-trip with isolation */
  it('should preserve data through save/load cycle with isolation (property-based)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            email: fc.emailAddress(),
            key: fc.string({ minLength: 1, maxLength: 50 }),
            value: fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean(),
              fc.record({ nested: fc.string(), count: fc.integer() })
            ),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (users) => {
          const dataManager = new DataManager(testStoragePath);
          dataManager.initialize();

          const mockProfileManager = {
            getCurrentEmail: jest.fn(),
          } as unknown as jest.Mocked<UserProfileManager>;

          dataManager.setUserProfileManager(mockProfileManager);

          // Save and immediately load for each user
          users.forEach((user) => {
            mockProfileManager.getCurrentEmail.mockReturnValue(user.email);
            const saveResult = dataManager.saveData(user.key, user.value);
            expect(saveResult.success).toBe(true);

            const loadResult = dataManager.loadData(user.key);
            expect(loadResult.success).toBe(true);
            expect(loadResult.data).toEqual(user.value);
          });

          // Verify all users' data is still intact
          users.forEach((user) => {
            mockProfileManager.getCurrentEmail.mockReturnValue(user.email);
            const result = dataManager.loadData(user.key);
            expect(result.success).toBe(true);
            expect(result.data).toEqual(user.value);
          });

          dataManager.close();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Multiple users, each saves data, then "logout" (clear email), then "login" again
     Action: Save data, simulate logout, simulate login, load data
     Assertions: Data persists after logout, restored on login
     Requirements: ui.12.5, ui.12.7
     Property: Logout preserves user data */
  it('should persist user data after logout and restore on re-login (property-based)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            email: fc.emailAddress(),
            key: fc.string({ minLength: 1, maxLength: 50 }),
            value: fc.oneof(fc.string(), fc.integer(), fc.record({ data: fc.string() })),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (users) => {
          const dataManager = new DataManager(testStoragePath);
          dataManager.initialize();

          const mockProfileManager = {
            getCurrentEmail: jest.fn(),
          } as unknown as jest.Mocked<UserProfileManager>;

          dataManager.setUserProfileManager(mockProfileManager);

          // Save data for each user
          users.forEach((user) => {
            mockProfileManager.getCurrentEmail.mockReturnValue(user.email);
            dataManager.saveData(user.key, user.value);
          });

          // Simulate logout (getCurrentEmail returns null)
          mockProfileManager.getCurrentEmail.mockReturnValue(null);

          // Verify data is still in database (check directly)
          const db = new Database(testDbPath);
          users.forEach((user) => {
            const row = db
              .prepare('SELECT value FROM user_data WHERE key = ? AND user_email = ?')
              .get(user.key, user.email) as { value: string } | undefined;

            expect(row).toBeDefined();
            expect(JSON.parse(row!.value)).toEqual(user.value);
          });
          db.close();

          // Simulate re-login and verify data is restored
          users.forEach((user) => {
            mockProfileManager.getCurrentEmail.mockReturnValue(user.email);
            const result = dataManager.loadData(user.key);
            expect(result.success).toBe(true);
            expect(result.data).toEqual(user.value);
          });

          dataManager.close();
        }
      ),
      { numRuns: 100 }
    );
  });
});
