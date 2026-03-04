// Requirements: database-refactoring.1, user-data-isolation.6, user-data-isolation.7

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';
import { MigrationRunner } from './MigrationRunner';
import type { UserManager } from './auth/UserManager';
import { Logger } from './Logger';
import { SettingsRepository } from './db/repositories/SettingsRepository';
import { AgentsRepository } from './db/repositories/AgentsRepository';
import { MessagesRepository } from './db/repositories/MessagesRepository';
import { UsersRepository } from './db/repositories/UsersRepository';
import { GlobalRepository } from './db/repositories/GlobalRepository';
import { NO_USER_LOGGED_IN_ERROR } from '../shared/errors/userErrors';

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
 * Requirements: user-data-isolation.6.1, user-data-isolation.6.2
 */
export interface IDatabaseManager {
  setUserManager(userManager: UserManager): void;
  getDatabase(): Database.Database | null;
  getCurrentUserId(): string | null;
  getCurrentUserIdStrict(): string;

  // Repository accessors (Drizzle-based API)
  // Requirements: user-data-isolation.6.2
  readonly settings: SettingsRepository;
  readonly agents: AgentsRepository;
  readonly messages: MessagesRepository;
  readonly users: UsersRepository;
  readonly global: GlobalRepository;
}

/**
 * DatabaseManager - single entry point for database access
 *
 * Responsibilities:
 * - Database initialization and migrations
 * - SQLite database instance access
 * - Current user_id retrieval through UserManager
 * - Typed repositories for data operations
 *
 * Supports two modes:
 * 1. Legacy mode: constructor(db) - for backward compatibility
 * 2. New mode: constructor() + initialize(storagePath) - for full DB management
 *
 * Requirements: database-refactoring.1, user-data-isolation.6, user-data-isolation.7
 */
export class DatabaseManager implements IDatabaseManager {
  private db: Database.Database | null = null;
  private userManager: UserManager | null = null;
  private storagePath: string | null = null;
  private migrationRunner: MigrationRunner | null = null;
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('DatabaseManager');

  // Drizzle ORM instance (private - not accessible outside)
  // Requirements: user-data-isolation.7.5
  private drizzleDb: BetterSQLite3Database<typeof schema> | null = null;

  // Repository instances (private backing fields)
  // Requirements: user-data-isolation.6.2
  private _settings: SettingsRepository | null = null;
  private _agents: AgentsRepository | null = null;
  private _messages: MessagesRepository | null = null;
  private _users: UsersRepository | null = null;
  private _global: GlobalRepository | null = null;

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
      // Initialize Drizzle for legacy mode
      this.initializeDrizzle();
    }
  }

  /**
   * Requires userId - throws error if not logged in
   * Used by repositories to ensure user isolation
   * Requirements: user-data-isolation.6.4
   */
  private requireUserId = (): string => {
    const userId = this.userManager?.getCurrentUserId();
    if (!userId) {
      throw new Error(NO_USER_LOGGED_IN_ERROR);
    }
    return userId;
  };

  /**
   * Initialize Drizzle ORM and repositories
   * Requirements: user-data-isolation.7.1
   */
  private initializeDrizzle(): void {
    if (!this.db) return;

    this.drizzleDb = drizzle(this.db, { schema });

    // Initialize repositories
    this._users = new UsersRepository(this.drizzleDb);
    this._global = new GlobalRepository(this.drizzleDb);
    this._settings = new SettingsRepository(this.drizzleDb, this.requireUserId);
    this._agents = new AgentsRepository(this.drizzleDb, this.requireUserId);
    this._messages = new MessagesRepository(this.drizzleDb, this.requireUserId, this._agents);

    this.logger.info('Drizzle ORM and repositories initialized');
  }

  // ========== PUBLIC REPOSITORY ACCESSORS ==========
  // Requirements: user-data-isolation.6.2

  /**
   * Settings repository for user key-value storage
   */
  get settings(): SettingsRepository {
    if (!this._settings) throw new Error('Database not initialized');
    return this._settings;
  }

  /**
   * Agents repository for managing user agents
   */
  get agents(): AgentsRepository {
    if (!this._agents) throw new Error('Database not initialized');
    return this._agents;
  }

  /**
   * Messages repository for managing agent messages
   */
  get messages(): MessagesRepository {
    if (!this._messages) throw new Error('Database not initialized');
    return this._messages;
  }

  /**
   * Users repository for user management (no userId required)
   */
  get users(): UsersRepository {
    if (!this._users) throw new Error('Database not initialized');
    return this._users;
  }

  /**
   * Global repository for system-wide data (no userId required)
   */
  get global(): GlobalRepository {
    if (!this._global) throw new Error('Database not initialized');
    return this._global;
  }

  /**
   * Set the database instance (legacy mode)
   * @param db Database instance
   */
  setDatabase(db: Database.Database | null): void {
    this.db = db;
    if (db) {
      this.initializeDrizzle();
    }
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

      // Initialize Drizzle ORM and repositories
      // Requirements: user-data-isolation.7.1
      this.initializeDrizzle();

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
   * Returns null if database not initialized
   *
   * Note: Direct database access should be limited to:
   * - Migrations (MigrationRunner)
   * - Tests (unit tests)
   *
   * For data operations, prefer using repositories:
   * - dbManager.settings - for user settings
   * - dbManager.agents - for agents
   * - dbManager.messages - for messages
   * - dbManager.users - for user management
   * - dbManager.global - for global data
   *
   * Requirements: database-refactoring.1.1, user-data-isolation.6.9
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
      throw new Error(NO_USER_LOGGED_IN_ERROR);
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
