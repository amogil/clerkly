# Документ Дизайна: User Data Isolation

## Обзор

Данный документ описывает дизайн системы изоляции данных пользователей в приложении Clerkly. Система обеспечивает автоматическую фильтрацию данных по user_id пользователя, позволяя нескольким пользователям безопасно использовать одно приложение на одном устройстве.

**Архитектурный Принцип:** Следует принципу **Единого Источника Истины (Single Source of Truth)**, где база данных является единственным источником истины для всех пользовательских данных. При смене пользователя данные предыдущего пользователя остаются в базе и автоматически восстанавливаются при повторном входе.

## Архитектура

### Компоненты

```
┌─────────────────────────────────────────────────────────────┐
│                    User Data Isolation                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │ UserProfileManager   │──────▶│ DataManager         │     │
│  │                      │       │                     │     │
│  │ - currentUserId      │       │ - saveData()        │     │
│  │ - fetchProfile()     │       │ - loadData()        │     │
│  │ - getCurrentUserId() │       │ - deleteData()      │     │
│  └──────────────────────┘       │ + user_id filter    │     │
│           │                      └─────────────────────┘     │
│           │                                │                 │
│           ▼                                ▼                 │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │ Google OAuth         │       │    SQLite DB        │     │
│  │ (email from profile) │       │  users table        │     │
│  └──────────────────────┘       │  user_data table    │     │
│                                  │  + user_id col      │     │
│                                  └─────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Поток Данных

1. **Авторизация:**
   - Пользователь авторизуется через Google OAuth
   - UserProfileManager получает email из профиля
   - Система находит или создает запись в таблице `users` по email
   - user_id кэшируется в `currentUserId`

2. **Сохранение Данных:**
   - Приложение вызывает `DataManager.saveData(key, value)`
   - DataManager автоматически получает user_id через `getCurrentUserId()`
   - Данные сохраняются с привязкой к `user_id`

3. **Загрузка Данных:**
   - Приложение вызывает `DataManager.loadData(key)`
   - DataManager автоматически фильтрует по `user_id`
   - Возвращаются только данные текущего пользователя

4. **Смена Пользователя:**
   - Пользователь A выходит (logout)
   - `currentUserId` очищается
   - Пользователь B авторизуется
   - Система находит/создает user_id для пользователя B
   - `currentUserId` устанавливается на user_id пользователя B
   - Все операции с данными автоматически фильтруются по новому user_id

## Модели Данных

### users Table Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

**Примечание:** user_id генерируется как случайная alphanumeric строка длиной 10 символов при создании пользователя.

### user_data Table Schema

```sql
CREATE TABLE IF NOT EXISTS user_data (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (key, user_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_id ON user_data(user_id);
```

### UserProfile Interface

```typescript
interface UserProfile {
  id: string;
  email: string;
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  lastUpdated: number;
}

interface User {
  user_id: string;  // 10-character alphanumeric string
  name: string | null;
  email: string;
}
```

## Компоненты и Интерфейсы

### UserManager

```typescript
class UserManager {
  /**
   * Generate random user_id (10 alphanumeric characters)
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
   * Requirements: user-data-isolation.0.2, user-data-isolation.0.3, user-data-isolation.0.4
   */
  async findOrCreateUser(email: string, name: string | null): Promise<User> {
    // Try to find existing user
    const existingUser = this.db.prepare(
      'SELECT user_id, name, email FROM users WHERE email = ?'
    ).get(email) as User | undefined;

    if (existingUser) {
      // Update name if changed
      if (name && existingUser.name !== name) {
        this.db.prepare('UPDATE users SET name = ? WHERE user_id = ?')
          .run(name, existingUser.user_id);
        existingUser.name = name;
      }
      return existingUser;
    }

    // Create new user with random user_id
    const userId = this.generateUserId();
    this.db.prepare(
      'INSERT INTO users (user_id, name, email) VALUES (?, ?, ?)'
    ).run(userId, name, email);

    return {
      user_id: userId,
      name,
      email
    };
  }
}
```

### DataManager (Extended)

```typescript
class DataManager {
  private userProfileManager: UserProfileManager;

  constructor(userProfileManager: UserProfileManager) {
    this.userProfileManager = userProfileManager;
  }

  /**
   * Save data with automatic user_id filtering
   * Requirements: user-data-isolation.1.3, user-data-isolation.1.11, user-data-isolation.1.12
   */
  async saveData(key: string, value: any): Promise<void> {
    // Requirements: user-data-isolation.1.14 - Check if user is logged in
    const userId = this.userProfileManager.getCurrentUserId();
    if (!userId) {
      console.error('[DataManager] No user logged in');
      throw new Error('No user logged in');
    }

    try {
      const valueJson = JSON.stringify(value);
      
      // Requirements: user-data-isolation.1.3 - Automatically add user_id
      await this.db.run(
        `INSERT OR REPLACE INTO user_data (key, value, user_id) VALUES (?, ?, ?)`,
        [key, valueJson, userId]
      );
      
      console.log(`[DataManager] Data saved for user ${userId}, key: ${key}`);
    } catch (error) {
      console.error('[DataManager] Failed to save data:', error);
      throw error;
    }
  }

  /**
   * Load data with automatic user_id filtering
   * Requirements: user-data-isolation.1.4, user-data-isolation.1.13
   */
  async loadData(key: string): Promise<{ success: boolean; data?: any; error?: string }> {
    // Requirements: user-data-isolation.1.14 - Check if user is logged in
    const userId = this.userProfileManager.getCurrentUserId();
    if (!userId) {
      return {
        success: false,
        error: 'No user logged in'
      };
    }

    try {
      // Requirements: user-data-isolation.1.4 - Filter by user_id
      const row = await this.db.get(
        `SELECT value FROM user_data WHERE key = ? AND user_id = ?`,
        [key, userId]
      );

      if (row) {
        const data = JSON.parse(row.value);
        console.log(`[DataManager] Data loaded for user ${userId}, key: ${key}`);
        return { success: true, data };
      }

      return { success: true, data: null };
    } catch (error) {
      console.error('[DataManager] Failed to load data:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Delete data with automatic user_id filtering
   * Requirements: user-data-isolation.1.4
   */
  async deleteData(key: string): Promise<void> {
    // Requirements: user-data-isolation.1.14 - Check if user is logged in
    const userId = this.userProfileManager.getCurrentUserId();
    if (!userId) {
      console.error('[DataManager] No user logged in');
      throw new Error('No user logged in');
    }

    try {
      // Requirements: user-data-isolation.1.4 - Filter by user_id
      await this.db.run(
        `DELETE FROM user_data WHERE key = ? AND user_id = ?`,
        [key, userId]
      );
      
      console.log(`[DataManager] Data deleted for user ${userId}, key: ${key}`);
    } catch (error) {
      console.error('[DataManager] Failed to delete data:', error);
      throw error;
    }
  }
}
```

### UserProfileManager (Extended)

```typescript
class UserProfileManager {
  private currentUserId: string | null = null; // Requirements: user-data-isolation.1.15
  private userManager: UserManager;

  /**
   * Get current user ID
   * Requirements: user-data-isolation.1.11, user-data-isolation.1.15
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /**
   * Fetch profile from Google API and set user_id
   * Requirements: user-data-isolation.1.16
   */
  async fetchProfile(): Promise<UserProfile | null> {
    try {
      const authStatus = await this.oauthClient.getAuthStatus();
      if (!authStatus.authorized || !authStatus.tokens?.access_token) {
        return null;
      }

      const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
        headers: { Authorization: `Bearer ${authStatus.tokens.access_token}` }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.statusText}`);
      }

      const profile = await response.json();
      
      // Requirements: user-data-isolation.1.16 - Find or create user and cache user_id
      const user = await this.userManager.findOrCreateUser(profile.email, profile.name);
      this.currentUserId = user.user_id;
      
      await this.saveProfile(profile);
      return profile;
    } catch (error) {
      console.error('[UserProfileManager] Failed to fetch profile:', error);
      return null;
    }
  }

  /**
   * Initialize profile on app startup
   * Requirements: user-data-isolation.1.17
   */
  async initialize(): Promise<void> {
    try {
      const profile = await this.loadProfile();
      if (profile) {
        // Requirements: user-data-isolation.1.17 - Find user and set currentUserId
        const user = await this.userManager.findOrCreateUser(profile.email, profile.name);
        this.currentUserId = user.user_id;
        console.log('[UserProfileManager] User ID cached from stored profile:', user.user_id);
      }
    } catch (error) {
      console.error('[UserProfileManager] Failed to initialize:', error);
    }
  }

  /**
   * Clear session on logout
   * Requirements: user-data-isolation.1.18
   */
  async clearSession(): Promise<void> {
    // Requirements: user-data-isolation.1.18 - Clear currentUserId
    this.currentUserId = null;
    console.log('[UserProfileManager] User ID cleared');
  }
}
```

## Свойства Корректности

*Свойство (property) — это характеристика или поведение, которое должно выполняться для всех допустимых выполнений системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.*

### Property 44: Автоматическое добавление user_id при сохранении

*Для любого* вызова `saveData(key, value)`, система должна автоматически добавить `user_id` текущего авторизованного пользователя к сохраняемым данным без явного параметра в методе.

**Validates: Requirements 1.3, 1.11, 1.12**

### Property 45: Автоматическая фильтрация по user_id при загрузке

*Для любого* вызова `loadData(key)`, система должна автоматически фильтровать данные по `user_id` текущего авторизованного пользователя без явного параметра в методе.

**Validates: Requirements 1.4, 1.13**

### Property 46: Изоляция данных между пользователями

*Для любых* двух пользователей A и B с разными user_id, данные сохраненные пользователем A не должны быть доступны пользователю B при загрузке.

**Validates: Requirements 1.6, 1.8**

### Property 47: Восстановление данных при повторном входе

*Для любого* пользователя, после logout и повторного login с тем же email, все ранее сохраненные данные должны быть восстановлены в неизменном виде (user_id остается тем же).

**Validates: Requirements 1.5, 1.7**

### Property 48: Определение пользователя по OAuth email

*Для любого* успешного OAuth профиля, система должна корректно извлечь email, найти или создать запись в таблице users, и использовать user_id для идентификации пользователя.

**Validates: Requirements 0.2, 0.3, 1.1, 1.16**

### Property 49: Очистка user_id при logout

*Для любого* авторизованного пользователя, после выполнения logout операции, `currentUserId` должен быть установлен в `null`.

**Validates: Requirements 1.18**

### Property 50: Изоляция применяется ко всем типам данных

*Для любого* типа пользовательских данных (настройки, профиль, токены, агенты, задачи, контакты, календарь), изоляция по `user_id` должна применяться автоматически.

**Validates: Requirements 1.8**

## Обработка Ошибок

### Ошибка: "No user logged in"

**Сценарий 1:** Пользователь не авторизован
- **Действие:** Перенаправить на экран логина
- **Очистка:** Очистить все кэши
- **Requirements:** user-data-isolation.1.19

**Сценарий 2:** Сессия истекла во время работы
- **Действие:** Применить процедуру восстановления сессии (token-management-ui.1.1, token-management-ui.1.3)
- **При успехе:** Повторить операцию без уведомления пользователю
- **Requirements:** user-data-isolation.1.20

**Сценарий 3:** Race condition во время logout
- **Действие:** Молча игнорировать ошибку
- **Логирование:** Логировать через Logger класс (clerkly.3)
- **Requirements:** user-data-isolation.1.21

## Стратегия Тестирования

### Модульные Тесты

#### UserManager

```typescript
describe('UserManager', () => {
  /* Preconditions: empty users table
     Action: call findOrCreateUser('test@example.com', 'Test User')
     Assertions: new user created with auto-generated user_id
     Requirements: user-data-isolation.0.2 */
  it('should create new user on first login', async () => {
    // Тест создания нового пользователя
  });

  /* Preconditions: user exists in users table
     Action: call findOrCreateUser with same email
     Assertions: returns existing user_id
     Requirements: user-data-isolation.0.3 */
  it('should find existing user on re-login', async () => {
    // Тест поиска существующего пользователя
  });

  /* Preconditions: user exists with name 'Old Name'
     Action: call findOrCreateUser with same email but name 'New Name'
     Assertions: name is updated in database
     Requirements: user-data-isolation.0.4 */
  it('should update user name if changed', async () => {
    // Тест обновления имени
  });
});
```

#### DataManager (Extended)

```typescript
describe('DataManager - User Data Isolation', () => {
  /* Preconditions: UserProfileManager returns valid user_id
     Action: call saveData('key', 'value')
     Assertions: SQL query includes user_id in WHERE clause
     Requirements: user-data-isolation.1.3, user-data-isolation.1.11, user-data-isolation.1.12 */
  it('should automatically add user_id when saving', async () => {
    // Тест автоматического добавления user_id
  });

  /* Preconditions: UserProfileManager returns valid user_id
     Action: call loadData('key')
     Assertions: SQL query filters by user_id
     Requirements: user-data-isolation.1.4, user-data-isolation.1.13 */
  it('should automatically filter by user_id when loading', async () => {
    // Тест автоматической фильтрации
  });

  /* Preconditions: UserProfileManager returns null
     Action: call saveData('key', 'value')
     Assertions: throws Error('No user logged in')
     Requirements: user-data-isolation.1.14 */
  it('should throw error when no user logged in', async () => {
    // Тест ошибки при отсутствии пользователя
  });
});
```

#### UserProfileManager (Extended)

```typescript
describe('UserProfileManager - User ID Caching', () => {
  /* Preconditions: successful OAuth login
     Action: call fetchProfile()
     Assertions: currentUserId is set from users table
     Requirements: user-data-isolation.1.16 */
  it('should cache user_id after successful login', async () => {
    // Тест кэширования user_id
  });

  /* Preconditions: app startup with valid tokens
     Action: call initialize()
     Assertions: currentUserId is loaded from database
     Requirements: user-data-isolation.1.17 */
  it('should restore user_id from database on startup', async () => {
    // Тест восстановления user_id
  });

  /* Preconditions: user logged in
     Action: call clearSession()
     Assertions: currentUserId is null
     Requirements: user-data-isolation.1.18 */
  it('should clear user_id on logout', async () => {
    // Тест очистки user_id
  });
});
```

### Property-Based Тесты

```typescript
describe('User Data Isolation - Property Tests', () => {
  /* Property 44: Автоматическое добавление user_id */
  it('should always add user_id when saving data', () => {
    fc.assert(
      fc.property(
        fc.string(), // key
        fc.anything(), // value
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 10, maxLength: 10 }), // userId
        async (key, value, userId) => {
          // Setup: mock getCurrentUserId() to return userId
          // Action: saveData(key, value)
          // Assert: DB contains record with user_id = userId
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Property 45: Автоматическая фильтрация по user_id */
  it('should always filter by user_id when loading data', () => {
    fc.assert(
      fc.property(
        fc.string(), // key
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 10, maxLength: 10 }), // userId
        async (key, userId) => {
          // Setup: save data for multiple users
          // Action: loadData(key) with specific user
          // Assert: returns only data for that user
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Property 46: Изоляция данных между пользователями */
  it('should isolate data between different users', () => {
    fc.assert(
      fc.property(
        fc.string(), // key
        fc.anything(), // value
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 10, maxLength: 10 }), // userIdA
        fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'), { minLength: 10, maxLength: 10 }), // userIdB
        async (key, value, userIdA, userIdB) => {
          fc.pre(userIdA !== userIdB); // Ensure different users
          // Setup: save data as userA
          // Action: load data as userB
          // Assert: userB cannot see userA's data
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Property 47: Восстановление данных при повторном входе */
  it('should restore data after logout and re-login', () => {
    fc.assert(
      fc.property(
        fc.string(), // key
        fc.anything(), // value
        fc.emailAddress(), // userEmail
        async (key, value, email) => {
          // Setup: save data, logout, login again with same email
          // Action: load data after re-login
          // Assert: data is restored (same user_id)
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Функциональные Тесты

```typescript
describe('User Data Isolation Functional Tests', () => {
  /* Preconditions: user A logged in, data saved
     Action: logout user A, login user B, check data
     Assertions: user B cannot see user A's data
     Requirements: user-data-isolation.1.5, user-data-isolation.1.6, user-data-isolation.1.8 */
  it('should isolate data between different users', async () => {
    // Тест изоляции данных
  });

  /* Preconditions: user A logged in, data saved, logout
     Action: login user A again, load data
     Assertions: all data is restored
     Requirements: user-data-isolation.1.7, user-data-isolation.1.17 */
  it('should restore user data after re-login', async () => {
    // Тест восстановления данных
  });

  /* Preconditions: user A logged in, data saved
     Action: logout user A
     Assertions: data remains in database
     Requirements: user-data-isolation.1.5, user-data-isolation.1.8 */
  it('should persist data after logout', async () => {
    // Тест сохранности данных
  });

  /* Preconditions: multiple users with data
     Action: login as each user, load data
     Assertions: each user sees only their own data
     Requirements: user-data-isolation.1.4, user-data-isolation.1.6 */
  it('should filter data by user_id', async () => {
    // Тест фильтрации по user_id
  });

  /* Preconditions: not authenticated
     Action: attempt to save data
     Assertions: redirects to login screen, caches cleared
     Requirements: user-data-isolation.1.14, user-data-isolation.1.19 */
  it('should handle "No user logged in" error gracefully', async () => {
    // Тест обработки ошибки отсутствия пользователя
  });

  /* Preconditions: authenticated, token expires
     Action: token expires, attempt API request, system refreshes token
     Assertions: operation succeeds after automatic token refresh
     Requirements: user-data-isolation.1.20 */
  it('should retry operation after token refresh', async () => {
    // Тест повторной попытки после обновления токена
  });
});
```

## Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| user-data-isolation.0.1 | ✓ | - | - |
| user-data-isolation.0.2 | ✓ | - | ✓ |
| user-data-isolation.0.3 | ✓ | - | ✓ |
| user-data-isolation.0.4 | ✓ | - | ✓ |
| user-data-isolation.0.5 | - | - | - |
| user-data-isolation.1.1 | - | ✓ | ✓ |
| user-data-isolation.1.2 | ✓ | - | - |
| user-data-isolation.1.3 | ✓ | ✓ | ✓ |
| user-data-isolation.1.4 | ✓ | ✓ | ✓ |
| user-data-isolation.1.5 | - | ✓ | ✓ |
| user-data-isolation.1.6 | - | ✓ | ✓ |
| user-data-isolation.1.7 | - | ✓ | ✓ |
| user-data-isolation.1.8 | - | ✓ | ✓ |
| user-data-isolation.1.9 | - | - | ✓ |
| user-data-isolation.1.10 | - | - | - |
| user-data-isolation.1.11 | ✓ | ✓ | - |
| user-data-isolation.1.12 | ✓ | ✓ | - |
| user-data-isolation.1.13 | ✓ | ✓ | - |
| user-data-isolation.1.14 | ✓ | - | ✓ |
| user-data-isolation.1.15 | ✓ | - | - |
| user-data-isolation.1.16 | ✓ | ✓ | ✓ |
| user-data-isolation.1.17 | ✓ | - | ✓ |
| user-data-isolation.1.18 | ✓ | ✓ | ✓ |
| user-data-isolation.1.19 | - | - | ✓ |
| user-data-isolation.1.20 | - | - | ✓ |
| user-data-isolation.1.21 | ✓ | - | ✓ |

## Технические Решения

### Решение 22: Таблица Users для Изоляции Данных

**Решение:** Использовать отдельную таблицу `users` с числовым `user_id` вместо хранения email напрямую в таблицах данных.

**Обоснование:**
- Числовой ID эффективнее для индексов и JOIN операций
- Email может измениться (хотя редко), user_id остается постоянным
- Нормализация данных - email хранится в одном месте
- Возможность хранить дополнительную информацию о пользователе

**Альтернативы:**
- Использовать email напрямую как ключ (отклонено: менее эффективно, денормализация)
- Использовать UUID (отклонено: избыточно для локального приложения)

**Requirements:** user-data-isolation.0.1, user-data-isolation.0.2, user-data-isolation.0.3

### Решение 23: Автоматическая Изоляция Данных по user_id

**Решение:** Автоматически добавлять `user_id` при сохранении и фильтровать по `user_id` при загрузке данных без явных параметров в методах DataManager.

**Обоснование:**
- Упрощает API - не нужно передавать user_id в каждый метод
- Снижает риск ошибок - невозможно забыть добавить фильтр
- Централизованная логика изоляции в одном месте

**Альтернативы:**
- Требовать явную передачу user_id в каждый метод (отклонено: увеличивает сложность API)
- Использовать отдельные таблицы для каждого пользователя (отклонено: усложняет миграции)
- Использовать отдельные базы данных для каждого пользователя (отклонено: избыточная сложность)

**Requirements:** user-data-isolation.1.11, user-data-isolation.1.12, user-data-isolation.1.13

### Решение 24: Кэширование user_id в UserProfileManager

**Решение:** Хранить `currentUserId` в памяти в UserProfileManager и обновлять при авторизации/logout.

**Обоснование:**
- Быстрый доступ без запросов к БД
- Единственный источник истины для текущего пользователя
- Автоматическое обновление при смене пользователя

**Альтернативы:**
- Запрашивать user_id из БД при каждой операции (отклонено: медленно)
- Хранить user_id в глобальной переменной (отклонено: нарушает инкапсуляцию)

**Requirements:** user-data-isolation.1.15, user-data-isolation.1.16, user-data-isolation.1.17, user-data-isolation.1.18
