# Список Задач - Хранение Данных и Персистентность

## Текущий Статус

**Анализ соответствия коду**: 85% (17/20 требований реализовано)

### Реализованные Компоненты

- ✅ SQLite база данных с WAL режимом
- ✅ Система миграций с версионированием
- ✅ Базовые таблицы (app_meta, auth_tokens)
- ✅ Функции сохранения состояния приложения

### Пропущенные Компоненты

- ❌ Система резервного копирования
- ❌ Планируемые миграции (ui_settings, calendar_cache, contacts, tasks)
- ❌ Очистка старых резервных копий

## Задачи

### 1. Система Резервного Копирования

#### 1.1 Реализовать создание резервных копий

- [ ] Создать функцию `createBackup()` в `src/db/migrations.ts`
- [ ] Добавить создание директории `backups` в userData
- [ ] Реализовать копирование файла БД с временной меткой
- [ ] Интегрировать создание бэкапа перед каждой миграцией

**Детали реализации**:

```typescript
const createBackup = (dbPath: string): void => {
  const backupDir = path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `clerkly-${timestamp}.sqlite3`);

  fs.copyFileSync(dbPath, backupPath);
  cleanupOldBackups(backupDir);
};
```

**Критерии приемки**:

- Резервная копия создается перед каждой миграцией
- Файл бэкапа имеет корректную временную метку
- Директория backups создается автоматически

#### 1.2 Реализовать очистку старых резервных копий

- [ ] Создать функцию `cleanupOldBackups()`
- [ ] Сохранять только последние 3 резервные копии
- [ ] Сортировать файлы по времени модификации
- [ ] Удалять старые файлы безопасно

**Детали реализации**:

```typescript
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

  files.slice(3).forEach((file) => fs.unlinkSync(file.path));
};
```

**Критерии приемки**:

- Сохраняются только последние 3 бэкапа
- Старые файлы удаляются корректно
- Обработка ошибок при удалении файлов

### 2. Планируемые Миграции

#### 2.1 Миграция UI Settings (Migration 3)

- [ ] Добавить миграцию для таблицы `ui_settings`
- [ ] Создать индекс по полю `updated_at`
- [ ] Добавить функции `getUISetting()` и `setUISetting()`
- [ ] Протестировать сохранение/загрузку настроек UI

**SQL схема**:

```sql
CREATE TABLE IF NOT EXISTS ui_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
```

**Критерии приемки**:

- Таблица создается корректно
- Функции сохранения/загрузки работают
- Значения по умолчанию применяются правильно

#### 2.2 Миграция Calendar Cache (Migration 4)

- [ ] Добавить миграцию для таблицы `calendar_events`
- [ ] Создать индексы для оптимизации запросов по времени
- [ ] Добавить поля для Google Calendar интеграции
- [ ] Реализовать функции кэширования событий

**SQL схема**:

```sql
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
```

**Критерии приемки**:

- Таблица и индексы создаются корректно
- Поддержка Google Calendar ID
- Оптимизированные запросы по времени

#### 2.3 Миграция Contacts Cache (Migration 5)

- [ ] Добавить миграцию для таблицы `contacts`
- [ ] Создать индекс для поиска по имени
- [ ] Добавить поля для Google Contacts интеграции
- [ ] Реализовать функции кэширования контактов

**SQL схема**:

```sql
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  google_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cached_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_contacts_name ON contacts(name);
```

**Критерии приемки**:

- Таблица и индекс создаются корректно
- Поддержка Google Contacts ID
- Быстрый поиск по имени

#### 2.4 Миграция Tasks Storage (Migration 6)

- [ ] Добавить миграцию для таблицы `tasks`
- [ ] Создать индексы для фильтрации задач
- [ ] Добавить поля для управления задачами
- [ ] Реализовать CRUD операции для задач

**SQL схема**:

```sql
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
```

**Критерии приемки**:

- Таблица и индексы создаются корректно
- Поддержка булевых значений для completed
- Автоматические временные метки

### 3. Улучшения Производительности

#### 3.1 Оптимизация подготовленных запросов

- [ ] Создать кэш подготовленных запросов
- [ ] Реализовать переиспользование statements
- [ ] Добавить метрики производительности
- [ ] Оптимизировать частые операции

**Детали реализации**:

```typescript
const statements = {
  getAppMeta: db.prepare("SELECT value FROM app_meta WHERE key = ?"),
  setAppMeta: db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)"),
  getAuthTokens: db.prepare("SELECT encrypted FROM auth_tokens WHERE id = 1"),
  setAuthTokens: db.prepare(
    "INSERT OR REPLACE INTO auth_tokens (id, encrypted, updated_at) VALUES (1, ?, ?)",
  ),
};
```

**Критерии приемки**:

- Statements кэшируются и переиспользуются
- Улучшение производительности измеримо
- Нет утечек памяти

#### 3.2 Мониторинг и диагностика

- [ ] Добавить функцию `getDatabaseStats()`
- [ ] Реализовать проверку целостности БД
- [ ] Добавить логирование операций с БД
- [ ] Создать health check для БД

**Детали реализации**:

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

**Критерии приемки**:

- Статистика БД доступна
- Проверка целостности работает
- Логирование не влияет на производительность

### 4. Тестирование

#### 4.1 Unit тесты для миграций

- [ ] Написать тесты для каждой миграции
- [ ] Протестировать откат миграций
- [ ] Проверить идемпотентность миграций
- [ ] Тестировать обработку ошибок

**Property-Based Test 1: Атомарность Миграций**

```typescript
// **Validates: data-storage.2.4**
describe("Migration Atomicity Property", () => {
  it("should ensure migrations are atomic", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (migrationId) => {
        const db = createTestDatabase();
        const initialVersion = getCurrentVersion(db);

        try {
          runMigration(db, migrationId);
          const finalVersion = getCurrentVersion(db);
          return finalVersion === migrationId || finalVersion === initialVersion;
        } catch (error) {
          const errorVersion = getCurrentVersion(db);
          return errorVersion === initialVersion;
        }
      }),
    );
  });
});
```

#### 4.2 Integration тесты для резервного копирования

- [ ] Протестировать создание бэкапов
- [ ] Проверить восстановление из бэкапов
- [ ] Тестировать очистку старых файлов
- [ ] Проверить обработку ошибок файловой системы

**Property-Based Test 2: Целостность Резервных Копий**

```typescript
// **Validates: data-storage.3.3**
describe("Backup Integrity Property", () => {
  it("should create valid backups before migrations", () => {
    fc.assert(
      fc.property(fc.array(fc.record({ key: fc.string(), value: fc.string() })), (testData) => {
        const db = createTestDatabase();
        testData.forEach(({ key, value }) => {
          db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(key, value);
        });

        const backupPath = createBackup(getDatabasePath());
        const backupDb = new Database(backupPath);

        const originalData = db.prepare("SELECT * FROM app_meta").all();
        const backupData = backupDb.prepare("SELECT * FROM app_meta").all();

        return JSON.stringify(originalData) === JSON.stringify(backupData);
      }),
    );
  });
});
```

#### 4.3 Property-based тесты для персистентности

- [ ] Тестировать сохранение состояния
- [ ] Проверить восстановление после перезапуска
- [ ] Тестировать различные типы данных
- [ ] Проверить обработку некорректных данных

**Property-Based Test 3: Персистентность Состояния**

```typescript
// **Validates: data-storage.4.5**
describe("State Persistence Property", () => {
  it("should persist and restore application state", () => {
    fc.assert(
      fc.property(
        fc.record({
          key: fc.string({ minLength: 1, maxLength: 50 }),
          value: fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.object()),
        }),
        ({ key, value }) => {
          const db = createTestDatabase();

          // Сохраняем состояние
          setAppState(db, key, value);

          // Симулируем перезапуск (новое подключение к БД)
          const newDb = new Database(getDatabasePath());
          const restoredValue = getAppState(newDb, key);

          return JSON.stringify(restoredValue) === JSON.stringify(value);
        },
      ),
    );
  });
});
```

### 5. Документация и Безопасность

#### 5.1 Безопасность данных

- [ ] Установить права доступа к файлу БД (0o600)
- [ ] Добавить валидацию входных данных
- [ ] Реализовать санитизацию ключей
- [ ] Добавить защиту от SQL инъекций

**Критерии приемки**:

- Файл БД доступен только владельцу
- Все входные данные валидируются
- Prepared statements используются везде

#### 5.2 Обновление документации

- [ ] Документировать все новые миграции
- [ ] Обновить схему БД в design.md
- [ ] Добавить примеры использования API
- [ ] Создать troubleshooting guide

**Критерии приемки**:

- Документация актуальна
- Примеры кода работают
- Troubleshooting покрывает основные проблемы

## Критерии Завершения

### Функциональные Требования

- [ ] Все миграции выполняются успешно
- [ ] Резервное копирование работает автоматически
- [ ] Состояние приложения сохраняется корректно
- [ ] Производительность соответствует требованиям

### Качество Кода

- [ ] Покрытие тестами > 90%
- [ ] Все property-based тесты проходят
- [ ] Код соответствует стандартам проекта
- [ ] Документация обновлена

### Интеграция

- [ ] Совместимость с google-oauth-auth
- [ ] Интеграция с sidebar-navigation
- [ ] IPC каналы работают корректно
- [ ] Нет конфликтов с другими фичами

## Приоритизация

**Высокий приоритет**:

1. Система резервного копирования (1.1, 1.2)
2. Миграция UI Settings (2.1)
3. Unit тесты для миграций (4.1)

**Средний приоритет**: 4. Планируемые миграции (2.2, 2.3, 2.4) 5. Оптимизация производительности (3.1, 3.2) 6. Integration тесты (4.2)

**Низкий приоритет**: 7. Property-based тесты (4.3) 8. Безопасность и документация (5.1, 5.2)
