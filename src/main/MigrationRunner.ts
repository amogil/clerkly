// Requirements: clerkly.1

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean;
  appliedCount?: number;
  message?: string;
  error?: string;
}

/**
 * Migration status
 */
export interface MigrationStatus {
  currentVersion: number;
  appliedMigrations: number;
  pendingMigrations: number;
  totalMigrations: number;
  pending: Array<{ version: number; name: string }>;
}

/**
 * Migration file structure
 */
export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

/**
 * Manages database schema migrations
 */
export class MigrationRunner {
  private db: Database.Database;
  private migrationsPath: string;

  constructor(db: Database.Database, migrationsPath: string) {
    this.db = db;
    this.migrationsPath = migrationsPath;
  }

  /**
   * Инициализирует таблицу отслеживания миграций
   * Создает таблицу schema_migrations для отслеживания примененных миграций
   * Requirements: clerkly.1   */
  initializeMigrationTable(): void {
    try {
      this.db
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `
        )
        .run();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize migration table: ${errorMessage}`);
    }
  }

  /**
   * Возвращает текущую версию схемы
   * Requirements: clerkly.1   * @returns {number} Текущая версия схемы (0 если миграции не применены)
   */
  getCurrentVersion(): number {
    try {
      this.initializeMigrationTable();

      const row = this.db
        .prepare('SELECT MAX(version) as version FROM schema_migrations')
        .get() as { version: number | null };

      return row.version ?? 0;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get current version: ${errorMessage}`);
    }
  }

  /**
   * Возвращает список примененных версий миграций
   * Requirements: clerkly.1   * @returns {number[]} Массив примененных версий миграций
   */
  getAppliedMigrations(): number[] {
    try {
      this.initializeMigrationTable();

      const rows = this.db
        .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
        .all() as Array<{ version: number }>;

      return rows.map((row) => row.version);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get applied migrations: ${errorMessage}`);
    }
  }

  /**
   * Загружает файлы миграций из директории
   * Requirements: clerkly.1   * @returns {Migration[]} Массив объектов миграций, отсортированных по версии
   */
  loadMigrations(): Migration[] {
    try {
      // Проверяем существование директории миграций
      if (!fs.existsSync(this.migrationsPath)) {
        return [];
      }

      const files = fs.readdirSync(this.migrationsPath);
      const migrations: Migration[] = [];

      for (const file of files) {
        // Пропускаем не-SQL файлы и .gitkeep
        if (!file.endsWith('.sql') || file === '.gitkeep') {
          continue;
        }

        // Парсим имя файла: 001_initial_schema.sql
        const match = file.match(/^(\d+)_(.+)\.sql$/);
        if (!match) {
          console.warn(`Skipping invalid migration file: ${file}`);
          continue;
        }

        const version = parseInt(match[1], 10);
        const name = match[2];

        // Читаем содержимое файла
        const filePath = path.join(this.migrationsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Разделяем на up и down миграции
        const parts = content.split('-- DOWN');
        const up = parts[0].replace('-- UP', '').trim();
        const down = parts[1] ? parts[1].trim() : '';

        // Валидация: up миграция обязательна
        if (!up) {
          throw new Error(`Migration ${file} has empty UP section`);
        }

        migrations.push({
          version,
          name,
          up,
          down,
        });
      }

      // Сортируем по версии
      migrations.sort((a, b) => a.version - b.version);

      // Валидация: проверяем уникальность версий
      const versions = migrations.map((m) => m.version);
      const uniqueVersions = new Set(versions);
      if (versions.length !== uniqueVersions.size) {
        throw new Error('Duplicate migration versions found');
      }

      return migrations;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to load migrations: ${errorMessage}`);
    }
  }

  /**
   * Запускает все pending миграции
   * Создает таблицу migrations для отслеживания
   * Выполняет миграции в порядке возрастания версий
   * Requirements: clerkly.1   * @returns {MigrationResult}
   */
  runMigrations(): MigrationResult {
    try {
      // Инициализируем таблицу миграций
      this.initializeMigrationTable();

      // Загружаем все миграции
      const allMigrations = this.loadMigrations();

      if (allMigrations.length === 0) {
        return {
          success: true,
          appliedCount: 0,
          message: 'No migrations found',
        };
      }

      // Получаем примененные миграции
      const appliedVersions = new Set(this.getAppliedMigrations());

      // Фильтруем pending миграции
      const pendingMigrations = allMigrations.filter((m) => !appliedVersions.has(m.version));

      if (pendingMigrations.length === 0) {
        return {
          success: true,
          appliedCount: 0,
          message: 'All migrations already applied',
        };
      }

      // Применяем каждую pending миграцию в транзакции
      let appliedCount = 0;

      for (const migration of pendingMigrations) {
        try {
          // Выполняем миграцию в транзакции
          const applyMigration = this.db.transaction(() => {
            // Выполняем UP миграцию
            this.db.exec(migration.up);

            // Записываем в таблицу миграций
            this.db
              .prepare(
                `
              INSERT INTO schema_migrations (version, name, applied_at)
              VALUES (?, ?, ?)
            `
              )
              .run(migration.version, migration.name, Date.now());
          });

          applyMigration();
          appliedCount++;

          console.log(`Applied migration ${migration.version}_${migration.name}`);
        } catch (migrationError: unknown) {
          const errorMessage =
            migrationError instanceof Error ? migrationError.message : 'Unknown error';
          // Откат при ошибке миграции
          return {
            success: false,
            appliedCount,
            error: `Failed to apply migration ${migration.version}_${migration.name}: ${errorMessage}`,
          };
        }
      }

      return {
        success: true,
        appliedCount,
        message: `Successfully applied ${appliedCount} migration(s)`,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        appliedCount: 0,
        error: `Migration execution failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Откатывает последнюю примененную миграцию
   * Requirements: clerkly.1   * @returns {MigrationResult}
   */
  rollbackLastMigration(): MigrationResult {
    try {
      // Инициализируем таблицу миграций
      this.initializeMigrationTable();

      // Получаем последнюю примененную миграцию
      const lastMigration = this.db
        .prepare(
          `
        SELECT version, name FROM schema_migrations
        ORDER BY version DESC
        LIMIT 1
      `
        )
        .get() as { version: number; name: string } | undefined;

      if (!lastMigration) {
        return {
          success: false,
          error: 'No migrations to rollback',
        };
      }

      // Загружаем все миграции
      const allMigrations = this.loadMigrations();

      // Находим миграцию для отката
      const migration = allMigrations.find((m) => m.version === lastMigration.version);

      if (!migration) {
        return {
          success: false,
          error: `Migration file not found for version ${lastMigration.version}`,
        };
      }

      // Проверяем наличие DOWN миграции
      if (!migration.down) {
        return {
          success: false,
          error: `Migration ${migration.version}_${migration.name} has no DOWN section`,
        };
      }

      // Выполняем откат в транзакции
      try {
        const rollback = this.db.transaction(() => {
          // Выполняем DOWN миграцию
          this.db.exec(migration.down);

          // Удаляем запись из таблицы миграций
          this.db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(migration.version);
        });

        rollback();

        console.log(`Rolled back migration ${migration.version}_${migration.name}`);

        return {
          success: true,
          appliedCount: 1,
          message: `Successfully rolled back migration ${migration.version}_${migration.name}`,
        };
      } catch (rollbackError: unknown) {
        const errorMessage =
          rollbackError instanceof Error ? rollbackError.message : 'Unknown error';
        return {
          success: false,
          error: `Failed to rollback migration ${migration.version}_${migration.name}: ${errorMessage}`,
        };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Rollback failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Возвращает статус миграций
   * Requirements: clerkly.1   * @returns {MigrationStatus}
   */
  getStatus(): MigrationStatus {
    try {
      // Инициализируем таблицу миграций
      this.initializeMigrationTable();

      // Получаем текущую версию
      const currentVersion = this.getCurrentVersion();

      // Загружаем все миграции
      const allMigrations = this.loadMigrations();

      // Получаем примененные миграции
      const appliedVersions = new Set(this.getAppliedMigrations());

      // Фильтруем pending миграции
      const pendingMigrations = allMigrations
        .filter((m) => !appliedVersions.has(m.version))
        .map((m) => ({
          version: m.version,
          name: m.name,
        }));

      return {
        currentVersion,
        appliedMigrations: appliedVersions.size,
        pendingMigrations: pendingMigrations.length,
        totalMigrations: allMigrations.length,
        pending: pendingMigrations,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get migration status: ${errorMessage}`);
    }
  }
}
