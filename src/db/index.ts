// Requirements: E.S.1, E.S.3, E.S.4, E.S.5, E.S.6
import { app } from "electron";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import { migrations, type Migration, type SqliteDatabase } from "./migrations";

const DB_FILENAME = "clerkly.sqlite3";
const BACKUP_DIRNAME = "backups";

const getDatabasePath = (): string => {
  const userDataPath = app.getPath("userData");
  fs.mkdirSync(userDataPath, { recursive: true });
  return path.join(userDataPath, DB_FILENAME);
};

const ensureMigrationsTable = (db: SqliteDatabase): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER NOT NULL
    );
  `);

  const row = db
    .prepare("SELECT version FROM schema_migrations LIMIT 1")
    .get() as { version: number } | undefined;

  if (!row) {
    db.prepare("INSERT INTO schema_migrations (version) VALUES (0)").run();
  }
};

const getCurrentVersion = (db: SqliteDatabase): number => {
  const row = db
    .prepare("SELECT version FROM schema_migrations LIMIT 1")
    .get() as { version: number } | undefined;

  return row?.version ?? 0;
};

const setCurrentVersion = (db: SqliteDatabase, version: number): void => {
  db.prepare("UPDATE schema_migrations SET version = ?").run(version);
};

const getSortedMigrations = (): Migration[] => {
  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  const seen = new Set<number>();

  for (const migration of sorted) {
    if (migration.id <= 0) {
      throw new Error("Migration ids must be positive integers.");
    }
    if (seen.has(migration.id)) {
      throw new Error(`Duplicate migration id detected: ${migration.id}`);
    }
    seen.add(migration.id);
  }

  return sorted;
};

const getPendingMigrations = (currentVersion: number): Migration[] => {
  return getSortedMigrations().filter((migration) => migration.id > currentVersion);
};

const createBackup = (dbPath: string): string => {
  const backupRoot = path.join(path.dirname(dbPath), BACKUP_DIRNAME);
  fs.mkdirSync(backupRoot, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupRoot, `clerkly-${timestamp}.sqlite3`);
  fs.copyFileSync(dbPath, backupPath);

  return backupPath;
};

const openDatabase = (dbPath: string): SqliteDatabase => {
  return new Database(dbPath);
};

const applyMigrations = (
  db: SqliteDatabase,
  currentVersion: number,
  pending: Migration[]
): void => {
  const runMigrations = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      setCurrentVersion(db, migration.id);
    }
  });

  runMigrations();
};

export const ensureDatabase = (): void => {
  const dbPath = getDatabasePath();
  const dbExisted = fs.existsSync(dbPath);

  let db = openDatabase(dbPath);

  try {
    db.pragma("journal_mode = WAL");
    ensureMigrationsTable(db);

    const currentVersion = getCurrentVersion(db);
    const pending = getPendingMigrations(currentVersion);

    if (pending.length === 0) {
      return;
    }

    db.close();

    if (dbExisted) {
      createBackup(dbPath);
    }

    db = openDatabase(dbPath);
    db.pragma("journal_mode = WAL");
    ensureMigrationsTable(db);

    applyMigrations(db, currentVersion, pending);
  } finally {
    db.close();
  }
};
