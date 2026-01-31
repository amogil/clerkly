// Requirements: data-storage.1.1, data-storage.1.2, data-storage.3.1, data-storage.2.5, data-storage.1.3, data-storage.2.1
import { app } from "electron";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import { migrations, type Migration, type SqliteDatabase } from "./migrations";
import { logDebug, logInfo, logWarn, logError } from "../logging/logger";

const DB_FILENAME = "clerkly.sqlite3";
const BACKUP_DIRNAME = "backups";

const getDatabasePath = (): string => {
  const userDataPath = app.getPath("userData");
  const rootDir = userDataPath;

  logDebug(rootDir, "Getting database path", { userDataPath });

  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    logDebug(rootDir, "User data directory ensured", { path: userDataPath });
  } catch (error) {
    logError(rootDir, "Failed to create user data directory", error);
    throw error;
  }

  const dbPath = path.join(userDataPath, DB_FILENAME);
  logDebug(rootDir, "Database path resolved", { dbPath });

  return dbPath;
};

const ensureMigrationsTable = (db: SqliteDatabase): void => {
  const rootDir = app.getPath("userData");

  logDebug(rootDir, "Ensuring migrations table exists");

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER NOT NULL
      );
    `);
    logDebug(rootDir, "Migrations table created or verified");
  } catch (error) {
    logError(rootDir, "Failed to create migrations table", error);
    throw error;
  }

  try {
    const row = db.prepare("SELECT version FROM schema_migrations LIMIT 1").get() as
      | { version: number }
      | undefined;

    if (!row) {
      logInfo(rootDir, "Initializing schema migrations table with version 0");
      db.prepare("INSERT INTO schema_migrations (version) VALUES (0)").run();
      logDebug(rootDir, "Schema migrations table initialized successfully");
    } else {
      logDebug(rootDir, "Schema migrations table already initialized", {
        currentVersion: row.version,
      });
    }
  } catch (error) {
    logError(rootDir, "Failed to initialize schema migrations table", error);
    throw error;
  }
};

const getCurrentVersion = (db: SqliteDatabase): number => {
  const rootDir = app.getPath("userData");

  try {
    const row = db.prepare("SELECT version FROM schema_migrations LIMIT 1").get() as
      | { version: number }
      | undefined;

    const version = row?.version ?? 0;
    logDebug(rootDir, "Retrieved current schema version", { version });
    return version;
  } catch (error) {
    logError(rootDir, "Failed to get current schema version", error);
    throw error;
  }
};

const setCurrentVersion = (db: SqliteDatabase, version: number): void => {
  const rootDir = app.getPath("userData");

  try {
    db.prepare("UPDATE schema_migrations SET version = ?").run(version);
    logDebug(rootDir, "Schema version updated", { version });
  } catch (error) {
    logError(rootDir, "Failed to update schema version", { version, error });
    throw error;
  }
};

const getSortedMigrations = (): Migration[] => {
  const rootDir = app.getPath("userData");

  logDebug(rootDir, "Sorting and validating migrations", { totalMigrations: migrations.length });

  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  const seen = new Set<number>();

  for (const migration of sorted) {
    if (migration.id <= 0) {
      logError(rootDir, "Invalid migration ID detected", {
        migrationId: migration.id,
        migrationName: migration.name,
      });
      throw new Error("Migration ids must be positive integers.");
    }
    if (seen.has(migration.id)) {
      logError(rootDir, "Duplicate migration ID detected", { migrationId: migration.id });
      throw new Error(`Duplicate migration id detected: ${migration.id}`);
    }
    seen.add(migration.id);
  }

  logDebug(rootDir, "Migrations sorted and validated successfully", {
    migrationIds: sorted.map((m) => m.id),
    migrationNames: sorted.map((m) => m.name),
  });

  return sorted;
};

const getPendingMigrations = (currentVersion: number): Migration[] => {
  const rootDir = app.getPath("userData");

  const allMigrations = getSortedMigrations();
  const pending = allMigrations.filter((migration) => migration.id > currentVersion);

  logInfo(rootDir, "Identified pending migrations", {
    currentVersion,
    totalMigrations: allMigrations.length,
    pendingCount: pending.length,
    pendingMigrations: pending.map((m) => ({ id: m.id, name: m.name })),
  });

  return pending;
};

const createBackup = (dbPath: string): string => {
  const rootDir = app.getPath("userData");

  logInfo(rootDir, "Creating database backup before migration", { dbPath });

  try {
    const backupRoot = path.join(path.dirname(dbPath), BACKUP_DIRNAME);
    fs.mkdirSync(backupRoot, { recursive: true });
    logDebug(rootDir, "Backup directory ensured", { backupRoot });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupRoot, `clerkly-${timestamp}.sqlite3`);

    const startTime = Date.now();
    fs.copyFileSync(dbPath, backupPath);
    const duration = Date.now() - startTime;

    const stats = fs.statSync(backupPath);
    logInfo(rootDir, "Database backup created successfully", {
      backupPath,
      sizeBytes: stats.size,
      durationMs: duration,
    });

    return backupPath;
  } catch (error) {
    logError(rootDir, "Failed to create database backup", error);
    throw error;
  }
};

const openDatabase = (dbPath: string): SqliteDatabase => {
  const rootDir = app.getPath("userData");

  logDebug(rootDir, "Opening database connection", { dbPath });

  try {
    const db = new Database(dbPath);
    logInfo(rootDir, "Database connection established successfully", {
      dbPath,
      inMemory: db.memory,
      readonly: db.readonly,
    });
    return db;
  } catch (error) {
    logError(rootDir, "Failed to open database connection", { dbPath, error });
    throw error;
  }
};

const applyMigrations = (
  db: SqliteDatabase,
  currentVersion: number,
  pending: Migration[],
): void => {
  const rootDir = app.getPath("userData");

  if (pending.length === 0) {
    logInfo(rootDir, "No migrations to apply");
    return;
  }

  logInfo(rootDir, "Starting migration transaction", {
    currentVersion,
    migrationsToApply: pending.length,
    targetVersion: pending[pending.length - 1].id,
  });

  const startTime = Date.now();

  try {
    const runMigrations = db.transaction(() => {
      for (const migration of pending) {
        logInfo(rootDir, "Applying migration", {
          id: migration.id,
          name: migration.name,
        });

        const migrationStartTime = Date.now();

        try {
          migration.up(db);
          const migrationDuration = Date.now() - migrationStartTime;

          setCurrentVersion(db, migration.id);

          logInfo(rootDir, "Migration applied successfully", {
            id: migration.id,
            name: migration.name,
            durationMs: migrationDuration,
          });
        } catch (error) {
          logError(rootDir, "Migration failed", {
            id: migration.id,
            name: migration.name,
            error,
          });
          throw error;
        }
      }
    });

    runMigrations();

    const totalDuration = Date.now() - startTime;
    const finalVersion = pending[pending.length - 1].id;

    logInfo(rootDir, "All migrations completed successfully", {
      fromVersion: currentVersion,
      toVersion: finalVersion,
      migrationsApplied: pending.length,
      totalDurationMs: totalDuration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(rootDir, "Migration transaction failed", {
      currentVersion,
      pendingMigrations: pending.map((m) => ({ id: m.id, name: m.name })),
      durationMs: duration,
      error,
    });
    throw error;
  }
};

export const ensureDatabase = (): void => {
  const rootDir = app.getPath("userData");

  logInfo(rootDir, "Starting database initialization process");

  const dbPath = getDatabasePath();
  const dbExisted = fs.existsSync(dbPath);

  logInfo(rootDir, "Database file status checked", {
    dbPath,
    existed: dbExisted,
    filename: DB_FILENAME,
  });

  let db = openDatabase(dbPath);

  try {
    logDebug(rootDir, "Configuring database settings");

    // Configure WAL mode for better concurrency
    try {
      db.pragma("journal_mode = WAL");
      logDebug(rootDir, "WAL journal mode enabled");
    } catch (error) {
      logWarn(rootDir, "Failed to enable WAL mode, continuing with default", error);
    }

    // Ensure migrations table exists
    ensureMigrationsTable(db);

    const currentVersion = getCurrentVersion(db);
    const pending = getPendingMigrations(currentVersion);

    if (pending.length === 0) {
      logInfo(rootDir, "Database is up to date", { currentVersion });
      return;
    }

    logInfo(rootDir, "Database migrations required", {
      currentVersion,
      targetVersion: pending[pending.length - 1].id,
      migrationsCount: pending.length,
    });

    // Close database before backup and migration
    logDebug(rootDir, "Closing database connection for migration process");
    db.close();

    // Create backup if database existed
    if (dbExisted) {
      const backupPath = createBackup(dbPath);
      logInfo(rootDir, "Database backup completed", { backupPath });
    } else {
      logInfo(rootDir, "Skipping backup for new database");
    }

    // Reopen database for migrations
    logDebug(rootDir, "Reopening database for migrations");
    db = openDatabase(dbPath);

    // Reconfigure after reopening
    try {
      db.pragma("journal_mode = WAL");
      logDebug(rootDir, "WAL journal mode re-enabled after reopen");
    } catch (error) {
      logWarn(rootDir, "Failed to re-enable WAL mode after reopen", error);
    }

    ensureMigrationsTable(db);

    // Apply all pending migrations
    applyMigrations(db, currentVersion, pending);

    logInfo(rootDir, "Database initialization completed successfully", {
      finalVersion: pending[pending.length - 1].id,
      migrationsApplied: pending.length,
      dbPath,
    });
  } catch (error) {
    logError(rootDir, "Database initialization failed", {
      dbPath,
      dbExisted,
      error,
    });
    throw error;
  } finally {
    try {
      if (db && !db.open) {
        logDebug(rootDir, "Database connection was already closed");
      } else if (db) {
        db.close();
        logDebug(rootDir, "Database connection closed successfully");
      }
    } catch (closeError) {
      logWarn(rootDir, "Error closing database connection", closeError);
    }
  }
};
