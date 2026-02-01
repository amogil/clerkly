// Requirements: clerkly.1.4
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

interface MigrationResult {
  success: boolean;
  appliedCount?: number;
  message?: string;
  error?: string;
}

interface MigrationStatus {
  currentVersion: number;
  appliedMigrations: number;
  pendingMigrations: number;
  totalMigrations: number;
  pending: Array<{version: number; name: string; description?: string}>;
  error?: string;
}

interface Migration {
  version: number;
  name: string;
  description?: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

class MigrationRunner {
  private db: Database.Database;
  private migrationsPath: string;

  // Requirements: clerkly.1.4
  constructor(db: Database.Database, migrationsPath: string) {
    if (!db) {
      throw new Error('Database instance is required');
    }
    if (!migrationsPath || typeof migrationsPath !== 'string') {
      throw new Error('Invalid migrationsPath: must be non-empty string');
    }
    this.db = db;
    this.migrationsPath = migrationsPath;
  }

  // Requirements: clerkly.1.4
  initializeMigrationTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `);
  }

  // Requirements: clerkly.1.4
  getCurrentVersion(): number {
    try {
      const result = this.db.prepare(
        'SELECT MAX(version) as version FROM schema_migrations'
      ).get() as { version: number | null };
      return result.version || 0;
    } catch (error) {
      // Table might not exist yet
      return 0;
    }
  }

  // Requirements: clerkly.1.4
  getAppliedMigrations(): number[] {
    try {
      const results = this.db.prepare(
        'SELECT version FROM schema_migrations ORDER BY version'
      ).all() as Array<{ version: number }>;
      return results.map(row => row.version);
    } catch (error) {
      // Table might not exist yet
      return [];
    }
  }

  // Requirements: clerkly.1.4
  loadMigrations(): Migration[] {
    if (!fs.existsSync(this.migrationsPath)) {
      throw new Error(`Migrations directory not found: ${this.migrationsPath}`);
    }

    const files = fs.readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'))
      .sort();

    const migrations = files.map(file => {
      const filePath = path.join(this.migrationsPath, file);
      const migration = require(filePath) as Migration;
      
      // Validate migration structure
      if (!migration.version || typeof migration.version !== 'number') {
        throw new Error(`Invalid migration ${file}: missing or invalid version`);
      }
      if (!migration.name || typeof migration.name !== 'string') {
        throw new Error(`Invalid migration ${file}: missing or invalid name`);
      }
      if (typeof migration.up !== 'function') {
        throw new Error(`Invalid migration ${file}: missing up() function`);
      }
      if (typeof migration.down !== 'function') {
        throw new Error(`Invalid migration ${file}: missing down() function`);
      }

      return migration;
    });

    // Sort by version
    migrations.sort((a, b) => a.version - b.version);

    return migrations;
  }

  // Requirements: clerkly.1.4
  runMigrations(): MigrationResult {
    try {
      // Initialize migration tracking table
      this.initializeMigrationTable();

      // Get current version and applied migrations
      const appliedVersions = this.getAppliedMigrations();
      
      // Load all available migrations
      const migrations = this.loadMigrations();

      // Filter pending migrations
      const pendingMigrations = migrations.filter(
        migration => !appliedVersions.includes(migration.version)
      );

      if (pendingMigrations.length === 0) {
        return { 
          success: true, 
          appliedCount: 0,
          message: 'No pending migrations'
        };
      }

      // Apply each pending migration in a transaction
      let appliedCount = 0;
      for (const migration of pendingMigrations) {
        const transaction = this.db.transaction(() => {
          // Run migration
          migration.up(this.db);

          // Record migration in tracking table
          this.db.prepare(`
            INSERT INTO schema_migrations (version, name, applied_at)
            VALUES (?, ?, ?)
          `).run(migration.version, migration.name, Date.now());

          appliedCount++;
        });

        transaction();
      }

      return {
        success: true,
        appliedCount,
        message: `Applied ${appliedCount} migration(s)`
      };
    } catch (error: any) {
      console.error('Migration failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Requirements: clerkly.1.4
  rollbackLastMigration(): MigrationResult {
    try {
      const currentVersion = this.getCurrentVersion();
      
      if (currentVersion === 0) {
        return {
          success: false,
          error: 'No migrations to rollback'
        };
      }

      // Load all migrations
      const migrations = this.loadMigrations();
      
      // Find migration to rollback
      const migration = migrations.find(m => m.version === currentVersion);
      
      if (!migration) {
        return {
          success: false,
          error: `Migration file not found for version ${currentVersion}`
        };
      }

      // Rollback in a transaction
      const transaction = this.db.transaction(() => {
        // Run down migration
        migration.down(this.db);

        // Remove from tracking table
        this.db.prepare(
          'DELETE FROM schema_migrations WHERE version = ?'
        ).run(currentVersion);
      });

      transaction();

      return {
        success: true,
        message: `Rolled back migration ${migration.name} (version ${currentVersion})`
      };
    } catch (error: any) {
      console.error('Rollback failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Requirements: clerkly.1.4
  getStatus(): MigrationStatus {
    try {
      const currentVersion = this.getCurrentVersion();
      const appliedVersions = this.getAppliedMigrations();
      const migrations = this.loadMigrations();
      
      const pendingMigrations = migrations.filter(
        migration => !appliedVersions.includes(migration.version)
      );

      return {
        currentVersion,
        appliedMigrations: appliedVersions.length,
        pendingMigrations: pendingMigrations.length,
        totalMigrations: migrations.length,
        pending: pendingMigrations.map(m => ({
          version: m.version,
          name: m.name,
          description: m.description
        }))
      };
    } catch (error: any) {
      return {
        currentVersion: 0,
        appliedMigrations: 0,
        pendingMigrations: 0,
        totalMigrations: 0,
        pending: [],
        error: error.message
      };
    }
  }
}

export default MigrationRunner;
