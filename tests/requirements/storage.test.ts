import { describe, expect, it } from "vitest";

import { readText } from "../utils/fs";

describe("Storage and Migrations requirements", () => {
  /* Preconditions: db module exists.
     Action: inspect db filename.
     Assertions: SQLite filename is clerkly.sqlite3.
     Requirements: data-storage.1.1 */
  it("stores data in a local SQLite database", () => {
    const source = readText("src/db/index.ts");
    expect(source).toMatch(/clerkly\.sqlite3/);
  });

  /* Preconditions: db module exists.
     Action: inspect database path logic.
     Assertions: userData path is used.
     Requirements: data-storage.1.2 */
  it("stores SQLite under userData", () => {
    const source = readText("src/db/index.ts");
    expect(source).toContain('app.getPath("userData")');
  });

  /* Preconditions: db module exists.
     Action: inspect backup flow.
     Assertions: backups occur only when migrations pending.
     Requirements: data-storage.3.1 */
  it("backs up only before migrations", () => {
    const source = readText("src/db/index.ts");
    expect(source).toMatch(/pending\.length === 0/);
    expect(source).toMatch(/createBackup/);
  });

  /* Preconditions: main.ts exists.
     Action: inspect startup error handling.
     Assertions: migration failures stop startup and show an error.
     Requirements: data-storage.2.5 */
  it("stops startup on migration failure", () => {
    const source = readText("main.ts");
    expect(source).toContain("Database migration failed");
    expect(source).toContain("app.exit(1)");
  });

  /* Preconditions: db module exists.
     Action: inspect openDatabase/exists check.
     Assertions: missing database is created by opening path.
     Requirements: data-storage.1.3 */
  it("creates the database file when missing", () => {
    const source = readText("src/db/index.ts");
    expect(source).toMatch(/fs\.existsSync/);
    expect(source).toMatch(/openDatabase/);
  });

  /* Preconditions: migrations module exists.
     Action: inspect schema migrations list.
     Assertions: schema_migrations table exists.
     Requirements: data-storage.2.1 */
  it("applies schema migrations when needed", () => {
    const source = readText("src/db/index.ts");
    expect(source).toContain("schema_migrations");
  });

  /* Preconditions: app_meta table exists for application metadata.
     Action: inspect database schema migrations.
     Assertions: app_meta table is created in migrations.
     Requirements: data-storage.1.1 */
  it("uses app_meta table for application metadata", () => {
    const source = readText("src/db/migrations.ts");
    expect(source).toContain("app_meta");
  });
});
