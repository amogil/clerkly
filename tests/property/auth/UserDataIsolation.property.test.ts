// Requirements: user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.1.2, user-data-isolation.1.3, user-data-isolation.4.4, account-profile.1.3

import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UserSettingsManager } from '../../../src/main/UserSettingsManager';
import { DatabaseManager } from '../../../src/main/DatabaseManager';
import { UserManager } from '../../../src/main/auth/UserManager';
import { TokenStorageManager } from '../../../src/main/auth/TokenStorageManager';

// Mock electron BrowserWindow for error notifications
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

describe('User Data Isolation - Property-Based Tests', () => {
  let testStoragePath: string;
  let dataManager: UserSettingsManager;
  let dbManager: DatabaseManager;
  let profileManager: UserManager;
  let mockTokenStorage: jest.Mocked<TokenStorageManager>;

  beforeEach(() => {
    // Create unique test directory for each test
    testStoragePath = fs.mkdtempSync(path.join(os.tmpdir(), 'user-isolation-prop-test-'));

    // Ensure migrations directory exists
    const migrationsPath = path.join(__dirname, '..', '..', '..', 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }

    // Initialize DatabaseManager first, then UserSettingsManager
    // Requirements: database-refactoring.1, database-refactoring.2
    dbManager = new DatabaseManager();
    dbManager.initialize(testStoragePath);

    // Create UserSettingsManager with DatabaseManager
    dataManager = new UserSettingsManager(dbManager);

    // Create mock dependencies
    mockTokenStorage = {
      loadTokens: jest.fn(),
      deleteTokens: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TokenStorageManager>;

    // Create UserManager with DatabaseManager
    // Requirements: account-profile.1.3
    profileManager = new UserManager(dbManager, mockTokenStorage);

    // Set up circular dependency
    dbManager.setUserManager(profileManager);
  });

  afterEach(() => {
    // Close database
    dbManager.close();

    // Clean up test directory
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

  /* Preconditions: UserManager instance created
     Action: Call generateUserId() 100+ times
     Assertions: All IDs have length 10, contain only alphanumeric characters (A-Z, a-z, 0-9)
     Requirements: user-data-isolation.0.2, user-data-isolation.1.1
     **Validates: Requirements user-data-isolation.0.2** */
  it('should generate valid 10-character alphanumeric user_id', () => {
    const alphanumericRegex = /^[A-Za-z0-9]{10}$/;

    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), () => {
        // Access private method via any cast
        const userId = (profileManager as any).generateUserId();

        // Verify format
        expect(userId).toMatch(alphanumericRegex);
        expect(userId.length).toBe(10);

        // Verify only alphanumeric characters
        for (const char of userId) {
          expect(
            (char >= 'A' && char <= 'Z') ||
              (char >= 'a' && char <= 'z') ||
              (char >= '0' && char <= '9')
          ).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Preconditions: UserManager with database access
     Action: Call findOrCreateUser with same email multiple times
     Assertions: Returns same user_id for same email every time
     Requirements: user-data-isolation.0.3, user-data-isolation.1.2
     **Validates: Requirements user-data-isolation.0.3** */
  it('should return same user_id for same email on repeated findOrCreateUser calls', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.integer({ min: 2, max: 10 }),
        (email, name, repeatCount) => {
          // Create GoogleUserInfoResponse object
          const googleProfile = {
            id: `google_${email}`,
            email,
            verified_email: true,
            name,
            given_name: name.split(' ')[0] || name,
            family_name: name.split(' ')[1] || '',
            locale: 'en',
          };

          // First call - creates user
          const firstUser = profileManager.findOrCreateUser(googleProfile);
          expect(firstUser.user_id).toMatch(/^[A-Za-z0-9]{10}$/);
          expect(firstUser.email).toBe(email);

          // Repeated calls - should return same user_id
          for (let i = 0; i < repeatCount; i++) {
            const user = profileManager.findOrCreateUser(googleProfile);
            expect(user.user_id).toBe(firstUser.user_id);
            expect(user.email).toBe(email);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: Multiple users with different emails
     Action: Each user saves data with same key, then loads data
     Assertions: Each user sees only their own data, not other users' data
     Requirements: user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.4.4
     **Validates: Requirements user-data-isolation.4.4** */
  it('should isolate data between different users', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            email: fc.emailAddress(),
            name: fc.string({ minLength: 1, maxLength: 30 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        (users) => {
          const testKey = 'test_isolation_key';
          const userRecords: Array<{ user: any; value: string; email: string }> = [];

          // Create users and save UNIQUE data for each (using email as unique identifier)
          users.forEach((userData, index) => {
            const googleProfile = {
              id: `google_${userData.email}_${index}`,
              email: userData.email,
              verified_email: true,
              name: userData.name,
              given_name: userData.name.split(' ')[0] || userData.name,
              family_name: userData.name.split(' ')[1] || '',
              locale: 'en',
            };

            const user = profileManager.findOrCreateUser(googleProfile);
            // Use email + index as unique value to ensure different values per user
            const uniqueValue = `data_for_${userData.email}_${index}`;
            userRecords.push({ user, value: uniqueValue, email: userData.email });

            // Set current user and save data
            (profileManager as any).currentUserId = user.user_id;
            dataManager.saveData(testKey, uniqueValue);
          });

          // Verify each user can only see their own data
          userRecords.forEach(({ user, value }) => {
            (profileManager as any).currentUserId = user.user_id;
            const result = dataManager.loadData(testKey);

            expect(result.success).toBe(true);
            expect(result.data).toEqual(value);
          });

          // Verify cross-user isolation - users with different user_ids should have different data
          for (let i = 0; i < userRecords.length; i++) {
            for (let j = 0; j < userRecords.length; j++) {
              if (userRecords[i].user.user_id !== userRecords[j].user.user_id) {
                // Set as user i
                (profileManager as any).currentUserId = userRecords[i].user.user_id;
                const result = dataManager.loadData(testKey);

                // Should get user i's data, not user j's data
                expect(result.data).toEqual(userRecords[i].value);
                // Values are unique per user, so they should be different
                expect(result.data).not.toEqual(userRecords[j].value);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: User logged in with data saved
     Action: Logout (clear currentUserId), then re-login with same email
     Assertions: Data is restored after re-login, same user_id is used
     Requirements: user-data-isolation.0.3, user-data-isolation.1.3, user-data-isolation.1.4
     **Validates: Requirements user-data-isolation.1.3** */
  it('should restore data after logout and re-login with same email', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.record({ nested: fc.string(), value: fc.integer() })
        ),
        (email, name, key, value) => {
          const googleProfile = {
            id: `google_${email}`,
            email,
            verified_email: true,
            name,
            given_name: name.split(' ')[0] || name,
            family_name: name.split(' ')[1] || '',
            locale: 'en',
          };

          // Login - create user and save data
          const user1 = profileManager.findOrCreateUser(googleProfile);
          (profileManager as any).currentUserId = user1.user_id;

          const saveResult = dataManager.saveData(key, value);
          expect(saveResult.success).toBe(true);

          // Verify data saved
          const loadResult1 = dataManager.loadData(key);
          expect(loadResult1.success).toBe(true);
          expect(loadResult1.data).toEqual(value);

          // Logout - clear session
          profileManager.clearSession();
          expect(profileManager.getCurrentUserId()).toBeNull();

          // Re-login with same email
          const user2 = profileManager.findOrCreateUser(googleProfile);
          (profileManager as any).currentUserId = user2.user_id;

          // Verify same user_id
          expect(user2.user_id).toBe(user1.user_id);

          // Verify data restored
          const loadResult2 = dataManager.loadData(key);
          expect(loadResult2.success).toBe(true);
          expect(loadResult2.data).toEqual(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Preconditions: User exists with name
     Action: Call findOrCreateUser with same email but different name
     Assertions: Name is updated in database
     Requirements: user-data-isolation.0.4
     **Validates: Requirements user-data-isolation.0.4** */
  it('should update user name when changed', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        (email, oldName, newName) => {
          // Skip if names are the same
          fc.pre(oldName !== newName);

          const oldProfile = {
            id: `google_${email}`,
            email,
            verified_email: true,
            name: oldName,
            given_name: oldName.split(' ')[0] || oldName,
            family_name: oldName.split(' ')[1] || '',
            locale: 'en',
          };

          // Create user with old name
          const user1 = profileManager.findOrCreateUser(oldProfile);
          expect(user1.name).toBe(oldName);

          // Update with new name
          const newProfile = { ...oldProfile, name: newName };
          const user2 = profileManager.findOrCreateUser(newProfile);
          expect(user2.user_id).toBe(user1.user_id);
          expect(user2.name).toBe(newName);

          // Verify in database
          const db = dbManager.getDatabase();
          const dbUser = db
            ?.prepare('SELECT name FROM users WHERE user_id = ?')
            .get(user1.user_id) as { name: string };
          expect(dbUser.name).toBe(newName);
        }
      ),
      { numRuns: 100 }
    );
  });
});
