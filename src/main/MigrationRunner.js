// Requirements: clerkly.1.4
const fs = require('fs');
const path = require('path');

/**
 * MigrationRunner class
 * Manages database schema migrations with versioning
 * 
 * Requirements: clerkly.1.4
 */
class MigrationRunner {
  /**
   * Constructor
   * @param {Database} db - SQLite database instance
   * @param {string} migrationsPath - Path to migrations directory
   * 
   * Requirements: clerkly.1.4
   */
  constructor(db, migrationsPath) {
    if (!db) {
      throw new Error('Database instance is required');
    }
    if (!migrationsPath || typeof migrationsPath !== 'string') {
      throw new Error('Invalid migrationsPath: must be non-empty string');
    }
    this.db = db;
    this.migrationsPath = migrationsPath;
  }

  /**
   * Initialize migration tracking table
   * Creates schema_migrations table to track applied migrations
   * 
   * Requirements: clerkly.1.4
   */
  initializeMigrationTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * Get current schema version
   * @returns {number} Current schema version (0 if no migrations applied)
   * 
   * Requirements: clerkly.1.4
   */
  getCurrentVersion() {
    try {
      const result = this.db.prepare(
        'SELECT MAX(version) as version FROM schema_migrations'
      ).get();
      return result.version || 0;
    } catch (error) {
      // Table might not exist yet
      return 0;
    }
  }

  /**
   * Get list of applied migration versions
   * @returns {number[]} Array of applied migration versions
   * 
   * Requirements: clerkly.1.4
   */
  getAppliedMigrations() {
    try {
      const results = this.db.prepare(
        'SELECT version FROM schema_migrations ORDER BY version'
      ).all();
      return results.map(row => row.version);
    } catch (error) {
      // Table might not exist yet
      return [];
    }
  }

  /**
   * Load migration files from migrations directory
   * @returns {Array} Array of migration objects sorted by version
   * 
   * Requirements: clerkly.1.4
   */
  loadMigrations() {
    if (!fs.existsSync(this.migrationsPath)) {
      throw new Error(`Migrations directory not found: ${this.migrationsPath}`);
    }

    const files = fs.readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.js'))
      .sort();

    const migrations = files.map(file => {
      const filePath = path.join(this.migrationsPath, file);
      const migration = require(filePath);
      
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

  /**
   * Run pending migrations
   * Applies all migrations that haven't been applied yet
   * @returns {Object} Result with success status and applied migrations count
   * 
   * Requirements: clerkly.1.4
   */
  runMigrations() {
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
    } catch (error) {
      console.error('Migration failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Rollback last migration
   * Reverts the most recently applied migration
   * @returns {Object} Result with success status
   * 
   * Requirements: clerkly.1.4
   */
  rollbackLastMigration() {
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
    } catch (error) {
      console.error('Rollback failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get migration status
   * Returns information about current schema version and pending migrations
   * @returns {Object} Status object with version info and pending migrations
   * 
   * Requirements: clerkly.1.4
   */
  getStatus() {
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
    } catch (error) {
      return {
        error: error.message
      };
    }
  }
}

module.exports = MigrationRunner;
