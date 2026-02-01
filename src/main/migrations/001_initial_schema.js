// Requirements: clerkly.1.4

/**
 * Initial database schema migration
 * Creates user_data table and timestamp index
 * 
 * Requirements: clerkly.1.4
 */
module.exports = {
  version: 1,
  name: 'initial_schema',
  description: 'Create user_data table with timestamp index',

  /**
   * Apply migration - create tables and indexes
   * @param {Database} db - SQLite database instance
   * 
   * Requirements: clerkly.1.4
   */
  up(db) {
    // Create user_data table
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_data (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create index on timestamp for efficient queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON user_data(timestamp)
    `);
  },

  /**
   * Rollback migration - drop tables and indexes
   * @param {Database} db - SQLite database instance
   * 
   * Requirements: clerkly.1.4
   */
  down(db) {
    // Drop index first
    db.exec('DROP INDEX IF EXISTS idx_timestamp');
    
    // Drop table
    db.exec('DROP TABLE IF EXISTS user_data');
  }
};
