# Database Migrations

This directory contains database schema migrations for Clerkly.

## Overview

The migration system provides:
- **Schema versioning**: Track which migrations have been applied
- **Migration tracking**: `schema_migrations` table records applied migrations
- **Rollback support**: Ability to revert migrations
- **Transaction safety**: Each migration runs in a transaction

## Migration File Structure

Each migration file must export an object with the following structure:

```javascript
module.exports = {
  version: 1,                    // Unique version number (integer)
  name: 'migration_name',        // Descriptive name
  description: 'What this migration does',
  
  up(db) {
    // Apply migration - create tables, indexes, etc.
    db.exec('CREATE TABLE ...');
  },
  
  down(db) {
    // Rollback migration - drop tables, indexes, etc.
    db.exec('DROP TABLE ...');
  }
};
```

## Naming Convention

Migration files should be named: `{version}_{description}.js`

Examples:
- `001_initial_schema.js`
- `002_add_user_preferences.js`
- `003_add_sync_table.js`

## Using Migrations

### Automatic Migration on Startup

Migrations run automatically when DataManager initializes:

```javascript
const dataManager = new DataManager('/path/to/storage');
const result = dataManager.initialize();
// Migrations are applied automatically
```

### Manual Migration Control

Get the migration runner for manual control:

```javascript
const migrationRunner = dataManager.getMigrationRunner();

// Check migration status
const status = migrationRunner.getStatus();
console.log(`Current version: ${status.currentVersion}`);
console.log(`Pending migrations: ${status.pendingMigrations}`);

// Run pending migrations
const result = migrationRunner.runMigrations();
console.log(`Applied ${result.appliedCount} migrations`);

// Rollback last migration
const rollbackResult = migrationRunner.rollbackLastMigration();
```

## Creating a New Migration

1. Create a new file in this directory with the next version number
2. Implement both `up()` and `down()` functions
3. Test the migration thoroughly
4. The migration will be applied automatically on next app startup

Example:

```javascript
// 002_add_settings_table.js
module.exports = {
  version: 2,
  name: 'add_settings_table',
  description: 'Add settings table for user preferences',
  
  up(db) {
    db.exec(`
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    
    db.exec(`
      CREATE INDEX idx_settings_updated ON settings(updated_at)
    `);
  },
  
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_settings_updated');
    db.exec('DROP TABLE IF EXISTS settings');
  }
};
```

## Migration Tracking

The `schema_migrations` table tracks applied migrations:

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
```

## Best Practices

1. **Never modify existing migrations** - Create new migrations instead
2. **Always provide rollback** - Implement the `down()` function
3. **Test migrations** - Test both up and down migrations
4. **Use transactions** - Migrations run in transactions automatically
5. **Keep migrations small** - One logical change per migration
6. **Version sequentially** - Use sequential version numbers

## Requirements

This migration system implements requirement **clerkly.1.4** for local data storage with schema versioning.
