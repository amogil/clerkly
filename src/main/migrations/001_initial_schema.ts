// Requirements: clerkly.1.4
import Database from 'better-sqlite3';

interface Migration {
  version: number;
  name: string;
  description: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

const migration: Migration = {
  version: 1,
  name: '001_initial_schema',
  description: 'Create initial database schema with user_data table',

  // Requirements: clerkly.1.4
  up: (db: Database.Database): void => {
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

    // Create index on timestamp for faster queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON user_data(timestamp)
    `);
  },

  // Requirements: clerkly.1.4
  down: (db: Database.Database): void => {
    // Drop index
    db.exec(`DROP INDEX IF EXISTS idx_timestamp`);

    // Drop table
    db.exec(`DROP TABLE IF EXISTS user_data`);
  }
};

export = migration;
