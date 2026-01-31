# Документ Дизайна - Хранение Данных и Персистентность

## Введение

Этот документ описывает техническую архитектуру системы хранения данных на основе SQLite, включая систему миграций, резервное копирование и управление состоянием приложения.

## Архитектурный Обзор

### Архитектура Хранения Данных

```
┌─────────────────┐    Инициализация    ┌─────────────────┐
│   Main Process  │────────────────────►│ Database Manager│
│                 │                     │ (src/db/index)  │
└─────────────────┘                     └─────────────────┘
                                                │
                                        Проверка версии
                                                │
                                                ▼
┌─────────────────┐    Если нужно       ┌─────────────────┐
│ Backup System   │◄───────────────────│ Migration System│
│                 │                     │ (src/db/migrations)│
└─────────────────┘                     └─────────────────┘
         │                                       │
         ▼                                       ▼
┌─────────────────┐                     ┌─────────────────┐
│ SQLite Database │◄────────────────────│ Schema Updates  │
│ (clerkly.sqlite3)│                     │                 │
└─────────────────┘                     └─────────────────┘
```

## Компонентная Архитектура

### 1. Database Manager (src/db/index.ts)

**Инициализация БД**:

```typescript
const getDatabasePath = (): string => {
  const userDataPath = app.getPath("userData");
  fs.mkdirSync(userDataPath, { recursive: true });
  return path.join(userDataPath, "clerkly.sqlite3");
};

export const ensureDatabase = (): SqliteDatabase => {
  const dbPath = getDatabasePath();
  const db = new Database(dbPath);

  // Включение WAL режима для лучшей производительности
  db.pragma("journal_mode = WAL");

  ensureMigrationsTable(db);
  runPendingMigrations(db);

  return db;
};
```

**Управление Миграциями**:

```typescript
const ensureMigrationsTable = (db: SqliteDatabase): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER NOT NULL
    );
  `);

  // Инициализация версии 0 для новых БД
  const row = db.prepare("SELECT version FROM schema_migrations LIMIT 1").get();
  if (!row) {
    db.prepare("INSERT INTO schema_migrations (version) VALUES (0)").run();
  }
};
```

### 2. Migration System (src/db/migrations.ts)

**Структура Миграции**:

```typescript
export type Migration = {
  id: number;
  name: string;
  up: (db: SqliteDatabase) => void;
};
```

**Текущие Миграции**:

```typescript
export const migrations: Migration[] = [
  {
    id: 1,
    name: "initial-schema",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS app_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    },
  },
  {
    id: 2,
    name: "auth-tokens",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS auth_tokens (
          id INTEGER PRIMARY KEY,
          encrypted TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
];
```

**Планируемые Миграции**:

```typescript
// Migration 3: UI Settings
{
  id: 3,
  name: "ui-settings",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ui_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
    `)
  }
}

// Migration 4: Calendar Cache
{
  id: 4,
  name: "calendar-cache",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        description TEXT,
        location TEXT,
        cached_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX idx_calendar_events_time ON calendar_events(start_time, end_time);
    `)
  }
}

// Migration 5: Contacts Cache
{
  id: 5,
  name: "contacts-cache",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        google_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        cached_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX idx_contacts_name ON contacts(name);
    `)
  }
}

// Migration 6: Tasks Storage
{
  id: 6,
  name: "tasks-storage",
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        completed BOOLEAN NOT NULL DEFAULT 0,
        due_date INTEGER,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE INDEX idx_tasks_completed ON tasks(completed);
      CREATE INDEX idx_tasks_due_date ON tasks(due_date);
    `)
  }
}
```

### 3. Backup System

**Создание Резервных Копий**:

```typescript
const createBackup = (dbPath: string): void => {
  const backupDir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `clerkly-${timestamp}.sqlite3`);

  fs.copyFileSync(dbPath, backupPath);

  // Очистка старых бэкапов (оставляем последние 3)
  cleanupOldBackups(backupDir);
};

const cleanupOldBackups = (backupDir: string): void => {
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.startsWith("clerkly-") && f.endsWith(".sqlite3"))
    .map((f) => ({
      name: f,
      path: path.join(backupDir, f),
      mtime: fs.statSync(path.join(backupDir, f)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  // Удаляем все кроме последних 3
  files.slice(3).forEach((file) => {
    fs.unlinkSync(file.path);
  });
};
```

### 4. Application State Management

**Сайдбар Состояние**:

```typescript
const SIDEBAR_STATE_KEY = "sidebar_collapsed";

export const getSidebarCollapsed = (db: SqliteDatabase): boolean => {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(SIDEBAR_STATE_KEY);
  return row ? JSON.parse(row.value) : false; // По умолчанию развернут
};

export const setSidebarCollapsed = (db: SqliteDatabase, collapsed: boolean): void => {
  db.prepare(
    `
    INSERT OR REPLACE INTO app_meta (key, value) 
    VALUES (?, ?)
  `,
  ).run(SIDEBAR_STATE_KEY, JSON.stringify(collapsed));
};
```

**Общие Настройки UI**:

```typescript
export const getUISetting = (db: SqliteDatabase, key: string, defaultValue: any): any => {
  const row = db.prepare("SELECT value FROM ui_settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : defaultValue;
};

export const setUISetting = (db: SqliteDatabase, key: string, value: any): void => {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `
    INSERT OR REPLACE INTO ui_settings (key, value, updated_at) 
    VALUES (?, ?, ?)
  `,
  ).run(key, JSON.stringify(value), now);
};
```

## Производительность и Оптимизация

### WAL Mode

```typescript
// Включение Write-Ahead Logging для лучшей производительности
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("cache_size = 1000");
db.pragma("temp_store = memory");
```

### Prepared Statements

```typescript
// Кэширование подготовленных запросов
const statements = {
  getAppMeta: db.prepare("SELECT value FROM app_meta WHERE key = ?"),
  setAppMeta: db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)"),
  getAuthTokens: db.prepare("SELECT encrypted FROM auth_tokens WHERE id = 1"),
  setAuthTokens: db.prepare(
    "INSERT OR REPLACE INTO auth_tokens (id, encrypted, updated_at) VALUES (1, ?, ?)",
  ),
};
```

### Индексы

```sql
-- Для быстрого поиска по времени
CREATE INDEX idx_calendar_events_time ON calendar_events(start_time, end_time);

-- Для поиска контактов по имени
CREATE INDEX idx_contacts_name ON contacts(name);

-- Для фильтрации задач
CREATE INDEX idx_tasks_completed ON tasks(completed);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
```

## Безопасность

### Права Доступа к Файлам

```typescript
// Ограничение доступа к файлу БД (только владелец)
fs.chmodSync(dbPath, 0o600);
```

### Валидация Данных

```typescript
const validateMigrationId = (id: number): boolean => {
  return Number.isInteger(id) && id > 0 && id <= 1000;
};

const sanitizeKey = (key: string): string => {
  return key.replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 100);
};
```

## Свойства Корректности

### Свойство 1: Атомарность Миграций

**Описание**: Миграции должны выполняться атомарно - либо полностью успешно, либо откатываться

**Формальное Свойство**:

```
∀ migration : Migration
  WHEN runMigration(migration)
  THEN (migration.success = true AND db.version = migration.id)
    OR (migration.success = false AND db.version = previous_version)
```

### Свойство 2: Целостность Резервных Копий

**Описание**: Резервная копия должна создаваться до каждой миграции

**Формальное Свойство**:

```
∀ migration : Migration
  WHEN migration.id > current_version
  THEN ∃ backup_file : File
    WHERE backup_file.created_at < migration.started_at
    AND backup_file.content = db.content_before_migration
```

### Свойство 3: Монотонность Версий

**Описание**: Версия схемы БД должна только увеличиваться

**Формальное Свойство**:

```
∀ t1, t2 : Time
  WHERE t1 < t2
  THEN db.version(t1) ≤ db.version(t2)
```

### Свойство 4: Персистентность Состояния

**Описание**: Сохраненное состояние должно восстанавливаться после перезапуска

**Формальное Свойство**:

```
∀ key : String, value : Any
  WHEN setState(key, value) AND app.restart()
  THEN getState(key) = value
```

## Мониторинг и Диагностика

### Метрики БД

```typescript
export const getDatabaseStats = (db: SqliteDatabase) => {
  return {
    version: getCurrentVersion(db),
    size: fs.statSync(getDatabasePath()).size,
    pageCount: db.pragma("page_count", { simple: true }),
    pageSize: db.pragma("page_size", { simple: true }),
    walMode: db.pragma("journal_mode", { simple: true }) === "wal",
  };
};
```

### Проверка Целостности

```typescript
export const checkDatabaseIntegrity = (db: SqliteDatabase): boolean => {
  const result = db.pragma("integrity_check", { simple: true });
  return result === "ok";
};
```

## Тестирование

### Unit Tests

- Тестирование миграций в изоляции
- Проверка создания резервных копий
- Валидация сохранения/загрузки состояния
- Тестирование обработки ошибок

### Integration Tests

- E2E тестирование полного цикла миграций
- Проверка восстановления из резервных копий
- Тестирование производительности с большими данными

### Property-Based Tests

- Генерация различных состояний приложения
- Тестирование миграций с различными начальными данными
- Проверка целостности при различных сценариях сбоев

## Интеграционные Точки

### Предоставляемые Интерфейсы

1. **Database Connection**: Подключение к SQLite БД
2. **Migration System**: Система версионирования схемы
3. **State Management**: Сохранение состояния приложения
4. **Backup System**: Резервное копирование данных

### Зависимости

- **platform-foundation**: Доступ к userData директории, файловая система

### Используется Фичами

- **google-oauth-auth**: Хранение зашифрованных токенов
- **sidebar-navigation**: Сохранение состояния сайдбара
- **Будущие фичи**: Кэш календаря, контакты, задачи
