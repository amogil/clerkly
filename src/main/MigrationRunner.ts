// Requirements: clerkly.1

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';

// Requirements: clerkly.3.8 - Use centralized Logger instead of console.*
/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  appliedCount?: number;
  message?: string;
  error?: string;
}

/**
 * Migration status
 */
export interface MigrationStatus {
  currentVersion: number;
  appliedMigrations: number;
  pendingMigrations: number;
  totalMigrations: number;
  pending: Array<{ version: number; name: string }>;
}

/**
 * Migration file structure
 */
export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

/**
 * Manages database schema migrations
 */
export class MigrationRunner {
  // Requirements: clerkly.3.5, clerkly.3.7
  private logger = Logger.create('MigrationRunner');
  private db: Database.Database;
  private migrationsPath: string;

  constructor(db: Database.Database, migrationsPath: string) {
    this.db = db;
    this.migrationsPath = migrationsPath;
  }

  /**
   * Initializes migration tracking table
   * Creates schema_migrations table for tracking applied migrations
   * Requirements: clerkly.1   */
  initializeMigrationTable(): void {
    try {
      this.db
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `
        )
        .run();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize migration table: ${errorMessage}`);
    }
  }

  /**
   * Returns current schema version
   * Requirements: clerkly.1   * @returns {number} Current schema version (0 if no migrations applied)
   */
  getCurrentVersion(): number {
    try {
      this.initializeMigrationTable();

      const row = this.db
        .prepare('SELECT MAX(version) as version FROM schema_migrations')
        .get() as { version: number | null };

      return row.version ?? 0;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get current version: ${errorMessage}`);
    }
  }

  /**
   * Returns list of applied migration versions
   * Requirements: clerkly.1   * @returns {number[]} Array of applied migration versions
   */
  getAppliedMigrations(): number[] {
    try {
      this.initializeMigrationTable();

      const rows = this.db
        .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
        .all() as Array<{ version: number }>;

      return rows.map((row) => row.version);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get applied migrations: ${errorMessage}`);
    }
  }

  /**
   * Loads migration files from directory
   * Requirements: clerkly.1   * @returns {Migration[]} Array of migration objects sorted by version
   */
  loadMigrations(): Migration[] {
    try {
      // Check if migrations directory exists
      if (!fs.existsSync(this.migrationsPath)) {
        return [];
      }

      const files = fs.readdirSync(this.migrationsPath);
      const migrations: Migration[] = [];

      for (const file of files) {
        // Skip non-SQL files and .gitkeep
        if (!file.endsWith('.sql') || file === '.gitkeep') {
          continue;
        }

        // Parse filename: 001_initial_schema.sql
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (!match) {
          this.logger.warn(`Skipping invalid migration file: ${file}`);
          continue;
        }

        const version = parseInt(match[1], 10);
        const name = match[2];

        // Read file content
        const filePath = path.join(this.migrationsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Split into up and down migrations
        const parts = content.split('-- DOWN');
        const up = parts[0].replace('-- UP', '').trim();
        const down = parts[1] ? parts[1].trim() : '';

        // Validation: up migration is required
        if (!up) {
          throw new Error(`Migration ${file} has empty UP section`);
        }

        migrations.push({
          version,
          name,
          up,
          down,
        });
      }

      // Sort by version
      migrations.sort((a, b) => a.version - b.version);

      // Validation: check version uniqueness
      const versions = migrations.map((m) => m.version);
      const uniqueVersions = new Set(versions);
      if (versions.length !== uniqueVersions.size) {
        throw new Error('Duplicate migration versions found');
      }

      return migrations;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to load migrations: ${errorMessage}`);
    }
  }

  /**
   * Runs all pending migrations
   * Creates migrations table for tracking
   * Executes migrations in ascending version order
   * Requirements: clerkly.1   * @returns {MigrationResult}
   */
  runMigrations(): MigrationResult {
    try {
      // Initialize migrations table
      this.initializeMigrationTable();

      // Load all migrations
      const allMigrations = this.loadMigrations();

      if (allMigrations.length === 0) {
        return {
          success: true,
          appliedCount: 0,
          message: 'No migrations found',
        };
      }

      // Get applied migrations
      const appliedVersions = new Set(this.getAppliedMigrations());

      // Filter pending migrations
      const pendingMigrations = allMigrations.filter((m) => !appliedVersions.has(m.version));

      if (pendingMigrations.length === 0) {
        return {
          success: true,
          appliedCount: 0,
          message: 'All migrations already applied',
        };
      }

      // Apply each pending migration in a transaction
      let appliedCount = 0;

      for (const migration of pendingMigrations) {
        try {
          // Execute migration in transaction
          const applyMigration = this.db.transaction(() => {
            // Execute UP migration
            this.db.exec(migration.up);

            // Record in migrations table
            this.db
              .prepare(
                `
              INSERT INTO schema_migrations (version, name, applied_at)
              VALUES (?, ?, ?)
            `
              )
              .run(migration.version, migration.name, Date.now());
          });

          applyMigration();
          appliedCount++;

          Logger.info(
            'MigrationRunner',
            `Applied migration ${migration.version}_${migration.name}`
          );
        } catch (migrationError: unknown) {
          const errorMessage =
            migrationError instanceof Error ? migrationError.message : 'Unknown error';
          // Rollback on migration error
          return {
            success: false,
            appliedCount,
            error: `Failed to apply migration ${migration.version}_${migration.name}: ${errorMessage}`,
          };
        }
      }

      return {
        success: true,
        appliedCount,
        message: `Successfully applied ${appliedCount} migration(s)`,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        appliedCount: 0,
        error: `Migration execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Rolls back the last applied migration
   * Requirements: clerkly.1   * @returns {MigrationResult}
   */
  rollbackLastMigration(): MigrationResult {
    try {
      // Initialize migrations table
      this.initializeMigrationTable();

      // Get last applied migration
      const lastMigration = this.db
        .prepare(
          `
        SELECT version, name FROM schema_migrations
        ORDER BY version DESC
        LIMIT 1
      `
        )
        .get() as { version: number; name: string } | undefined;

      if (!lastMigration) {
        return {
          success: false,
          error: 'No migrations to rollback',
        };
      }

      // Load all migrations
      const allMigrations = this.loadMigrations();

      // Find migration to rollback
      const migration = allMigrations.find((m) => m.version === lastMigration.version);

      if (!migration) {
        return {
          success: false,
          error: `Migration file not found for version ${lastMigration.version}`,
        };
      }

      // Check for DOWN migration
      if (!migration.down) {
        return {
          success: false,
          error: `Migration ${migration.version}_${migration.name} has no DOWN section`,
        };
      }

      // Execute rollback in transaction
      try {
        const rollback = this.db.transaction(() => {
          // Execute DOWN migration
          this.db.exec(migration.down);

          // Remove record from migrations table
          this.db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(migration.version);
        });

        rollback();

        Logger.info(
          'MigrationRunner',
          `Rolled back migration ${migration.version}_${migration.name}`
        );

        return {
          success: true,
          appliedCount: 1,
          message: `Successfully rolled back migration ${migration.version}_${migration.name}`,
        };
      } catch (rollbackError: unknown) {
        const errorMessage =
          rollbackError instanceof Error ? rollbackError.message : 'Unknown error';
        return {
          success: false,
          error: `Failed to rollback migration ${migration.version}_${migration.name}: ${errorMessage}`,
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Rollback failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Returns migration status
   * Requirements: clerkly.1   * @returns {MigrationStatus}
   */
  getStatus(): MigrationStatus {
    try {
      // Initialize migrations table
      this.initializeMigrationTable();

      // Get current version
      const currentVersion = this.getCurrentVersion();

      // Load all migrations
      const allMigrations = this.loadMigrations();

      // Get applied migrations
      const appliedVersions = new Set(this.getAppliedMigrations());

      // Filter pending migrations
      const pendingMigrations = allMigrations
        .filter((m) => !appliedVersions.has(m.version))
        .map((m) => ({
          version: m.version,
          name: m.name,
        }));

      return {
        currentVersion,
        appliedMigrations: appliedVersions.size,
        pendingMigrations: pendingMigrations.length,
        totalMigrations: allMigrations.length,
        pending: pendingMigrations,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get migration status: ${errorMessage}`);
    }
  }
}
