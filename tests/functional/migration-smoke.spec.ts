import path from "path";
import { test, expect } from "@playwright/test";
import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";
import { assertTableExists, runSqliteScript } from "./utils/sqlite";

test.describe("Migration smoke", () => {
  /* Preconditions: outdated database schema.
     Action: launch app to trigger migrations.
     Assertions: latest tables exist after startup.
     Requirements: testing-infrastructure.1.19 */
  test("migrates outdated schema on startup", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    await runSqliteScript({
      dbPath,
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL);
        DELETE FROM schema_migrations;
        INSERT INTO schema_migrations (version) VALUES (1);
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `,
    });

    const { app, page } = await launchApp(userDataDir, { authMode: "success" });
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    await assertTableExists(dbPath, "auth_tokens");

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });
});
