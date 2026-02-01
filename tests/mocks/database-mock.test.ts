// Requirements: testing-infrastructure.2.3
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseMockImpl, type DatabaseMock, type MockStatement } from "./database-mock";

describe("Database Mock System", () => {
  let databaseMock: DatabaseMock;

  beforeEach(() => {
    databaseMock = new DatabaseMockImpl();
  });

  describe("Basic Database Operations", () => {
    /* Preconditions: fresh database mock instance
       Action: call prepare() with SQL statement
       Assertions: returns MockStatement instance, statement is cached for reuse
       Requirements: testing-infrastructure.2.3 */
    it("should prepare SQL statements and cache them", () => {
      const sql = "SELECT * FROM users WHERE id = ?";

      const statement1 = databaseMock.prepare(sql);
      const statement2 = databaseMock.prepare(sql);

      expect(statement1).toBeDefined();
      expect(statement1).toBe(statement2); // Should return same cached instance
      expect(typeof statement1.run).toBe("function");
      expect(typeof statement1.get).toBe("function");
      expect(typeof statement1.all).toBe("function");
    });

    /* Preconditions: fresh database mock instance
       Action: call exec() with CREATE TABLE statement
       Assertions: statement is recorded in query history, no errors thrown
       Requirements: testing-infrastructure.2.3 */
    it("should execute SQL statements without errors", () => {
      const sql = "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)";

      expect(() => databaseMock.exec(sql)).not.toThrow();

      const history = databaseMock.getQueryHistory();
      expect(history).toHaveLength(1);
      expect(history[0].sql).toBe(sql);
      expect(history[0].operation).toBe("exec");
    });

    /* Preconditions: open database mock instance
       Action: call close() method
       Assertions: database is marked as closed, subsequent operations throw errors
       Requirements: testing-infrastructure.2.3 */
    it("should close database connection and prevent further operations", () => {
      databaseMock.close();

      expect(() => databaseMock.prepare("SELECT 1")).toThrow("Database connection is closed");
      expect(() => databaseMock.exec("SELECT 1")).toThrow("Database connection is closed");
    });

    /* Preconditions: fresh database mock instance
       Action: call pragma() with journal_mode setting
       Assertions: returns appropriate mock value for pragma
       Requirements: testing-infrastructure.2.3 */
    it("should handle pragma statements", () => {
      const result = databaseMock.pragma("journal_mode = WAL");

      expect(result).toBe("wal");
    });

    /* Preconditions: fresh database mock instance
       Action: call transaction() with function
       Assertions: returns transaction function that executes the provided function
       Requirements: testing-infrastructure.2.3 */
    it("should create transaction functions", () => {
      let executed = false;
      const transactionFn = databaseMock.transaction(() => {
        executed = true;
        return "result";
      });

      expect(typeof transactionFn).toBe("function");

      const result = transactionFn();
      expect(executed).toBe(true);
      expect(result).toBe("result");
    });
  });

  describe("Mock Statement Operations", () => {
    let statement: MockStatement;

    beforeEach(() => {
      statement = databaseMock.prepare("INSERT INTO users (name) VALUES (?)");
    });

    /* Preconditions: prepared INSERT statement
       Action: call run() with parameters
       Assertions: returns changes and lastInsertRowid, records query in history
       Requirements: testing-infrastructure.2.3 */
    it("should execute run() and return changes info", () => {
      const result = statement.run("John Doe");

      expect(result).toEqual({
        changes: 1,
        lastInsertRowid: expect.any(Number),
      });
      expect(result.lastInsertRowid).toBeGreaterThan(0);

      const history = databaseMock.getQueryHistory();
      const runQuery = history.find((q) => q.operation === "run");
      expect(runQuery).toBeDefined();
      expect(runQuery?.params).toEqual(["John Doe"]);
    });

    /* Preconditions: prepared SELECT statement with mock data
       Action: call get() with parameters
       Assertions: returns single row from mock data
       Requirements: testing-infrastructure.2.3 */
    it("should execute get() and return single row", () => {
      databaseMock.setMockData("users", [
        { id: 1, name: "John Doe" },
        { id: 2, name: "Jane Smith" },
      ]);

      const selectStatement = databaseMock.prepare("SELECT * FROM users WHERE id = ?");
      const result = selectStatement.get(1);

      expect(result).toEqual({ id: 1, name: "John Doe" });
    });

    /* Preconditions: prepared SELECT statement with mock data
       Action: call all() with parameters
       Assertions: returns all rows from mock data
       Requirements: testing-infrastructure.2.3 */
    it("should execute all() and return all rows", () => {
      databaseMock.setMockData("users", [
        { id: 1, name: "John Doe" },
        { id: 2, name: "Jane Smith" },
      ]);

      const selectStatement = databaseMock.prepare("SELECT * FROM users");
      const result = selectStatement.all();

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { id: 1, name: "John Doe" },
        { id: 2, name: "Jane Smith" },
      ]);
    });

    /* Preconditions: prepared statement
       Action: call finalize() method
       Assertions: method executes without errors (no-op in mock)
       Requirements: testing-infrastructure.2.3 */
    it("should finalize statements without errors", () => {
      expect(() => statement.finalize()).not.toThrow();
    });
  });

  describe("Mock Data Management", () => {
    /* Preconditions: fresh database mock instance
       Action: call setMockData() with table name and data array
       Assertions: data is stored and retrievable via getMockData()
       Requirements: testing-infrastructure.2.3 */
    it("should set and get mock data for tables", () => {
      const testData = [
        { id: 1, name: "Test User" },
        { id: 2, name: "Another User" },
      ];

      databaseMock.setMockData("users", testData);
      const retrievedData = databaseMock.getMockData("users");

      expect(retrievedData).toEqual(testData);
      expect(retrievedData).not.toBe(testData); // Should be a copy
    });

    /* Preconditions: fresh database mock instance
       Action: call getMockData() for non-existent table
       Assertions: returns empty array
       Requirements: testing-infrastructure.2.3 */
    it("should return empty array for non-existent tables", () => {
      const result = databaseMock.getMockData("non_existent_table");

      expect(result).toEqual([]);
    });

    /* Preconditions: database mock with custom query result set
       Action: call setQueryResult() then execute matching query
       Assertions: returns custom result instead of default mock behavior
       Requirements: testing-infrastructure.2.3 */
    it("should use custom query results when set", () => {
      const customResult = { id: 999, name: "Custom Result" };
      const sql = "SELECT * FROM users WHERE special = 1";

      databaseMock.setQueryResult(sql, customResult);

      const statement = databaseMock.prepare(sql);
      const result = statement.get();

      expect(result).toEqual(customResult);
    });
  });

  describe("Query History Tracking", () => {
    /* Preconditions: fresh database mock instance
       Action: perform various database operations
       Assertions: all operations are recorded in query history with correct details
       Requirements: testing-infrastructure.2.3 */
    it("should track all database operations in history", () => {
      databaseMock.exec("CREATE TABLE test (id INTEGER)");
      const statement = databaseMock.prepare("INSERT INTO test (id) VALUES (?)");
      statement.run(1);
      statement.get();
      statement.all();

      const history = databaseMock.getQueryHistory();

      expect(history).toHaveLength(5); // exec, prepare, run, get, all
      expect(history[0].operation).toBe("exec");
      expect(history[1].operation).toBe("prepare");
      expect(history[2].operation).toBe("run");
      expect(history[3].operation).toBe("get");
      expect(history[4].operation).toBe("all");

      // Check timestamps are present and reasonable
      history.forEach((record) => {
        expect(record.timestamp).toBeGreaterThan(0);
        expect(typeof record.timestamp).toBe("number");
      });
    });

    /* Preconditions: database mock with query history
       Action: call reset() method
       Assertions: query history is cleared
       Requirements: testing-infrastructure.2.3 */
    it("should clear query history on reset", () => {
      databaseMock.prepare("SELECT 1");
      expect(databaseMock.getQueryHistory()).toHaveLength(1);

      databaseMock.reset();

      expect(databaseMock.getQueryHistory()).toHaveLength(0);
    });
  });

  describe("Error Simulation", () => {
    /* Preconditions: fresh database mock instance
       Action: call simulateError() then perform matching operation
       Assertions: specified error is thrown during operation
       Requirements: testing-infrastructure.2.3 */
    it("should simulate errors for specific operations", () => {
      const testError = new Error("Simulated database error");
      databaseMock.simulateError("prepare", testError);

      expect(() => databaseMock.prepare("SELECT 1")).toThrow("Simulated database error");
    });

    /* Preconditions: database mock with simulated statement errors
       Action: call statement operations that have simulated errors
       Assertions: appropriate errors are thrown for each operation
       Requirements: testing-infrastructure.2.3 */
    it("should simulate errors for statement operations", () => {
      const runError = new Error("Run error");
      const getError = new Error("Get error");
      const allError = new Error("All error");

      databaseMock.simulateError("run", runError);
      databaseMock.simulateError("get", getError);
      databaseMock.simulateError("all", allError);

      const statement = databaseMock.prepare("SELECT 1");

      expect(() => statement.run()).toThrow("Run error");
      expect(() => statement.get()).toThrow("Get error");
      expect(() => statement.all()).toThrow("All error");
    });

    /* Preconditions: database mock with simulated errors
       Action: call clearErrors() then perform operations
       Assertions: errors are cleared and operations succeed
       Requirements: testing-infrastructure.2.3 */
    it("should clear simulated errors", () => {
      const testError = new Error("Test error");
      databaseMock.simulateError("prepare", testError);

      expect(() => databaseMock.prepare("SELECT 1")).toThrow();

      databaseMock.clearErrors();

      expect(() => databaseMock.prepare("SELECT 1")).not.toThrow();
    });
  });

  describe("Default Table Initialization", () => {
    /* Preconditions: fresh database mock instance
       Action: check getMockData() for default tables
       Assertions: default tables from migrations are initialized
       Requirements: testing-infrastructure.2.3 */
    it("should initialize default tables based on migration schema", () => {
      const schemaMigrations = databaseMock.getMockData("schema_migrations");
      const appMeta = databaseMock.getMockData("app_meta");
      const authTokens = databaseMock.getMockData("auth_tokens");

      expect(schemaMigrations).toEqual([{ version: 2 }]);
      expect(appMeta).toEqual([]);
      expect(authTokens).toEqual([]);
    });

    /* Preconditions: database mock with modified default tables
       Action: call reset() method
       Assertions: default tables are restored to initial state
       Requirements: testing-infrastructure.2.3 */
    it("should restore default tables on reset", () => {
      // Modify default tables
      databaseMock.setMockData("app_meta", [{ key: "test", value: "data" }]);
      databaseMock.setMockData("auth_tokens", [{ id: 1, encrypted: "token" }]);

      databaseMock.reset();

      // Check tables are restored
      expect(databaseMock.getMockData("schema_migrations")).toEqual([{ version: 2 }]);
      expect(databaseMock.getMockData("app_meta")).toEqual([]);
      expect(databaseMock.getMockData("auth_tokens")).toEqual([]);
    });
  });

  describe("SQL Parsing and Table Operations", () => {
    /* Preconditions: fresh database mock instance
       Action: execute CREATE TABLE statement
       Assertions: new table is created in mock data storage
       Requirements: testing-infrastructure.2.3 */
    it("should create tables from CREATE TABLE statements", () => {
      databaseMock.exec("CREATE TABLE IF NOT EXISTS new_table (id INTEGER PRIMARY KEY)");

      const tableData = databaseMock.getMockData("new_table");
      expect(tableData).toEqual([]);
    });

    /* Preconditions: database mock with table data
       Action: execute INSERT statement via prepared statement
       Assertions: data is added to appropriate table in mock storage
       Requirements: testing-infrastructure.2.3 */
    it("should handle INSERT operations with table data updates", () => {
      databaseMock.setMockData("users", []);

      const statement = databaseMock.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
      const result = statement.run("John Doe", "john@example.com");

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBeGreaterThan(0);

      const userData = databaseMock.getMockData("users");
      expect(userData).toHaveLength(1);
      expect(userData[0]).toMatchObject({
        id: expect.any(Number),
        param_0: "John Doe",
        param_1: "john@example.com",
      });
    });

    /* Preconditions: database mock with existing table data
       Action: execute UPDATE statement via prepared statement
       Assertions: returns appropriate changes count
       Requirements: testing-infrastructure.2.3 */
    it("should handle UPDATE operations", () => {
      const statement = databaseMock.prepare("UPDATE users SET name = ? WHERE id = ?");
      const result = statement.run("Updated Name", 1);

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(0);
    });

    /* Preconditions: database mock with existing table data
       Action: execute DELETE statement via prepared statement
       Assertions: returns appropriate changes count
       Requirements: testing-infrastructure.2.3 */
    it("should handle DELETE operations", () => {
      const statement = databaseMock.prepare("DELETE FROM users WHERE id = ?");
      const result = statement.run(1);

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(0);
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    /* Preconditions: fresh database mock instance
       Action: call operations with null, undefined, and empty parameters
       Assertions: operations handle edge cases gracefully without errors
       Requirements: testing-infrastructure.2.3 */
    it("should handle null and undefined parameters gracefully", () => {
      const statement = databaseMock.prepare("SELECT * FROM users WHERE name = ?");

      expect(() => statement.run(null)).not.toThrow();
      expect(() => statement.run(undefined)).not.toThrow();
      expect(() => statement.run("")).not.toThrow();

      expect(() => statement.get(null)).not.toThrow();
      expect(() => statement.all(undefined)).not.toThrow();
    });

    /* Preconditions: fresh database mock instance
       Action: call prepare() with empty or malformed SQL
       Assertions: operations complete without throwing errors
       Requirements: testing-infrastructure.2.3 */
    it("should handle malformed SQL gracefully", () => {
      expect(() => databaseMock.prepare("")).not.toThrow();
      expect(() => databaseMock.prepare("INVALID SQL STATEMENT")).not.toThrow();
      expect(() => databaseMock.exec("")).not.toThrow();
    });

    /* Preconditions: fresh database mock instance
       Action: perform operations with very large parameter arrays
       Assertions: operations handle large datasets without performance issues
       Requirements: testing-infrastructure.2.3 */
    it("should handle large parameter arrays", () => {
      const largeParams = new Array(1000).fill("test_value");
      const statement = databaseMock.prepare(
        "INSERT INTO test VALUES " + "(?),".repeat(999) + "(?)",
      );

      expect(() => statement.run(...largeParams)).not.toThrow();

      const result = statement.run(...largeParams);
      expect(result.changes).toBe(1);
    });

    /* Preconditions: closed database mock instance
       Action: attempt various operations on closed database
       Assertions: all operations throw appropriate "connection closed" errors
       Requirements: testing-infrastructure.2.3 */
    it("should consistently throw errors for closed database operations", () => {
      databaseMock.close();

      expect(() => databaseMock.prepare("SELECT 1")).toThrow("Database connection is closed");
      expect(() => databaseMock.exec("SELECT 1")).toThrow("Database connection is closed");
      expect(() => databaseMock.pragma("journal_mode")).toThrow("Database connection is closed");
      expect(() => databaseMock.transaction(() => {})).toThrow("Database connection is closed");
    });
  });
});
