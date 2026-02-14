// Requirements: clerkly.1, clerkly.2, error-notifications.1.1, user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.2.6, user-data-isolation.3.1, user-data-isolation.3.2, user-data-isolation.6.7, user-data-isolation.6.8

import { handleBackgroundError } from './ErrorHandler';
import type { IDatabaseManager } from './DatabaseManager';
import { Logger } from './Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Save data result
 */
export interface SaveDataResult {
  success: boolean;
  error?: string;
}

/**
 * Load data result
 */
export interface LoadDataResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Delete data result
 */
export interface DeleteDataResult {
  success: boolean;
  error?: string;
}

/**
 * Interface for data storage operations
 * Allows dependency injection and testing with mock implementations
 * Requirements: database-refactoring.2.4
 */
export interface IUserSettingsManager {
  saveData(key: string, value: unknown): SaveDataResult;
  loadData(key: string): LoadDataResult;
  deleteData(key: string): DeleteDataResult;
}

/**
 * Manages user settings storage using SQLite
 * Requirements: user-data-isolation.3.1 - Supports user data isolation via DatabaseManager
 * Requirements: user-data-isolation.6.7 - Uses DatabaseManager methods for queries
 * Requirements: user-data-isolation.6.8 - Does not require explicit user_id in public methods
 */
export class UserSettingsManager implements IUserSettingsManager {
  private dbManager: IDatabaseManager;
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('UserSettingsManager');

  /**
   * Constructor - accepts DatabaseManager for database access
   * Requirements: user-data-isolation.6.7
   * @param dbManager DatabaseManager instance for database access and user_id
   */
  constructor(dbManager: IDatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Saves data locally
   * Validates key (non-empty string, max 1000 chars)
   * Serializes value to JSON
   * Checks size (max 10MB)
   * Handles errors (SQLITE_FULL, SQLITE_BUSY, SQLITE_LOCKED, SQLITE_READONLY)
   * Requirements: clerkly.1, error-notifications.1.1, user-data-isolation.2.4, user-data-isolation.3.1, user-data-isolation.6.7, user-data-isolation.6.8
   *
   * @param {string} key
   * @param {unknown} value
   * @returns {SaveDataResult}
   */
  saveData(key: string, value: unknown): SaveDataResult {
    try {
      // Validate key
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Invalid key: must be non-empty string' };
      }

      if (key.length > 1000) {
        return { success: false, error: 'Invalid key: exceeds maximum length of 1000 characters' };
      }

      // Check database initialization
      const db = this.dbManager.getDatabase();
      if (!db || !db.open) {
        return { success: false, error: 'Database not initialized or closed' };
      }

      // Serialize value with Infinity/-Infinity support
      let serializedValue: string;
      try {
        serializedValue = JSON.stringify(value, (_key, val) => {
          if (val === Infinity) return { __type: 'Infinity' };
          if (val === -Infinity) return { __type: '-Infinity' };
          if (typeof val === 'number' && isNaN(val)) return { __type: 'NaN' };
          return val;
        });
      } catch (serializeError: unknown) {
        const errorMessage =
          serializeError instanceof Error ? serializeError.message : 'Unknown error';
        return { success: false, error: `Failed to serialize value: ${errorMessage}` };
      }

      // Check size (max 10MB)
      const sizeInBytes = Buffer.byteLength(serializedValue, 'utf8');
      if (sizeInBytes > 10 * 1024 * 1024) {
        return { success: false, error: 'Value too large: exceeds 10MB limit' };
      }

      const now = Date.now();

      // Requirements: user-data-isolation.2.4, user-data-isolation.6.7, user-data-isolation.6.8
      // Use runUserQuery - user_id is automatically prepended as FIRST parameter
      // SQL placeholders: user_id (auto), key, value, created_at, updated_at
      this.dbManager.runUserQuery(
        `
        INSERT INTO user_data (user_id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key, user_id) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `,
        [key, serializedValue, now, now]
      );

      this.logger.info(`Data saved, key: ${key}`);

      return { success: true };
    } catch (writeError: unknown) {
      const errorObj = writeError as { code?: string; message?: string };
      // Handle SQLite-specific errors
      if (errorObj.code === 'SQLITE_FULL') {
        // Requirements: error-notifications.1.1 - Notify user about critical database error
        handleBackgroundError(
          new Error('Database is full: no space left on device'),
          'Database Storage (disk full)'
        );
        return { success: false, error: 'Database is full: no space left on device' };
      } else if (errorObj.code === 'SQLITE_BUSY' || errorObj.code === 'SQLITE_LOCKED') {
        return { success: false, error: 'Database is locked: try again later' };
      } else if (errorObj.code === 'SQLITE_READONLY') {
        // Requirements: error-notifications.1.1 - Notify user about critical database error
        handleBackgroundError(
          new Error('Database is read-only: check permissions'),
          'Database Storage (read-only)'
        );
        return { success: false, error: 'Database is read-only: check permissions' };
      }
      // Handle "No user logged in" error
      if (errorObj.message === 'No user logged in') {
        return { success: false, error: 'No user logged in' };
      }
      const errorMessage = errorObj.message || 'Unknown error';
      return { success: false, error: `Database write failed: ${errorMessage}` };
    }
  }

  /**
   * Loads data from local storage
   * Validates key
   * Deserializes JSON
   * Handles errors (SQLITE_BUSY, SQLITE_LOCKED)
   * Requirements: clerkly.1, user-data-isolation.2.5, user-data-isolation.3.1, user-data-isolation.6.7, user-data-isolation.6.8
   *
   * @param {string} key
   * @returns {LoadDataResult}
   */
  loadData(key: string): LoadDataResult {
    try {
      // Validate key
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Invalid key: must be non-empty string' };
      }

      if (key.length > 1000) {
        return { success: false, error: 'Invalid key: exceeds maximum length of 1000 characters' };
      }

      // Check database initialization
      const db = this.dbManager.getDatabase();
      if (!db || !db.open) {
        return { success: false, error: 'Database not initialized or closed' };
      }

      // Requirements: user-data-isolation.2.5, user-data-isolation.6.7, user-data-isolation.6.8
      // Use getUserRow - user_id is automatically prepended as FIRST parameter
      // SQL placeholders: user_id (auto), key
      const row = this.dbManager.getUserRow<{ value: string }>(
        'SELECT value FROM user_data WHERE user_id = ? AND key = ?',
        [key]
      );

      if (!row) {
        return { success: false, error: 'Key not found' };
      }

      // Deserialize with Infinity/-Infinity support
      let data: unknown;
      try {
        data = JSON.parse(row.value, (_key, val) => {
          if (val && typeof val === 'object' && val.__type) {
            if (val.__type === 'Infinity') return Infinity;
            if (val.__type === '-Infinity') return -Infinity;
            if (val.__type === 'NaN') return NaN;
          }
          return val;
        });
      } catch {
        // Fallback for plain string
        data = row.value;
      }

      return { success: true, data };
    } catch (queryError: unknown) {
      const errorObj = queryError as { code?: string; message?: string };
      if (errorObj.code === 'SQLITE_BUSY' || errorObj.code === 'SQLITE_LOCKED') {
        return { success: false, error: 'Database is locked: try again later' };
      }
      // Handle "No user logged in" error
      if (errorObj.message === 'No user logged in') {
        return { success: false, error: 'No user logged in' };
      }
      const errorMessage = errorObj.message || 'Unknown error';
      return { success: false, error: `Database query failed: ${errorMessage}` };
    }
  }

  /**
   * Deletes data from local storage
   * Validates key
   * Handles errors
   * Requirements: clerkly.1, user-data-isolation.2.6, user-data-isolation.3.1, user-data-isolation.6.7, user-data-isolation.6.8
   *
   * @param {string} key
   * @returns {DeleteDataResult}
   */
  deleteData(key: string): DeleteDataResult {
    try {
      // Validate key
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Invalid key: must be non-empty string' };
      }

      if (key.length > 1000) {
        return { success: false, error: 'Invalid key: exceeds maximum length of 1000 characters' };
      }

      // Check database initialization
      const db = this.dbManager.getDatabase();
      if (!db || !db.open) {
        return { success: false, error: 'Database not initialized or closed' };
      }

      // Requirements: user-data-isolation.2.6, user-data-isolation.6.7, user-data-isolation.6.8
      // Use runUserQuery - user_id is automatically prepended as FIRST parameter
      // SQL placeholders: user_id (auto), key
      const result = this.dbManager.runUserQuery(
        'DELETE FROM user_data WHERE user_id = ? AND key = ?',
        [key]
      );

      if (result.changes === 0) {
        return { success: false, error: 'Key not found' };
      }

      return { success: true };
    } catch (deleteError: unknown) {
      const errorObj = deleteError as { code?: string; message?: string };
      if (errorObj.code === 'SQLITE_BUSY' || errorObj.code === 'SQLITE_LOCKED') {
        return { success: false, error: 'Database is locked: try again later' };
      } else if (errorObj.code === 'SQLITE_READONLY') {
        return { success: false, error: 'Database is read-only: check permissions' };
      }
      // Handle "No user logged in" error
      if (errorObj.message === 'No user logged in') {
        return { success: false, error: 'No user logged in' };
      }
      const errorMessage = errorObj.message || 'Unknown error';
      return { success: false, error: `Database delete failed: ${errorMessage}` };
    }
  }
}
