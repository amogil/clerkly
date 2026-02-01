// Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3
import path from "path";
import { test, expect } from "@playwright/test";
import { cleanupUserDataDir, createUserDataDir, launchApp } from "./utils/app";
import { assertTableExists, runSqliteScript, getSchemaVersion, getRowCount } from "./utils/sqlite";

test.describe("Migration smoke", () => {
  /* Preconditions: outdated database schema with version 1.
     Action: launch app to trigger migrations.
     Assertions: latest tables exist after startup, schema version updated to 2.
     Requirements: testing-infrastructure.8.2 */
  test("migrates outdated schema from version 1 to version 2", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    // Create outdated schema at version 1
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

    // Launch app to trigger migration
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    // Verify migration completed: auth_tokens table should exist
    await assertTableExists(dbPath, "auth_tokens");

    // Verify schema version updated to 2
    const version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: brand new database with no schema.
     Action: launch app to trigger all migrations from scratch.
     Assertions: all tables exist, schema version is latest (2).
     Requirements: testing-infrastructure.8.2 */
  test("migrates from scratch to latest schema", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    // Launch app with no existing database
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    // Verify all tables exist
    await assertTableExists(dbPath, "schema_migrations");
    await assertTableExists(dbPath, "app_meta");
    await assertTableExists(dbPath, "auth_tokens");

    // Verify schema version is latest
    const version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: database already at latest schema version 2.
     Action: launch app with up-to-date database.
     Assertions: no migrations run, all tables still exist, version unchanged.
     Requirements: testing-infrastructure.8.2 */
  test("skips migration when schema is already up to date", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    // Create database at latest version
    await runSqliteScript({
      dbPath,
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL);
        INSERT INTO schema_migrations (version) VALUES (2);
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_tokens (
          id INTEGER PRIMARY KEY,
          encrypted TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `,
    });

    // Launch app
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    // Verify all tables still exist
    await assertTableExists(dbPath, "schema_migrations");
    await assertTableExists(dbPath, "app_meta");
    await assertTableExists(dbPath, "auth_tokens");

    // Verify version unchanged
    const version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: migrated database with version 2.
     Action: perform basic app operations (auth).
     Assertions: app functions correctly after migration.
     Requirements: testing-infrastructure.8.3 */
  test("basic functionality works after migration", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    // Create outdated schema at version 1
    await runSqliteScript({
      dbPath,
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL);
        INSERT INTO schema_migrations (version) VALUES (1);
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `,
    });

    // Launch app to trigger migration
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    // Smoke test: verify auth screen loads
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    // Smoke test: verify authentication works
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: database with existing data at version 1.
     Action: migrate to version 2.
     Assertions: existing data preserved, new tables added.
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  test("preserves existing data during migration", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    // Create database with existing data at version 1
    await runSqliteScript({
      dbPath,
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL);
        INSERT INTO schema_migrations (version) VALUES (1);
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        INSERT INTO app_meta (key, value) VALUES ('test_key', 'test_value');
        INSERT INTO app_meta (key, value) VALUES ('sidebar_collapsed', '1');
      `,
    });

    // Launch app to trigger migration
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    // Verify migration completed
    await assertTableExists(dbPath, "auth_tokens");
    const version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);

    // Verify existing data preserved (should still have 2 rows)
    const rowCount = await getRowCount(dbPath, "app_meta");
    expect(rowCount).toBe(2);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: database with empty app_meta table at version 1.
     Action: migrate to version 2.
     Assertions: migration succeeds with empty table, new tables added.
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  test("handles migration with empty tables", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    // Create database with empty table at version 1
    await runSqliteScript({
      dbPath,
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL);
        INSERT INTO schema_migrations (version) VALUES (1);
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `,
    });

    // Launch app to trigger migration
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    // Verify migration completed
    await assertTableExists(dbPath, "auth_tokens");
    const version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);

    // Verify empty table still exists
    const rowCount = await getRowCount(dbPath, "app_meta");
    expect(rowCount).toBe(0);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: database at version 0 (initial state).
     Action: migrate to latest version.
     Assertions: all migrations applied sequentially, final version is 2.
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  test("migrates from version 0 to latest", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    // Create database at version 0
    await runSqliteScript({
      dbPath,
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL);
        INSERT INTO schema_migrations (version) VALUES (0);
      `,
    });

    // Launch app to trigger all migrations
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    // Verify all tables exist
    await assertTableExists(dbPath, "schema_migrations");
    await assertTableExists(dbPath, "app_meta");
    await assertTableExists(dbPath, "auth_tokens");

    // Verify schema version is latest
    const version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: migrated database at version 2.
     Action: perform basic operations after migration (auth and dashboard load).
     Assertions: app loads correctly, authentication works, dashboard is accessible.
     Requirements: testing-infrastructure.8.3 */
  test("app loads correctly after migration", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    // Create database at version 1
    await runSqliteScript({
      dbPath,
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL);
        INSERT INTO schema_migrations (version) VALUES (1);
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `,
    });

    // Launch app and authenticate
    const { app, page } = await launchApp(userDataDir, { authMode: "success" });

    // Verify auth screen loads after migration
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();

    // Verify authentication works after migration
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });

    // Verify migration completed successfully
    const version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);

    await app.close();
    await cleanupUserDataDir(userDataDir);
  });

  /* Preconditions: migrated database at version 2.
     Action: perform multiple app restarts.
     Assertions: no additional migrations run, version stays at 2.
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  test("handles multiple restarts without re-running migrations", async () => {
    const userDataDir = await createUserDataDir();
    const dbPath = path.join(userDataDir, "clerkly.sqlite3");

    // Create database at version 1
    await runSqliteScript({
      dbPath,
      sql: `
        CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL);
        INSERT INTO schema_migrations (version) VALUES (1);
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `,
    });

    // First launch - triggers migration
    let result = await launchApp(userDataDir, { authMode: "success" });
    await expect(result.page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    let version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);
    await result.app.close();

    // Second launch - should not re-run migrations
    result = await launchApp(userDataDir, { authMode: "success" });
    await expect(result.page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);
    await result.app.close();

    // Third launch - should still be at version 2
    result = await launchApp(userDataDir, { authMode: "success" });
    await expect(result.page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    version = await getSchemaVersion(dbPath);
    expect(version).toBe(2);
    await result.app.close();

    await cleanupUserDataDir(userDataDir);
  });
});
