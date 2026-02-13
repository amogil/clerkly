# Документ Дизайна: User Data Isolation

## Обзор

Данный документ описывает дизайн системы изоляции данных пользователей в приложении Clerkly. Система обеспечивает автоматическую фильтрацию данных по `user_id`, позволяя нескольким пользователям безопасно использовать одно приложение на одном устройстве.

**Архитектурный Принцип:** Следует принципу **Единого Источника Истины (Single Source of Truth)**, где база данных является единственным источником истины для всех пользовательских данных.

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
│  │                     DataManager                           │   │
│  │                                                           │   │
│  │  - saveData(key, value): void                            │   │
│  │  - loadData(key): { success, data?, error? }             │   │
│  │  - deleteData(key): void                                 │   │
│  │  + автоматическая фильтрация по user_id                  │   │
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

### UserProfileManager (Extended)

**Файл:** `src/main/auth/UserProfileManager.ts`

```typescript
class UserProfileManager {
  // Requirements: user-data-isolation.1.3
  private currentUserId: string | null = null;
  
  // Flag to prevent profile loading after logout
  private isLoggedOut: boolean = false;

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
   * 2. If found: update name if changed, return existing user_id
   * 3. If not found: generate random user_id, create record, return new user_id
   */
  findOrCreateUser(email: string, name: string | null): User {
    // Try to find existing user
    const existingUser = this.db.prepare(
      'SELECT user_id, name, email FROM users WHERE email = ?'
    ).get(email) as User | undefined;

    if (existingUser) {
      // Update name if changed
      if (name !== null && existingUser.name !== name) {
        this.db.prepare('UPDATE users SET name = ? WHERE user_id = ?')
          .run(name, existingUser.user_id);
        this.logger.info(`Updated name for user ${existingUser.user_id}`);
        return { ...existingUser, name };
      }
      this.logger.info(`Found existing user ${existingUser.user_id}`);
      return existingUser;
    }

    // Create new user with random user_id
    const userId = this.generateUserId();
    this.db.prepare(
      'INSERT INTO users (user_id, name, email) VALUES (?, ?, ?)'
    ).run(userId, name, email);

    this.logger.info(`Created new user ${userId} for ${email}`);
    return { user_id: userId, name, email };
  }

  /**
   * Get current user ID
   * Requirements: user-data-isolation.1.5
   * 
   * Returns the cached user_id of the currently logged in user.
   * Used by DataManager to filter data by user_id.
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Fetch profile from Google API and set user_id
   * Requirements: user-data-isolation.1.2, error-notifications.1.4
   */
  async fetchProfile(): Promise<UserProfile | null> {
    try {
      // ... fetch profile from Google API ...
      const profile = await response.json();
      
      // Find or create user and cache user_id
      const user = this.findOrCreateUser(profile.email, profile.name);
      this.currentUserId = user.user_id;
      this.isLoggedOut = false;
      
      this.logger.info(`User ID set: ${user.user_id}`);
      await this.saveProfile(profile);
      return profile;
    } catch (error) {
      ErrorHandler.handleBackgroundError(error, 'Profile Loading');
      return null;
    }
  }

  /**
   * Initialize profile on app startup
   * Requirements: user-data-isolation.1.3, error-notifications.1.4
   */
  async initialize(): Promise<void> {
    try {
      const profile = await this.loadProfile();
      if (profile && !this.isLoggedOut) {
        const user = this.findOrCreateUser(profile.email, profile.name);
        this.currentUserId = user.user_id;
        this.logger.info(`Initialized with user ID: ${user.user_id}`);
      }
    } catch (error) {
      ErrorHandler.handleBackgroundError(error, 'Profile Initialization');
    }
  }

  /**
   * Clear session on logout
   * Requirements: user-data-isolation.1.4
   */
  clearSession(): void {
    this.currentUserId = null;
    this.isLoggedOut = true;
    this.logger.info('User ID cleared');
  }
}
```

### DataManager (Extended)

**Файл:** `src/main/DataManager.ts`

```typescript
class DataManager {
  // Requirements: user-data-isolation.3.1
  private userProfileManager: UserProfileManager;

  constructor(/* ... */, userProfileManager: UserProfileManager) {
    this.userProfileManager = userProfileManager;
  }

  /**
   * Save data with automatic user_id filtering
   * Requirements: user-data-isolation.2.4, user-data-isolation.3.2, user-data-isolation.3.3
   */
  saveData(key: string, value: any): void {
    const userId = this.userProfileManager.getCurrentUserId();
    if (!userId) {
      throw new Error('No user logged in');
    }

    const now = Date.now();
    const valueJson = JSON.stringify(value);
    
    this.db.prepare(`
      INSERT INTO user_data (key, value, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key, user_id) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).run(key, valueJson, userId, now, now);
    
    this.logger.info(`Data saved for user ${userId}, key: ${key}`);
  }

  /**
   * Load data with automatic user_id filtering
   * Requirements: user-data-isolation.2.5, user-data-isolation.3.2, user-data-isolation.3.3
   */
  loadData(key: string): { success: boolean; data?: any; error?: string } {
    const userId = this.userProfileManager.getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'No user logged in' };
    }

    const row = this.db
      .prepare('SELECT value FROM user_data WHERE key = ? AND user_id = ?')
      .get(key, userId) as { value: string } | undefined;

    if (row) {
      const data = JSON.parse(row.value);
      this.logger.info(`Data loaded for user ${userId}, key: ${key}`);
      return { success: true, data };
    }

    return { success: true, data: null };
  }

  /**
   * Delete data with automatic user_id filtering
   * Requirements: user-data-isolation.2.6, user-data-isolation.3.2, user-data-isolation.3.3
   */
  deleteData(key: string): void {
    const userId = this.userProfileManager.getCurrentUserId();
    if (!userId) {
      throw new Error('No user logged in');
    }

    this.db.prepare('DELETE FROM user_data WHERE key = ? AND user_id = ?')
      .run(key, userId);
    
    this.logger.info(`Data deleted for user ${userId}, key: ${key}`);
  }
}
```

### Обработка Ошибок Изоляции

**Requirements:** user-data-isolation.4, error-notifications.1

Ошибки изоляции данных обрабатываются на уровне вызывающего кода, который знает контекст операции:

```typescript
// В компонентах, использующих DataManager
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
- DataManager просто бросает ошибку `'No user logged in'` без вызова ErrorHandler
- Вызывающий код решает, как обработать ошибку в зависимости от контекста
- Если контекст содержит "Logout", ErrorHandler автоматически фильтрует ошибку (не показывает пользователю)
- Все ошибки ВСЕГДА логируются для отладки
```

### Глобальные Настройки (Исключения из Изоляции)

**Requirements:** user-data-isolation.2.8

Некоторые данные НЕ должны изолироваться по пользователю:

```typescript
// Window State - глобальные настройки окна
// Requirements: window-management.5.7, user-data-isolation.2.8

class WindowStateManager {
  // Использует отдельную таблицу window_state без user_id
  // Состояние окна одинаково для всех пользователей на устройстве
  
  saveWindowState(state: WindowState): void {
    // НЕ использует user_id - глобальное состояние
    this.db.prepare(`
      INSERT OR REPLACE INTO window_state (key, value)
      VALUES ('main_window', ?)
    `).run(JSON.stringify(state));
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

*Для любого* вызова `saveData(key, value)` или `loadData(key)`, система ДОЛЖНА автоматически использовать `user_id` текущего пользователя без явного параметра.

**Validates:** user-data-isolation.3.1, user-data-isolation.3.3

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
```

#### DataManager

**Файл:** `tests/unit/DataManager.test.ts` (extended)

```typescript
describe('DataManager - User Data Isolation', () => {
  /* Preconditions: UserProfileManager returns valid user_id
     Action: call saveData('key', 'value')
     Assertions: data saved with user_id
     Requirements: user-data-isolation.2.4, user-data-isolation.3.2 */
  it('should automatically add user_id when saving');

  /* Preconditions: UserProfileManager returns valid user_id
     Action: call loadData('key')
     Assertions: SQL query filters by user_id
     Requirements: user-data-isolation.2.5, user-data-isolation.3.2 */
  it('should automatically filter by user_id when loading');

  /* Preconditions: UserProfileManager returns null
     Action: call saveData('key', 'value')
     Assertions: throws Error('No user logged in')
     Requirements: user-data-isolation.3.3 */
  it('should throw error when no user logged in');
});
```

### Property-Based Тесты

**Файл:** `tests/property/UserDataIsolation.property.test.ts`

```typescript
describe('User Data Isolation - Property Tests', () => {
  /* Property 1: Генерация user_id */
  it('should always generate valid 10-char alphanumeric user_id');

  /* Property 2: Идемпотентность findOrCreateUser */
  it('should return same user_id for same email');

  /* Property 3: Изоляция данных */
  it('should isolate data between different users');
});
```

### Функциональные Тесты

**Файл:** `tests/functional/user-data-isolation.spec.ts`

```typescript
describe('User Data Isolation Functional Tests', () => {
  test('should create user record on first login');
  test('should find existing user on re-login');
  test('should update user name if changed');
  test('should isolate data between different users');
  test('should persist data after logout');
  test('should restore user data after re-login');
  test('should filter data by user_id');
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
| user-data-isolation.0.4 | ✓ | - | ✓ |
| user-data-isolation.0.5 | - | - | - |
| user-data-isolation.1.1 | ✓ | - | - |
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
| user-data-isolation.3.2 | ✓ | - | ✓ |
| user-data-isolation.3.3 | ✓ | ✓ | - |
| user-data-isolation.4.1 | - | - | ✓ |
| user-data-isolation.4.2 | - | - | ✓ |
| user-data-isolation.4.3 | ✓ | - | - |
| user-data-isolation.4.4 | - | ✓ | ✓ |
| user-data-isolation.5.1 | ✓ | - | ✓ |
| user-data-isolation.5.2 | ✓ | - | - |
| user-data-isolation.5.3 | ✓ | - | - |
| user-data-isolation.5.4 | ✓ | - | - |

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

### Решение 4: Расширение UserProfileManager

**Решение:** Добавить логику управления таблицей users в существующий UserProfileManager вместо создания отдельного класса.

**Обоснование:**
- UserProfileManager уже управляет профилем пользователя
- Логика findOrCreateUser тесно связана с авторизацией
- Меньше классов = проще архитектура
- Единая точка управления идентификацией пользователя

**Requirements:** user-data-isolation.1.1, user-data-isolation.1.2
