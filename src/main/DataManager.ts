// Requirements: clerkly.1, clerkly.2

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MigrationRunner } from './MigrationRunner';

/**
 * Initialize result
 */
export interface InitializeResult {
  success: boolean;
  migrations?: {
    success: boolean;
    appliedCount: number;
    message: string;
  };
  warning?: string;
  path?: string;
}

/**
 * Save data result
 */
export interface SaveDataResult {
  success: boolean;
  error?: string;
}

/**
 * Load data result
 */
export interface LoadDataResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Delete data result
 */
export interface DeleteDataResult {
  success: boolean;
  error?: string;
}

/**
 * Manages local data storage using SQLite
 */
export class DataManager {
  private storagePath: string;
  private db: Database.Database | null = null;
  private migrationRunner: MigrationRunner | null = null;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  /**
   * Инициализирует локальное хранилище
   * Создает необходимые директории и файлы
   * Запускает миграции базы данных
   * Обрабатывает ошибки прав доступа (fallback на temp directory)
   * Обрабатывает поврежденные базы данных (backup и пересоздание)
   * Requirements: clerkly.1, clerkly.2   * @returns {InitializeResult}
   */
  initialize(): InitializeResult {
    try {
      // Создание директории хранилища
      let usedFallback = false;
      let fallbackPath: string | undefined;

      try {
        if (!fs.existsSync(this.storagePath)) {
          fs.mkdirSync(this.storagePath, { recursive: true });
        }
      } catch (dirError: unknown) {
        const errorObj = dirError as { code?: string };
        // Обработка ошибок прав доступа - fallback на temp directory
        if (errorObj.code === 'EACCES' || errorObj.code === 'EPERM') {
          console.warn('Permission denied, using temp directory');
          this.storagePath = path.join(os.tmpdir(), 'clerkly-fallback');
          usedFallback = true;
          fallbackPath = this.storagePath;

          // Создаем fallback директорию
          if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
          }
        } else {
          throw dirError;
        }
      }

      const dbPath = path.join(this.storagePath, 'clerkly.db');

      // Проверка поврежденной базы данных
      if (fs.existsSync(dbPath)) {
        try {
          const testDb = new Database(dbPath);
          testDb.prepare('SELECT 1').get();
          testDb.close();
        } catch {
          console.warn('Database corrupted, creating backup');
          const backupPath = path.join(this.storagePath, `clerkly.db.backup-${Date.now()}`);
          fs.copyFileSync(dbPath, backupPath);
          fs.unlinkSync(dbPath);
        }
      }

      // Открываем базу данных
      this.db = new Database(dbPath);

      // Запускаем миграции
      const migrationsPath = path.join(__dirname, '..', '..', 'migrations');
      this.migrationRunner = new MigrationRunner(this.db, migrationsPath);

      const migrationResult = this.migrationRunner.runMigrations();

      const result: InitializeResult = {
        success: true,
        migrations: {
          success: migrationResult.success,
          appliedCount: migrationResult.appliedCount || 0,
          message: migrationResult.message || migrationResult.error || '',
        },
      };

      if (usedFallback && fallbackPath) {
        result.warning = 'Using temporary directory';
        result.path = fallbackPath;
      }

      return result;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize storage: ${errorMessage}`);
    }
  }

  /**
   * Сохраняет данные локально
   * Валидирует key (non-empty string, max 1000 chars)
   * Сериализует value в JSON
   * Проверяет размер (max 10MB)
   * Обрабатывает ошибки (SQLITE_FULL, SQLITE_BUSY, SQLITE_LOCKED, SQLITE_READONLY)
   * Requirements: clerkly.1   * @param {string} key
   * @param {unknown} value
   * @returns {SaveDataResult}
   */
  saveData(key: string, value: unknown): SaveDataResult {
    try {
      // Валидация ключа
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Invalid key: must be non-empty string' };
      }

      if (key.length > 1000) {
        return { success: false, error: 'Invalid key: exceeds maximum length of 1000 characters' };
      }

      // Проверка инициализации базы данных
      if (!this.db || !this.db.open) {
        return { success: false, error: 'Database not initialized or closed' };
      }

      // Сериализация значения с поддержкой Infinity/-Infinity
      let serializedValue: string;
      try {
        serializedValue = JSON.stringify(value, (key, val) => {
          if (val === Infinity) return { __type: 'Infinity' };
          if (val === -Infinity) return { __type: '-Infinity' };
          if (typeof val === 'number' && isNaN(val)) return { __type: 'NaN' };
          return val;
        });
      } catch (serializeError: unknown) {
        const errorMessage =
          serializeError instanceof Error ? serializeError.message : 'Unknown error';
        return { success: false, error: `Failed to serialize value: ${errorMessage}` };
      }

      // Проверка размера (max 10MB)
      const sizeInBytes = Buffer.byteLength(serializedValue, 'utf8');
      if (sizeInBytes > 10 * 1024 * 1024) {
        return { success: false, error: 'Value too large: exceeds 10MB limit' };
      }

      // Сохранение в базу данных
      const timestamp = Date.now();
      const stmt = this.db.prepare(`
        INSERT INTO user_data (key, value, timestamp, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          timestamp = excluded.timestamp,
          updated_at = excluded.updated_at
      `);

      stmt.run(key, serializedValue, timestamp, timestamp, timestamp);

      return { success: true };
    } catch (writeError: unknown) {
      const errorObj = writeError as { code?: string; message?: string };
      // Обработка специфичных ошибок SQLite
      if (errorObj.code === 'SQLITE_FULL') {
        return { success: false, error: 'Database is full: no space left on device' };
      } else if (errorObj.code === 'SQLITE_BUSY' || errorObj.code === 'SQLITE_LOCKED') {
        return { success: false, error: 'Database is locked: try again later' };
      } else if (errorObj.code === 'SQLITE_READONLY') {
        return { success: false, error: 'Database is read-only: check permissions' };
      }
      const errorMessage = errorObj.message || 'Unknown error';
      return { success: false, error: `Database write failed: ${errorMessage}` };
    }
  }

  /**
   * Загружает данные из локального хранилища
   * Валидирует key
   * Десериализует JSON
   * Обрабатывает ошибки (SQLITE_BUSY, SQLITE_LOCKED)
   * Requirements: clerkly.1   * @param {string} key
   * @returns {LoadDataResult}
   */
  loadData(key: string): LoadDataResult {
    try {
      // Валидация ключа
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Invalid key: must be non-empty string' };
      }

      if (key.length > 1000) {
        return { success: false, error: 'Invalid key: exceeds maximum length of 1000 characters' };
      }

      // Проверка инициализации базы данных
      if (!this.db || !this.db.open) {
        return { success: false, error: 'Database not initialized or closed' };
      }

      // Запрос данных
      const row = this.db.prepare('SELECT value FROM user_data WHERE key = ?').get(key) as
        | { value: string }
        | undefined;

      if (!row) {
        return { success: false, error: 'Key not found' };
      }

      // Десериализация с поддержкой Infinity/-Infinity
      let data: unknown;
      try {
        data = JSON.parse(row.value, (key, val) => {
          if (val && typeof val === 'object' && val.__type) {
            if (val.__type === 'Infinity') return Infinity;
            if (val.__type === '-Infinity') return -Infinity;
            if (val.__type === 'NaN') return NaN;
          }
          return val;
        });
      } catch {
        // Fallback для plain string
        data = row.value;
      }

      return { success: true, data };
    } catch (queryError: unknown) {
      const errorObj = queryError as { code?: string; message?: string };
      if (errorObj.code === 'SQLITE_BUSY' || errorObj.code === 'SQLITE_LOCKED') {
        return { success: false, error: 'Database is locked: try again later' };
      }
      const errorMessage = errorObj.message || 'Unknown error';
      return { success: false, error: `Database query failed: ${errorMessage}` };
    }
  }

  /**
   * Удаляет данные из локального хранилища
   * Валидирует key
   * Обрабатывает ошибки
   * Requirements: clerkly.1   * @param {string} key
   * @returns {DeleteDataResult}
   */
  deleteData(key: string): DeleteDataResult {
    try {
      // Валидация ключа
      if (!key || typeof key !== 'string') {
        return { success: false, error: 'Invalid key: must be non-empty string' };
      }

      if (key.length > 1000) {
        return { success: false, error: 'Invalid key: exceeds maximum length of 1000 characters' };
      }

      // Проверка инициализации базы данных
      if (!this.db || !this.db.open) {
        return { success: false, error: 'Database not initialized or closed' };
      }

      // Удаление данных
      const stmt = this.db.prepare('DELETE FROM user_data WHERE key = ?');
      const result = stmt.run(key);

      if (result.changes === 0) {
        return { success: false, error: 'Key not found' };
      }

      return { success: true };
    } catch (deleteError: unknown) {
      const errorObj = deleteError as { code?: string; message?: string };
      if (errorObj.code === 'SQLITE_BUSY' || errorObj.code === 'SQLITE_LOCKED') {
        return { success: false, error: 'Database is locked: try again later' };
      } else if (errorObj.code === 'SQLITE_READONLY') {
        return { success: false, error: 'Database is read-only: check permissions' };
      }
      const errorMessage = errorObj.message || 'Unknown error';
      return { success: false, error: `Database delete failed: ${errorMessage}` };
    }
  }

  /**
   * Возвращает путь к локальному хранилищу
   * Requirements: clerkly.1   * @returns {string}
   */
  getStoragePath(): string {
    return this.storagePath;
  }

  /**
   * Закрывает соединение с базой данных
   * Requirements: clerkly.1   */
  close(): void {
    if (this.db && this.db.open) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Возвращает экземпляр Migration Runner
   * Requirements: clerkly.1   * @returns {MigrationRunner}
   */
  getMigrationRunner(): MigrationRunner {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const migrationsPath = path.join(__dirname, '..', '..', 'migrations');
    return new MigrationRunner(this.db, migrationsPath);
  }
}
