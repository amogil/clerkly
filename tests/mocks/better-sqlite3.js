// Requirements: clerkly.2.1, clerkly.2.5
// Mock implementation of better-sqlite3 for testing

/**
 * Mock Database class
 * Simulates better-sqlite3 Database for testing data storage
 */
class Database {
  constructor(filename, options = {}) {
    this.filename = filename;
    this.options = options;
    this.isOpen = true;
    this._inTransaction = false;
    this.data = new Map();
    this.statements = new Map();
    this.tables = new Set(); // Track created tables
    this.indexes = new Set(); // Track created indexes
  }

  /**
   * Prepare a SQL statement
   * @param {string} sql - SQL query string
   * @returns {Statement} Mock statement object
   */
  prepare(sql) {
    const statement = new Statement(this, sql);
    this.statements.set(sql, statement);
    return statement;
  }

  /**
   * Execute a SQL statement
   * @param {string} sql - SQL query string
   * @returns {Object} Result info
   */
  exec(sql) {
    // Handle CREATE TABLE statements
    if (sql.toLowerCase().includes('create table')) {
      const tableMatch = sql.match(/create table (?:if not exists )?(\w+)/i);
      if (tableMatch) {
        this.tables.add(tableMatch[1]);
      }
    }
    
    // Handle DROP TABLE statements
    if (sql.toLowerCase().includes('drop table')) {
      const tableMatch = sql.match(/drop table (?:if exists )?(\w+)/i);
      if (tableMatch) {
        this.tables.delete(tableMatch[1]);
        // Clear data for this table
        const tableName = tableMatch[1];
        for (const [key, value] of this.data.entries()) {
          if (value._table === tableName) {
            this.data.delete(key);
          }
        }
      }
    }
    
    // Handle CREATE INDEX statements
    if (sql.toLowerCase().includes('create index')) {
      const indexMatch = sql.match(/create index (?:if not exists )?(\w+)/i);
      if (indexMatch) {
        this.indexes.add(indexMatch[1]);
      }
    }
    
    // Handle DROP INDEX statements
    if (sql.toLowerCase().includes('drop index')) {
      const indexMatch = sql.match(/drop index (?:if exists )?(\w+)/i);
      if (indexMatch) {
        this.indexes.delete(indexMatch[1]);
      }
    }
    
    return { changes: 0, lastInsertRowid: 0 };
  }

  /**
   * Close the database
   */
  close() {
    this.isOpen = false;
  }

  /**
   * Create a transaction function
   * @param {Function} fn - Function to wrap in transaction
   * @returns {Function} Transaction function
   */
  transaction(fn) {
    return (...args) => {
      this._inTransaction = true;
      try {
        const result = fn(...args);
        this._inTransaction = false;
        return result;
      } catch (error) {
        this._inTransaction = false;
        throw error;
      }
    };
  }

  /**
   * Get database pragma
   * @param {string} name - Pragma name
   * @param {boolean} simple - Return simple value
   * @returns {any} Pragma value
   */
  pragma(name, simple = false) {
    const pragmas = {
      journal_mode: 'wal',
      synchronous: 'normal',
      foreign_keys: 1
    };
    return simple ? pragmas[name] : { [name]: pragmas[name] };
  }

  /**
   * Check if database is open
   * @returns {boolean} True if open
   */
  get open() {
    return this.isOpen;
  }

  /**
   * Check if in transaction
   * @returns {boolean} True if in transaction
   */
  get inTransaction() {
    return this._inTransaction;
  }

  /**
   * Get database name
   * @returns {string} Database filename
   */
  get name() {
    return this.filename;
  }

  /**
   * Get database memory status
   * @returns {boolean} True if in-memory database
   */
  get memory() {
    return this.filename === ':memory:';
  }

  /**
   * Get database readonly status
   * @returns {boolean} True if readonly
   */
  get readonly() {
    return this.options.readonly || false;
  }
}

/**
 * Mock Statement class
 * Simulates better-sqlite3 prepared statements
 */
class Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this._reader = false;
  }

  /**
   * Run the statement (for INSERT, UPDATE, DELETE)
   * @param {...any} params - Statement parameters
   * @returns {Object} Result info
   */
  run(...params) {
    // Mock implementation
    // For INSERT statements, simulate adding data
    if (this.sql.toLowerCase().includes('insert')) {
      // Check if it's for schema_migrations table
      if (this.sql.toLowerCase().includes('schema_migrations')) {
        const version = params[0];
        const name = params[1];
        const applied_at = params[2];
        this.database.data.set(`migration_${version}`, {
          _table: 'schema_migrations',
          version,
          name,
          applied_at
        });
        return { changes: 1, lastInsertRowid: version };
      }
      
      // Regular user_data inserts
      const key = params[0];
      const value = params[1];
      if (key && value !== undefined) {
        this.database.data.set(key, {
          _table: 'user_data',
          value: typeof value === 'string' ? value : JSON.stringify(value),
          timestamp: Date.now(),
          created_at: Date.now(),
          updated_at: Date.now()
        });
      }
      return { changes: 1, lastInsertRowid: this.database.data.size };
    }
    
    // For UPDATE statements
    if (this.sql.toLowerCase().includes('update')) {
      // Parameters order: value, timestamp, updated_at, key (from WHERE clause)
      const value = params[0];
      const timestamp = params[1];
      const updated_at = params[2];
      const key = params[3]; // key is last param in WHERE clause
      
      if (key && this.database.data.has(key)) {
        const existing = this.database.data.get(key);
        existing.value = value;
        existing.timestamp = timestamp;
        existing.updated_at = updated_at;
        return { changes: 1, lastInsertRowid: 0 };
      }
      return { changes: 0, lastInsertRowid: 0 };
    }
    
    // For DELETE statements
    if (this.sql.toLowerCase().includes('delete')) {
      // Check if it's for schema_migrations table
      if (this.sql.toLowerCase().includes('schema_migrations')) {
        const version = params[0];
        const key = `migration_${version}`;
        if (this.database.data.has(key)) {
          this.database.data.delete(key);
          return { changes: 1, lastInsertRowid: 0 };
        }
        return { changes: 0, lastInsertRowid: 0 };
      }
      
      // Regular user_data deletes
      const key = params[0];
      if (key && this.database.data.has(key)) {
        this.database.data.delete(key);
        return { changes: 1, lastInsertRowid: 0 };
      }
      return { changes: 0, lastInsertRowid: 0 };
    }
    
    return { changes: 0, lastInsertRowid: 0 };
  }

  /**
   * Get a single row (for SELECT)
   * @param {...any} params - Statement parameters
   * @returns {Object|undefined} Row data or undefined
   */
  get(...params) {
    // Mock implementation for sqlite_master queries
    if (this.sql.toLowerCase().includes('sqlite_master')) {
      // Check if querying for table
      if (this.sql.toLowerCase().includes("type='table'")) {
        const tableMatch = this.sql.match(/name='(\w+)'/);
        if (tableMatch) {
          const tableName = tableMatch[1];
          if (this.database.tables.has(tableName)) {
            return { name: tableName };
          }
        }
      }
      // Check if querying for index
      if (this.sql.toLowerCase().includes("type='index'")) {
        const indexMatch = this.sql.match(/name='(\w+)'/);
        if (indexMatch) {
          const indexName = indexMatch[1];
          if (this.database.indexes.has(indexName)) {
            return { name: indexName };
          }
        }
      }
      return undefined;
    }
    
    // Handle schema_migrations queries
    if (this.sql.toLowerCase().includes('schema_migrations')) {
      // MAX(version) query
      if (this.sql.toLowerCase().includes('max(version)')) {
        let maxVersion = 0;
        for (const [key, value] of this.database.data.entries()) {
          if (value._table === 'schema_migrations' && value.version > maxVersion) {
            maxVersion = value.version;
          }
        }
        return { version: maxVersion || null };
      }
      
      // SELECT with WHERE version = ? (parameterized)
      if (this.sql.toLowerCase().includes('where version = ?') && params.length > 0) {
        const version = params[0];
        const key = `migration_${version}`;
        if (this.database.data.has(key)) {
          const data = this.database.data.get(key);
          return {
            version: data.version,
            name: data.name,
            applied_at: data.applied_at
          };
        }
        return undefined;
      }
      
      // SELECT with WHERE version = <number> (literal)
      if (this.sql.toLowerCase().includes('where version =')) {
        const versionMatch = this.sql.match(/where version = (\d+)/i);
        if (versionMatch) {
          const version = parseInt(versionMatch[1], 10);
          const key = `migration_${version}`;
          if (this.database.data.has(key)) {
            const data = this.database.data.get(key);
            return {
              version: data.version,
              name: data.name,
              applied_at: data.applied_at
            };
          }
        }
        return undefined;
      }
      
      return undefined;
    }
    
    // Regular SELECT queries for user_data
    if (this.sql.toLowerCase().includes('select')) {
      const key = params[0];
      if (key && this.database.data.has(key)) {
        const data = this.database.data.get(key);
        if (data._table === 'user_data') {
          return {
            key: key,
            value: data.value,
            timestamp: data.timestamp,
            created_at: data.created_at,
            updated_at: data.updated_at
          };
        }
      }
    }
    return undefined;
  }

  /**
   * Get all rows (for SELECT)
   * @param {...any} params - Statement parameters
   * @returns {Array} Array of row data
   */
  all(...params) {
    // Handle schema_migrations queries
    if (this.sql.toLowerCase().includes('schema_migrations')) {
      const results = [];
      for (const [key, value] of this.database.data.entries()) {
        if (value._table === 'schema_migrations') {
          results.push({
            version: value.version,
            name: value.name,
            applied_at: value.applied_at
          });
        }
      }
      // Sort by version
      results.sort((a, b) => a.version - b.version);
      return results;
    }
    
    // Regular user_data queries
    const results = [];
    for (const [key, data] of this.database.data.entries()) {
      if (data._table === 'user_data') {
        results.push({
          key: key,
          value: data.value,
          timestamp: data.timestamp,
          created_at: data.created_at,
          updated_at: data.updated_at
        });
      }
    }
    return results;
  }

  /**
   * Iterate over rows
   * @param {...any} params - Statement parameters
   * @returns {Iterator} Row iterator
   */
  iterate(...params) {
    return this.all(...params)[Symbol.iterator]();
  }

  /**
   * Get the SQL source
   * @returns {string} SQL string
   */
  get source() {
    return this.sql;
  }

  /**
   * Check if statement returns data
   * @returns {boolean} True if SELECT statement
   */
  get reader() {
    return this.sql.toLowerCase().includes('select');
  }
}

/**
 * Helper function to create in-memory database for testing
 * @returns {Database} In-memory database instance
 */
function createInMemoryDatabase() {
  return new Database(':memory:');
}

/**
 * Helper function to reset database mock
 * @param {Database} db - Database instance to reset
 */
function resetDatabase(db) {
  if (db) {
    db.data.clear();
    db.statements.clear();
  }
}

// Export mock
module.exports = Database;
module.exports.Database = Database;
module.exports.Statement = Statement;
module.exports.createInMemoryDatabase = createInMemoryDatabase;
module.exports.resetDatabase = resetDatabase;
