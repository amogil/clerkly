// Requirements: user-data-isolation.3.2, user-data-isolation.6.6, user-data-isolation.6.7, user-data-isolation.6.8

import { UserSettingsManager } from '../../src/main/UserSettingsManager';
import { DatabaseManager } from '../../src/main/DatabaseManager';
import type { UserManager } from '../../src/main/auth/UserManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { NO_USER_LOGGED_IN_ERROR } from '../../src/shared/errors/userErrors';

// Mock electron BrowserWindow
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

describe('UserSettingsManager Error Handling - "No user logged in"', () => {
  let dataManager: UserSettingsManager;
  let dbManager: DatabaseManager;
  let testStoragePath: string;
  let testDbPath: string;
  let mockProfileManager: jest.Mocked<UserManager>;

  beforeEach(() => {
    testStoragePath = fs.mkdtempSync(path.join(os.tmpdir(), 'datamanager-error-test-'));
    testDbPath = path.join(testStoragePath, 'clerkly.db');

    // Ensure migrations directory exists
    const migrationsPath = path.join(__dirname, '..', '..', 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }

    mockProfileManager = {
      getCurrentUserId: jest.fn(),
    } as unknown as jest.Mocked<UserManager>;

    // Initialize DatabaseManager first
    dbManager = new DatabaseManager();
    dbManager.initialize(testStoragePath);
    dbManager.setUserManager(mockProfileManager);

    // Create UserSettingsManager with DatabaseManager
    dataManager = new UserSettingsManager(dbManager);
  });

  afterEach(() => {
    if (dbManager) {
      dbManager.close();
    }

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

  /* Preconditions: getCurrentUserId returns null, user is not authenticated
     Action: Trigger "No user logged in" error from saveData
     Assertions: Returns error result with message containing "No user logged in"
     Requirements: user-data-isolation.3.2, user-data-isolation.6.6
     Note: Application code should handle this by redirecting to login and clearing caches */
  it('should return error when user is not authenticated', () => {
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    const result = dataManager.saveData('test_key', 'test_value');

    expect(result.success).toBe(false);
    expect(result.error).toContain(NO_USER_LOGGED_IN_ERROR);
  });

  /* Preconditions: getCurrentUserId returns null during operation, user was authenticated
     Action: Trigger "No user logged in" error
     Assertions: Returns error result, application code should retry after token refresh
     Requirements: user-data-isolation.3.2, user-data-isolation.6.6
     Note: This test verifies the error is returned. Application code should:
     1. Check the error
     2. Call refreshAccessToken()
     3. Retry the operation if refresh succeeds
     4. Redirect to login if refresh fails */
  it('should return error when session expires during operation', () => {
    // Initially authenticated
    mockProfileManager.getCurrentUserId.mockReturnValue('test-user-id');
    dataManager.saveData('test_key', 'initial_value');

    // Session expires (getCurrentUserId returns null)
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    const result = dataManager.saveData('test_key', 'new_value');

    expect(result.success).toBe(false);
    expect(result.error).toContain(NO_USER_LOGGED_IN_ERROR);
  });

  /* Preconditions: getCurrentUserId returns null
     Action: Call loadData
     Assertions: Returns error result with "No user logged in"
     Requirements: user-data-isolation.3.2, user-data-isolation.6.6 */
  it('should return error on loadData when user is not authenticated', () => {
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    const result = dataManager.loadData('test_key');

    expect(result.success).toBe(false);
    expect(result.error).toContain(NO_USER_LOGGED_IN_ERROR);
  });

  /* Preconditions: getCurrentUserId returns null
     Action: Call deleteData
     Assertions: Returns error result with "No user logged in"
     Requirements: user-data-isolation.3.2, user-data-isolation.6.6 */
  it('should return error on deleteData when user is not authenticated', () => {
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    const result = dataManager.deleteData('test_key');

    expect(result.success).toBe(false);
    expect(result.error).toContain(NO_USER_LOGGED_IN_ERROR);
  });

  /* Preconditions: User authenticated, data saved, then user logs out
     Action: Try to access data after logout
     Assertions: Returns error result with "No user logged in"
     Requirements: user-data-isolation.3.2, user-data-isolation.6.6 */
  it('should return error when trying to access data after logout', () => {
    // User is authenticated and saves data
    mockProfileManager.getCurrentUserId.mockReturnValue('test-user-id');
    dataManager.saveData('test_key', 'test_value');

    // User logs out (getCurrentUserId returns null)
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    // Try to load data
    const loadResult = dataManager.loadData('test_key');
    expect(loadResult.success).toBe(false);
    expect(loadResult.error).toContain(NO_USER_LOGGED_IN_ERROR);

    // Try to delete data
    const deleteResult = dataManager.deleteData('test_key');
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.error).toContain(NO_USER_LOGGED_IN_ERROR);
  });
});
