# Документ Дизайна: User Data Isolation

## Обзор

Данный документ описывает дизайн системы изоляции данных пользователей в приложении Clerkly. Система обеспечивает автоматическую фильтрацию данных по `user_id`, позволяя нескольким пользователям безопасно использовать одно приложение на одном устройстве.

**Архитектурный Принцип:** Следует принципу **Единого Источника Истины (Single Source of Truth)**, где база данных является единственным источником истины для всех пользовательских данных.

## Архитектура

### Диаграмма Компонентов

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Data Isolation                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐      ┌──────────────────┐                 │
│  │ UserProfileManager│─────▶│   UserManager    │                 │
│  │                  │      │                  │                 │
│  │ - currentUserId  │      │ - generateUserId │                 │
│  │ - getCurrentUserId│      │ - findOrCreateUser│                │
│  │ - fetchProfile   │      └────────┬─────────┘                 │
│  │ - clearSession   │               │                           │
│  └────────┬─────────┘               │                           │
│           │                         │                           │
│           ▼                         ▼                           │
│  ┌──────────────────┐      ┌──────────────────┐                 │
│  │   DataManager    │      │    SQLite DB     │                 │
│  │                  │      │                  │                 │
│  │ - saveData()     │─────▶│  ┌────────────┐  │                 │
│  │ - loadData()     │      │  │   users    │  │                 │
│  │ - deleteData()   │      │  └────────────┘  │                 │
│  │ + user_id filter │      │  ┌────────────┐  │                 │
│  └──────────────────┘      │  │ user_data  │  │                 │
│                            │  └────────────┘  │                 │
│                            └──────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

### Поток Данных

1. **Авторизация:**
   - Пользователь авторизуется через Google OAuth
   - UserProfileManager получает email и name из профиля
   - UserProfileManager вызывает `UserManager.findOrCreateUser(email, name)`
   - UserManager находит или создает запись в таблице `users`
   - `currentUserId` кэшируется в UserProfileManager

2. **Сохранение Данных:**
   - Приложение вызывает `DataManager.saveData(key, value)`
   - DataManager получает `user_id` через `userProfileManager.getCurrentUserId()`
   - Данные сохраняются с привязкой к `user_id`

3. **Загрузка Данных:**
   - Приложение вызывает `DataManager.loadData(key)`
   - DataManager автоматически фильтрует по `user_id`
   - Возвращаются только данные текущего пользователя

4. **Смена Пользователя:**
   - Пользователь A выходит (logout) → `currentUserId = null`
   - Пользователь B авторизуется → новый `currentUserId`
   - Все операции автоматически фильтруются по новому `user_id`

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

### Таблица user_data

```sql
CREATE TABLE IF NOT EXISTS user_data (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_id ON user_data(user_id);
```

**Поля:**
- `key` - ключ данных
- `value` - JSON-сериализованное значение
- `user_id` - FK на users.user_id
- `timestamp`, `created_at`, `updated_at` - временные метки

---

## Компоненты

### User Interface

```typescript
// Requirements: user-data-isolation.1.4
interface User {
  user_id: string;  // 10-character alphanumeric string
  name: string | null;
  email: string;
}
```

### UserManager

**Файл:** `src/main/auth/UserManager.ts`

```typescript
// Requirements: user-data-isolation.1.1
class UserManager {
  private db: Database;
  private logger: Logger;

  constructor(db: Database, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Generate random user_id (10 alphanumeric characters)
   * Requirements: user-data-isolation.0.2, user-data-isolation.1.2
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
   * Requirements: user-data-isolation.0.3, user-data-isolation.0.4, user-data-isolation.0.5, user-data-isolation.1.3
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
        this.logger.info(`[UserManager] Updated name for user ${existingUser.user_id}`);
        return { ...existingUser, name };
      }
      this.logger.info(`[UserManager] Found existing user ${existingUser.user_id}`);
      return existingUser;
    }

    // Create new user with random user_id
    const userId = this.generateUserId();
    this.db.prepare(
      'INSERT INTO users (user_id, name, email) VALUES (?, ?, ?)'
    ).run(userId, name, email);

    this.logger.info(`[UserManager] Created new user ${userId} for ${email}`);
    return { user_id: userId, name, email };
  }
}
```

### UserProfileManager (Extended)

**Файл:** `src/main/auth/UserProfileManager.ts`

```typescript
class UserProfileManager {
  // Requirements: user-data-isolation.3.2
  private currentUserId: string | null = null;
  private userManager: UserManager;

  constructor(/* ... */, userManager: UserManager) {
    this.userManager = userManager;
  }

  /**
   * Get current user ID
   * Requirements: user-data-isolation.3.3
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Fetch profile from Google API and set user_id
   * Requirements: user-data-isolation.3.4
   */
  async fetchProfile(): Promise<UserProfile | null> {
    try {
      // ... fetch profile from Google API ...
      const profile = await response.json();
      
      // Find or create user and cache user_id
      const user = this.userManager.findOrCreateUser(profile.email, profile.name);
      this.currentUserId = user.user_id;
      
      this.logger.info(`[UserProfileManager] User ID set: ${user.user_id}`);
      await this.saveProfile(profile);
      return profile;
    } catch (error) {
      this.logger.error('[UserProfileManager] Failed to fetch profile:', error);
      return null;
    }
  }

  /**
   * Initialize profile on app startup
   * Requirements: user-data-isolation.3.5
   */
  async initialize(): Promise<void> {
    try {
      const profile = await this.loadProfile();
      if (profile) {
        const user = this.userManager.findOrCreateUser(profile.email, profile.name);
        this.currentUserId = user.user_id;
        this.logger.info(`[UserProfileManager] Initialized with user ID: ${user.user_id}`);
      }
    } catch (error) {
      this.logger.error('[UserProfileManager] Failed to initialize:', error);
    }
  }

  /**
   * Clear session on logout
   * Requirements: user-data-isolation.3.6
   */
  async clearSession(): Promise<void> {
    this.currentUserId = null;
    this.logger.info('[UserProfileManager] User ID cleared');
  }
}
```

### DataManager (Extended)

**Файл:** `src/main/DataManager.ts`

```typescript
class DataManager {
  // Requirements: user-data-isolation.4.1
  private userProfileManager: UserProfileManager;

  constructor(/* ... */, userProfileManager: UserProfileManager) {
    this.userProfileManager = userProfileManager;
  }

  /**
   * Save data with automatic user_id filtering
   * Requirements: user-data-isolation.2.5, user-data-isolation.4.2, user-data-isolation.4.3
   */
  saveData(key: string, value: any): void {
    const userId = this.userProfileManager.getCurrentUserId();
    if (!userId) {
      this.logger.error('[DataManager] No user logged in');
      throw new Error('No user logged in');
    }

    const timestamp = Date.now();
    const valueJson = JSON.stringify(value);
    
    this.db.prepare(`
      INSERT INTO user_data (key, value, user_id, timestamp, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key, user_id) DO UPDATE SET
        value = excluded.value,
        timestamp = excluded.timestamp,
        updated_at = excluded.updated_at
    `).run(key, valueJson, userId, timestamp, timestamp, timestamp);
    
    this.logger.info(`[DataManager] Data saved for user ${userId}, key: ${key}`);
  }

  /**
   * Load data with automatic user_id filtering
   * Requirements: user-data-isolation.2.6, user-data-isolation.4.2, user-data-isolation.4.3
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
      this.logger.info(`[DataManager] Data loaded for user ${userId}, key: ${key}`);
      return { success: true, data };
    }

    return { success: true, data: null };
  }

  /**
   * Delete data with automatic user_id filtering
   * Requirements: user-data-isolation.2.7, user-data-isolation.4.2, user-data-isolation.4.3
   */
  deleteData(key: string): void {
    const userId = this.userProfileManager.getCurrentUserId();
    if (!userId) {
      this.logger.error('[DataManager] No user logged in');
      throw new Error('No user logged in');
    }

    this.db.prepare('DELETE FROM user_data WHERE key = ? AND user_id = ?')
      .run(key, userId);
    
    this.logger.info(`[DataManager] Data deleted for user ${userId}, key: ${key}`);
  }
}
```

---

## Миграция Данных

### Миграция: create_users_table

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

### Миграция: migrate_user_data_to_user_id

```sql
-- UP
-- 1. Create users from existing user_email values
INSERT OR IGNORE INTO users (user_id, name, email)
SELECT 
  lower(hex(randomblob(5))) as user_id,  -- 10-char hex string
  NULL as name,
  user_email as email
FROM user_data
WHERE user_email IS NOT NULL
GROUP BY user_email;

-- 2. Create new user_data table with user_id
CREATE TABLE user_data_new (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- 3. Copy data with user_id lookup
INSERT INTO user_data_new (key, value, user_id, timestamp, created_at, updated_at)
SELECT 
  ud.key,
  ud.value,
  u.user_id,
  ud.timestamp,
  ud.created_at,
  ud.updated_at
FROM user_data ud
JOIN users u ON ud.user_email = u.email;

-- 4. Replace old table
DROP TABLE user_data;
ALTER TABLE user_data_new RENAME TO user_data;

-- 5. Create index
CREATE INDEX IF NOT EXISTS idx_user_id ON user_data(user_id);

-- DOWN
-- Reverse migration (simplified - may lose data)
ALTER TABLE user_data ADD COLUMN user_email TEXT;
UPDATE user_data SET user_email = (SELECT email FROM users WHERE users.user_id = user_data.user_id);
```

---

## Свойства Корректности

### Property 1: Генерация user_id

*Для любого* вызова `generateUserId()`, результат ДОЛЖЕН быть строкой длиной 10 символов, содержащей только alphanumeric символы (A-Z, a-z, 0-9).

**Validates:** user-data-isolation.0.2, user-data-isolation.1.2

### Property 2: Идемпотентность findOrCreateUser

*Для любого* email, повторные вызовы `findOrCreateUser(email, name)` ДОЛЖНЫ возвращать один и тот же `user_id`.

**Validates:** user-data-isolation.0.4, user-data-isolation.1.3

### Property 3: Изоляция данных

*Для любых* двух пользователей A и B с разными `user_id`, данные сохраненные пользователем A НЕ ДОЛЖНЫ быть доступны пользователю B.

**Validates:** user-data-isolation.2.5, user-data-isolation.2.6, user-data-isolation.5.4

### Property 4: Автоматическая фильтрация

*Для любого* вызова `saveData(key, value)` или `loadData(key)`, система ДОЛЖНА автоматически использовать `user_id` текущего пользователя без явного параметра.

**Validates:** user-data-isolation.4.2, user-data-isolation.4.4

### Property 5: Восстановление данных

*Для любого* пользователя, после logout и повторного login с тем же email, все ранее сохраненные данные ДОЛЖНЫ быть восстановлены (тот же `user_id`).

**Validates:** user-data-isolation.0.4, user-data-isolation.3.5

---

## Стратегия Тестирования

### Модульные Тесты

#### UserManager

**Файл:** `tests/unit/auth/UserManager.test.ts`

```typescript
describe('UserManager', () => {
  /* Preconditions: empty users table
     Action: call generateUserId()
     Assertions: returns 10-char alphanumeric string
     Requirements: user-data-isolation.0.2, user-data-isolation.1.2 */
  it('should generate valid 10-character alphanumeric user_id');

  /* Preconditions: empty users table
     Action: call findOrCreateUser('test@example.com', 'Test User')
     Assertions: creates new user with generated user_id
     Requirements: user-data-isolation.0.3, user-data-isolation.1.3 */
  it('should create new user on first login');

  /* Preconditions: user exists in users table
     Action: call findOrCreateUser with same email
     Assertions: returns existing user_id
     Requirements: user-data-isolation.0.4, user-data-isolation.1.3 */
  it('should find existing user on re-login');

  /* Preconditions: user exists with name 'Old Name'
     Action: call findOrCreateUser with same email but name 'New Name'
     Assertions: name is updated in database
     Requirements: user-data-isolation.0.5, user-data-isolation.1.3 */
  it('should update user name if changed');
});
```

#### DataManager

**Файл:** `tests/unit/DataManager.test.ts` (extended)

```typescript
describe('DataManager - User Data Isolation', () => {
  /* Preconditions: UserProfileManager returns valid user_id
     Action: call saveData('key', 'value')
     Assertions: data saved with user_id
     Requirements: user-data-isolation.2.5, user-data-isolation.4.2 */
  it('should automatically add user_id when saving');

  /* Preconditions: UserProfileManager returns valid user_id
     Action: call loadData('key')
     Assertions: SQL query filters by user_id
     Requirements: user-data-isolation.2.6, user-data-isolation.4.2 */
  it('should automatically filter by user_id when loading');

  /* Preconditions: UserProfileManager returns null
     Action: call saveData('key', 'value')
     Assertions: throws Error('No user logged in')
     Requirements: user-data-isolation.4.3 */
  it('should throw error when no user logged in');
});
```

### Property-Based Тесты

**Файл:** `tests/property/UserDataIsolation.property.test.ts`

```typescript
describe('User Data Isolation - Property Tests', () => {
  /* Property 1: Генерация user_id */
  it('should always generate valid 10-char alphanumeric user_id', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (iterations) => {
        for (let i = 0; i < iterations; i++) {
          const userId = userManager.generateUserId();
          expect(userId).toHaveLength(10);
          expect(userId).toMatch(/^[A-Za-z0-9]+$/);
        }
      }),
      { numRuns: 100 }
    );
  });

  /* Property 2: Идемпотентность findOrCreateUser */
  it('should return same user_id for same email', () => {
    fc.assert(
      fc.property(fc.emailAddress(), fc.string(), (email, name) => {
        const user1 = userManager.findOrCreateUser(email, name);
        const user2 = userManager.findOrCreateUser(email, name);
        expect(user1.user_id).toBe(user2.user_id);
      }),
      { numRuns: 100 }
    );
  });

  /* Property 3: Изоляция данных */
  it('should isolate data between different users', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.anything(),
        fc.emailAddress(),
        fc.emailAddress(),
        (key, value, emailA, emailB) => {
          fc.pre(emailA !== emailB);
          // Save as userA, try to load as userB
          // Assert: userB cannot see userA's data
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Функциональные Тесты

**Файл:** `tests/functional/user-data-isolation.spec.ts`

```typescript
describe('User Data Isolation Functional Tests', () => {
  /* Preconditions: clean database
     Action: login as new user
     Assertions: user record created in users table
     Requirements: user-data-isolation.0.3 */
  test('should create user record on first login');

  /* Preconditions: user exists in database
     Action: logout, login again
     Assertions: same user_id used
     Requirements: user-data-isolation.0.4 */
  test('should find existing user on re-login');

  /* Preconditions: user A logged in, data saved
     Action: logout, login as user B
     Assertions: user B cannot see user A's data
     Requirements: user-data-isolation.2.5, user-data-isolation.2.6 */
  test('should isolate data between different users');

  /* Preconditions: user logged in, data saved
     Action: logout
     Assertions: data persists in database
     Requirements: user-data-isolation.2.8 */
  test('should persist data after logout');

  /* Preconditions: user logged in, data saved, logout
     Action: login again
     Assertions: data restored
     Requirements: user-data-isolation.3.5 */
  test('should restore user data after re-login');
});
```

---

## Покрытие Требований

| Требование | Модульные | Property | Функциональные |
|------------|-----------|----------|----------------|
| user-data-isolation.0.1 | - | - | ✓ |
| user-data-isolation.0.2 | ✓ | ✓ | - |
| user-data-isolation.0.3 | ✓ | - | ✓ |
| user-data-isolation.0.4 | ✓ | ✓ | ✓ |
| user-data-isolation.0.5 | ✓ | - | ✓ |
| user-data-isolation.0.6 | - | - | - |
| user-data-isolation.1.1 | ✓ | - | - |
| user-data-isolation.1.2 | ✓ | ✓ | - |
| user-data-isolation.1.3 | ✓ | ✓ | ✓ |
| user-data-isolation.1.4 | ✓ | - | - |
| user-data-isolation.1.5 | ✓ | - | - |
| user-data-isolation.2.1 | - | - | ✓ |
| user-data-isolation.2.2 | - | - | ✓ |
| user-data-isolation.2.3 | - | - | ✓ |
| user-data-isolation.2.4 | - | - | - |
| user-data-isolation.2.5 | ✓ | ✓ | ✓ |
| user-data-isolation.2.6 | ✓ | ✓ | ✓ |
| user-data-isolation.2.7 | ✓ | - | - |
| user-data-isolation.2.8 | - | - | ✓ |
| user-data-isolation.2.9 | - | - | ✓ |
| user-data-isolation.3.1 | ✓ | - | - |
| user-data-isolation.3.2 | ✓ | - | - |
| user-data-isolation.3.3 | ✓ | - | - |
| user-data-isolation.3.4 | ✓ | - | ✓ |
| user-data-isolation.3.5 | ✓ | ✓ | ✓ |
| user-data-isolation.3.6 | ✓ | - | ✓ |
| user-data-isolation.4.1 | ✓ | - | - |
| user-data-isolation.4.2 | ✓ | ✓ | - |
| user-data-isolation.4.3 | ✓ | - | ✓ |
| user-data-isolation.4.4 | ✓ | ✓ | - |
| user-data-isolation.5.1 | - | - | ✓ |
| user-data-isolation.5.2 | - | - | ✓ |
| user-data-isolation.5.3 | ✓ | - | - |
| user-data-isolation.5.4 | - | ✓ | ✓ |
| user-data-isolation.6.1 | ✓ | - | - |
| user-data-isolation.6.2 | ✓ | - | - |
| user-data-isolation.6.3 | ✓ | - | - |
| user-data-isolation.6.4 | ✓ | - | - |
| user-data-isolation.6.5 | ✓ | - | - |

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

### Решение 2: 10-символьный alphanumeric user_id

**Решение:** Генерировать `user_id` как случайную alphanumeric строку длиной 10 символов.

**Обоснование:**
- 62^10 ≈ 8.4 × 10^17 возможных комбинаций (достаточно для локального приложения)
- Не содержит персональной информации
- Компактный для хранения и логирования
- Читаемый для отладки

**Requirements:** user-data-isolation.0.2, user-data-isolation.1.2

### Решение 3: Автоматическая изоляция в DataManager

**Решение:** DataManager автоматически получает `user_id` из UserProfileManager без явного параметра.

**Обоснование:**
- Упрощает API
- Снижает риск ошибок (невозможно забыть фильтр)
- Централизованная логика изоляции

**Requirements:** user-data-isolation.4.2, user-data-isolation.4.4
