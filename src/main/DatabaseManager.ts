// Requirements: database-refactoring.1, user-data-isolation.6.1, user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.6.4, user-data-isolation.6.7

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MigrationRunner } from './MigrationRunner';
import type { UserManager } from './auth/UserManager';
import { Logger } from './Logger';

/**
 * Initialize result for DatabaseManager
 * Requirements: database-refactoring.1.1
 */
export interface DatabaseInitializeResult {
  success: boolean;
  migrations?: {
    success: boolean;
    appliedCount: number;
    message: string;
  };
  warning?: string;
  path?: string;
}

/**
 * Interface for database management operations
 * Allows dependency injection and testing with mock implementations
 * Requirements: user-data-isolation.6.1, user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.6.4
 */
export interface IDatabaseManager {
  setUserManager(userManager: UserManager): void;
  getDatabase(): Database.Database | null;
  getCurrentUserId(): string | null;
  getCurrentUserIdStrict(): string;

  // Methods for queries with automatic user_id injection
  // Requirements: user-data-isolation.6.3, user-data-isolation.6.5, user-data-isolation.6.6
  runUserQuery(sql: string, params?: unknown[]): Database.RunResult;
  getUserRow<T>(sql: string, params?: unknown[]): T | undefined;
  getUserRows<T>(sql: string, params?: unknown[]): T[];

  // Methods for global queries (without user_id)
  // Requirements: user-data-isolation.6.4, user-data-isolation.6.10
  runQuery(sql: string, params?: unknown[]): Database.RunResult;
  getRow<T>(sql: string, params?: unknown[]): T | undefined;
  getRows<T>(sql: string, params?: unknown[]): T[];
}

/**
 * DatabaseManager - единая точка входа для доступа к базе данных
 *
 * Responsibilities:
 * - Инициализация БД и миграций
 * - Доступ к SQLite database instance
 * - Получение текущего user_id через UserManager
 *
 * Supports two modes:
 * 1. Legacy mode: constructor(db) - for backward compatibility
 * 2. New mode: constructor() + initialize(storagePath) - for full DB management
 *
 * Requirements: database-refactoring.1, user-data-isolation.6.1, user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.6.4
 */
export class DatabaseManager implements IDatabaseManager {
  private db: Database.Database | null = null;
  private userManager: UserManager | null = null;
  private storagePath: string | null = null;
  private migrationRunner: MigrationRunner | null = null;
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('DatabaseManager');

  /**
   * Create a new DatabaseManager
   *
   * @param db Optional database instance for legacy mode (backward compatibility)
   *           If provided, DatabaseManager acts as a wrapper around existing DB
   *           If not provided, use initialize() to create and manage the DB
   */
  constructor(db?: Database.Database | null) {
    if (db) {
      this.db = db;
    }
  }

  /**
   * Set the database instance (legacy mode)
   * @param db Database instance
   */
  setDatabase(db: Database.Database | null): void {
    this.db = db;
  }

  /**
   * Initialize database and run migrations
   * Creates necessary directories and files
   * Handles permission errors (fallback to temp directory)
   * Handles corrupted databases (backup and recreate)
   *
   * Requirements: database-refactoring.1.1, user-data-isolation.6.1, user-data-isolation.6.7
   *
   * @param storagePath - Path to storage directory
   * @returns DatabaseInitializeResult
   */
  initialize(storagePath: string): DatabaseInitializeResult {
    try {
      this.storagePath = storagePath;
      let usedFallback = false;
      let fallbackPath: string | undefined;

      // Create storage directory
      try {
        if (!fs.existsSync(storagePath)) {
          fs.mkdirSync(storagePath, { recursive: true });
        }
      } catch (dirError: unknown) {
        const errorObj = dirError as { code?: string };
        // Handle permission errors - fallback to temp directory
        if (errorObj.code === 'EACCES' || errorObj.code === 'EPERM') {
          this.logger.warn('Permission denied, using temp directory');
          this.storagePath = path.join(os.tmpdir(), 'clerkly-fallback');
          usedFallback = true;
          fallbackPath = this.storagePath;

          // Create fallback directory
          if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
          }
        } else {
          throw dirError;
        }
      }

      const dbPath = path.join(this.storagePath, 'clerkly.db');

      // Check for corrupted database
      if (fs.existsSync(dbPath)) {
        try {
          const testDb = new Database(dbPath);
          testDb.prepare('SELECT 1').get();
          testDb.close();
        } catch {
          this.logger.warn('Database corrupted, creating backup');
          const backupPath = path.join(this.storagePath, `clerkly.db.backup-${Date.now()}`);
          fs.copyFileSync(dbPath, backupPath);
          fs.unlinkSync(dbPath);
        }
      }

      // Open database
      this.db = new Database(dbPath);

      // Run migrations
      // In production (compiled): __dirname = dist/main/main/, so ../../../migrations = migrations/
      // In tests (ts-jest): __dirname = src/main/, so we need to use process.cwd()
      const isCompiledCode = __dirname.includes('dist');
      const migrationsPath = isCompiledCode
        ? path.join(__dirname, '..', '..', '..', 'migrations')
        : path.join(process.cwd(), 'migrations');
      this.migrationRunner = new MigrationRunner(this.db, migrationsPath);

      const migrationResult = this.migrationRunner.runMigrations();

      this.logger.info('Database initialized');

      const result: DatabaseInitializeResult = {
        success: true,
        migrations: {
          success: migrationResult.success,
          appliedCount: migrationResult.appliedCount || 0,
          message: migrationResult.message || migrationResult.error || '',
        },
      };

      if (usedFallback && fallbackPath) {
        result.warning = 'Using temporary directory';
        result.path = fallbackPath;
      }

      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize storage: ${errorMessage}`);
    }
  }

  /**
   * Set UserManager for getting current userId
   * Must be called after DatabaseManager initialization to enable user data isolation.
   * This avoids circular dependency between DatabaseManager and UserManager.
   *
   * Requirements: database-refactoring.1.1
   *
   * @param userManager - UserManager instance
   */
  setUserManager(userManager: UserManager): void {
    this.userManager = userManager;
    this.logger.info('UserManager set for data isolation');
  }

  /**
   * Get SQLite database instance
   * Returns null if database not initialized (legacy behavior for backward compatibility)
   *
   * IMPORTANT: Direct database access is RESTRICTED to:
   * - Migrations (MigrationRunner)
   * - Tests (unit tests, property tests)
   * - WindowStateManager (global data without user_id)
   *
   * For user-specific data operations, use:
   * - runUserQuery(), getUserRow(), getUserRows() - with automatic user_id injection
   * - runQuery(), getRow(), getRows() - for global data without user_id
   *
   * Requirements: database-refactoring.1.1, user-data-isolation.6.2, user-data-isolation.6.11
   *
   * @returns Database instance or null if not initialized
   */
  getDatabase(): Database.Database | null {
    return this.db;
  }

  /**
   * Get SQLite database instance (strict mode)
   * Throws error if database not initialized
   *
   * Requirements: database-refactoring.1.1, user-data-isolation.6.2
   *
   * @returns Database instance
   * @throws Error if database not initialized
   */
  getDatabaseStrict(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Get current user ID (automatic isolation)
   * Returns null if no user logged in (legacy behavior for backward compatibility)
   *
   * Requirements: database-refactoring.1.1, database-refactoring.1.2, user-data-isolation.6.3, user-data-isolation.6.4
   *
   * @returns Current user_id or null if not logged in
   */
  getCurrentUserId(): string | null {
    return this.userManager?.getCurrentUserId() ?? null;
  }

  /**
   * Get current user ID (strict mode)
   * Throws error if no user logged in
   *
   * Requirements: database-refactoring.1.1, database-refactoring.1.2, user-data-isolation.6.3, user-data-isolation.6.4
   *
   * @returns Current user_id
   * @throws Error if no user logged in
   */
  getCurrentUserIdStrict(): string {
    const userId = this.userManager?.getCurrentUserId();
    if (!userId) {
      throw new Error('No user logged in');
    }
    return userId;
  }

  /**
   * Close database connection
   *
   * Requirements: database-refactoring.1.1
   */
  close(): void {
    if (this.db && this.db.open) {
      this.db.close();
      this.db = null;
      this.logger.info('Database closed');
    }
  }

  // ============================================
  // Methods for queries with automatic user_id injection
  // Requirements: user-data-isolation.6.3, user-data-isolation.6.5, user-data-isolation.6.6
  // ============================================

  /**
   * Execute INSERT/UPDATE/DELETE with automatic user_id injection
   * user_id is prepended to params array as FIRST parameter
   *
   * Requirements: user-data-isolation.6.3, user-data-isolation.6.5, user-data-isolation.6.6
   *
   * @param sql - SQL query with placeholder for user_id as first parameter
   * @param params - Additional parameters (user_id will be prepended)
   * @returns Database.RunResult
   * @throws Error if no user logged in
   */
  runUserQuery(sql: string, params: unknown[] = []): Database.RunResult {
    const userId = this.getCurrentUserIdStrict();
    return this.getDatabaseStrict()
      .prepare(sql)
      .run(userId, ...params);
  }

  /**
   * Get single row with automatic user_id injection
   * user_id is prepended to params array as FIRST parameter
   *
   * Requirements: user-data-isolation.6.3, user-data-isolation.6.5, user-data-isolation.6.6
   *
   * @param sql - SQL query with placeholder for user_id as first parameter
   * @param params - Additional parameters (user_id will be prepended)
   * @returns Single row or undefined if not found
   * @throws Error if no user logged in
   */
  getUserRow<T>(sql: string, params: unknown[] = []): T | undefined {
    const userId = this.getCurrentUserIdStrict();
    return this.getDatabaseStrict()
      .prepare(sql)
      .get(userId, ...params) as T | undefined;
  }

  /**
   * Get all rows with automatic user_id injection
   * user_id is prepended to params array as FIRST parameter
   *
   * Requirements: user-data-isolation.6.3, user-data-isolation.6.5, user-data-isolation.6.6
   *
   * @param sql - SQL query with placeholder for user_id as first parameter
   * @param params - Additional parameters (user_id will be prepended)
   * @returns Array of rows (empty array if no matches)
   * @throws Error if no user logged in
   */
  getUserRows<T>(sql: string, params: unknown[] = []): T[] {
    const userId = this.getCurrentUserIdStrict();
    return this.getDatabaseStrict()
      .prepare(sql)
      .all(userId, ...params) as T[];
  }

  // ============================================
  // Methods for global queries (without user_id)
  // Requirements: user-data-isolation.6.4, user-data-isolation.6.10
  // ============================================

  /**
   * Execute INSERT/UPDATE/DELETE without user_id
   * For global data (WindowStateManager, migrations)
   *
   * Requirements: user-data-isolation.6.4, user-data-isolation.6.10
   *
   * @param sql - SQL query
   * @param params - Query parameters
   * @returns Database.RunResult
   */
  runQuery(sql: string, params: unknown[] = []): Database.RunResult {
    return this.getDatabaseStrict()
      .prepare(sql)
      .run(...params);
  }

  /**
   * Get single row without user_id
   * For global data (WindowStateManager, migrations)
   *
   * Requirements: user-data-isolation.6.4, user-data-isolation.6.10
   *
   * @param sql - SQL query
   * @param params - Query parameters
   * @returns Single row or undefined if not found
   */
  getRow<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.getDatabaseStrict()
      .prepare(sql)
      .get(...params) as T | undefined;
  }

  /**
   * Get all rows without user_id
   * For global data (WindowStateManager, migrations)
   *
   * Requirements: user-data-isolation.6.4, user-data-isolation.6.10
   *
   * @param sql - SQL query
   * @param params - Query parameters
   * @returns Array of rows (empty array if no matches)
   */
  getRows<T>(sql: string, params: unknown[] = []): T[] {
    return this.getDatabaseStrict()
      .prepare(sql)
      .all(...params) as T[];
  }

  /**
   * Returns path to storage directory
   *
   * @returns Storage path or null if not initialized
   */
  getStoragePath(): string | null {
    return this.storagePath;
  }

  /**
   * Returns Migration Runner instance
   *
   * @returns MigrationRunner instance
   * @throws Error if database not initialized
   */
  getMigrationRunner(): MigrationRunner {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    if (!this.migrationRunner) {
      const isCompiledCode = __dirname.includes('dist');
      const migrationsPath = isCompiledCode
        ? path.join(__dirname, '..', '..', '..', 'migrations')
        : path.join(process.cwd(), 'migrations');
      this.migrationRunner = new MigrationRunner(this.db, migrationsPath);
    }

    return this.migrationRunner;
  }
}
