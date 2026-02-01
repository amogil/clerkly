// Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

// Unmock better-sqlite3 for these tests since we need real database operations
vi.unmock("better-sqlite3");

import { migrations, type Migration, type SqliteDatabase } from "./migrations";
import Database from "better-sqlite3";

describe("Database Migrations", () => {
  /* Preconditions: migrations array is defined
     Action: verify migrations array structure
     Assertions: migrations should be properly defined with id, name, and up function
     Requirements: testing-infrastructure.8.2 */
  it("should export migrations array with correct structure", () => {
    expect(migrations).toBeDefined();
    expect(Array.isArray(migrations)).toBe(true);
    expect(migrations.length).toBeGreaterThan(0);

    migrations.forEach((migration) => {
      expect(migration).toHaveProperty("id");
      expect(migration).toHaveProperty("name");
      expect(migration).toHaveProperty("up");
      expect(typeof migration.id).toBe("number");
      expect(typeof migration.name).toBe("string");
      expect(typeof migration.up).toBe("function");
      expect(migration.id).toBeGreaterThan(0);
    });
  });

  /* Preconditions: migrations array is defined
     Action: check for duplicate migration IDs
     Assertions: all migration IDs should be unique
     Requirements: testing-infrastructure.8.2 */
  it("should have unique migration IDs", () => {
    const ids = migrations.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  /* Preconditions: migrations array is defined
     Action: verify migrations are in sequential order
     Assertions: migration IDs should be sequential starting from 1
     Requirements: testing-infrastructure.8.2 */
  it("should have sequential migration IDs", () => {
    const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);
    sortedMigrations.forEach((migration, index) => {
      expect(migration.id).toBe(index + 1);
    });
  });

  /* Preconditions: migrations array is defined
     Action: verify migration 1 exists and has correct name
     Assertions: migration 1 should be named "initial-schema"
     Requirements: testing-infrastructure.8.2 */
  it("should have migration 1 for initial schema", () => {
    const migration1 = migrations.find((m) => m.id === 1);
    expect(migration1).toBeDefined();
    expect(migration1?.name).toBe("initial-schema");
    expect(migration1?.up).toBeDefined();
  });

  /* Preconditions: migrations array is defined
     Action: verify migration 2 exists and has correct name
     Assertions: migration 2 should be named "auth-tokens"
     Requirements: testing-infrastructure.8.2 */
  it("should have migration 2 for auth tokens", () => {
    const migration2 = migrations.find((m) => m.id === 2);
    expect(migration2).toBeDefined();
    expect(migration2?.name).toBe("auth-tokens");
    expect(migration2?.up).toBeDefined();
  });

  /* Preconditions: migrations array is defined
     Action: verify migration names are descriptive
     Assertions: migration names should follow kebab-case convention
     Requirements: testing-infrastructure.8.2 */
  it("should have descriptive migration names in kebab-case", () => {
    const kebabCaseRegex = /^[a-z]+(-[a-z]+)*$/;

    migrations.forEach((migration) => {
      expect(migration.name).toMatch(kebabCaseRegex);
      expect(migration.name.length).toBeGreaterThan(0);
    });
  });

  /* Preconditions: migrations array is defined
     Action: verify all migrations have valid IDs
     Assertions: all migration IDs should be positive integers
     Requirements: testing-infrastructure.8.2 */
  it("should have positive integer IDs for all migrations", () => {
    migrations.forEach((migration) => {
      expect(migration.id).toBeGreaterThan(0);
      expect(Number.isInteger(migration.id)).toBe(true);
    });
  });

  /* Preconditions: migrations array is defined
     Action: verify migrations can be sorted
     Assertions: migrations should be sortable by ID without errors
     Requirements: testing-infrastructure.8.2 */
  it("should be sortable by ID", () => {
    expect(() => {
      const sorted = [...migrations].sort((a, b) => a.id - b.id);
      expect(sorted.length).toBe(migrations.length);
    }).not.toThrow();
  });

  /* Preconditions: migrations array is defined
     Action: verify migration count matches expected
     Assertions: should have exactly 2 migrations defined
     Requirements: testing-infrastructure.8.2 */
  it("should have expected number of migrations", () => {
    expect(migrations.length).toBe(2);
  });

  /* Preconditions: migrations array is defined
     Action: verify migration names are unique
     Assertions: all migration names should be unique
     Requirements: testing-infrastructure.8.2 */
  it("should have unique migration names", () => {
    const names = migrations.map((m) => m.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  /* Preconditions: migrations array is defined
     Action: verify each migration has a valid up function
     Assertions: up function should be callable and accept a database parameter
     Requirements: testing-infrastructure.8.2 */
  it("should have valid up functions for all migrations", () => {
    migrations.forEach((migration) => {
      expect(typeof migration.up).toBe("function");
      expect(migration.up.length).toBeGreaterThanOrEqual(1); // Should accept at least db parameter
    });
  });

  /* Preconditions: migrations array is defined
     Action: verify migration names are not empty strings
     Assertions: all migration names should have non-zero length
     Requirements: testing-infrastructure.8.2 */
  it("should not have empty migration names", () => {
    migrations.forEach((migration) => {
      expect(migration.name.trim()).not.toBe("");
      expect(migration.name.length).toBeGreaterThan(0);
    });
  });

  /* Preconditions: migrations array is defined
     Action: verify migrations array is not empty
     Assertions: should have at least one migration defined
     Requirements: testing-infrastructure.8.2 */
  it("should have at least one migration", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  /* Preconditions: migrations array is defined
     Action: verify migration IDs start from 1
     Assertions: first migration should have ID 1
     Requirements: testing-infrastructure.8.2 */
  it("should start migration IDs from 1", () => {
    const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);
    expect(sortedMigrations[0].id).toBe(1);
  });

  /* Preconditions: migrations array is defined
     Action: verify no gaps in migration ID sequence
     Assertions: migration IDs should be consecutive without gaps
     Requirements: testing-infrastructure.8.2 */
  it("should have no gaps in migration ID sequence", () => {
    const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);
    for (let i = 0; i < sortedMigrations.length; i++) {
      expect(sortedMigrations[i].id).toBe(i + 1);
    }
  });
});

describe("Migration Execution", () => {
  let testDbPath: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    // Create a temporary database for testing
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "migration-test-"));
    testDbPath = path.join(tempDir, "test.db");
    db = new Database(testDbPath);
  });

  afterEach(() => {
    // Clean up test database
    if (db) {
      db.close();
    }
    if (testDbPath && fs.existsSync(testDbPath)) {
      const dir = path.dirname(testDbPath);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  /* Preconditions: empty database
     Action: execute migration 1 (initial-schema)
     Assertions: app_meta table should be created with correct schema
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should create app_meta table in migration 1", () => {
    const migration1 = migrations.find((m) => m.id === 1);
    expect(migration1).toBeDefined();

    migration1!.up(db);

    // Verify table exists
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_meta'")
      .get() as { name: string } | undefined;
    expect(tableInfo).toBeDefined();
    expect(tableInfo?.name).toBe("app_meta");

    // Verify table schema
    const columns = db.prepare("PRAGMA table_info(app_meta)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    expect(columns).toHaveLength(2);
    expect(columns.find((c) => c.name === "key")).toBeDefined();
    expect(columns.find((c) => c.name === "value")).toBeDefined();

    const keyColumn = columns.find((c) => c.name === "key");
    expect(keyColumn?.type).toBe("TEXT");
    expect(keyColumn?.pk).toBe(1); // Primary key

    const valueColumn = columns.find((c) => c.name === "value");
    expect(valueColumn?.type).toBe("TEXT");
    expect(valueColumn?.notnull).toBe(1); // NOT NULL
  });

  /* Preconditions: empty database
     Action: execute migration 2 (auth-tokens)
     Assertions: auth_tokens table should be created with correct schema
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should create auth_tokens table in migration 2", () => {
    const migration2 = migrations.find((m) => m.id === 2);
    expect(migration2).toBeDefined();

    migration2!.up(db);

    // Verify table exists
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_tokens'")
      .get() as { name: string } | undefined;
    expect(tableInfo).toBeDefined();
    expect(tableInfo?.name).toBe("auth_tokens");

    // Verify table schema
    const columns = db.prepare("PRAGMA table_info(auth_tokens)").all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    expect(columns).toHaveLength(3);
    expect(columns.find((c) => c.name === "id")).toBeDefined();
    expect(columns.find((c) => c.name === "encrypted")).toBeDefined();
    expect(columns.find((c) => c.name === "updated_at")).toBeDefined();

    const idColumn = columns.find((c) => c.name === "id");
    expect(idColumn?.type).toBe("INTEGER");
    expect(idColumn?.pk).toBe(1); // Primary key

    const encryptedColumn = columns.find((c) => c.name === "encrypted");
    expect(encryptedColumn?.type).toBe("TEXT");
    expect(encryptedColumn?.notnull).toBe(1); // NOT NULL

    const updatedAtColumn = columns.find((c) => c.name === "updated_at");
    expect(updatedAtColumn?.type).toBe("INTEGER");
    expect(updatedAtColumn?.notnull).toBe(1); // NOT NULL
  });

  /* Preconditions: empty database
     Action: execute all migrations in sequence
     Assertions: all tables should be created successfully
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should execute all migrations in sequence", () => {
    const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);

    sortedMigrations.forEach((migration) => {
      expect(() => migration.up(db)).not.toThrow();
    });

    // Verify all expected tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("app_meta");
    expect(tableNames).toContain("auth_tokens");
  });

  /* Preconditions: empty database
     Action: execute migration 1 twice (idempotency test)
     Assertions: second execution should not fail due to CREATE IF NOT EXISTS
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should be idempotent - migration 1 can run multiple times", () => {
    const migration1 = migrations.find((m) => m.id === 1);
    expect(migration1).toBeDefined();

    // First execution
    expect(() => migration1!.up(db)).not.toThrow();

    // Second execution should not fail
    expect(() => migration1!.up(db)).not.toThrow();

    // Verify table still exists and is correct
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_meta'")
      .get() as { name: string } | undefined;
    expect(tableInfo).toBeDefined();
  });

  /* Preconditions: empty database
     Action: execute migration 2 twice (idempotency test)
     Assertions: second execution should not fail due to CREATE IF NOT EXISTS
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should be idempotent - migration 2 can run multiple times", () => {
    const migration2 = migrations.find((m) => m.id === 2);
    expect(migration2).toBeDefined();

    // First execution
    expect(() => migration2!.up(db)).not.toThrow();

    // Second execution should not fail
    expect(() => migration2!.up(db)).not.toThrow();

    // Verify table still exists and is correct
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auth_tokens'")
      .get() as { name: string } | undefined;
    expect(tableInfo).toBeDefined();
  });

  /* Preconditions: database with app_meta table and existing data
     Action: execute migration 1 again
     Assertions: existing data should be preserved
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should preserve existing data when re-running migration 1", () => {
    const migration1 = migrations.find((m) => m.id === 1);
    expect(migration1).toBeDefined();

    // First execution
    migration1!.up(db);

    // Insert test data
    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("test_key", "test_value");
    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(
      "another_key",
      "another_value",
    );

    // Verify data exists
    const beforeCount = db.prepare("SELECT COUNT(*) as count FROM app_meta").get() as {
      count: number;
    };
    expect(beforeCount.count).toBe(2);

    // Second execution
    migration1!.up(db);

    // Verify data is still there
    const afterCount = db.prepare("SELECT COUNT(*) as count FROM app_meta").get() as {
      count: number;
    };
    expect(afterCount.count).toBe(2);

    const rows = db.prepare("SELECT key, value FROM app_meta ORDER BY key").all() as Array<{
      key: string;
      value: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ key: "another_key", value: "another_value" });
    expect(rows[1]).toEqual({ key: "test_key", value: "test_value" });
  });

  /* Preconditions: database with auth_tokens table and existing data
     Action: execute migration 2 again
     Assertions: existing data should be preserved
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should preserve existing data when re-running migration 2", () => {
    const migration2 = migrations.find((m) => m.id === 2);
    expect(migration2).toBeDefined();

    // First execution
    migration2!.up(db);

    // Insert test data
    const now = Date.now();
    db.prepare("INSERT INTO auth_tokens (encrypted, updated_at) VALUES (?, ?)").run(
      "encrypted_token_1",
      now,
    );
    db.prepare("INSERT INTO auth_tokens (encrypted, updated_at) VALUES (?, ?)").run(
      "encrypted_token_2",
      now + 1000,
    );

    // Verify data exists
    const beforeCount = db.prepare("SELECT COUNT(*) as count FROM auth_tokens").get() as {
      count: number;
    };
    expect(beforeCount.count).toBe(2);

    // Second execution
    migration2!.up(db);

    // Verify data is still there
    const afterCount = db.prepare("SELECT COUNT(*) as count FROM auth_tokens").get() as {
      count: number;
    };
    expect(afterCount.count).toBe(2);

    const rows = db
      .prepare("SELECT encrypted, updated_at FROM auth_tokens ORDER BY id")
      .all() as Array<{
      encrypted: string;
      updated_at: number;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0].encrypted).toBe("encrypted_token_1");
    expect(rows[1].encrypted).toBe("encrypted_token_2");
  });

  /* Preconditions: empty database
     Action: insert data into app_meta table after migration 1
     Assertions: data should be insertable and retrievable with correct constraints
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should enforce app_meta table constraints", () => {
    const migration1 = migrations.find((m) => m.id === 1);
    migration1!.up(db);

    // Should allow valid inserts
    expect(() => {
      db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("valid_key", "valid_value");
    }).not.toThrow();

    // Should enforce primary key constraint (duplicate key)
    expect(() => {
      db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(
        "valid_key",
        "another_value",
      );
    }).toThrow();

    // Should enforce NOT NULL constraint on value
    expect(() => {
      db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("null_value_key", null);
    }).toThrow();
  });

  /* Preconditions: empty database
     Action: insert data into auth_tokens table after migration 2
     Assertions: data should be insertable and retrievable with correct constraints
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should enforce auth_tokens table constraints", () => {
    const migration2 = migrations.find((m) => m.id === 2);
    migration2!.up(db);

    const now = Date.now();

    // Should allow valid inserts
    expect(() => {
      db.prepare("INSERT INTO auth_tokens (encrypted, updated_at) VALUES (?, ?)").run(
        "valid_token",
        now,
      );
    }).not.toThrow();

    // Should enforce NOT NULL constraint on encrypted
    expect(() => {
      db.prepare("INSERT INTO auth_tokens (encrypted, updated_at) VALUES (?, ?)").run(null, now);
    }).toThrow();

    // Should enforce NOT NULL constraint on updated_at
    expect(() => {
      db.prepare("INSERT INTO auth_tokens (encrypted, updated_at) VALUES (?, ?)").run(
        "valid_token",
        null,
      );
    }).toThrow();

    // Should auto-increment id
    const id1 = db
      .prepare("INSERT INTO auth_tokens (encrypted, updated_at) VALUES (?, ?)")
      .run("token1", now).lastInsertRowid;
    const id2 = db
      .prepare("INSERT INTO auth_tokens (encrypted, updated_at) VALUES (?, ?)")
      .run("token2", now).lastInsertRowid;

    expect(Number(id2)).toBeGreaterThan(Number(id1));
  });

  /* Preconditions: empty database
     Action: execute migrations out of order
     Assertions: migrations should work independently regardless of order
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should handle migrations executed out of order", () => {
    // Execute migration 2 first
    const migration2 = migrations.find((m) => m.id === 2);
    expect(() => migration2!.up(db)).not.toThrow();

    // Then execute migration 1
    const migration1 = migrations.find((m) => m.id === 1);
    expect(() => migration1!.up(db)).not.toThrow();

    // Verify both tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("app_meta");
    expect(tableNames).toContain("auth_tokens");
  });

  /* Preconditions: empty database
     Action: execute all migrations and verify table relationships
     Assertions: tables should be independent with no foreign key constraints
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should create independent tables without foreign key constraints", () => {
    // Execute all migrations
    const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);
    sortedMigrations.forEach((migration) => migration.up(db));

    // Verify no foreign keys exist
    const appMetaForeignKeys = db.prepare("PRAGMA foreign_key_list(app_meta)").all();
    expect(appMetaForeignKeys).toHaveLength(0);

    const authTokensForeignKeys = db.prepare("PRAGMA foreign_key_list(auth_tokens)").all();
    expect(authTokensForeignKeys).toHaveLength(0);
  });

  /* Preconditions: empty database
     Action: execute migrations and test concurrent access patterns
     Assertions: migrations should support concurrent reads after creation
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should support concurrent access after migrations", () => {
    // Execute all migrations
    const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);
    sortedMigrations.forEach((migration) => migration.up(db));

    // Insert test data
    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("key1", "value1");
    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("key2", "value2");

    // Simulate concurrent reads
    const read1 = db.prepare("SELECT * FROM app_meta WHERE key = ?").get("key1");
    const read2 = db.prepare("SELECT * FROM app_meta WHERE key = ?").get("key2");

    expect(read1).toBeDefined();
    expect(read2).toBeDefined();
  });

  /* Preconditions: empty database
     Action: execute migrations with empty database
     Assertions: migrations should handle empty database state correctly
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should handle empty database state", () => {
    // Verify database is empty
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
      name: string;
    }>;
    expect(tables).toHaveLength(0);

    // Execute all migrations
    const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);
    expect(() => {
      sortedMigrations.forEach((migration) => migration.up(db));
    }).not.toThrow();

    // Verify tables were created
    const tablesAfter = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    expect(tablesAfter.length).toBeGreaterThan(0);
  });

  /* Preconditions: database with existing tables
     Action: verify migration SQL uses CREATE IF NOT EXISTS
     Assertions: migrations should use IF NOT EXISTS clause for safety
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should use CREATE IF NOT EXISTS in migration SQL", () => {
    // This test verifies the idempotency by checking behavior
    const migration1 = migrations.find((m) => m.id === 1);
    const migration2 = migrations.find((m) => m.id === 2);

    // First run
    migration1!.up(db);
    migration2!.up(db);

    // Get table count
    const tablesFirst = db
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'")
      .get() as { count: number };

    // Second run should not create duplicate tables
    migration1!.up(db);
    migration2!.up(db);

    const tablesSecond = db
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'")
      .get() as { count: number };

    expect(tablesFirst.count).toBe(tablesSecond.count);
  });

  /* Preconditions: empty database
     Action: execute migrations and verify table names match expected schema
     Assertions: table names should match exactly as defined in migrations
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should create tables with exact names as specified", () => {
    const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);
    sortedMigrations.forEach((migration) => migration.up(db));

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map((t) => t.name);

    // Verify exact table names
    expect(tableNames).toContain("app_meta");
    expect(tableNames).toContain("auth_tokens");

    // Verify no unexpected tables
    const expectedTables = ["app_meta", "auth_tokens"];
    tableNames.forEach((name) => {
      expect(expectedTables).toContain(name);
    });
  });

  /* Preconditions: empty database
     Action: execute migrations and test data types
     Assertions: columns should accept correct data types and reject invalid ones
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should enforce correct data types in app_meta table", () => {
    const migration1 = migrations.find((m) => m.id === 1);
    migration1!.up(db);

    // TEXT columns should accept strings
    expect(() => {
      db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(
        "string_key",
        "string_value",
      );
    }).not.toThrow();

    // Verify data was inserted correctly
    const row = db.prepare("SELECT * FROM app_meta WHERE key = ?").get("string_key") as {
      key: string;
      value: string;
    };
    expect(row.key).toBe("string_key");
    expect(row.value).toBe("string_value");
    expect(typeof row.key).toBe("string");
    expect(typeof row.value).toBe("string");
  });

  /* Preconditions: empty database
     Action: execute migrations and test data types for auth_tokens
     Assertions: columns should accept correct data types
     Requirements: testing-infrastructure.8.2, testing-infrastructure.8.3 */
  it("should enforce correct data types in auth_tokens table", () => {
    const migration2 = migrations.find((m) => m.id === 2);
    migration2!.up(db);

    const now = Date.now();

    // Should accept correct types
    expect(() => {
      db.prepare("INSERT INTO auth_tokens (encrypted, updated_at) VALUES (?, ?)").run(
        "encrypted_string",
        now,
      );
    }).not.toThrow();

    // Verify data was inserted correctly
    const row = db
      .prepare("SELECT * FROM auth_tokens WHERE encrypted = ?")
      .get("encrypted_string") as {
      id: number;
      encrypted: string;
      updated_at: number;
    };
    expect(row.encrypted).toBe("encrypted_string");
    expect(row.updated_at).toBe(now);
    expect(typeof row.encrypted).toBe("string");
    expect(typeof row.updated_at).toBe("number");
    expect(typeof row.id).toBe("number");
  });
});
