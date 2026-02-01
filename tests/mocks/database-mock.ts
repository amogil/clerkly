// Requirements: testing-infrastructure.2.3
import { vi, type MockedFunction } from "vitest";

/**
 * Mock statement interface for database operations
 * Requirements: testing-infrastructure.2.3
 */
export interface MockStatement {
  run(...params: any[]): { changes: number; lastInsertRowid: number };
  get(...params: any[]): any;
  all(...params: any[]): any[];
  finalize(): void;
}

/**
 * Interface for database mock operations
 * Requirements: testing-infrastructure.2.3
 */
export interface DatabaseMock {
  prepare(sql: string): MockStatement;
  exec(sql: string): void;
  close(): void;
  pragma(pragma: string): any;
  transaction<T>(fn: () => T): () => T;
  reset(): void;
  setMockData(table: string, data: any[]): void;
  getMockData(table: string): any[];
  setQueryResult(sql: string, result: any): void;
  getQueryHistory(): QueryRecord[];
  simulateError(operation: string, error: Error): void;
  clearErrors(): void;
}

/**
 * Query record for tracking database operations
 * Requirements: testing-infrastructure.2.3
 */
interface QueryRecord {
  sql: string;
  params: any[];
  operation: "prepare" | "exec" | "run" | "get" | "all";
  timestamp: number;
}

/**
 * Mock data storage for database tables
 * Requirements: testing-infrastructure.2.3
 */
interface MockTableData {
  [tableName: string]: any[];
}

/**
 * Error simulation configuration
 * Requirements: testing-infrastructure.2.3
 */
interface MockError {
  operation: string;
  error: Error;
}

/**
 * Implementation of MockStatement for database operations
 * Requirements: testing-infrastructure.2.3
 */
class MockStatementImpl implements MockStatement {
  private sql: string;
  private mockData: MockTableData;
  private queryResults: Map<string, any>;
  private queryHistory: QueryRecord[];
  private mockErrors: MockError[];

  constructor(
    sql: string,
    mockData: MockTableData,
    queryResults: Map<string, any>,
    queryHistory: QueryRecord[],
    mockErrors: MockError[],
  ) {
    this.sql = sql;
    this.mockData = mockData;
    this.queryResults = queryResults;
    this.queryHistory = queryHistory;
    this.mockErrors = mockErrors;
  }

  /**
   * Execute statement and return changes/lastInsertRowid
   * Requirements: testing-infrastructure.2.3
   */
  run(...params: any[]): { changes: number; lastInsertRowid: number } {
    this.checkForError("run");

    this.queryHistory.push({
      sql: this.sql,
      params,
      operation: "run",
      timestamp: Date.now(),
    });

    // Check for custom query result
    const customResult = this.queryResults.get(this.sql);
    if (customResult && typeof customResult === "object" && "changes" in customResult) {
      return customResult;
    }

    // Simulate INSERT operations
    if (this.sql.toLowerCase().includes("insert")) {
      const tableName = this.extractTableName(this.sql);
      if (tableName && this.mockData[tableName]) {
        const newId = this.mockData[tableName].length + 1;
        this.mockData[tableName].push({ id: newId, ...this.createRowFromParams(params) });
        return { changes: 1, lastInsertRowid: newId };
      }
      return { changes: 1, lastInsertRowid: 1 };
    }

    // Simulate UPDATE operations
    if (this.sql.toLowerCase().includes("update")) {
      return { changes: 1, lastInsertRowid: 0 };
    }

    // Simulate DELETE operations
    if (this.sql.toLowerCase().includes("delete")) {
      return { changes: 1, lastInsertRowid: 0 };
    }

    return { changes: 0, lastInsertRowid: 0 };
  }

  /**
   * Get single row from query
   * Requirements: testing-infrastructure.2.3
   */
  get(...params: any[]): any {
    this.checkForError("get");

    this.queryHistory.push({
      sql: this.sql,
      params,
      operation: "get",
      timestamp: Date.now(),
    });

    // Check for custom query result
    const customResult = this.queryResults.get(this.sql);
    if (customResult !== undefined) {
      return Array.isArray(customResult) ? customResult[0] : customResult;
    }

    // Simulate SELECT operations
    if (this.sql.toLowerCase().includes("select")) {
      const tableName = this.extractTableName(this.sql);
      if (tableName && this.mockData[tableName] && this.mockData[tableName].length > 0) {
        return this.mockData[tableName][0];
      }
    }

    return undefined;
  }

  /**
   * Get all rows from query
   * Requirements: testing-infrastructure.2.3
   */
  all(...params: any[]): any[] {
    this.checkForError("all");

    this.queryHistory.push({
      sql: this.sql,
      params,
      operation: "all",
      timestamp: Date.now(),
    });

    // Check for custom query result
    const customResult = this.queryResults.get(this.sql);
    if (customResult !== undefined) {
      return Array.isArray(customResult) ? customResult : [customResult];
    }

    // Simulate SELECT operations
    if (this.sql.toLowerCase().includes("select")) {
      const tableName = this.extractTableName(this.sql);
      if (tableName && this.mockData[tableName]) {
        return [...this.mockData[tableName]];
      }
    }

    return [];
  }

  /**
   * Finalize statement (no-op in mock)
   * Requirements: testing-infrastructure.2.3
   */
  finalize(): void {
    // Mock implementation - no actual finalization needed
  }

  /**
   * Check for simulated errors
   * Requirements: testing-infrastructure.2.3
   */
  private checkForError(operation: string): void {
    const error = this.mockErrors.find((e) => e.operation === operation);
    if (error) {
      throw error.error;
    }
  }

  /**
   * Extract table name from SQL query
   * Requirements: testing-infrastructure.2.3
   */
  private extractTableName(sql: string): string | null {
    const lowerSql = sql.toLowerCase();

    // Handle INSERT INTO
    let match = lowerSql.match(/insert\s+into\s+(\w+)/);
    if (match) return match[1];

    // Handle UPDATE
    match = lowerSql.match(/update\s+(\w+)/);
    if (match) return match[1];

    // Handle DELETE FROM
    match = lowerSql.match(/delete\s+from\s+(\w+)/);
    if (match) return match[1];

    // Handle SELECT FROM
    match = lowerSql.match(/from\s+(\w+)/);
    if (match) return match[1];

    return null;
  }

  /**
   * Create row object from parameters
   * Requirements: testing-infrastructure.2.3
   */
  private createRowFromParams(params: any[]): any {
    const row: any = {};
    params.forEach((param, index) => {
      row[`param_${index}`] = param;
    });
    return row;
  }
}

/**
 * Implementation of DatabaseMock for unit test isolation
 * Requirements: testing-infrastructure.2.3
 */
export class DatabaseMockImpl implements DatabaseMock {
  private statements: Map<string, MockStatement> = new Map();
  private mockData: MockTableData = {};
  private queryResults: Map<string, any> = new Map();
  private queryHistory: QueryRecord[] = [];
  private mockErrors: MockError[] = [];
  private isOpen: boolean = true;

  // Mock functions for database operations
  public prepare: MockedFunction<(sql: string) => MockStatement>;
  public exec: MockedFunction<(sql: string) => void>;
  public close: MockedFunction<() => void>;
  public pragma: MockedFunction<(pragma: string) => any>;
  public transaction: MockedFunction<(fn: () => any) => () => any>;

  constructor() {
    // Initialize mock functions with default implementations
    this.prepare = vi.fn(this.mockPrepare.bind(this));
    this.exec = vi.fn(this.mockExec.bind(this));
    this.close = vi.fn(this.mockClose.bind(this));
    this.pragma = vi.fn(this.mockPragma.bind(this));
    this.transaction = vi.fn(this.mockTransaction.bind(this));

    // Initialize default table structures based on migrations
    this.initializeDefaultTables();
  }

  /**
   * Set mock data for a specific table
   * Requirements: testing-infrastructure.2.3
   */
  setMockData(table: string, data: any[]): void {
    this.mockData[table] = [...data];
  }

  /**
   * Get mock data for a specific table
   * Requirements: testing-infrastructure.2.3
   */
  getMockData(table: string): any[] {
    return this.mockData[table] ? [...this.mockData[table]] : [];
  }

  /**
   * Set custom result for specific SQL query
   * Requirements: testing-infrastructure.2.3
   */
  setQueryResult(sql: string, result: any): void {
    this.queryResults.set(sql, result);
  }

  /**
   * Get history of all database queries
   * Requirements: testing-infrastructure.2.3
   */
  getQueryHistory(): QueryRecord[] {
    return [...this.queryHistory];
  }

  /**
   * Simulate error for specific operation
   * Requirements: testing-infrastructure.2.3
   */
  simulateError(operation: string, error: Error): void {
    this.mockErrors.push({ operation, error });
  }

  /**
   * Clear all simulated errors
   * Requirements: testing-infrastructure.2.3
   */
  clearErrors(): void {
    this.mockErrors = [];
  }

  /**
   * Reset all mock data, queries, and errors
   * Requirements: testing-infrastructure.2.3
   */
  reset(): void {
    this.statements.clear();
    this.mockData = {};
    this.queryResults.clear();
    this.queryHistory = [];
    this.mockErrors = [];
    this.isOpen = true;
    this.initializeDefaultTables();
    vi.clearAllMocks();
  }

  /**
   * Initialize default table structures
   * Requirements: testing-infrastructure.2.3
   */
  private initializeDefaultTables(): void {
    // Initialize tables based on the migration schema
    this.mockData = {
      schema_migrations: [{ version: 2 }],
      app_meta: [],
      auth_tokens: [],
    };
  }

  /**
   * Check for simulated errors
   * Requirements: testing-infrastructure.2.3
   */
  private checkForError(operation: string): void {
    const error = this.mockErrors.find((e) => e.operation === operation);
    if (error) {
      throw error.error;
    }
  }

  /**
   * Mock implementation of database.prepare()
   * Requirements: testing-infrastructure.2.3
   */
  private mockPrepare(sql: string): MockStatement {
    this.checkForError("prepare");

    if (!this.isOpen) {
      throw new Error("Database connection is closed");
    }

    this.queryHistory.push({
      sql,
      params: [],
      operation: "prepare",
      timestamp: Date.now(),
    });

    if (!this.statements.has(sql)) {
      const statement = new MockStatementImpl(
        sql,
        this.mockData,
        this.queryResults,
        this.queryHistory,
        this.mockErrors,
      );
      this.statements.set(sql, statement);
    }

    return this.statements.get(sql)!;
  }

  /**
   * Mock implementation of database.exec()
   * Requirements: testing-infrastructure.2.3
   */
  private mockExec(sql: string): void {
    this.checkForError("exec");

    if (!this.isOpen) {
      throw new Error("Database connection is closed");
    }

    this.queryHistory.push({
      sql,
      params: [],
      operation: "exec",
      timestamp: Date.now(),
    });

    // Handle CREATE TABLE statements
    if (sql.toLowerCase().includes("create table")) {
      const tableName = this.extractTableNameFromCreate(sql);
      if (tableName && !this.mockData[tableName]) {
        this.mockData[tableName] = [];
      }
    }
  }

  /**
   * Mock implementation of database.close()
   * Requirements: testing-infrastructure.2.3
   */
  private mockClose(): void {
    this.checkForError("close");
    this.isOpen = false;
  }

  /**
   * Mock implementation of database.pragma()
   * Requirements: testing-infrastructure.2.3
   */
  private mockPragma(pragma: string): any {
    this.checkForError("pragma");

    if (!this.isOpen) {
      throw new Error("Database connection is closed");
    }

    // Return appropriate mock values for common pragmas
    if (pragma.includes("journal_mode")) {
      return "wal";
    }

    return null;
  }

  /**
   * Mock implementation of database.transaction()
   * Requirements: testing-infrastructure.2.3
   */
  private mockTransaction<T>(fn: () => T): () => T {
    this.checkForError("transaction");

    if (!this.isOpen) {
      throw new Error("Database connection is closed");
    }

    // Return a function that executes the transaction
    return () => {
      return fn();
    };
  }

  /**
   * Extract table name from CREATE TABLE statement
   * Requirements: testing-infrastructure.2.3
   */
  private extractTableNameFromCreate(sql: string): string | null {
    const match = sql.toLowerCase().match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/);
    return match ? match[1] : null;
  }
}

/**
 * Global database mock instance
 * Requirements: testing-infrastructure.2.3
 */
export const databaseMock = new DatabaseMockImpl();
