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
