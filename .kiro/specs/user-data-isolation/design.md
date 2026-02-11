# Документ Дизайна: User Data Isolation

## Обзор

Данный документ описывает дизайн системы изоляции данных пользователей в приложении Clerkly. Система обеспечивает автоматическую фильтрацию данных по email пользователя, полученному из Google OAuth профиля, позволяя нескольким пользователям безопасно использовать одно приложение на одном устройстве.

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
│  │ - currentUserEmail   │       │ - saveData()        │     │
│  │ - fetchProfile()     │       │ - loadData()        │     │
│  │ - getCurrentEmail()  │       │ - deleteData()      │     │
│  └──────────────────────┘       │ + user_email filter │     │
│           │                      └─────────────────────┘     │
│           │                                │                 │
│           ▼                                ▼                 │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │ Google OAuth         │       │    SQLite DB        │     │
│  │ (email from profile) │       │  user_data table    │     │
│  └──────────────────────┘       │  + user_email col   │     │
│                                  └─────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Поток Данных

1. **Авторизация:**
   - Пользователь авторизуется через Google OAuth
   - UserProfileManager получает email из профиля
   - Email кэшируется в `currentUserEmail`

2. **Сохранение Данных:**
   - Приложение вызывает `DataManager.saveData(key, value)`
   - DataManager автоматически получает email через `getCurrentEmail()`
   - Данные сохраняются с привязкой к `user_email`

3. **Загрузка Данных:**
   - Приложение вызывает `DataManager.loadData(key)`
   - DataManager автоматически фильтрует по `user_email`
   - Возвращаются только данные текущего пользователя

4. **Смена Пользователя:**
   - Пользователь A выходит (logout)
   - `currentUserEmail` очищается
   - Пользователь B авторизуется
   - `currentUserEmail` устанавливается на email пользователя B
   - Все операции с данными автоматически фильтруются по новому email

## Компоненты и Интерфейсы

### DataManager (Extended)

```typescript
class DataManager {
  private userProfileManager: UserProfileManager;

  constructor(userProfileManager: UserProfileManager) {
    this.userProfileManager = userProfileManager;
  }

  /**
   * Save data with automatic user_email filtering
   * Requirements: user-data-isolation.1.3, user-data-isolation.1.11
   */
  async saveData(key: string, value: any): Promise<void> {
    // Requirements: user-data-isolation.1.13 - Check if user is logged in
    const userEmail = this.userProfileManager.getCurrentEmail();
    if (!userEmail) {
      console.error('[DataManager] No user logged in');
      throw new Error('No user logged in');
    }

    try {
      const valueJson = JSON.stringify(value);
      
      // Requirements: user-data-isolation.1.3 - Automatically add user_email
      await this.db.run(
        `INSERT OR REPLACE INTO user_data (key, value, user_email) VALUES (?, ?, ?)`,
        [key, valueJson, userEmail]
      );
      
      console.log(`[DataManager] Data saved for user ${userEmail}, key: ${key}`);
    } catch (error) {
      console.error('[DataManager] Failed to save data:', error);
      throw error;
    }
  }

  /**
   * Load data with automatic user_email filtering
   * Requirements: user-data-isolation.1.4, user-data-isolation.1.12
   */
  async loadData(key: string): Promise<{ success: boolean; data?: any; error?: string }> {
    // Requirements: user-data-isolation.1.13 - Check if user is logged in
    const userEmail = this.userProfileManager.getCurrentEmail();
    if (!userEmail) {
      return {
        success: false,
        error: 'No user logged in'
      };
    }

    try {
      // Requirements: user-data-isolation.1.4 - Filter by user_email
      const row = await this.db.get(
        `SELECT value FROM user_data WHERE key = ? AND user_email = ?`,
        [key, userEmail]
      );

      if (row) {
        const data = JSON.parse(row.value);
        console.log(`[DataManager] Data loaded for user ${userEmail}, key: ${key}`);
        return { success: true, data };
      }

      return { success: true, data: null };
    } catch (error) {
      console.error('[DataManager] Failed to load data:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Delete data with automatic user_email filtering
   * Requirements: user-data-isolation.1.4
   */
  async deleteData(key: string): Promise<void> {
    // Requirements: user-data-isolation.1.13 - Check if user is logged in
    const userEmail = this.userProfileManager.getCurrentEmail();
    if (!userEmail) {
      console.error('[DataManager] No user logged in');
      throw new Error('No user logged in');
    }

    try {
      // Requirements: user-data-isolation.1.4 - Filter by user_email
      await this.db.run(
        `DELETE FROM user_data WHERE key = ? AND user_email = ?`,
        [key, userEmail]
      );
      
      console.log(`[DataManager] Data deleted for user ${userEmail}, key: ${key}`);
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
  private currentUserEmail: string | null = null; // Requirements: user-data-isolation.1.14

  /**
   * Get current user email
   * Requirements: user-data-isolation.1.10, user-data-isolation.1.14
   */
  getCurrentEmail(): string | null {
    return this.currentUserEmail;
  }

  /**
   * Fetch profile from Google API and cache email
   * Requirements: user-data-isolation.1.15
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
      
      // Requirements: user-data-isolation.1.15 - Cache email
      this.currentUserEmail = profile.email;
      
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
        // Requirements: user-data-isolation.1.17 - Set currentUserEmail from cached profile
        this.currentUserEmail = profile.email;
        console.log('[UserProfileManager] Email cached from stored profile:', profile.email);
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
    // Requirements: user-data-isolation.1.18 - Clear currentUserEmail
    this.currentUserEmail = null;
    console.log('[UserProfileManager] User email cleared');
  }
}
```

## Модели Данных

### user_data Table Schema

```sql
CREATE TABLE IF NOT EXISTS user_data (
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  user_email TEXT NOT NULL,
  PRIMARY KEY (key, user_email)
);

CREATE INDEX IF NOT EXISTS idx_user_email ON user_data(user_email);
```

**Примечание:** Миграция выполняется вручную разработчиком (пересоздание базы данных).

### UserProfile Interface

```typescript
interface UserProfile {
  id: string;
  email: string;  // Used for data isolation
  name: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  lastUpdated: number;
}
```

## Свойства Корректности

### Property 44: Автоматическое добавление user_email при сохранении

*Для любого* вызова `saveData()`, система должна автоматически добавить `user_email` текущего авторизованного пользователя к сохраняемым данным без явного параметра в методе.

**Формальное определение:**
```
∀ key, value: saveData(key, value) → 
  ∃ userEmail: userEmail = getCurrentEmail() ∧ 
  DB.insert(key, value, userEmail)
```

**Тестирование:** Property-based тест с генерацией различных ключей и значений, проверка что все записи в БД содержат `user_email`.

### Property 45: Автоматическая фильтрация по user_email при загрузке

*Для любого* вызова `loadData()`, система должна автоматически фильтровать данные по `user_email` текущего авторизованного пользователя без явного параметра в методе.

**Формальное определение:**
```
∀ key: loadData(key) → 
  ∃ userEmail: userEmail = getCurrentEmail() ∧ 
  result = DB.select(key WHERE user_email = userEmail)
```

**Тестирование:** Property-based тест с несколькими пользователями, проверка что каждый пользователь видит только свои данные.

### Property 46: Изоляция данных между пользователями

*Для любых* двух пользователей A и B, данные пользователя A не должны быть доступны пользователю B.

**Формальное определение:**
```
∀ userA, userB, key: userA ≠ userB ∧ 
  saveData(key, valueA) with userA ∧
  loadData(key) with userB → 
  result = null
```

**Тестирование:** Property-based тест с генерацией пар пользователей, проверка изоляции данных.

### Property 47: Восстановление данных при повторном входе

*Для любого* пользователя, после logout и повторного login, все данные должны быть восстановлены.

**Формальное определение:**
```
∀ user, key, value: 
  saveData(key, value) with user ∧
  logout() ∧
  login(user) →
  loadData(key) = value
```

**Тестирование:** Property-based тест с циклами logout/login, проверка сохранности данных.

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

#### DataManager (Extended)

```typescript
describe('DataManager - User Data Isolation', () => {
  /* Preconditions: UserProfileManager returns valid email
     Action: call saveData('key', 'value')
     Assertions: SQL query includes user_email in WHERE clause
     Requirements: user-data-isolation.1.3, user-data-isolation.1.11 */
  it('should automatically add user_email when saving', async () => {
    // Тест автоматического добавления email
  });

  /* Preconditions: UserProfileManager returns valid email
     Action: call loadData('key')
     Assertions: SQL query filters by user_email
     Requirements: user-data-isolation.1.4, user-data-isolation.1.12 */
  it('should automatically filter by user_email when loading', async () => {
    // Тест автоматической фильтрации
  });

  /* Preconditions: UserProfileManager returns null
     Action: call saveData('key', 'value')
     Assertions: throws Error('No user logged in')
     Requirements: user-data-isolation.1.13 */
  it('should throw error when no user logged in', async () => {
    // Тест ошибки при отсутствии пользователя
  });
});
```

#### UserProfileManager (Extended)

```typescript
describe('UserProfileManager - Email Caching', () => {
  /* Preconditions: successful OAuth login
     Action: call fetchProfile()
     Assertions: currentUserEmail is set to profile.email
     Requirements: user-data-isolation.1.15 */
  it('should cache email after successful login', async () => {
    // Тест кэширования email
  });

  /* Preconditions: app startup with valid tokens
     Action: call initialize()
     Assertions: currentUserEmail is loaded from database
     Requirements: user-data-isolation.1.17 */
  it('should restore email from database on startup', async () => {
    // Тест восстановления email
  });

  /* Preconditions: user logged in
     Action: call clearSession()
     Assertions: currentUserEmail is null
     Requirements: user-data-isolation.1.18 */
  it('should clear email on logout', async () => {
    // Тест очистки email
  });
});
```

### Property-Based Тесты

```typescript
describe('User Data Isolation - Property Tests', () => {
  /* Property 44: Автоматическое добавление user_email */
  it('should always add user_email when saving data', () => {
    fc.assert(
      fc.property(
        fc.string(), // key
        fc.anything(), // value
        fc.emailAddress(), // userEmail
        async (key, value, email) => {
          // Setup: mock getCurrentEmail() to return email
          // Action: saveData(key, value)
          // Assert: DB contains record with user_email = email
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Property 45: Автоматическая фильтрация по user_email */
  it('should always filter by user_email when loading data', () => {
    fc.assert(
      fc.property(
        fc.string(), // key
        fc.emailAddress(), // userEmail
        async (key, email) => {
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
        fc.emailAddress(), // userA
        fc.emailAddress(), // userB
        async (key, value, emailA, emailB) => {
          fc.pre(emailA !== emailB); // Ensure different users
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
          // Setup: save data, logout, login again
          // Action: load data after re-login
          // Assert: data is restored
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
     Requirements: user-data-isolation.1.5, user-data-isolation.1.6 */
  it('should isolate data between different users', async () => {
    // Тест изоляции данных
  });

  /* Preconditions: user A logged in, data saved, logout
     Action: login user A again, load data
     Assertions: all data is restored
     Requirements: user-data-isolation.1.7 */
  it('should restore user data after re-login', async () => {
    // Тест восстановления данных
  });

  /* Preconditions: user A logged in, data saved
     Action: logout user A
     Assertions: data remains in database
     Requirements: user-data-isolation.1.5 */
  it('should persist data after logout', async () => {
    // Тест сохранности данных
  });

  /* Preconditions: multiple users with data
     Action: login as each user, load data
     Assertions: each user sees only their own data
     Requirements: user-data-isolation.1.8 */
  it('should filter data by user email', async () => {
    // Тест фильтрации по email
  });
});
```

## Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| user-data-isolation.1.1 | - | - | ✓ |
| user-data-isolation.1.2 | - | - | ✓ |
| user-data-isolation.1.3 | ✓ | ✓ | - |
| user-data-isolation.1.4 | ✓ | ✓ | - |
| user-data-isolation.1.5 | - | - | ✓ |
| user-data-isolation.1.6 | - | - | ✓ |
| user-data-isolation.1.7 | - | ✓ | ✓ |
| user-data-isolation.1.8 | - | - | ✓ |
| user-data-isolation.1.9 | - | - | - |
| user-data-isolation.1.10 | ✓ | - | - |
| user-data-isolation.1.11 | ✓ | ✓ | - |
| user-data-isolation.1.12 | ✓ | ✓ | - |
| user-data-isolation.1.13 | ✓ | - | - |
| user-data-isolation.1.14 | ✓ | - | - |
| user-data-isolation.1.15 | ✓ | - | - |
| user-data-isolation.1.16 | ✓ | - | - |
| user-data-isolation.1.17 | ✓ | - | - |
| user-data-isolation.1.18 | ✓ | - | - |
| user-data-isolation.1.19 | - | - | ✓ |
| user-data-isolation.1.20 | - | - | ✓ |
| user-data-isolation.1.21 | ✓ | - | - |
| user-data-isolation.1.22 | - | - | ✓ |
| user-data-isolation.1.23 | - | - | ✓ |
| user-data-isolation.1.24 | - | - | ✓ |

## Технические Решения

### Решение 22: Автоматическая Изоляция Данных по Email

**Решение:** Автоматически добавлять `user_email` при сохранении и фильтровать по `user_email` при загрузке данных без явных параметров в методах DataManager.

**Обоснование:**
- Упрощает API - не нужно передавать email в каждый метод
- Снижает риск ошибок - невозможно забыть добавить фильтр
- Централизованная логика изоляции в одном месте

**Альтернативы:**
- Требовать явную передачу user_email в каждый метод (отклонено: увеличивает сложность API)
- Использовать отдельные таблицы для каждого пользователя (отклонено: усложняет миграции)
- Использовать отдельные базы данных для каждого пользователя (отклонено: избыточная сложность)

**Requirements:** user-data-isolation.1.11, user-data-isolation.1.12

### Решение 23: Кэширование Email в UserProfileManager

**Решение:** Хранить `currentUserEmail` в памяти в UserProfileManager и обновлять при авторизации/logout.

**Обоснование:**
- Быстрый доступ без запросов к БД
- Единственный источник истины для текущего пользователя
- Автоматическое обновление при смене пользователя

**Альтернативы:**
- Запрашивать email из БД при каждой операции (отклонено: медленно)
- Хранить email в глобальной переменной (отклонено: нарушает инкапсуляцию)

**Requirements:** user-data-isolation.1.14, user-data-isolation.1.15, user-data-isolation.1.17, user-data-isolation.1.18
