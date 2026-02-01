// Requirements: clerkly.2.1, clerkly.2.5

class Database {
  filename: string;
  options: any;
  isOpen: boolean;
  _inTransaction: boolean;
  data: Map<string, any>;
  statements: Map<string, Statement>;
  tables: Set<string>;
  indexes: Set<string>;

  constructor(filename: string, options: any = {}) {
    this.filename = filename;
    this.options = options;
    this.isOpen = true;
    this._inTransaction = false;
    this.data = new Map();
    this.statements = new Map();
    this.tables = new Set();
    this.indexes = new Set();
  }

  prepare(sql: string): Statement {
    const statement = new Statement(this, sql);
    this.statements.set(sql, statement);
    return statement;
  }

  exec(sql: string): { changes: number; lastInsertRowid: number } {
    if (sql.toLowerCase().includes('create table')) {
      const tableMatch = sql.match(/create table (?:if not exists )?(\w+)/i);
      if (tableMatch) {
        this.tables.add(tableMatch[1]);
      }
    }
    
    if (sql.toLowerCase().includes('drop table')) {
      const tableMatch = sql.match(/drop table (?:if exists )?(\w+)/i);
      if (tableMatch) {
        this.tables.delete(tableMatch[1]);
        const tableName = tableMatch[1];
        for (const [key, value] of this.data.entries()) {
          if (value._table === tableName) {
            this.data.delete(key);
          }
        }
      }
    }
    
    if (sql.toLowerCase().includes('create index')) {
      const indexMatch = sql.match(/create index (?:if not exists )?(\w+)/i);
      if (indexMatch) {
        this.indexes.add(indexMatch[1]);
      }
    }
    
    if (sql.toLowerCase().includes('drop index')) {
      const indexMatch = sql.match(/drop index (?:if exists )?(\w+)/i);
      if (indexMatch) {
        this.indexes.delete(indexMatch[1]);
      }
    }
    
    return { changes: 0, lastInsertRowid: 0 };
  }

  close(): void {
    this.isOpen = false;
  }

  transaction(fn: Function): Function {
    return (...args: any[]) => {
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

  pragma(name: string, simple = false): any {
    const pragmas: any = {
      journal_mode: 'wal',
      synchronous: 'normal',
      foreign_keys: 1
    };
    return simple ? pragmas[name] : { [name]: pragmas[name] };
  }

  get open(): boolean {
    return this.isOpen;
  }

  get inTransaction(): boolean {
    return this._inTransaction;
  }

  get name(): string {
    return this.filename;
  }

  get memory(): boolean {
    return this.filename === ':memory:';
  }

  get readonly(): boolean {
    return this.options.readonly || false;
  }
}

class Statement {
  database: Database;
  sql: string;
  _reader: boolean;

  constructor(database: Database, sql: string) {
    this.database = database;
    this.sql = sql;
    this._reader = false;
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number } {
    if (this.sql.toLowerCase().includes('insert')) {
      if (this.sql.toLowerCase().includes('schema_migrations')) {
        const [version, name, applied_at] = params;
        this.database.data.set(`migration_${version}`, {
          _table: 'schema_migrations',
          version,
          name,
          applied_at
        });
        return { changes: 1, lastInsertRowid: version };
      }
      
      const [key, value] = params;
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
    
    if (this.sql.toLowerCase().includes('update')) {
      const [value, timestamp, updated_at, key] = params;
      
      if (key && this.database.data.has(key)) {
        const existing = this.database.data.get(key);
        existing.value = value;
        existing.timestamp = timestamp;
        existing.updated_at = updated_at;
        return { changes: 1, lastInsertRowid: 0 };
      }
      return { changes: 0, lastInsertRowid: 0 };
    }
    
    if (this.sql.toLowerCase().includes('delete')) {
      if (this.sql.toLowerCase().includes('schema_migrations')) {
        const [version] = params;
        const key = `migration_${version}`;
        if (this.database.data.has(key)) {
          this.database.data.delete(key);
          return { changes: 1, lastInsertRowid: 0 };
        }
        return { changes: 0, lastInsertRowid: 0 };
      }
      
      const [key] = params;
      if (key && this.database.data.has(key)) {
        this.database.data.delete(key);
        return { changes: 1, lastInsertRowid: 0 };
      }
      return { changes: 0, lastInsertRowid: 0 };
    }
    
    return { changes: 0, lastInsertRowid: 0 };
  }

  get(...params: any[]): any {
    if (this.sql.toLowerCase().includes('sqlite_master')) {
      if (this.sql.toLowerCase().includes("type='table'")) {
        const tableMatch = this.sql.match(/name='(\w+)'/);
        if (tableMatch) {
          const tableName = tableMatch[1];
          if (this.database.tables.has(tableName)) {
            return { name: tableName };
          }
        }
      }
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
    
    if (this.sql.toLowerCase().includes('schema_migrations')) {
      if (this.sql.toLowerCase().includes('max(version)')) {
        let maxVersion = 0;
        for (const [key, value] of this.database.data.entries()) {
          if (value._table === 'schema_migrations' && value.version > maxVersion) {
            maxVersion = value.version;
          }
        }
        return { version: maxVersion || null };
      }
      
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
    
    if (this.sql.toLowerCase().includes('select')) {
      const [key] = params;
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

  all(...params: any[]): any[] {
    if (this.sql.toLowerCase().includes('schema_migrations')) {
      const results: any[] = [];
      for (const [key, value] of this.database.data.entries()) {
        if (value._table === 'schema_migrations') {
          results.push({
            version: value.version,
            name: value.name,
            applied_at: value.applied_at
          });
        }
      }
      results.sort((a, b) => a.version - b.version);
      return results;
    }
    
    const results: any[] = [];
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

  iterate(...params: any[]): Iterator<any> {
    return this.all(...params)[Symbol.iterator]();
  }

  get source(): string {
    return this.sql;
  }

  get reader(): boolean {
    return this.sql.toLowerCase().includes('select');
  }
}

function createInMemoryDatabase(): Database {
  return new Database(':memory:');
}

function resetDatabase(db: Database): void {
  if (db) {
    db.data.clear();
    db.statements.clear();
  }
}

export default Database;
export { Database, Statement, createInMemoryDatabase, resetDatabase };
