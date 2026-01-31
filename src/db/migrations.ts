// Requirements: data-storage.1.1, data-storage.2.1
import Database from "better-sqlite3";

export type SqliteDatabase = InstanceType<typeof Database>;

export type Migration = {
  id: number;
  name: string;
  up: (db: SqliteDatabase) => void;
};

export const migrations: Migration[] = [
  {
    id: 1,
    name: "initial-schema",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
  {
    id: 2,
    name: "auth-tokens",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_tokens (
          id INTEGER PRIMARY KEY,
          encrypted TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
];
