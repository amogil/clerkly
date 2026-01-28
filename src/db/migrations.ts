// Requirements: E.G.13
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
];
