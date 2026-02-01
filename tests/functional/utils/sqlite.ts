import { execFile } from "child_process";
import { promisify } from "util";
import electronPath from "electron";

const execFileAsync = promisify(execFile);

type SqliteScript = {
  dbPath: string;
  sql: string;
};

export const runSqliteScript = async ({ dbPath, sql }: SqliteScript): Promise<void> => {
  const script = `
    const Database = require("better-sqlite3");
    const db = new Database(process.argv[1]);
    db.exec(process.argv[2]);
    db.close();
  `;

  await execFileAsync(electronPath, ["-e", script, dbPath, sql], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  });
};

export const assertTableExists = async (dbPath: string, tableName: string): Promise<void> => {
  const script = `
    const Database = require("better-sqlite3");
    const db = new Database(process.argv[1]);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(process.argv[2]);
    db.close();
    if (!row || row.name !== process.argv[2]) {
      throw new Error("missing table: " + process.argv[2]);
    }
  `;

  await execFileAsync(electronPath, ["-e", script, dbPath, tableName], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  });
};

// Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3
export const getSchemaVersion = async (dbPath: string): Promise<number> => {
  const script = `
    const Database = require("better-sqlite3");
    const db = new Database(process.argv[1]);
    const row = db.prepare("SELECT version FROM schema_migrations LIMIT 1").get();
    db.close();
    if (row && typeof row.version === 'number') {
      process.stdout.write(String(row.version));
    } else {
      process.stdout.write('0');
    }
  `;

  const { stdout } = await execFileAsync(electronPath, ["-e", script, dbPath], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  });

  const version = parseInt(stdout.trim(), 10);
  return isNaN(version) ? 0 : version;
};

// Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3
export const getRowCount = async (dbPath: string, tableName: string): Promise<number> => {
  const script = `
    const Database = require("better-sqlite3");
    const db = new Database(process.argv[1]);
    const row = db.prepare("SELECT COUNT(*) as count FROM " + process.argv[2]).get();
    db.close();
    process.stdout.write(String(row.count));
  `;

  const { stdout } = await execFileAsync(electronPath, ["-e", script, dbPath, tableName], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  });

  return parseInt(stdout.trim(), 10);
};
