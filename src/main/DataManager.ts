// Requirements: clerkly.1.4
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import MigrationRunner from './MigrationRunner';

interface InitializeResult {
  success: boolean;
  migrations?: {
    success: boolean;
    appliedCount: number;
    message: string;
  };
  warning?: string;
  path?: string;
}

interface SaveDataResult {
  success: boolean;
  error?: string;
}

interface LoadDataResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface DeleteDataResult {
  success: boolean;
  error?: string;
}

class DataManager {
  public storagePath: string;
  private db: Database.Database | null = null;

  // Requirements: clerkly.1.4
  constructor(storagePath: string) {
    if (!storagePath || typeof storagePath !== 'string') {
      throw new Error('Invalid storagePath: must be non-empty string');
    }
    this.storagePath = storagePath;
  }

  // Requirements: clerkly.1.4
  initialize(): InitializeResult {
    try {
      // Create storage directory if it doesn't exist
      if (!fs.existsSync(this.storagePath)) {
        try {
          fs.mkdirSync(this.storagePath, { recursive: true });
        } catch (dirError: any) {
          // Handle permission errors - try to use temp directory
          if (dirError.code === 'EACCES' || dirError.code === 'EPERM') {
            console.warn(`Permission denied for ${this.storagePath}, using temp directory`);
            const tempPath = path.join(os.tmpdir(), 'clerkly-fallback');
            this.storagePath = tempPath;
            fs.mkdirSync(this.storagePath, { recursive: true });
            return {
              success: true,
              warning: 'Using temporary directory due to permission issues',
              path: this.storagePath
            };
          }
          throw dirError;
        }
      }

      // Verify write permissions
      try {
        const testFile = path.join(this.storagePath, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (permError: any) {
        if (permError.code === 'EACCES' || permError.code === 'EPERM') {
          console.warn(`No write permission for ${this.storagePath}, using temp directory`);
          const tempPath = path.join(os.tmpdir(), 'clerkly-fallback');
          this.storagePath = tempPath;
          if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
          }
          return {
            success: true,
            warning: 'Using temporary directory due to permission issues',
            path: this.storagePath
          };
        }
        throw permError;
      }

      // Create database file path
      const dbPath = path.join(this.storagePath, 'clerkly.db');

      // Check if database file exists and is corrupted
      if (fs.existsSync(dbPath)) {
        try {
          // Try to open the database to check if it's corrupted
          const testDb = new Database(dbPath);
          testDb.prepare('SELECT 1').get();
          testDb.close();
        } catch (corruptError) {
          console.warn('Database appears corrupted, creating backup and new database');
          // Create backup of corrupted database
          const backupPath = path.join(
            this.storagePath,
            `clerkly.db.backup-${Date.now()}`
          );
          fs.copyFileSync(dbPath, backupPath);
          // Remove corrupted database
          fs.unlinkSync(dbPath);
          console.log(`Corrupted database backed up to: ${backupPath}`);
        }
      }

      // Open database connection
      try {
        this.db = new Database(dbPath);
      } catch (dbError) {
        // If database opening fails, try to recover
        if (fs.existsSync(dbPath)) {
          console.warn('Failed to open database, attempting recovery');
          const backupPath = path.join(
            this.storagePath,
            `clerkly.db.backup-${Date.now()}`
          );
          fs.copyFileSync(dbPath, backupPath);
          fs.unlinkSync(dbPath);
          this.db = new Database(dbPath);
          console.log(`Database recreated, backup saved to: ${backupPath}`);
        } else {
          throw dbError;
        }
      }

      // Run migrations to set up schema
      const migrationsPath = path.join(__dirname, 'migrations');
      const migrationRunner = new MigrationRunner(this.db, migrationsPath);
      const migrationResult = migrationRunner.runMigrations();

      if (!migrationResult.success) {
        throw new Error(`Migration failed: ${migrationResult.error}`);
      }

      return { success: true, migrations: migrationResult as any };
    } catch (error: any) {
      console.error('Failed to initialize database:', error);
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  // Requirements: clerkly.1.4
  saveData(key: string, value: any): SaveDataResult {
    try {
      // Validate key
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Invalid key: must be non-empty string' };
      }

      // Validate key length (SQLite has limits)
      if (key.length > 1000) {
        return { success: false, error: 'Invalid key: exceeds maximum length of 1000 characters' };
      }

      // Check if database is initialized
      if (!this.db) {
        return { success: false, error: 'Database not initialized' };
      }

      // Check if database is open
      if (!this.db.open) {
        return { success: false, error: 'Database connection is closed' };
      }

      // Serialize value to JSON string
      let serializedValue: string;
      try {
        // Always JSON.stringify to ensure consistent round-trip behavior
        serializedValue = JSON.stringify(value);
      } catch (serializeError: any) {
        return { success: false, error: `Failed to serialize value: ${serializeError.message}` };
      }

      // Validate serialized value size (prevent extremely large values)
      if (serializedValue.length > 10 * 1024 * 1024) { // 10MB limit
        return { success: false, error: 'Value too large: exceeds 10MB limit' };
      }

      const timestamp = Date.now();

      // Check if key already exists
      let existingData: any;
      try {
        existingData = this.db.prepare('SELECT key FROM user_data WHERE key = ?').get(key);
      } catch (queryError: any) {
        return { success: false, error: `Database query failed: ${queryError.message}` };
      }

      try {
        if (existingData) {
          // Update existing record
          const stmt = this.db.prepare(`
            UPDATE user_data 
            SET value = ?, timestamp = ?, updated_at = ?
            WHERE key = ?
          `);
          stmt.run(serializedValue, timestamp, timestamp, key);
        } else {
          // Insert new record
          const stmt = this.db.prepare(`
            INSERT INTO user_data (key, value, timestamp, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `);
          stmt.run(key, serializedValue, timestamp, timestamp, timestamp);
        }
      } catch (writeError: any) {
        // Handle database write errors
        if (writeError.code === 'SQLITE_FULL') {
          return { success: false, error: 'Database is full: no space left on device' };
        } else if (writeError.code === 'SQLITE_BUSY' || writeError.code === 'SQLITE_LOCKED') {
          return { success: false, error: 'Database is locked: try again later' };
        } else if (writeError.code === 'SQLITE_READONLY') {
          return { success: false, error: 'Database is read-only: check permissions' };
        }
        return { success: false, error: `Database write failed: ${writeError.message}` };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Failed to save data:', error);
      return { success: false, error: error.message };
    }
  }

  // Requirements: clerkly.1.4
  loadData(key: string): LoadDataResult {
    try {
      // Validate key
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Invalid key: must be non-empty string' };
      }

      // Validate key length
      if (key.length > 1000) {
        return { success: false, error: 'Invalid key: exceeds maximum length of 1000 characters' };
      }

      // Check if database is initialized
      if (!this.db) {
        return { success: false, error: 'Database not initialized' };
      }

      // Check if database is open
      if (!this.db.open) {
        return { success: false, error: 'Database connection is closed' };
      }

      // Query data from database
      let row: any;
      try {
        const stmt = this.db.prepare('SELECT value FROM user_data WHERE key = ?');
        row = stmt.get(key);
      } catch (queryError: any) {
        if (queryError.code === 'SQLITE_BUSY' || queryError.code === 'SQLITE_LOCKED') {
          return { success: false, error: 'Database is locked: try again later' };
        }
        return { success: false, error: `Database query failed: ${queryError.message}` };
      }

      if (!row) {
        return { success: false, error: 'Key not found' };
      }

      // Deserialize value
      let data: any;
      try {
        data = JSON.parse(row.value);
      } catch (e) {
        // If parsing fails, return as string
        data = row.value;
      }

      return { success: true, data };
    } catch (error: any) {
      console.error('Failed to load data:', error);
      return { success: false, error: error.message };
    }
  }

  // Requirements: clerkly.1.4
  deleteData(key: string): DeleteDataResult {
    try {
      // Validate key
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Invalid key: must be non-empty string' };
      }

      // Validate key length
      if (key.length > 1000) {
        return { success: false, error: 'Invalid key: exceeds maximum length of 1000 characters' };
      }

      // Check if database is initialized
      if (!this.db) {
        return { success: false, error: 'Database not initialized' };
      }

      // Check if database is open
      if (!this.db.open) {
        return { success: false, error: 'Database connection is closed' };
      }

      // Delete data from database
      let result: any;
      try {
        const stmt = this.db.prepare('DELETE FROM user_data WHERE key = ?');
        result = stmt.run(key);
      } catch (deleteError: any) {
        if (deleteError.code === 'SQLITE_BUSY' || deleteError.code === 'SQLITE_LOCKED') {
          return { success: false, error: 'Database is locked: try again later' };
        } else if (deleteError.code === 'SQLITE_READONLY') {
          return { success: false, error: 'Database is read-only: check permissions' };
        }
        return { success: false, error: `Database delete failed: ${deleteError.message}` };
      }

      if (result.changes === 0) {
        return { success: false, error: 'Key not found' };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete data:', error);
      return { success: false, error: error.message };
    }
  }

  // Requirements: clerkly.1.4
  getStoragePath(): string {
    return this.storagePath;
  }

  // Requirements: clerkly.1.4
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // Requirements: clerkly.1.4
  getMigrationRunner(): MigrationRunner {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    const migrationsPath = path.join(__dirname, 'migrations');
    return new MigrationRunner(this.db, migrationsPath);
  }
}

export default DataManager;
