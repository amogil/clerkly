// Requirements: clerkly.2, user-data-isolation.6.7, user-data-isolation.6.8

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UserSettingsManager } from '../../src/main/UserSettingsManager';
import { DatabaseManager } from '../../src/main/DatabaseManager';
import { NO_USER_LOGGED_IN_ERROR } from '../../src/shared/errors/userErrors';

describe('UserSettingsManager', () => {
  let dataManager: UserSettingsManager;
  let dbManager: DatabaseManager;
  let testDbPath: string;

  beforeEach(() => {
    // Create a temporary directory for test database
    testDbPath = path.join(os.tmpdir(), `test-user-settings-${Date.now()}`);

    // Initialize DatabaseManager
    dbManager = new DatabaseManager();
    dbManager.initialize(testDbPath);

    // Mock UserManager for getCurrentUserId
    const mockUserManager = {
      getCurrentUserId: jest.fn().mockReturnValue('test-user-id'),
    } as any;
    dbManager.setUserManager(mockUserManager);

    // Create UserSettingsManager with DatabaseManager
    dataManager = new UserSettingsManager(dbManager);
  });

  afterEach(() => {
    // Clean up
    dbManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  describe('saveData', () => {
    /* Preconditions: UserSettingsManager initialized with DatabaseManager
       Action: call saveData with valid key and value
       Assertions: returns success true
       Requirements: clerkly.2, user-data-isolation.6.7, user-data-isolation.6.8 */
    it('should save data successfully', () => {
      const result = dataManager.saveData('test-key', 'test-value');
      expect(result.success).toBe(true);
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call saveData with empty key
       Assertions: returns success false with error message
       Requirements: clerkly.2 */
    it('should reject empty key', () => {
      const result = dataManager.saveData('', 'test-value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call saveData with key longer than 1000 characters
       Assertions: returns success false with error message
       Requirements: clerkly.2 */
    it('should reject key longer than 1000 characters', () => {
      const longKey = 'a'.repeat(1001);
      const result = dataManager.saveData(longKey, 'test-value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call saveData with various data types
       Assertions: all types saved successfully
       Requirements: clerkly.2 */
    it('should save various data types', () => {
      expect(dataManager.saveData('string-key', 'string-value').success).toBe(true);
      expect(dataManager.saveData('number-key', 42).success).toBe(true);
      expect(dataManager.saveData('object-key', { nested: 'object' }).success).toBe(true);
      expect(dataManager.saveData('array-key', [1, 2, 3]).success).toBe(true);
      expect(dataManager.saveData('boolean-key', true).success).toBe(true);
      expect(dataManager.saveData('null-key', null).success).toBe(true);
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call saveData with Infinity values
       Assertions: Infinity values saved and loaded correctly
       Requirements: clerkly.2 */
    it('should handle Infinity values', () => {
      const saveResult = dataManager.saveData('infinity-key', Infinity);
      expect(saveResult.success).toBe(true);

      const loadResult = dataManager.loadData('infinity-key');
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(Infinity);
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call saveData with -Infinity values
       Assertions: -Infinity values saved and loaded correctly
       Requirements: clerkly.2 */
    it('should handle -Infinity values', () => {
      const saveResult = dataManager.saveData('neg-infinity-key', -Infinity);
      expect(saveResult.success).toBe(true);

      const loadResult = dataManager.loadData('neg-infinity-key');
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBe(-Infinity);
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call saveData with value larger than 10MB
       Assertions: returns success false with error message
       Requirements: clerkly.2 */
    it('should reject value larger than 10MB', () => {
      const largeValue = 'a'.repeat(11 * 1024 * 1024);
      const result = dataManager.saveData('large-key', largeValue);
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds 10MB limit');
    });
  });

  describe('loadData', () => {
    /* Preconditions: Data saved in database
       Action: call loadData with existing key
       Assertions: returns success true with correct data
       Requirements: clerkly.2, user-data-isolation.6.7, user-data-isolation.6.8 */
    it('should load saved data', () => {
      dataManager.saveData('test-key', 'test-value');
      const result = dataManager.loadData('test-key');
      expect(result.success).toBe(true);
      expect(result.data).toBe('test-value');
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call loadData with non-existent key
       Assertions: returns success false with 'Key not found' error
       Requirements: clerkly.2 */
    it('should return error for non-existent key', () => {
      const result = dataManager.loadData('non-existent-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Key not found');
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call loadData with empty key
       Assertions: returns success false with error message
       Requirements: clerkly.2 */
    it('should reject empty key', () => {
      const result = dataManager.loadData('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });

    /* Preconditions: Various data types saved
       Action: call loadData for each type
       Assertions: all types loaded correctly
       Requirements: clerkly.2 */
    it('should load various data types correctly', () => {
      dataManager.saveData('string-key', 'string-value');
      dataManager.saveData('number-key', 42);
      dataManager.saveData('object-key', { nested: 'object' });
      dataManager.saveData('array-key', [1, 2, 3]);
      dataManager.saveData('boolean-key', true);

      expect(dataManager.loadData('string-key').data).toBe('string-value');
      expect(dataManager.loadData('number-key').data).toBe(42);
      expect(dataManager.loadData('object-key').data).toEqual({ nested: 'object' });
      expect(dataManager.loadData('array-key').data).toEqual([1, 2, 3]);
      expect(dataManager.loadData('boolean-key').data).toBe(true);
    });
  });

  describe('deleteData', () => {
    /* Preconditions: Data saved in database
       Action: call deleteData with existing key
       Assertions: returns success true, data no longer accessible
       Requirements: clerkly.2, user-data-isolation.6.7, user-data-isolation.6.8 */
    it('should delete existing data', () => {
      dataManager.saveData('test-key', 'test-value');
      const deleteResult = dataManager.deleteData('test-key');
      expect(deleteResult.success).toBe(true);

      const loadResult = dataManager.loadData('test-key');
      expect(loadResult.success).toBe(false);
      expect(loadResult.error).toBe('Key not found');
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call deleteData with non-existent key
       Assertions: returns success false with 'Key not found' error
       Requirements: clerkly.2 */
    it('should return error for non-existent key', () => {
      const result = dataManager.deleteData('non-existent-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Key not found');
    });

    /* Preconditions: UserSettingsManager initialized
       Action: call deleteData with empty key
       Assertions: returns success false with error message
       Requirements: clerkly.2 */
    it('should reject empty key', () => {
      const result = dataManager.deleteData('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid key');
    });
  });

  describe('user data isolation', () => {
    /* Preconditions: Data saved for user A
       Action: Switch to user B and try to load data
       Assertions: Data not accessible for user B
       Requirements: user-data-isolation.3.1, user-data-isolation.6.7, user-data-isolation.6.8 */
    it('should isolate data between users', () => {
      // Save data as user A
      dataManager.saveData('shared-key', 'user-a-value');

      // Switch to user B
      const mockUserManagerB = {
        getCurrentUserId: jest.fn().mockReturnValue('user-b-id'),
      } as any;
      dbManager.setUserManager(mockUserManagerB);

      // Try to load data as user B
      const result = dataManager.loadData('shared-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Key not found');
    });

    /* Preconditions: Same key saved for different users
       Action: Load data for each user
       Assertions: Each user gets their own data
       Requirements: user-data-isolation.3.1, user-data-isolation.6.7, user-data-isolation.6.8 */
    it('should allow same key for different users', () => {
      // Save data as user A
      dataManager.saveData('shared-key', 'user-a-value');

      // Switch to user B and save different value
      const mockUserManagerB = {
        getCurrentUserId: jest.fn().mockReturnValue('user-b-id'),
      } as any;
      dbManager.setUserManager(mockUserManagerB);
      dataManager.saveData('shared-key', 'user-b-value');

      // Verify user B gets their value
      expect(dataManager.loadData('shared-key').data).toBe('user-b-value');

      // Switch back to user A
      const mockUserManagerA = {
        getCurrentUserId: jest.fn().mockReturnValue('test-user-id'),
      } as any;
      dbManager.setUserManager(mockUserManagerA);

      // Verify user A still gets their value
      expect(dataManager.loadData('shared-key').data).toBe('user-a-value');
    });
  });

  describe('database not initialized', () => {
    /* Preconditions: Database closed
       Action: call saveData
       Assertions: returns success false with error message
       Requirements: clerkly.2 */
    it('should handle closed database on save', () => {
      dbManager.close();
      const result = dataManager.saveData('test-key', 'test-value');
      expect(result.success).toBe(false);
      // Error can be "Database not initialized" or "connection is not open"
      expect(result.error).toBeDefined();
    });

    /* Preconditions: Database closed
       Action: call loadData
       Assertions: returns success false with error message
       Requirements: clerkly.2 */
    it('should handle closed database on load', () => {
      dbManager.close();
      const result = dataManager.loadData('test-key');
      expect(result.success).toBe(false);
      // Error can be "Database not initialized" or "connection is not open"
      expect(result.error).toBeDefined();
    });

    /* Preconditions: Database closed
       Action: call deleteData
       Assertions: returns success false with error message
       Requirements: clerkly.2 */
    it('should handle closed database on delete', () => {
      dbManager.close();
      const result = dataManager.deleteData('test-key');
      expect(result.success).toBe(false);
      // Error can be "Database not initialized" or "connection is not open"
      expect(result.error).toBeDefined();
    });
  });

  describe('no user logged in', () => {
    /* Preconditions: No user logged in (getCurrentUserId returns null)
       Action: call saveData
       Assertions: returns error 'No user logged in'
       Requirements: user-data-isolation.3.2, user-data-isolation.6.6 */
    it('should return error on save when no user logged in', () => {
      const mockUserManagerNoUser = {
        getCurrentUserId: jest.fn().mockReturnValue(null),
      } as any;
      dbManager.setUserManager(mockUserManagerNoUser);

      const result = dataManager.saveData('test-key', 'test-value');
      expect(result.success).toBe(false);
      expect(result.error).toContain(NO_USER_LOGGED_IN_ERROR);
    });

    /* Preconditions: No user logged in (getCurrentUserId returns null)
       Action: call loadData
       Assertions: returns error 'No user logged in'
       Requirements: user-data-isolation.3.2, user-data-isolation.6.6 */
    it('should return error on load when no user logged in', () => {
      const mockUserManagerNoUser = {
        getCurrentUserId: jest.fn().mockReturnValue(null),
      } as any;
      dbManager.setUserManager(mockUserManagerNoUser);

      const result = dataManager.loadData('test-key');
      expect(result.success).toBe(false);
      expect(result.error).toContain(NO_USER_LOGGED_IN_ERROR);
    });

    /* Preconditions: No user logged in (getCurrentUserId returns null)
       Action: call deleteData
       Assertions: returns error 'No user logged in'
       Requirements: user-data-isolation.3.2, user-data-isolation.6.6 */
    it('should return error on delete when no user logged in', () => {
      const mockUserManagerNoUser = {
        getCurrentUserId: jest.fn().mockReturnValue(null),
      } as any;
      dbManager.setUserManager(mockUserManagerNoUser);

      const result = dataManager.deleteData('test-key');
      expect(result.success).toBe(false);
      expect(result.error).toContain(NO_USER_LOGGED_IN_ERROR);
    });
  });
});
