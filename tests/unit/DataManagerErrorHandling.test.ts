// Requirements: user-data-isolation.1.13, user-data-isolation.1.19, user-data-isolation.1.20, user-data-isolation.1.21

import { DataManager } from '../../src/main/DataManager';
import type { UserProfileManager } from '../../src/main/auth/UserProfileManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock electron BrowserWindow
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));

describe('DataManager Error Handling - "No user logged in"', () => {
  let dataManager: DataManager;
  let testStoragePath: string;
  let testDbPath: string;
  let mockProfileManager: jest.Mocked<UserProfileManager>;

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
    } as unknown as jest.Mocked<UserProfileManager>;

    dataManager = new DataManager(testStoragePath);
    dataManager.initialize();
    dataManager.setUserProfileManager(mockProfileManager);
  });

  afterEach(() => {
    if (dataManager) {
      dataManager.close();
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
     Requirements: user-data-isolation.1.19
     Note: Application code should handle this by redirecting to login and clearing caches */
  it('should return error when user is not authenticated', () => {
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    const result = dataManager.saveData('test_key', 'test_value');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No user logged in');
  });

  /* Preconditions: getCurrentUserId returns null during operation, user was authenticated
     Action: Trigger "No user logged in" error
     Assertions: Returns error result, application code should retry after token refresh
     Requirements: user-data-isolation.1.20
     Note: This test verifies the error is returned. Application code should:
     1. Check the error
     2. Call refreshAccessToken()
     3. Retry the operation if refresh succeeds
     4. Redirect to login if refresh fails */
  it('should return error when session expires during operation', () => {
    // Initially authenticated
    mockProfileManager.getCurrentUserId.mockReturnValue('user@example.com');
    dataManager.saveData('test_key', 'initial_value');

    // Session expires (getCurrentUserId returns null)
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    const result = dataManager.saveData('test_key', 'new_value');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No user logged in');

    // Note: Application code should handle this by:
    // 1. Checking the error
    // 2. Attempting token refresh
    // 3. Retrying the operation if refresh succeeds
  });

  /* Preconditions: getCurrentUserId returns null during logout
     Action: Trigger "No user logged in" error during logout
     Assertions: Returns error result
     Requirements: user-data-isolation.1.21
     Note: Application code should silently ignore this error during logout and log it for debugging */
  it('should return error during logout (race condition)', () => {
    // User was authenticated
    mockProfileManager.getCurrentUserId.mockReturnValue('user@example.com');
    dataManager.saveData('test_key', 'test_value');

    // Logout happens (getCurrentUserId returns null)
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    // Attempt to save during logout (race condition)
    const result = dataManager.saveData('test_key', 'new_value');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No user logged in');

    // Note: Application code should:
    // 1. Check this error during logout
    // 2. Silently ignore it (don't show to user)
    // 3. Log it to console for debugging
  });

  /* Preconditions: getCurrentUserId returns null
     Action: Attempt to load data
     Assertions: Returns error result with message containing "No user logged in"
     Requirements: user-data-isolation.1.13 */
  it('should return error on loadData when no user logged in', () => {
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    const result = dataManager.loadData('test_key');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No user logged in');
  });

  /* Preconditions: getCurrentUserId returns null
     Action: Attempt to delete data
     Assertions: Returns error result with message containing "No user logged in"
     Requirements: user-data-isolation.1.13 */
  it('should return error on deleteData when no user logged in', () => {
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    const result = dataManager.deleteData('test_key');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No user logged in');
  });

  /* Preconditions: User authenticated, data saved
     Action: Session expires, attempt to load data
     Assertions: Returns error, data remains in database
     Requirements: user-data-isolation.1.20 */
  it('should preserve data when session expires during load', () => {
    // Save data while authenticated
    mockProfileManager.getCurrentUserId.mockReturnValue('user@example.com');
    dataManager.saveData('test_key', 'test_value');

    // Session expires
    mockProfileManager.getCurrentUserId.mockReturnValue(null);

    // Attempt to load
    const result = dataManager.loadData('test_key');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No user logged in');

    // Verify data is still in database (re-authenticate and load)
    mockProfileManager.getCurrentUserId.mockReturnValue('user@example.com');
    const result2 = dataManager.loadData('test_key');
    expect(result2.success).toBe(true);
    expect(result2.data).toBe('test_value');
  });
});
