# Документ Дизайна: User Data Isolation

## Обзор

Данный документ описывает дизайн системы изоляции данных пользователей в приложении Clerkly. Система обеспечивает автоматическую фильтрацию данных по `user_id`, позволяя нескольким пользователям безопасно использовать одно приложение на одном устройстве.

**Архитектурный Принцип:** Следует принципу **Единого Источника Истины (Single Source of Truth)**, где база данных является единственным источником истины для всех пользовательских данных.

**Ключевые компоненты:**
- **DatabaseManager** — единая точка входа для доступа к БД, инициализации и получения текущего user_id
- **UserSettingsManager** — управление пользовательскими настройками (key-value в таблице user_data) с автоматической фильтрацией по user_id
- **UserProfileManager** — управление профилем пользователя, таблицей users и текущим user_id

---

## Сценарии Использования

### Сценарий 1: Первый запуск приложения (нет userId)

**Начальное состояние:**
- БД пустая или нет сохраненного `userId`
- Нет токенов

**Поток:**
1. `UserManager.initialize()` → читает БД → `userId = null`
2. Показываем экран **Login**
3. Пользователь нажимает "Sign in with Google"
4. OAuth flow → получаем токены от Google
5. Загружаем профиль (используя полученный access token)
6. Создаем/находим пользователя → получаем `userId`
7. Сохраняем `userId` в БД (`setCurrentUser()` → `dbManager.global.currentUser.setUserId()`)
8. Сохраняем токены (теперь есть `userId`)
9. Показываем экран **Agents**

**Результат:**
- Пользователь авторизован
- `userId` сохранен в глобальном хранилище
- Токены сохранены в БД с привязкой к `userId`

### Сценарий 2: Повторный запуск приложения (есть userId)

**Начальное состояние:**
- В БД есть пользователь с `user_id = "abc123"`
- Сохранен `userId = "abc123"` в глобальном хранилище
- Есть токены в БД (привязаны к `userId = "abc123"`)

**Поток:**
1. `UserManager.initialize()` → читает БД → `userId = "abc123"`
2. Кэшируем: `userIdCache = "abc123"`
3. Загружаем `user = dbManager.users.findById("abc123")`
4. Если `user` найден → устанавливаем `currentUser = user`, показываем **Agents**
5. Если `user` НЕ найден → очищаем `userId`, показываем **Login**

**Результат:**
- Сессия восстановлена без повторной авторизации
- Пользователь видит свои данные (агенты, сообщения)

### Сценарий 3: Выход из аккаунта (Sign Out)

**Начальное состояние:**
- Пользователь авторизован
- `userId = "abc123"` в БД и кэше
- Токены в БД

**Поток:**
1. Пользователь нажимает "Sign Out"
2. `OAuthClientManager.signOut()` вызывается
3. Попытка отозвать токены в Google:
   - Если успешно → логируем успех
   - Если ошибка (нет сети, Google недоступен) → логируем ошибку, НО продолжаем
4. Удаляем токены из БД: `tokenStorage.deleteTokens()`
5. Очищаем сессию: `userManager.clearSession()`
   - Удаляем `userId` из БД: `dbManager.global.currentUser.clearUserId()`
   - Сбрасываем кэш: `userIdCache = null`
   - Очищаем память: `currentUser = null`
6. Показываем экран **Login**

**Результат:**
- Пользователь вышел из системы
- Локальные токены удалены
- Данные пользователя (агенты, сообщения, настройки) остаются в БД для восстановления при следующем входе

**Важно:** Ошибка отзыва токенов в Google НЕ прерывает процесс выхода. Пользователь всегда может выйти из приложения, даже если Google недоступен.

---

## Алгоритмы

### Алгоритм генерации user_id

```
1. Определить набор символов: A-Z, a-z, 0-9 (62 символа)
2. Сгенерировать строку длиной 10 символов:
   - Для каждой позиции (0-9):
     - Выбрать случайный символ из набора
     - Добавить символ к результату
3. Вернуть результат
```

**Пример:** `aB3xK9mNpQ`

**Свойства:**
- Случайный: каждый новый пользователь получает уникальный ID
- Компактный: ровно 10 символов
- Большой диапазон: 62^10 ≈ 8.4 × 10^17 комбинаций (достаточно для локального приложения)

### Алгоритм определения пользователя при логине через Google

```
1. Получить email из Google OAuth профиля
2. Найти запись в таблице users по email:
   - SELECT user_id, name, email FROM users WHERE email = ?
3. ЕСЛИ запись найдена:
   - Обновить name, если изменилось
   - Вернуть существующий user_id
4. ЕСЛИ запись НЕ найдена:
   - Сгенерировать новый user_id (см. алгоритм выше)
   - Создать запись: INSERT INTO users (user_id, name, email) VALUES (?, ?, ?)
   - Вернуть новый user_id
5. Установить currentUserId = user_id
6. Использовать currentUserId для всех операций с данными
```

---

## Архитектура

### Диаграмма Компонентов

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Data Isolation                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  DatabaseManager                          │   │
│  │                                                           │   │
│  │  - db: Database | null                                   │   │
│  │  - userManager: UserManager | null                       │   │
│  │                                                           │   │
│  │  // Инициализация                                        │   │
│  │  - initialize(storagePath): void                         │   │
│  │  - setUserManager(userManager): void                     │   │
│  │  - close(): void                                         │   │
│  │                                                           │   │
│  │  // Запросы с автоматическим user_id                     │   │
│  │  - runUserQuery(sql, params?): RunResult                 │   │
│  │  - getUserRow<T>(sql, params?): T | undefined            │   │
│  │  - getUserRows<T>(sql, params?): T[]                     │   │
│  │                                                           │   │
│  │  // Глобальные запросы (без user_id)                     │   │
│  │  - runQuery(sql, params?): RunResult                     │   │
│  │  - getRow<T>(sql, params?): T | undefined                │   │
│  │  - getRows<T>(sql, params?): T[]                         │   │
│  │                                                           │   │
│  │  // Ограниченный доступ (миграции, тесты)                │   │
│  │  - getDatabase(): Database                               │   │
│  │  - getCurrentUserIdStrict(): string                      │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│           ┌───────────────┼───────────────┐                     │
│           │               │               │                     │
│           ▼               ▼               ▼                     │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────────┐   │
│  │UserSettingsManager│ │ AgentManager │ │ MessageManager     │   │
│  │                │ │                │ │                    │   │
│  │- saveData()    │ │- create()      │ │- list()            │   │
│  │- loadData()    │ │- list()        │ │- create()          │   │
│  │- deleteData()  │ │- get()         │ │- update()          │   │
│  │                │ │- update()      │ │                    │   │
│  │ Uses:          │ │- archive()     │ │ Uses:              │   │
│  │ runUserQuery   │ │                │ │ getUserRow         │   │
│  │ getUserRow     │ │ Uses:          │ │ getRows            │   │
│  │                │ │ runUserQuery   │ │ runQuery           │   │
│  │                │ │ getUserRow(s)  │ │                    │   │
│  └────────────────┘ └────────────────┘ └────────────────────┘   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              WindowStateManager (ИСКЛЮЧЕНИЕ)               │ │
│  │                                                            │ │
│  │  Uses: runQuery, getRow (глобальные данные, без user_id)  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  UserProfileManager                       │   │
│  │                                                           │   │
│  │  - currentUserId: string | null                          │   │
│  │  - generateUserId(): string                              │   │
│  │  - findOrCreateUser(email, name): User                   │   │
│  │  - getCurrentUserId(): string | null                     │   │
│  │  - fetchProfile(): Promise<UserProfile>                  │   │
│  │  - clearSession(): void                                  │   │
│  └────────────────────────┬─────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                      SQLite DB                            │   │
│  │                                                           │   │
│  │  ┌─────────────────┐    ┌─────────────────────────────┐  │   │
│  │  │     users       │    │        user_data            │  │   │
│  │  │                 │    │                             │  │   │
│  │  │ user_id (PK)    │    │ key (PK)                    │  │   │
│  │  │ name            │    │ user_id (PK)                │  │   │
│  │  │ email (UNIQUE)  │    │ value                       │  │   │
│  │  └─────────────────┘    │ timestamp                   │  │   │
│  │                         └─────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Поток Данных при Авторизации

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Google OAuth│────▶│ UserProfileManager│────▶│  SQLite DB  │
│   Profile   │     │                  │     │             │
│             │     │ 1. Получить email│     │             │
│ email: ...  │     │ 2. findOrCreate  │     │ users table │
│ name: ...   │     │ 3. set currentId │     │             │
└─────────────┘     └──────────────────┘     └─────────────┘
```

---

## Схема Базы Данных

### Таблица users

```sql
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

**Поля:**
- `user_id` - уникальный идентификатор (10-символьная alphanumeric строка)
- `name` - имя пользователя из Google OAuth профиля (может быть NULL)
- `email` - email пользователя (уникальный, NOT NULL)

**Примечание:** Целостность данных поддерживается логикой приложения, FOREIGN KEY не используется.

### Таблица user_data

```sql
CREATE TABLE IF NOT EXISTS user_data (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_id ON user_data(user_id);
```

**Поля:**
- `key` - ключ данных
- `value` - JSON-сериализованное значение
- `user_id` - идентификатор пользователя (связь с users.user_id через логику приложения)
- `created_at`, `updated_at` - временные метки

---

## Компоненты

### User Interface

```typescript
// Requirements: user-data-isolation.1
interface User {
  user_id: string;  // 10-character alphanumeric string
  name: string | null;
  email: string;
}
```

### DatabaseManager (Новый Компонент)

**Файл:** `src/main/DatabaseManager.ts`

Единая точка входа для доступа к базе данных. Все SQL-запросы выполняются через методы DatabaseManager.

```typescript
// Requirements: user-data-isolation.6
import Database from 'better-sqlite3';
import { UserManager } from './auth/UserManager';
import { MigrationRunner } from './MigrationRunner';
import { Logger } from './Logger';

class DatabaseManager {
  private db: Database.Database | null = null;
  private userManager: UserManager | null = null;
  private logger = Logger.create('DatabaseManager');
  
  /**
   * Initialize database and run migrations
   * Requirements: user-data-isolation.6.1, user-data-isolation.6.9
   */
  initialize(storagePath: string): void {
    this.db = new Database(storagePath);
    
    // Run migrations
    const migrationRunner = new MigrationRunner(this.db);
    migrationRunner.runMigrations();
    
    this.logger.info('Database initialized');
  }
  
  /**
   * Set UserManager for getting current userId
   */
  setUserManager(userManager: UserManager): void {
    this.userManager = userManager;
  }
  
  /**
   * Get SQLite database instance (restricted use)
   * Requirements: user-data-isolation.6.11
   * 
   * ВАЖНО: Использование ограничено:
   * - Миграциями
   * - Тестами
   * - WindowStateManager (глобальные данные)
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }
  
  /**
   * Get current user ID (strict mode)
   * Requirements: user-data-isolation.6.6
   */
  getCurrentUserIdStrict(): string {
    const userId = this.userManager?.getCurrentUserId();
    if (!userId) {
      throw new Error('No user logged in');
    }
    return userId;
  }
  
  // ============================================
  // Методы для запросов с автоматическим user_id
  // Requirements: user-data-isolation.6.3, user-data-isolation.6.5
  // ============================================
  
  /**
   * Execute INSERT/UPDATE/DELETE with automatic user_id injection
   * user_id is prepended to params array
   * Requirements: user-data-isolation.6.3, user-data-isolation.6.5, user-data-isolation.6.6
   */
  runUserQuery(sql: string, params: unknown[] = []): Database.RunResult {
    const userId = this.getCurrentUserIdStrict();
    return this.getDatabase().prepare(sql).run(userId, ...params);
  }
  
  /**
   * Get single row with automatic user_id injection
   * user_id is prepended to params array
   * Requirements: user-data-isolation.6.3, user-data-isolation.6.5, user-data-isolation.6.6
   */
  getUserRow<T>(sql: string, params: unknown[] = []): T | undefined {
    const userId = this.getCurrentUserIdStrict();
    return this.getDatabase().prepare(sql).get(userId, ...params) as T | undefined;
  }
  
  /**
   * Get all rows with automatic user_id injection
   * user_id is prepended to params array
   * Requirements: user-data-isolation.6.3, user-data-isolation.6.5, user-data-isolation.6.6
   */
  getUserRows<T>(sql: string, params: unknown[] = []): T[] {
    const userId = this.getCurrentUserIdStrict();
    return this.getDatabase().prepare(sql).all(userId, ...params) as T[];
  }
  
  // ============================================
  // Методы для глобальных запросов (без user_id)
  // Requirements: user-data-isolation.6.4, user-data-isolation.6.10
  // ============================================
  
  /**
   * Execute INSERT/UPDATE/DELETE without user_id
   * For global data (WindowStateManager, migrations)
   * Requirements: user-data-isolation.6.4, user-data-isolation.6.10
   */
  runQuery(sql: string, params: unknown[] = []): Database.RunResult {
    return this.getDatabase().prepare(sql).run(...params);
  }
  
  /**
   * Get single row without user_id
   * For global data (WindowStateManager, migrations)
   * Requirements: user-data-isolation.6.4, user-data-isolation.6.10
   */
  getRow<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.getDatabase().prepare(sql).get(...params) as T | undefined;
  }
  
  /**
   * Get all rows without user_id
   * For global data (WindowStateManager, migrations)
   * Requirements: user-data-isolation.6.4, user-data-isolation.6.10
   */
  getRows<T>(sql: string, params: unknown[] = []): T[] {
    return this.getDatabase().prepare(sql).all(...params) as T[];
  }
  
  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.logger.info('Database closed');
    }
  }
}

export const databaseManager = new DatabaseManager();
```

### UserSettingsManager (Переименован из DataManager)

**Файл:** `src/main/UserSettingsManager.ts`

Управление пользовательскими настройками (key-value в таблице user_data) с автоматической фильтрацией по user_id.

```typescript
// Requirements: user-data-isolation.2, user-data-isolation.3, user-data-isolation.6.7, drizzle-migration.5
import { IDatabaseManager } from './DatabaseManager';
import { Logger } from './Logger';

class UserSettingsManager {
  private dbManager: IDatabaseManager;
  private logger = Logger.create('UserSettingsManager');

  constructor(dbManager: IDatabaseManager) {
    this.dbManager = dbManager;
  }

  /**
   * Save data with automatic user_id filtering
   * Requirements: user-data-isolation.2.4, user-data-isolation.3.1, user-data-isolation.6.7, drizzle-migration.5.1
   */
  saveData(key: string, value: any): void {
    // Использует репозиторий settings - user_id подставляется автоматически
    this.dbManager.settings.set(key, value);
    this.logger.info(`Data saved, key: ${key}`);
  }

  /**
   * Load data with automatic user_id filtering
   * Requirements: user-data-isolation.2.5, user-data-isolation.3.1, user-data-isolation.6.7, drizzle-migration.5.1
   */
  loadData(key: string): { success: boolean; data?: any; error?: string } {
    // Использует репозиторий settings - user_id подставляется автоматически
    const data = this.dbManager.settings.get(key);
    
    if (data !== undefined) {
      this.logger.info(`Data loaded, key: ${key}`);
      return { success: true, data };
    }

    return { success: true, data: null };
  }

  /**
   * Delete data with automatic user_id filtering
   * Requirements: user-data-isolation.2.6, user-data-isolation.3.1, user-data-isolation.6.7, drizzle-migration.5.1
   */
  deleteData(key: string): void {
    // Использует репозиторий settings - user_id подставляется автоматически
    this.dbManager.settings.delete(key);
    this.logger.info(`Data deleted, key: ${key}`);
  }
}
```

### UserManager (Extended)

**Файл:** `src/main/auth/UserManager.ts`

```typescript
class UserManager {
  // Requirements: user-data-isolation.1.5 - Cache user_id with lazy loading from DB
  private userIdCache: string | null | undefined = undefined; // undefined = not loaded yet
  private currentUser: User | null = null;

  /**
   * Generate random 10-character alphanumeric user_id
   * Requirements: user-data-isolation.0.2, user-data-isolation.1.1
   * 
   * Algorithm:
   * 1. Define character set: A-Z, a-z, 0-9 (62 characters)
   * 2. Generate 10-character string by picking random characters
   * 3. Return result
   */
  private generateUserId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Find or create user by email
   * Requirements: user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.1.2
   * 
   * Algorithm:
   * 1. Search for user by email in users table
   * 2. If found: update name if changed, return existing user
   * 3. If not found: generate random user_id, create record, return new user
   */
  findOrCreateUser(googleProfile: GoogleUserInfoResponse): User {
    // ... implementation ...
  }

  /**
   * Get current user ID with caching
   * Requirements: user-data-isolation.1.5
   * 
   * Returns the user_id of the currently logged in user.
   * First call loads from DB, subsequent calls return cached value.
   * Used by DatabaseManager to filter data by user_id.
   */
  getCurrentUserId(): string | null {
    if (this.userIdCache === undefined) {
      // First call - load from DB
      this.userIdCache = this.dbManager.global.currentUser.getUserId();
    }
    return this.userIdCache;
  }

  /**
   * Set current user and persist userId
   * Requirements: user-data-isolation.1.2, user-data-isolation.1.6
   */
  setCurrentUser(user: User): void {
    // Save userId to global storage
    this.dbManager.global.currentUser.setUserId(user.user_id);
    // Update cache
    this.userIdCache = user.user_id;
    this.currentUser = user;
    this.logger.info(`Current user set to ${user.user_id}`);
  }

  /**
   * Fetch profile from Google API during authorization
   * Requirements: user-data-isolation.1.2
   */
  async fetchProfileSynchronously(): Promise<
    { success: true; user: User } | { success: false; error: string }
  > {
    try {
      // ... fetch profile from Google API ...
      const googleProfile = await response.json();
      
      // Find or create user
      const user = this.findOrCreateUser(googleProfile);
      // setCurrentUser saves userId to DB and updates cache
      this.setCurrentUser(user);
      
      return { success: true, user };
    } catch (error) {
      await this.tokenStorage.deleteTokens();
      return { success: false, error: 'profile_fetch_failed' };
    }
  }

  /**
   * Initialize on app startup - restore session from DB
   * Requirements: user-data-isolation.1.3
   */
  async initialize(): Promise<void> {
    const savedUserId = this.dbManager.global.currentUser.getUserId();
    
    if (!savedUserId) {
      this.logger.info('No saved user_id, user not logged in');
      return;
    }
    
    // Cache the userId
    this.userIdCache = savedUserId;
    
    // Load user from users table
    const user = this.dbManager.users.findById(savedUserId);
    
    if (!user) {
      this.logger.warn(`User not found for saved user_id: ${savedUserId}`);
      this.dbManager.global.currentUser.clearUserId();
      this.userIdCache = null;
      return;
    }
    
    this.currentUser = user;
    this.logger.info(`User restored: ${user.email}`);
  }

  /**
   * Clear session on logout
   * Requirements: user-data-isolation.1.4
   */
  clearSession(): void {
    // Clear from DB
    this.dbManager.global.currentUser.clearUserId();
    // Clear cache
    this.userIdCache = null;
    this.currentUser = null;
    this.logger.info('User session cleared');
  }
}
```

### GlobalRepository (Extended)

**Файл:** `src/main/db/repositories/GlobalRepository.ts`

Репозиторий для глобальных данных (без фильтрации по userId). Используется для хранения состояния окна и текущего userId.

```typescript
// Requirements: user-data-isolation.7.8, user-data-isolation.1.6
import { eq, and } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { userData } from '../schema';

const SYSTEM_USER_ID = '__system__';

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

export class GlobalRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  /**
   * Window state management
   * Requirements: user-data-isolation.7.8
   */
  windowState = {
    get: (): WindowState | undefined => {
      const row = this.db
        .select()
        .from(userData)
        .where(and(eq(userData.key, 'window_state'), eq(userData.userId, SYSTEM_USER_ID)))
        .get();

      if (row) {
        return JSON.parse(row.value);
      }
      return undefined;
    },

    set: (state: WindowState): void => {
      const now = Date.now();
      const value = JSON.stringify(state);

      this.db
        .insert(userData)
        .values({
          key: 'window_state',
          userId: SYSTEM_USER_ID,
          value,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [userData.key, userData.userId],
          set: { value, updatedAt: now },
        })
        .run();
    },
  };

  /**
   * Current user management
   * Requirements: user-data-isolation.1.6
   */
  currentUser = {
    /**
     * Get saved userId from global storage
     */
    getUserId: (): string | null => {
      const row = this.db
        .select()
        .from(userData)
        .where(and(eq(userData.key, 'current_user_id'), eq(userData.userId, SYSTEM_USER_ID)))
        .get();

      return row ? row.value : null;
    },

    /**
     * Save userId to global storage
     */
    setUserId: (userId: string): void => {
      const now = Date.now();

      this.db
        .insert(userData)
        .values({
          key: 'current_user_id',
          userId: SYSTEM_USER_ID,
          value: userId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [userData.key, userData.userId],
          set: { value: userId, updatedAt: now },
        })
        .run();
    },

    /**
     * Clear userId from global storage
     */
    clearUserId: (): void => {
      this.db
        .delete(userData)
        .where(and(eq(userData.key, 'current_user_id'), eq(userData.userId, SYSTEM_USER_ID)))
        .run();
    },
  };
}
```

### UsersRepository (New)

**Файл:** `src/main/db/repositories/UsersRepository.ts`

Репозиторий для работы с таблицей users. Используется для поиска и создания пользователей.

```typescript
// Requirements: user-data-isolation.7.7
import { eq } from 'drizzle-orm';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import { users } from '../schema';

export interface User {
  user_id: string;
  name: string | null;
  email: string;
  google_id: string | null;
  locale: string | null;
  last_synced: number | null;
}

export class UsersRepository {
  constructor(private db: BetterSQLite3Database<typeof schema>) {}

  /**
   * Find user by email
   * Requirements: user-data-isolation.7.7
   */
  findByEmail(email: string): User | undefined {
    return this.db.select().from(users).where(eq(users.email, email)).get();
  }

  /**
   * Find user by userId
   * Requirements: user-data-isolation.1.3
   */
  findById(userId: string): User | undefined {
    return this.db.select().from(users).where(eq(users.user_id, userId)).get();
  }

  /**
   * Create new user
   * Requirements: user-data-isolation.7.7
   */
  create(user: User): void {
    this.db.insert(users).values(user).run();
  }

  /**
   * Update user data
   * Requirements: user-data-isolation.7.7
   */
  update(userId: string, data: Partial<Omit<User, 'user_id'>>): void {
    this.db.update(users).set(data).where(eq(users.user_id, userId)).run();
  }
}
```

### Обработка Ошибок Изоляции

**Requirements:** user-data-isolation.4, error-notifications.1

Ошибки изоляции данных обрабатываются на уровне вызывающего кода, который знает контекст операции:

```typescript
// В компонентах, использующих UserSettingsManager
// Requirements: user-data-isolation.4.1, user-data-isolation.4.2, user-data-isolation.4.3
// Requirements: error-notifications.1.4, error-notifications.1.5

import { ErrorHandler } from '../ErrorHandler';

async function handleDataOperation(
  operation: () => Promise<any>, 
  context: string,
  isLogoutInProgress: boolean
): Promise<any> {
  try {
    return await operation();
  } catch (error) {
    if (error.message === 'No user logged in') {
      if (isLogoutInProgress) {
        // Requirements: user-data-isolation.4.3, error-notifications.1.5
        // Silently ignore during logout (race condition)
        // ErrorHandler will log but NOT show notification (context contains 'Logout')
        ErrorHandler.handleBackgroundError(error, 'Logout');
        return null;
      }
      
      // Requirements: user-data-isolation.4.2
      // Try to restore session
      const restored = await tokenManager.tryRefreshToken();
      if (restored) {
        return await operation();
      }
      
      // Requirements: user-data-isolation.4.1
      // Redirect to login screen
      navigationManager.navigateTo('/login');
      return null;
    }
    
    // Requirements: error-notifications.1.1, error-notifications.1.4
    // Other errors - show notification to user
    ErrorHandler.handleBackgroundError(error, context);
    throw error;
  }
}
```

**Важно:** 
- UserSettingsManager просто бросает ошибку `'No user logged in'` без вызова ErrorHandler
- Вызывающий код решает, как обработать ошибку в зависимости от контекста
- Если контекст содержит "Logout", ErrorHandler автоматически фильтрует ошибку (не показывает пользователю)
- Все ошибки ВСЕГДА логируются для отладки
```

### Глобальные Настройки (Исключения из Изоляции)

**Requirements:** user-data-isolation.2.8, user-data-isolation.6.10, drizzle-migration.6

Некоторые данные НЕ должны изолироваться по пользователю:

```typescript
// Window State - глобальные настройки окна
// Requirements: window-management.5.7, user-data-isolation.2.8, user-data-isolation.6.10, drizzle-migration.6.1

class WindowStateManager {
  private dbManager: IDatabaseManager;
  
  constructor(dbManager: IDatabaseManager) {
    this.dbManager = dbManager;
  }
  
  // Использует глобальный репозиторий DatabaseManager (без user_id)
  // Состояние окна одинаково для всех пользователей на устройстве
  
  saveState(state: WindowState): void {
    // Использует dbManager.global.windowState - глобальное состояние
    this.dbManager.global.windowState.set(state);
  }
  
  loadState(): WindowState {
    // Использует dbManager.global.windowState - глобальное состояние
    const state = this.dbManager.global.windowState.get();
    if (state && this.isPositionValid(state.x, state.y)) {
      return state;
    }
    return this.getDefaultState();
  }
}
```

**Обоснование:** Состояние окна (размер, позиция, maximized) является глобальным для устройства, а не для пользователя. При смене пользователя окно должно сохранять свое положение.

---

## Миграция Данных

### Миграция 1: create_users_table

```sql
-- UP
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- DOWN
DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS users;
```

### Миграция 2: migrate_user_data_to_user_id

**Примечание:** Миграция выполняется через код приложения (MigrationRunner) для генерации случайных user_id.

```typescript
// Migration code in MigrationRunner
async function migrateUserDataToUserId(db: Database) {
  // Helper function - same as in UserProfileManager
  function generateUserId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // 1. Get all unique emails from user_data
  const emails = db.prepare(
    'SELECT DISTINCT user_email FROM user_data WHERE user_email IS NOT NULL'
  ).all() as { user_email: string }[];

  // 2. Create users for each email with random alphanumeric user_id
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (user_id, name, email) VALUES (?, NULL, ?)'
  );
  
  for (const { user_email } of emails) {
    const userId = generateUserId();
    insertUser.run(userId, user_email);
  }

  // 3. Create new user_data table with user_id
  db.exec(`
    CREATE TABLE user_data_new (
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (key, user_id)
    )
  `);

  // 4. Copy data with user_id lookup
  db.exec(`
    INSERT INTO user_data_new (key, value, user_id, created_at, updated_at)
    SELECT 
      ud.key,
      ud.value,
      u.user_id,
      ud.created_at,
      ud.updated_at
    FROM user_data ud
    JOIN users u ON ud.user_email = u.email
  `);

  // 5. Replace old table
  db.exec('DROP TABLE user_data');
  db.exec('ALTER TABLE user_data_new RENAME TO user_data');

  // 6. Create index
  db.exec('CREATE INDEX IF NOT EXISTS idx_user_id ON user_data(user_id)');
}

// DOWN migration
async function rollbackUserDataMigration(db: Database) {
  db.exec('ALTER TABLE user_data ADD COLUMN user_email TEXT');
  db.exec(`
    UPDATE user_data 
    SET user_email = (SELECT email FROM users WHERE users.user_id = user_data.user_id)
  `);
}
```

---

## Свойства Корректности

### Property 1: Формат user_id

*Для любого* вызова `generateUserId()`, результат ДОЛЖЕН быть строкой из 10 alphanumeric символов (A-Z, a-z, 0-9).

**Validates:** user-data-isolation.0.2, user-data-isolation.1.1

### Property 2: Идемпотентность findOrCreateUser

*Для любого* email, повторные вызовы `findOrCreateUser(email, name)` ДОЛЖНЫ возвращать один и тот же `user_id` (тот, что был создан при первом вызове).

**Validates:** user-data-isolation.0.3, user-data-isolation.1.2

### Property 3: Изоляция данных

*Для любых* двух пользователей A и B с разными `user_id`, данные сохраненные пользователем A НЕ ДОЛЖНЫ быть доступны пользователю B.

**Validates:** user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.4.4

### Property 4: Автоматическая фильтрация

*Для любого* вызова `saveData(key, value)` или `loadData(key)` через UserSettingsManager, система ДОЛЖНА автоматически использовать `user_id` текущего пользователя без явного параметра.

**Validates:** user-data-isolation.3.1, user-data-isolation.6.6

### Property 5: Восстановление данных

*Для любого* пользователя, после logout и повторного login с тем же email, все ранее сохраненные данные ДОЛЖНЫ быть восстановлены (тот же `user_id` найден по email в таблице users).

**Validates:** user-data-isolation.0.3, user-data-isolation.1.3

---

## Стратегия Тестирования

### Модульные Тесты

#### UserProfileManager

**Файл:** `tests/unit/auth/UserProfileManager.test.ts` (extended)

```typescript
describe('UserProfileManager - User ID Management', () => {
  /* Preconditions: нет
     Action: вызвать generateUserId() 100 раз
     Assertions: все ID имеют длину 10, содержат только alphanumeric
     Requirements: user-data-isolation.0.2, user-data-isolation.1.1 */
  it('should generate valid 10-character alphanumeric user_id');

  /* Preconditions: пустая таблица users
     Action: вызвать findOrCreateUser('test@example.com', 'Test User')
     Assertions: создан пользователь с 10-символьным user_id
     Requirements: user-data-isolation.0.3, user-data-isolation.1.2 */
  it('should create new user on first login');

  /* Preconditions: пользователь существует в таблице users
     Action: вызвать findOrCreateUser с тем же email
     Assertions: возвращается существующий user_id
     Requirements: user-data-isolation.0.3, user-data-isolation.1.2 */
  it('should find existing user on re-login');

  /* Preconditions: пользователь существует с именем 'Old Name'
     Action: вызвать findOrCreateUser с тем же email, но именем 'New Name'
     Assertions: имя обновлено в базе данных
     Requirements: user-data-isolation.0.4, user-data-isolation.1.2 */
  it('should update user name if changed');

  /* Preconditions: successful OAuth login
     Action: call fetchProfile()
     Assertions: currentUserId is set
     Requirements: user-data-isolation.1.2 */
  it('should cache user_id after successful login');

  /* Preconditions: user logged in
     Action: call clearSession()
     Assertions: currentUserId is null
     Requirements: user-data-isolation.1.4 */
  it('should clear user_id on logout');

  /* Preconditions: user logged in
     Action: call getCurrentUserId()
     Assertions: returns correct user_id
     Requirements: user-data-isolation.1.5 */
  it('should return current user_id via getCurrentUserId');
});

describe('UserProfileManager - getCurrentUserId Caching', () => {
  /* Preconditions: userIdCache = undefined, БД содержит userId = 'abc123'
     Action: вызвать getCurrentUserId() первый раз
     Assertions: читает из БД, возвращает 'abc123', кэш = 'abc123'
     Requirements: user-data-isolation.1.5 */
  it('should load userId from DB on first call');

  /* Preconditions: userIdCache = 'abc123'
     Action: вызвать getCurrentUserId() второй раз
     Assertions: НЕ читает из БД, возвращает 'abc123' из кэша
     Requirements: user-data-isolation.1.5 */
  it('should return cached userId on subsequent calls');

  /* Preconditions: userIdCache = undefined, БД НЕ содержит userId
     Action: вызвать getCurrentUserId()
     Assertions: возвращает null, кэш = null
     Requirements: user-data-isolation.1.5 */
  it('should return null when no userId in DB');

  /* Preconditions: userIdCache = 'old123'
     Action: вызвать setCurrentUser(user) с user_id = 'new456'
     Assertions: кэш обновлен на 'new456', БД обновлена
     Requirements: user-data-isolation.1.2, user-data-isolation.1.5 */
  it('should update cache when setCurrentUser is called');

  /* Preconditions: userIdCache = 'abc123'
     Action: вызвать clearSession()
     Assertions: кэш = null, userId удален из БД
     Requirements: user-data-isolation.1.4, user-data-isolation.1.5 */
  it('should clear cache when clearSession is called');
});

describe('UserProfileManager - setCurrentUser', () => {
  /* Preconditions: user = { user_id: 'abc123', email: 'test@example.com', ... }
     Action: вызвать setCurrentUser(user)
     Assertions: dbManager.global.currentUser.setUserId('abc123') вызван
     Requirements: user-data-isolation.1.2, user-data-isolation.1.6 */
  it('should save userId to global storage');

  /* Preconditions: user = { user_id: 'abc123', ... }
     Action: вызвать setCurrentUser(user)
     Assertions: userIdCache = 'abc123', currentUser = user
     Requirements: user-data-isolation.1.2, user-data-isolation.1.5 */
  it('should update cache and currentUser');

  /* Preconditions: user = { user_id: 'abc123', ... }
     Action: вызвать setCurrentUser(user)
     Assertions: логируется "Current user set to abc123"
     Requirements: user-data-isolation.1.2 */
  it('should log user_id when set');
});

describe('UserProfileManager - clearSession', () => {
  /* Preconditions: userIdCache = 'abc123', currentUser = { ... }
     Action: вызвать clearSession()
     Assertions: dbManager.global.currentUser.clearUserId() вызван
     Requirements: user-data-isolation.1.4, user-data-isolation.1.6 */
  it('should clear userId from global storage');

  /* Preconditions: userIdCache = 'abc123', currentUser = { ... }
     Action: вызвать clearSession()
     Assertions: userIdCache = null, currentUser = null
     Requirements: user-data-isolation.1.4, user-data-isolation.1.5 */
  it('should clear cache and currentUser');

  /* Preconditions: userIdCache = 'abc123'
     Action: вызвать clearSession()
     Assertions: логируется "User session cleared"
     Requirements: user-data-isolation.1.4 */
  it('should log session cleared');
});

describe('UserProfileManager - initialize', () => {
  /* Preconditions: БД содержит userId = 'abc123', users содержит user с user_id = 'abc123'
     Action: вызвать initialize()
     Assertions: userIdCache = 'abc123', currentUser установлен, логируется "User restored: email"
     Requirements: user-data-isolation.1.3 */
  it('should restore user from DB on startup');

  /* Preconditions: БД НЕ содержит userId
     Action: вызвать initialize()
     Assertions: userIdCache остается undefined, логируется "No saved user_id"
     Requirements: user-data-isolation.1.3 */
  it('should do nothing when no saved userId');

  /* Preconditions: БД содержит userId = 'abc123', users НЕ содержит user с user_id = 'abc123'
     Action: вызвать initialize()
     Assertions: userId очищен из БД, userIdCache = null, логируется warning
     Requirements: user-data-isolation.1.3 */
  it('should clear userId when user not found in users table');

  /* Preconditions: БД содержит userId = 'abc123', dbManager.users.findById() бросает ошибку
     Action: вызвать initialize()
     Assertions: ошибка НЕ прерывает инициализацию, логируется ошибка
     Requirements: user-data-isolation.1.3 */
  it('should handle errors gracefully during initialization');
});

describe('UserProfileManager - fetchProfileSynchronously', () => {
  /* Preconditions: OAuth flow завершен, получен профиль от Google
     Action: вызвать fetchProfileSynchronously()
     Assertions: setCurrentUser() вызван с созданным/найденным пользователем
     Requirements: user-data-isolation.1.2 */
  it('should call setCurrentUser after creating/finding user');

  /* Preconditions: OAuth flow завершен, профиль получен
     Action: вызвать fetchProfileSynchronously()
     Assertions: userId сохранен в БД через setCurrentUser()
     Requirements: user-data-isolation.1.2, user-data-isolation.1.6 */
  it('should persist userId during OAuth flow');

  /* Preconditions: Google API возвращает ошибку
     Action: вызвать fetchProfileSynchronously()
     Assertions: токены удалены, userId НЕ сохранен, возвращается { success: false }
     Requirements: user-data-isolation.1.2 */
  it('should not persist userId when profile fetch fails');
});
```

#### GlobalRepository

**Файл:** `tests/unit/db/repositories/GlobalRepository.test.ts`

```typescript
describe('GlobalRepository - currentUser', () => {
  /* Preconditions: БД пустая
     Action: вызвать currentUser.getUserId()
     Assertions: возвращает null
     Requirements: user-data-isolation.1.6 */
  it('should return null when no userId saved');

  /* Preconditions: БД содержит userId = 'abc123'
     Action: вызвать currentUser.getUserId()
     Assertions: возвращает 'abc123'
     Requirements: user-data-isolation.1.6 */
  it('should return saved userId');

  /* Preconditions: БД пустая
     Action: вызвать currentUser.setUserId('abc123')
     Assertions: userId сохранен с ключом 'current_user_id' и userId = '__system__'
     Requirements: user-data-isolation.1.6 */
  it('should save userId to global storage');

  /* Preconditions: БД содержит userId = 'old123'
     Action: вызвать currentUser.setUserId('new456')
     Assertions: userId обновлен на 'new456'
     Requirements: user-data-isolation.1.6 */
  it('should update existing userId');

  /* Preconditions: БД содержит userId = 'abc123'
     Action: вызвать currentUser.clearUserId()
     Assertions: запись удалена из БД
     Requirements: user-data-isolation.1.6 */
  it('should delete userId from global storage');

  /* Preconditions: БД НЕ содержит userId
     Action: вызвать currentUser.clearUserId()
     Assertions: операция завершается без ошибок
     Requirements: user-data-isolation.1.6 */
  it('should handle clearUserId when no userId exists');

  /* Preconditions: БД содержит userId = 'abc123'
     Action: вызвать currentUser.getUserId() дважды
     Assertions: оба вызова возвращают 'abc123' (проверка идемпотентности)
     Requirements: user-data-isolation.1.6 */
  it('should be idempotent for getUserId');
});
```

#### UsersRepository

**Файл:** `tests/unit/db/repositories/UsersRepository.test.ts`

```typescript
describe('UsersRepository - findById', () => {
  /* Preconditions: users содержит user с user_id = 'abc123'
     Action: вызвать findById('abc123')
     Assertions: возвращает user объект
     Requirements: user-data-isolation.1.3 */
  it('should return user by userId');

  /* Preconditions: users НЕ содержит user с user_id = 'xyz789'
     Action: вызвать findById('xyz789')
     Assertions: возвращает undefined
     Requirements: user-data-isolation.1.3 */
  it('should return undefined when user not found');

  /* Preconditions: users содержит несколько пользователей
     Action: вызвать findById() с разными userId
     Assertions: каждый вызов возвращает правильного пользователя
     Requirements: user-data-isolation.1.3 */
  it('should return correct user for each userId');
});
```

#### OAuthClientManager

**Файл:** `tests/unit/auth/OAuthClientManager.test.ts`

```typescript
describe('OAuthClientManager - signOut with revoke errors', () => {
  /* Preconditions: пользователь авторизован, Google API доступен
     Action: вызвать signOut()
     Assertions: токены отозваны в Google, локальные токены удалены, userId очищен
     Requirements: user-data-isolation.1.4 */
  it('should revoke tokens and clear session on successful signOut');

  /* Preconditions: пользователь авторизован, Google API недоступен (сеть)
     Action: вызвать signOut()
     Assertions: ошибка залогирована, локальные токены удалены, userId очищен, процесс НЕ прерван
     Requirements: user-data-isolation.1.4 */
  it('should continue signOut when revoke fails due to network error');

  /* Preconditions: пользователь авторизован, Google возвращает 500
     Action: вызвать signOut()
     Assertions: ошибка залогирована, локальные токены удалены, userId очищен, процесс НЕ прерван
     Requirements: user-data-isolation.1.4 */
  it('should continue signOut when revoke fails due to server error');

  /* Preconditions: пользователь авторизован, Google возвращает 401
     Action: вызвать signOut()
     Assertions: ошибка залогирована, локальные токены удалены, userId очищен, процесс НЕ прерван
     Requirements: user-data-isolation.1.4 */
  it('should continue signOut when revoke fails due to invalid token');

  /* Preconditions: пользователь авторизован, revoke бросает исключение
     Action: вызвать signOut()
     Assertions: исключение поймано, залогировано, локальные токены удалены, userId очищен
     Requirements: user-data-isolation.1.4 */
  it('should handle exceptions during revoke gracefully');
});
```

#### UserSettingsManager

**Файл:** `tests/unit/UserSettingsManager.test.ts`

```typescript
describe('UserSettingsManager - User Data Isolation', () => {
  /* Preconditions: DatabaseManager returns valid user_id
     Action: call saveData('key', 'value')
     Assertions: data saved with user_id
     Requirements: user-data-isolation.2.4, user-data-isolation.6.5 */
  it('should automatically add user_id when saving');

  /* Preconditions: DatabaseManager returns valid user_id
     Action: call loadData('key')
     Assertions: SQL query filters by user_id
     Requirements: user-data-isolation.2.5, user-data-isolation.6.5 */
  it('should automatically filter by user_id when loading');

  /* Preconditions: DatabaseManager.getCurrentUserId() throws 'No user logged in'
     Action: call saveData('key', 'value')
     Assertions: throws Error('No user logged in')
     Requirements: user-data-isolation.6.4 */
  it('should throw error when no user logged in');
});
```

#### DatabaseManager

**Файл:** `tests/unit/DatabaseManager.test.ts`

```typescript
describe('DatabaseManager', () => {
  /* Preconditions: DatabaseManager not initialized
     Action: call getDatabase()
     Assertions: throws Error('Database not initialized')
     Requirements: user-data-isolation.6.2 */
  it('should throw error when database not initialized');

  /* Preconditions: DatabaseManager initialized, UserManager not set
     Action: call getCurrentUserId()
     Assertions: throws Error('No user logged in')
     Requirements: user-data-isolation.6.4 */
  it('should throw error when no user logged in');

  /* Preconditions: DatabaseManager initialized, UserManager set with valid user
     Action: call getCurrentUserId()
     Assertions: returns correct user_id
     Requirements: user-data-isolation.6.3 */
  it('should return current user_id from UserManager');
});
```

### Property-Based Тесты

**Файл:** `tests/property/auth/UserDataIsolation.property.test.ts`

```typescript
describe('User Data Isolation - Property Tests', () => {
  /* Property 1: Генерация user_id
     **Validates: Requirements user-data-isolation.0.2** */
  it('should generate valid 10-character alphanumeric user_id');

  /* Property 2: Идемпотентность findOrCreateUser
     **Validates: Requirements user-data-isolation.0.3** */
  it('should return same user_id for same email on repeated findOrCreateUser calls');

  /* Property 3: Изоляция данных
     **Validates: Requirements user-data-isolation.4.4** */
  it('should isolate data between different users');

  /* Property 4: Восстановление данных
     **Validates: Requirements user-data-isolation.1.3** */
  it('should restore data after logout and re-login with same email');

  /* Property 5: Обновление имени
     **Validates: Requirements user-data-isolation.0.4** */
  it('should update user name when changed');

  /* Property 6: Игнорирование null имени
     **Validates: Requirements user-data-isolation.0.4** */
  it('should not update name when null is passed');
});
```

### Функциональные Тесты

**Файл:** `tests/functional/user-data-isolation.spec.ts`

```typescript
describe('User Data Isolation Functional Tests', () => {
  test('should isolate data between different users');
  test('should restore user data after re-login');
  test('should persist data after logout');
  test('should filter data by user_id');
  test('should handle No user logged in error');
  test('should retry operation after token refresh');
  test('should handle No user logged in error');
});
```

---

## Покрытие Требований

| Требование | Модульные | Property | Функциональные |
|------------|-----------|----------|----------------|
| user-data-isolation.0.1 | - | - | ✓ |
| user-data-isolation.0.2 | ✓ | ✓ | - |
| user-data-isolation.0.3 | ✓ | ✓ | ✓ |
| user-data-isolation.0.4 | ✓ | ✓ | ✓ |
| user-data-isolation.0.5 | - | - | - |
| user-data-isolation.1.1 | ✓ | ✓ | - |
| user-data-isolation.1.2 | ✓ | ✓ | ✓ |
| user-data-isolation.1.3 | ✓ | ✓ | ✓ |
| user-data-isolation.1.4 | ✓ | - | ✓ |
| user-data-isolation.1.5 | ✓ | - | - |
| user-data-isolation.2.1 | - | - | ✓ |
| user-data-isolation.2.2 | - | - | ✓ |
| user-data-isolation.2.3 | - | - | - |
| user-data-isolation.2.4 | ✓ | ✓ | ✓ |
| user-data-isolation.2.5 | ✓ | ✓ | ✓ |
| user-data-isolation.2.6 | ✓ | - | - |
| user-data-isolation.2.7 | - | - | ✓ |
| user-data-isolation.2.8 | - | - | ✓ |
| user-data-isolation.2.9 | - | - | - |
| user-data-isolation.3.1 | ✓ | ✓ | - |
| user-data-isolation.3.2 | ✓ | ✓ | ✓ |
| user-data-isolation.3.3 | - | - | - |
| user-data-isolation.4.1 | - | - | ✓ |
| user-data-isolation.4.2 | - | - | ✓ |
| user-data-isolation.4.3 | ✓ | - | - |
| user-data-isolation.4.4 | - | ✓ | ✓ |
| user-data-isolation.5.1 | ✓ | - | ✓ |
| user-data-isolation.5.2 | ✓ | - | - |
| user-data-isolation.5.3 | ✓ | - | - |
| user-data-isolation.5.4 | ✓ | - | - |
| user-data-isolation.6.1 | ✓ | - | ✓ |
| user-data-isolation.6.2 | ✓ | - | - |
| user-data-isolation.6.3 | ✓ | ✓ | ✓ |
| user-data-isolation.6.4 | ✓ | - | ✓ |
| user-data-isolation.6.5 | ✓ | ✓ | ✓ |
| user-data-isolation.6.6 | ✓ | ✓ | ✓ |
| user-data-isolation.6.7 | ✓ | - | ✓ |
| user-data-isolation.6.8 | ✓ | ✓ | - |
| user-data-isolation.6.9 | ✓ | - | ✓ |
| user-data-isolation.6.10 | ✓ | - | ✓ |
| user-data-isolation.6.11 | ✓ | - | - |

---

## Технические Решения

### Решение 1: Отдельная таблица users

**Решение:** Использовать отдельную таблицу `users` с `user_id` вместо хранения email напрямую в таблицах данных.

**Обоснование:**
- Стабильный идентификатор (email может измениться)
- Нормализация данных
- Возможность хранить дополнительную информацию о пользователе
- Эффективные индексы

**Requirements:** user-data-isolation.0.1, user-data-isolation.0.2

### Решение 2: Случайная 10-символьная alphanumeric строка для user_id

**Решение:** Генерировать `user_id` как случайную alphanumeric строку длиной 10 символов (A-Z, a-z, 0-9).

**Обоснование:**
- Простой: легко генерировать без внешних зависимостей
- Уникальный: 62^10 ≈ 8.4 × 10^17 комбинаций (достаточно для локального приложения)
- Компактный для хранения и логирования
- Не содержит персональной информации

**Requirements:** user-data-isolation.0.2, user-data-isolation.1.1

### Решение 3: Логика приложения вместо FOREIGN KEY

**Решение:** Поддерживать целостность данных через логику приложения, а не через FOREIGN KEY constraints.

**Обоснование:**
- Упрощает миграции
- Позволяет сохранять "осиротевшие" данные (не удаляются автоматически)
- Более гибкое управление данными

**Requirements:** user-data-isolation.2.9

### Решение 4: DatabaseManager как единая точка входа

**Решение:** Создать DatabaseManager как единую точку входа для доступа к БД, инициализации и получения текущего user_id.

**Обоснование:**
- Централизованное управление подключением к БД
- Единая точка для получения user_id (через UserManager)
- Все менеджеры данных используют DatabaseManager
- Упрощает тестирование (один мок вместо нескольких)

**Requirements:** user-data-isolation.6.1, user-data-isolation.6.2, user-data-isolation.6.3

### Решение 5: Переименование DataManager в UserSettingsManager

**Решение:** Переименовать DataManager в UserSettingsManager для более точного отражения его назначения.

**Обоснование:**
- DataManager работает только с таблицей user_data (key-value storage)
- Название UserSettingsManager точнее отражает назначение класса
- DatabaseManager теперь является точкой входа для доступа к БД
- Разделение ответственности: DatabaseManager — доступ к БД, UserSettingsManager — пользовательские настройки

**Requirements:** user-data-isolation.6.5, user-data-isolation.6.6

### Решение 6: Расширение UserProfileManager

**Решение:** Добавить логику управления таблицей users в существующий UserProfileManager вместо создания отдельного класса.

**Обоснование:**
- UserProfileManager уже управляет профилем пользователя
- Логика findOrCreateUser тесно связана с авторизацией
- Меньше классов = проще архитектура
- Единая точка управления идентификацией пользователя

**Requirements:** user-data-isolation.1.1, user-data-isolation.1.2
