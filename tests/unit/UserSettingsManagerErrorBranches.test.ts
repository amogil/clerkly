// Requirements: clerkly.2, error-notifications.1.1, user-data-isolation.6.5

import { UserSettingsManager } from '../../src/main/UserSettingsManager';
import type { IDatabaseManager } from '../../src/main/DatabaseManager';
import { handleBackgroundError } from '../../src/main/ErrorHandler';

jest.mock('../../src/main/ErrorHandler', () => ({
  handleBackgroundError: jest.fn(),
}));

describe('UserSettingsManager error branches', () => {
  let settings: {
    set: jest.Mock;
    get: jest.Mock;
    delete: jest.Mock;
  };
  let manager: UserSettingsManager;

  beforeEach(() => {
    settings = {
      set: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };

    manager = new UserSettingsManager({ settings } as unknown as IDatabaseManager);
    jest.clearAllMocks();
  });

  /* Preconditions: UserSettingsManager initialized with mock settings
     Action: Call saveData with circular value
     Assertions: Returns serialization error
     Requirements: clerkly.2, user-data-isolation.6.5 */
  it('should return error when value cannot be serialized', () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    const result = manager.saveData('key', circular);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to serialize value');
  });

  /* Preconditions: settings.set throws SQLITE_FULL
     Action: Call saveData with valid key and value
     Assertions: Returns disk full error and reports background error
     Requirements: error-notifications.1.1 */
  it('should handle SQLITE_FULL in saveData', () => {
    settings.set.mockImplementation(() => {
      const error = new Error('SQLITE_FULL');
      (error as { code?: string }).code = 'SQLITE_FULL';
      throw error;
    });

    const result = manager.saveData('key', 'value');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database is full: no space left on device');
    expect(handleBackgroundError).toHaveBeenCalled();
  });

  /* Preconditions: settings.set throws SQLITE_BUSY
     Action: Call saveData with valid key and value
     Assertions: Returns database locked error
     Requirements: clerkly.2 */
  it('should handle SQLITE_BUSY in saveData', () => {
    settings.set.mockImplementation(() => {
      const error = new Error('SQLITE_BUSY');
      (error as { code?: string }).code = 'SQLITE_BUSY';
      throw error;
    });

    const result = manager.saveData('key', 'value');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database is locked: try again later');
  });

  /* Preconditions: settings.set throws SQLITE_READONLY
     Action: Call saveData with valid key and value
     Assertions: Returns read-only error and reports background error
     Requirements: error-notifications.1.1 */
  it('should handle SQLITE_READONLY in saveData', () => {
    settings.set.mockImplementation(() => {
      const error = new Error('SQLITE_READONLY');
      (error as { code?: string }).code = 'SQLITE_READONLY';
      throw error;
    });

    const result = manager.saveData('key', 'value');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database is read-only: check permissions');
    expect(handleBackgroundError).toHaveBeenCalled();
  });

  /* Preconditions: settings.set throws Database not initialized
     Action: Call saveData with valid key and value
     Assertions: Returns database not initialized error
     Requirements: clerkly.2 */
  it('should handle database not initialized in saveData', () => {
    settings.set.mockImplementation(() => {
      throw new Error('Database not initialized');
    });

    const result = manager.saveData('key', 'value');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database not initialized or closed');
  });

  /* Preconditions: settings.get returns invalid JSON
     Action: Call loadData for key with invalid JSON value
     Assertions: Returns raw string as data
     Requirements: clerkly.2 */
  it('should fall back to raw string when JSON parsing fails', () => {
    settings.get.mockReturnValue({ value: '{invalid-json' });

    const result = manager.loadData('key');

    expect(result.success).toBe(true);
    expect(result.data).toBe('{invalid-json');
  });

  /* Preconditions: key length exceeds 1000 characters
     Action: Call loadData with long key
     Assertions: Returns invalid key error
     Requirements: clerkly.2 */
  it('should reject long keys in loadData', () => {
    const result = manager.loadData('a'.repeat(1001));

    expect(result.success).toBe(false);
    expect(result.error).toContain('exceeds maximum length');
  });

  /* Preconditions: settings.get throws SQLITE_LOCKED
     Action: Call loadData with valid key
     Assertions: Returns database locked error
     Requirements: clerkly.2 */
  it('should handle SQLITE_LOCKED in loadData', () => {
    settings.get.mockImplementation(() => {
      const error = new Error('SQLITE_LOCKED');
      (error as { code?: string }).code = 'SQLITE_LOCKED';
      throw error;
    });

    const result = manager.loadData('key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database is locked: try again later');
  });

  /* Preconditions: settings.get throws Database not initialized
     Action: Call loadData with valid key
     Assertions: Returns database not initialized error
     Requirements: clerkly.2 */
  it('should handle database not initialized in loadData', () => {
    settings.get.mockImplementation(() => {
      throw new Error('Database not initialized');
    });

    const result = manager.loadData('key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database not initialized or closed');
  });

  /* Preconditions: key length exceeds 1000 characters
     Action: Call deleteData with long key
     Assertions: Returns invalid key error
     Requirements: clerkly.2 */
  it('should reject long keys in deleteData', () => {
    const result = manager.deleteData('a'.repeat(1001));

    expect(result.success).toBe(false);
    expect(result.error).toContain('exceeds maximum length');
  });

  /* Preconditions: settings.delete returns false
     Action: Call deleteData for missing key
     Assertions: Returns key not found error
     Requirements: clerkly.2 */
  it('should return error when deleteData cannot find key', () => {
    settings.delete.mockReturnValue(false);

    const result = manager.deleteData('missing-key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Key not found');
  });

  /* Preconditions: settings.delete throws SQLITE_READONLY
     Action: Call deleteData with valid key
     Assertions: Returns read-only error
     Requirements: error-notifications.1.1 */
  it('should handle SQLITE_READONLY in deleteData', () => {
    settings.delete.mockImplementation(() => {
      const error = new Error('SQLITE_READONLY');
      (error as { code?: string }).code = 'SQLITE_READONLY';
      throw error;
    });

    const result = manager.deleteData('key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database is read-only: check permissions');
  });

  /* Preconditions: settings.delete throws SQLITE_BUSY
     Action: Call deleteData with valid key
     Assertions: Returns database locked error
     Requirements: clerkly.2 */
  it('should handle SQLITE_BUSY in deleteData', () => {
    settings.delete.mockImplementation(() => {
      const error = new Error('SQLITE_BUSY');
      (error as { code?: string }).code = 'SQLITE_BUSY';
      throw error;
    });

    const result = manager.deleteData('key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database is locked: try again later');
  });

  /* Preconditions: settings.delete throws Database not initialized
     Action: Call deleteData with valid key
     Assertions: Returns database not initialized error
     Requirements: clerkly.2 */
  it('should handle database not initialized in deleteData', () => {
    settings.delete.mockImplementation(() => {
      throw new Error('Database not initialized');
    });

    const result = manager.deleteData('key');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database not initialized or closed');
  });
});
