# Документ Дизайна: User Data Isolation

## Обзор

Данный документ описывает архитектуру и дизайн системы изоляции данных пользователей в приложении Clerkly, обеспечивая приватность и безопасность данных при использовании приложения несколькими пользователями.

### Архитектурный Принцип: База Данных как Единственный Источник Истины

Приложение построено на фундаментальном архитектурном принципе: **база данных (SQLite через DataManager) является единственным источником истины для всех данных приложения**.

**Ключевые аспекты:**

1. **UI отображает данные из базы**: Все компоненты интерфейса читают данные из базы данных, а не хранят собственное состояние данных
2. **Реактивное обновление**: При изменении данных в базе UI автоматически обновляется через систему событий (IPC)
3. **Фоновая синхронизация**: Фоновые процессы обновляют базу данных, изменения автоматически попадают в UI

**Поток данных:**
```
External API → Main Process → Database → IPC Event → Renderer → UI Update
```

**Применение к User Data Isolation:**
- Все данные пользователей хранятся в базе данных с привязкой к `user_email`
- DataManager автоматически фильтрует данные по текущему пользователю
- При смене пользователя данные предыдущего пользователя остаются в базе и восстанавливаются при повторном входе
- UI автоматически обновляется при смене пользователя, отображая данные нового пользователя из базы

Этот принцип обеспечивает:
- Консистентность данных во всем приложении
- Offline-first подход (приложение работает с локальными данными)
- Плавный UX без мерцания пустых состояний
- Простоту отладки и тестирования
- Надежность (данные персистентны)
- Multi-user support с полной приватностью данных

### Цели Дизайна

- Обеспечить изоляцию данных между пользователями по email из Google OAuth
- Автоматически фильтровать данные по текущему авторизованному пользователю
- Сохранять данные пользователя после logout для восстановления при повторном входе
- Обеспечить безопасность и приватность данных
- Поддерживать multi-user support без ручного управления email


### Технологический Стек

- **SQLite**: База данных для хранения пользовательских данных
- **DataManager**: Класс для управления данными с автоматической фильтрацией по user_email
- **UserProfileManager**: Класс для управления профилем пользователя и текущим email
- **TypeScript**: Язык программирования для типобезопасности

## Архитектура

### Компоненты Системы

Система изоляции данных пользователей состоит из следующих основных компонентов:

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│                                                               │
│  ┌──────────────────────┐       ┌─────────────────────┐     │
│  │  DataManager         │──────▶│  UserProfileManager │     │
│  │                      │       │                     │     │
│  │  - saveData()        │       │  - getCurrentEmail()│     │
│  │  - loadData()        │       │  - setCurrentEmail()│     │
│  │  - deleteData()      │       │  - clearEmail()     │     │
│  └──────────────────────┘       └─────────────────────┘     │
│           │                                                   │
│           ▼                                                   │
│  ┌──────────────────────┐                                    │
│  │    SQLite Database   │                                    │
│  │                      │                                    │
│  │  user_data table:    │                                    │
│  │  - key TEXT          │                                    │
│  │  - value TEXT        │                                    │
│  │  - user_email TEXT   │                                    │
│  │  - updated_at INT    │                                    │
│  └──────────────────────┘                                    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Поток Данных

1. **Авторизация пользователя**:
   - Пользователь авторизуется через Google OAuth
   - `UserProfileManager` получает email из профиля
   - `UserProfileManager` устанавливает `currentUserEmail` в памяти

2. **Сохранение данных**:
   - Приложение вызывает `DataManager.saveData(key, value)`
   - `DataManager` запрашивает `currentUserEmail` у `UserProfileManager`
   - Если email отсутствует, выбрасывается ошибка "No user logged in"
   - Данные сохраняются в базу с привязкой к `user_email`

3. **Загрузка данных**:
   - Приложение вызывает `DataManager.loadData(key)`
   - `DataManager` запрашивает `currentUserEmail` у `UserProfileManager`
   - Если email отсутствует, выбрасывается ошибка "No user logged in"
   - Данные загружаются из базы с фильтрацией по `user_email`

4. **Смена пользователя**:
   - Пользователь A выходит из системы (logout)
   - `UserProfileManager` очищает `currentUserEmail`
   - Данные пользователя A остаются в базе данных
   - Пользователь B авторизуется
   - `UserProfileManager` устанавливает новый `currentUserEmail`
   - Приложение видит только данные пользователя B


## Компоненты и Интерфейсы

### DataManager (Расширенный)

Класс `DataManager` расширяется для поддержки автоматической изоляции данных по user_email.

**Расширения для изоляции данных:**

```typescript
// Requirements: user-data-isolation.1
class DataManager {
  private db: Database;
  private userProfileManager: UserProfileManager;

  constructor(dbPath: string, userProfileManager: UserProfileManager) {
    this.db = new Database(dbPath);
    this.userProfileManager = userProfileManager;
    this.initializeDatabase();
  }

  /**
   * Initialize database with user_data table
   * Requirements: user-data-isolation.1.2, user-data-isolation.1.9
   */
  private initializeDatabase(): void {
    // Create user_data table with user_email column
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_data (
        key TEXT NOT NULL,
        value TEXT,
        user_email TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (key, user_email)
      )
    `);

    // Create index on user_email for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_email 
      ON user_data(user_email)
    `);
  }

  /**
   * Save data with automatic user_email filtering
   * Requirements: user-data-isolation.1.3, user-data-isolation.1.10, user-data-isolation.1.11, user-data-isolation.1.13
   */
  async saveData(key: string, value: any): Promise<void> {
    // Requirements: user-data-isolation.1.10, user-data-isolation.1.13
    const userEmail = this.userProfileManager.getCurrentEmail();
    if (!userEmail) {
      console.error('[DataManager] No user logged in');
      throw new Error('No user logged in');
    }

    try {
      const valueJson = JSON.stringify(value);
      const timestamp = Date.now();

      // Requirements: user-data-isolation.1.3, user-data-isolation.1.11
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO user_data (key, value, user_email, updated_at)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(key, valueJson, userEmail, timestamp);
      console.log('[DataManager] Data saved:', { key, userEmail });
    } catch (error) {
      console.error('[DataManager] Failed to save data:', error);
      throw error;
    }
  }

  /**
   * Load data with automatic user_email filtering
   * Requirements: user-data-isolation.1.4, user-data-isolation.1.10, user-data-isolation.1.12, user-data-isolation.1.13
   */
  async loadData(key: string): Promise<{ success: boolean; data?: any; error?: string }> {
    // Requirements: user-data-isolation.1.10, user-data-isolation.1.13
    const userEmail = this.userProfileManager.getCurrentEmail();
    if (!userEmail) {
      console.error('[DataManager] No user logged in');
      return { success: false, error: 'No user logged in' };
    }

    try {
      // Requirements: user-data-isolation.1.4, user-data-isolation.1.12
      const stmt = this.db.prepare(`
        SELECT value FROM user_data 
        WHERE key = ? AND user_email = ?
      `);

      const row = stmt.get(key, userEmail) as { value: string } | undefined;

      if (row) {
        const data = JSON.parse(row.value);
        console.log('[DataManager] Data loaded:', { key, userEmail });
        return { success: true, data };
      } else {
        return { success: true, data: null };
      }
    } catch (error) {
      console.error('[DataManager] Failed to load data:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Delete data with automatic user_email filtering
   * Requirements: user-data-isolation.1.10, user-data-isolation.1.13
   */
  async deleteData(key: string): Promise<void> {
    // Requirements: user-data-isolation.1.10, user-data-isolation.1.13
    const userEmail = this.userProfileManager.getCurrentEmail();
    if (!userEmail) {
      console.error('[DataManager] No user logged in');
      throw new Error('No user logged in');
    }

    try {
      const stmt = this.db.prepare(`
        DELETE FROM user_data 
        WHERE key = ? AND user_email = ?
      `);

      stmt.run(key, userEmail);
      console.log('[DataManager] Data deleted:', { key, userEmail });
    } catch (error) {
      console.error('[DataManager] Failed to delete data:', error);
      throw error;
    }
  }
}
```

**Ключевые изменения:**
- Добавлена зависимость от `UserProfileManager`
- Все методы автоматически получают `user_email` из `UserProfileManager`
- Все SQL запросы фильтруются по `user_email`
- Выбрасывается ошибка "No user logged in" при отсутствии авторизации


### UserProfileManager (Расширенный)

Класс `UserProfileManager` расширяется для кэширования текущего email пользователя.

**Расширения для изоляции данных:**

```typescript
// Requirements: user-data-isolation.1
class UserProfileManager {
  private dataManager: DataManager;
  private oauthClient: OAuthClientManager;
  private currentUserEmail: string | null = null; // Requirements: user-data-isolation.1.14

  constructor(dataManager: DataManager, oauthClient: OAuthClientManager) {
    this.dataManager = dataManager;
    this.oauthClient = oauthClient;
  }

  /**
   * Get current user email
   * Requirements: user-data-isolation.1.10, user-data-isolation.1.14
   */
  getCurrentEmail(): string | null {
    return this.currentUserEmail;
  }

  /**
   * Set current user email after successful authentication
   * Requirements: user-data-isolation.1.15
   */
  setCurrentEmail(email: string): void {
    this.currentUserEmail = email;
    console.log('[UserProfileManager] Current user email set:', email);
  }

  /**
   * Clear current user email on logout
   * Requirements: user-data-isolation.1.18
   */
  clearCurrentEmail(): void {
    this.currentUserEmail = null;
    console.log('[UserProfileManager] Current user email cleared');
  }

  /**
   * Fetch profile from Google UserInfo API and update current email
   * Requirements: user-data-isolation.1.15
   */
  async fetchProfile(): Promise<void> {
    try {
      const profile = await this.oauthClient.fetchUserProfile();
      
      // Save profile to database
      await this.saveProfile(profile);
      
      // Requirements: user-data-isolation.1.15 - Set current email
      this.setCurrentEmail(profile.email);
      
      console.log('[UserProfileManager] Profile fetched and email set');
    } catch (error) {
      console.error('[UserProfileManager] Failed to fetch profile:', error);
      throw error;
    }
  }

  /**
   * Update profile after token refresh
   * Requirements: user-data-isolation.1.16
   */
  async updateProfileAfterTokenRefresh(): Promise<void> {
    try {
      const profile = await this.oauthClient.fetchUserProfile();
      
      // Save updated profile to database
      await this.saveProfile(profile);
      
      // Requirements: user-data-isolation.1.16 - Update current email
      this.setCurrentEmail(profile.email);
      
      console.log('[UserProfileManager] Profile updated after token refresh');
    } catch (error) {
      console.error('[UserProfileManager] Failed to update profile:', error);
      // Don't throw - token refresh should continue even if profile update fails
    }
  }

  /**
   * Load profile from database on app startup
   * Requirements: user-data-isolation.1.17
   */
  async loadProfileOnStartup(): Promise<void> {
    try {
      const authStatus = await this.oauthClient.getAuthStatus();
      
      if (authStatus.authorized) {
        // Requirements: user-data-isolation.1.17 - Load profile from database
        const profile = await this.loadProfile();
        
        if (profile) {
          // Set current email from cached profile
          this.setCurrentEmail(profile.email);
          console.log('[UserProfileManager] Profile loaded on startup, email set');
        } else {
          // No cached profile, fetch from API
          await this.fetchProfile();
        }
      } else {
        console.log('[UserProfileManager] User not authenticated, skipping profile load');
      }
    } catch (error) {
      console.error('[UserProfileManager] Failed to load profile on startup:', error);
      // Don't throw - app should continue even if profile load fails
    }
  }

  /**
   * Clear profile on logout
   * Requirements: user-data-isolation.1.18
   */
  async clearProfile(): Promise<void> {
    try {
      // Requirements: user-data-isolation.1.18 - Clear current email
      this.clearCurrentEmail();
      
      // Note: We don't delete profile from database - it's preserved for next login
      console.log('[UserProfileManager] Profile cleared from memory');
    } catch (error) {
      console.error('[UserProfileManager] Failed to clear profile:', error);
      throw error;
    }
  }

  private async saveProfile(profile: UserProfile): Promise<void> {
    try {
      // Note: This will use the OLD user_email before setCurrentEmail() is called
      // We need to temporarily set email for saveData to work
      const oldEmail = this.currentUserEmail;
      this.currentUserEmail = profile.email;
      
      await this.dataManager.saveData('user_profile', profile);
      
      // Restore old email if it was different (shouldn't happen in practice)
      if (oldEmail && oldEmail !== profile.email) {
        this.currentUserEmail = oldEmail;
      }
    } catch (error) {
      console.error('[UserProfileManager] Failed to save profile:', error);
      throw error;
    }
  }

  private async loadProfile(): Promise<UserProfile | null> {
    try {
      const result = await this.dataManager.loadData('user_profile');
      
      if (result.success && result.data) {
        return result.data as UserProfile;
      } else {
        return null;
      }
    } catch (error) {
      console.error('[UserProfileManager] Failed to load profile:', error);
      return null;
    }
  }
}
```

**Ключевые особенности:**
- Кэширует `currentUserEmail` в памяти
- Автоматически устанавливает email при авторизации и refresh token
- Загружает email из базы данных при запуске приложения
- Очищает email при logout


## Модели Данных

### user_data Table

Таблица для хранения пользовательских данных с изоляцией по email.

```sql
-- Requirements: user-data-isolation.1.2, user-data-isolation.1.9
CREATE TABLE user_data (
  key TEXT NOT NULL,
  value TEXT,
  user_email TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_email)
);

-- Requirements: user-data-isolation.1.9
CREATE INDEX idx_user_email ON user_data(user_email);
```

**Поля:**
- `key`: Ключ данных (например, 'ai_agent_llm_provider', 'window_state')
- `value`: Значение в формате JSON
- `user_email`: Email пользователя из Google OAuth профиля
- `updated_at`: Timestamp последнего обновления

**Ограничения:**
- Первичный ключ: комбинация (key, user_email)
- Индекс на user_email для быстрой фильтрации

### UserProfile Interface

Интерфейс для представления профиля пользователя.

```typescript
interface UserProfile {
  email: string;
  name: string;
  picture?: string;
  // ... other fields
}
```

## Свойства Корректности

Свойство - это характеристика или поведение, которое должно быть истинным для всех валидных выполнений системы. По сути, это формальное утверждение о том, что система должна делать. Свойства служат мостом между человекочитаемыми спецификациями и машинно-проверяемыми гарантиями корректности.

### Property 1: Автоматическое добавление user_email при сохранении

*Для любого* вызова `saveData()`, система должна автоматически добавить `user_email` текущего авторизованного пользователя к сохраняемым данным без явного параметра в методе.

**Validates: Requirements user-data-isolation.1.3, user-data-isolation.1.11**

### Property 2: Автоматическая фильтрация по user_email при загрузке

*Для любого* вызова `loadData()`, система должна автоматически фильтровать данные по `user_email` текущего авторизованного пользователя без явного параметра в методе.

**Validates: Requirements user-data-isolation.1.4, user-data-isolation.1.12**

### Property 3: Изоляция данных между пользователями

*Для любых* двух пользователей A и B с разными email, данные сохраненные пользователем A НЕ должны быть доступны пользователю B при вызове `loadData()` с тем же ключом.

**Validates: Requirements user-data-isolation.1.5, user-data-isolation.1.6, user-data-isolation.1.7, user-data-isolation.1.8**

### Property 4: Персистентность данных после logout

*Для любого* пользователя, после выхода из системы (logout) все его данные должны оставаться в базе данных и быть доступны при повторной авторизации того же пользователя.

**Validates: Requirements user-data-isolation.1.5, user-data-isolation.1.7**

### Property 5: Ошибка при отсутствии авторизации

*Для любого* вызова `saveData()`, `loadData()` или `deleteData()` когда пользователь не авторизован (нет email), метод должен вернуть ошибку "No user logged in".

**Validates: Requirements user-data-isolation.1.13**

### Edge Cases

Следующие граничные случаи должны быть обработаны корректно:

1. **Не авторизован (user-data-isolation.1.13, user-data-isolation.1.19)**: Когда пользователь не авторизован, методы DataManager возвращают ошибку "No user logged in". Система должна перенаправить на экран логина и очистить все кэши.

2. **Сессия истекла во время операции (user-data-isolation.1.20)**: Когда сессия истекает во время работы приложения, система должна применить процедуру восстановления сессии (refresh token). При успешном восстановлении операция повторяется без уведомления пользователю.

3. **Race condition при logout (user-data-isolation.1.21)**: Когда DataManager возвращает ошибку "No user logged in" во время logout, система должна молча игнорировать ошибку (логировать через Logger класс для отладки).

4. **Первая авторизация**: Когда пользователь авторизуется впервые, в базе данных нет данных для его email. Все методы loadData() возвращают null, что является корректным поведением.

5. **Повторная авторизация**: Когда пользователь авторизуется повторно после logout, система восстанавливает все его данные из базы данных по email.

6. **Смена пользователя**: Когда пользователь A выходит и пользователь B входит, система автоматически переключается на данные пользователя B. Данные пользователя A остаются в базе и недоступны пользователю B.


## Обработка Ошибок

### Стратегия Обработки Ошибок

Система изоляции данных должна обрабатывать ошибки gracefully, обеспечивая безопасность и приватность данных.

### Сценарии Ошибок

#### 1. Ошибка "No user logged in"

**Причины:**
- Пользователь не авторизован
- Сессия истекла во время операции
- Race condition при logout

**Обработка:**
```typescript
// Requirements: user-data-isolation.1.13, user-data-isolation.1.19, user-data-isolation.1.20, user-data-isolation.1.21
async saveData(key: string, value: any): Promise<void> {
  const userEmail = this.userProfileManager.getCurrentEmail();
  if (!userEmail) {
    console.error('[DataManager] No user logged in');
    throw new Error('No user logged in');
  }
  // ... save logic ...
}

// In application code
try {
  await dataManager.saveData('some_key', someValue);
} catch (error) {
  if (error.message === 'No user logged in') {
    // Requirements: user-data-isolation.1.19 - Not authenticated
    if (!await isUserAuthenticated()) {
      navigationManager.redirectToLogin();
      clearAllCaches();
    } else {
      // Requirements: user-data-isolation.1.20 - Session expired during operation
      try {
        await oauthClient.refreshAccessToken();
        await dataManager.saveData('some_key', someValue); // Retry
      } catch (refreshError) {
        navigationManager.redirectToLogin();
      }
    }
  }
}

// Requirements: user-data-isolation.1.21 - During logout (ignore silently)
async function handleLogout() {
  try {
    await dataManager.saveData('last_action', 'logout');
  } catch (error) {
    if (error.message === 'No user logged in') {
      console.log('[Logout] Data save failed due to cleared session (expected)');
    }
  }
}
```

**Результат:** 
- Если не авторизован: перенаправление на логин
- Если сессия истекла: попытка refresh и retry
- При logout: молча игнорируется

#### 2. Ошибка сохранения данных

**Причины:**
- Ошибка записи в базу данных
- Недостаточно места на диске
- Проблемы с правами доступа

**Обработка:**
```typescript
// Requirements: user-data-isolation.1.3
async saveData(key: string, value: any): Promise<void> {
  const userEmail = this.userProfileManager.getCurrentEmail();
  if (!userEmail) {
    throw new Error('No user logged in');
  }

  try {
    const valueJson = JSON.stringify(value);
    const timestamp = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO user_data (key, value, user_email, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(key, valueJson, userEmail, timestamp);
  } catch (error) {
    console.error('[DataManager] Failed to save data:', error);
    throw error;
  }
}
```

**Результат:** Ошибка логируется и пробрасывается выше для обработки в приложении.

#### 3. Ошибка загрузки данных

**Причины:**
- Поврежденные данные в базе данных
- Ошибка парсинга JSON
- Отсутствие доступа к базе данных

**Обработка:**
```typescript
// Requirements: user-data-isolation.1.4
async loadData(key: string): Promise<{ success: boolean; data?: any; error?: string }> {
  const userEmail = this.userProfileManager.getCurrentEmail();
  if (!userEmail) {
    console.error('[DataManager] No user logged in');
    return { success: false, error: 'No user logged in' };
  }

  try {
    const stmt = this.db.prepare(`
      SELECT value FROM user_data 
      WHERE key = ? AND user_email = ?
    `);
    
    const row = stmt.get(key, userEmail) as { value: string } | undefined;
    
    if (row) {
      const data = JSON.parse(row.value);
      return { success: true, data };
    } else {
      return { success: true, data: null };
    }
  } catch (error) {
    console.error('[DataManager] Failed to load data:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

**Результат:** Ошибка логируется и возвращается в структурированном формате.

### Логирование

Все ошибки должны логироваться с достаточным контекстом для диагностики через централизованный Logger класс (clerkly.3):

```typescript
// Data Manager errors (user isolation)
console.error('[DataManager] No user logged in');
console.error('[DataManager] Failed to save data:', error);
console.error('[DataManager] Failed to load data:', error);
console.error('[DataManager] Failed to delete data:', error);

// UserProfileManager errors
console.error('[UserProfileManager] Failed to fetch profile:', error);
console.error('[UserProfileManager] Failed to save profile:', error);
console.error('[UserProfileManager] Failed to load profile:', error);
console.error('[UserProfileManager] Failed to clear profile:', error);
```

**Формат логов:**
- Префикс с именем компонента в квадратных скобках
- Описательное сообщение об ошибке
- Объект ошибки для stack trace


## Стратегия Тестирования

### Двойной Подход к Тестированию

Система изоляции данных будет тестироваться с использованием двух комплементарных подходов:

1. **Модульные тесты (Unit Tests)**: Проверяют конкретные примеры, граничные случаи и условия ошибок
2. **Property-based тесты**: Проверяют универсальные свойства на множестве входных данных

Оба подхода необходимы для комплексного покрытия.

### Баланс Модульного Тестирования

- Модульные тесты полезны для конкретных примеров и граничных случаев
- Избегать написания слишком большого количества модульных тестов - property-based тесты покрывают множество входных данных
- Модульные тесты должны фокусироваться на:
  - Конкретных примерах, демонстрирующих корректное поведение
  - Точках интеграции между компонентами
  - Граничных случаях и условиях ошибок
- Property-based тесты должны фокусироваться на:
  - Универсальных свойствах, которые истинны для всех входных данных
  - Комплексном покрытии входных данных через рандомизацию

### Конфигурация Property-Based Тестов

- **Библиотека**: `fast-check` для TypeScript/JavaScript
- **Минимум итераций**: 100 итераций на property-based тест
- **Тегирование**: Каждый тест должен ссылаться на свойство из документа дизайна
- **Формат тега**: `Feature: user-data-isolation, Property {number}: {property_text}`

### Модульные Тесты

#### DataManager Tests (User Isolation)

```typescript
describe('DataManager - User Isolation', () => {
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

  /* Preconditions: UserProfileManager returns null (not logged in)
     Action: call saveData('key', 'value')
     Assertions: throws error "No user logged in"
     Requirements: user-data-isolation.1.13 */
  it('should throw error when user not logged in', async () => {
    // Тест ошибки при отсутствии пользователя
  });

  /* Preconditions: data saved for user A and user B
     Action: load data as user A
     Assertions: only user A's data returned, user B's data not visible
     Requirements: user-data-isolation.1.6, user-data-isolation.1.7 */
  it('should isolate data between users', async () => {
    // Тест изоляции данных
  });

  /* Preconditions: user A logged in, data saved
     Action: logout user A (clear email), check database
     Assertions: data persists in database with user A's email
     Requirements: user-data-isolation.1.5 */
  it('should persist data after logout', async () => {
    // Тест персистентности после logout
  });

  /* Preconditions: user A logged in, data saved, logout, login again
     Action: load data as user A
     Assertions: data restored from database
     Requirements: user-data-isolation.1.7 */
  it('should restore user data after re-login', async () => {
    // Тест восстановления данных
  });
});
```

#### UserProfileManager Tests (Email Management)

```typescript
describe('UserProfileManager - Email Management', () => {
  /* Preconditions: UserProfileManager created
     Action: call setCurrentEmail('user@example.com')
     Assertions: getCurrentEmail() returns 'user@example.com'
     Requirements: user-data-isolation.1.14, user-data-isolation.1.15 */
  it('should set and get current email', () => {
    // Тест установки и получения email
  });

  /* Preconditions: email set
     Action: call clearCurrentEmail()
     Assertions: getCurrentEmail() returns null
     Requirements: user-data-isolation.1.18 */
  it('should clear current email', () => {
    // Тест очистки email
  });

  /* Preconditions: OAuth successful
     Action: call fetchProfile()
     Assertions: currentUserEmail set to profile.email
     Requirements: user-data-isolation.1.15 */
  it('should set email after successful authentication', async () => {
    // Тест установки email после авторизации
  });

  /* Preconditions: token refreshed
     Action: call updateProfileAfterTokenRefresh()
     Assertions: currentUserEmail updated to new profile.email
     Requirements: user-data-isolation.1.16 */
  it('should update email after token refresh', async () => {
    // Тест обновления email после refresh
  });

  /* Preconditions: app startup, user authenticated
     Action: call loadProfileOnStartup()
     Assertions: currentUserEmail set from cached profile
     Requirements: user-data-isolation.1.17 */
  it('should load email on startup', async () => {
    // Тест загрузки email при запуске
  });
});
```

### Property-Based Тесты

```typescript
import fc from 'fast-check';

describe('DataManager Property Tests - User Isolation', () => {
  /* Feature: user-data-isolation, Property 1: Автоматическое добавление user_email при сохранении
     Preconditions: various user emails and data keys
     Action: saveData() with different users and keys
     Assertions: all saved data includes correct user_email
     Requirements: user-data-isolation.1.3, user-data-isolation.1.11 */
  it('should automatically add user_email for all save operations', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.anything(),
        async (email, key, value) => {
          // Mock UserProfileManager to return email
          mockUserProfileManager.getCurrentEmail.mockReturnValue(email);

          // Save data
          await dataManager.saveData(key, value);

          // Verify data saved with correct user_email
          const row = db.prepare('SELECT user_email FROM user_data WHERE key = ?').get(key);
          expect(row.user_email).toBe(email);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: user-data-isolation, Property 2: Автоматическая фильтрация по user_email при загрузке
     Preconditions: data saved for multiple users
     Action: loadData() with different users
     Assertions: each user sees only their own data
     Requirements: user-data-isolation.1.4, user-data-isolation.1.12 */
  it('should automatically filter by user_email for all load operations', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.anything(),
        async (emailA, emailB, key, value) => {
          fc.pre(emailA !== emailB); // Ensure different emails

          // Save data as user A
          mockUserProfileManager.getCurrentEmail.mockReturnValue(emailA);
          await dataManager.saveData(key, value);

          // Load data as user B
          mockUserProfileManager.getCurrentEmail.mockReturnValue(emailB);
          const result = await dataManager.loadData(key);

          // User B should not see user A's data
          expect(result.data).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: user-data-isolation, Property 3: Изоляция данных между пользователями
     Preconditions: multiple users with same keys
     Action: save and load data for different users
     Assertions: data isolated by user_email
     Requirements: user-data-isolation.1.5, user-data-isolation.1.6, user-data-isolation.1.7, user-data-isolation.1.8 */
  it('should isolate data between different users', () => {
    fc.assert(
      fc.property(
        fc.array(fc.emailAddress(), { minLength: 2, maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (emails, key) => {
          const uniqueEmails = [...new Set(emails)];
          fc.pre(uniqueEmails.length >= 2);

          // Save different values for each user
          const values = uniqueEmails.map((_, i) => `value_${i}`);
          
          for (let i = 0; i < uniqueEmails.length; i++) {
            mockUserProfileManager.getCurrentEmail.mockReturnValue(uniqueEmails[i]);
            await dataManager.saveData(key, values[i]);
          }

          // Verify each user sees only their own value
          for (let i = 0; i < uniqueEmails.length; i++) {
            mockUserProfileManager.getCurrentEmail.mockReturnValue(uniqueEmails[i]);
            const result = await dataManager.loadData(key);
            expect(result.data).toBe(values[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: user-data-isolation, Property 4: Персистентность данных после logout
     Preconditions: user logged in with data
     Action: save data, logout (clear email), login again
     Assertions: data restored after re-login
     Requirements: user-data-isolation.1.5, user-data-isolation.1.7 */
  it('should persist data after logout and restore on re-login', () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.anything(),
        async (email, key, value) => {
          // Save data as user
          mockUserProfileManager.getCurrentEmail.mockReturnValue(email);
          await dataManager.saveData(key, value);

          // Logout (clear email)
          mockUserProfileManager.getCurrentEmail.mockReturnValue(null);

          // Login again
          mockUserProfileManager.getCurrentEmail.mockReturnValue(email);
          const result = await dataManager.loadData(key);

          // Data should be restored
          expect(result.data).toEqual(value);
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: user-data-isolation, Property 5: Ошибка при отсутствии авторизации
     Preconditions: user not logged in (email is null)
     Action: call saveData(), loadData(), deleteData()
     Assertions: all methods throw "No user logged in" error
     Requirements: user-data-isolation.1.13 */
  it('should throw error when user not logged in', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.anything(),
        async (key, value) => {
          // Mock no user logged in
          mockUserProfileManager.getCurrentEmail.mockReturnValue(null);

          // All operations should throw
          await expect(dataManager.saveData(key, value)).rejects.toThrow('No user logged in');
          
          const loadResult = await dataManager.loadData(key);
          expect(loadResult.success).toBe(false);
          expect(loadResult.error).toBe('No user logged in');
          
          await expect(dataManager.deleteData(key)).rejects.toThrow('No user logged in');
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Функциональные Тесты

Функциональные тесты проверяют полную функциональность системы в реальных условиях использования.

```typescript
describe('User Data Isolation Functional Tests', () => {
  /* Preconditions: user A logged in, data saved
     Action: logout user A, login user B, check data
     Assertions: user B sees empty data, not user A's data
     Requirements: user-data-isolation.1.5, user-data-isolation.1.6 */
  it('should isolate data between different users', async () => {
    // Тест изоляции между пользователями
  });

  /* Preconditions: user A logged in, data saved, logout
     Action: login user A again
     Assertions: user A's data restored from database
     Requirements: user-data-isolation.1.7 */
  it('should restore user data after re-login', async () => {
    // Тест восстановления данных
  });

  /* Preconditions: user A logged in, data saved
     Action: logout user A
     Assertions: data persists in database (not deleted)
     Requirements: user-data-isolation.1.5 */
  it('should persist data after logout', async () => {
    // Тест персистентности после logout
  });

  /* Preconditions: multiple users with data
     Action: login as each user, check data
     Assertions: each user sees only their own data
     Requirements: user-data-isolation.1.8 */
  it('should filter data by user email', async () => {
    // Тест фильтрации по email
  });
});
```


### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| user-data-isolation.1.1 | ✓ | - | - |
| user-data-isolation.1.2 | ✓ | - | - |
| user-data-isolation.1.3 | ✓ | ✓ | ✓ |
| user-data-isolation.1.4 | ✓ | ✓ | ✓ |
| user-data-isolation.1.5 | ✓ | ✓ | ✓ |
| user-data-isolation.1.6 | ✓ | ✓ | ✓ |
| user-data-isolation.1.7 | ✓ | ✓ | ✓ |
| user-data-isolation.1.8 | ✓ | - | ✓ |
| user-data-isolation.1.9 | ✓ | - | - |
| user-data-isolation.1.10 | ✓ | - | - |
| user-data-isolation.1.11 | ✓ | ✓ | ✓ |
| user-data-isolation.1.12 | ✓ | ✓ | ✓ |
| user-data-isolation.1.13 | ✓ | ✓ | ✓ |
| user-data-isolation.1.14 | ✓ | - | - |
| user-data-isolation.1.15 | ✓ | - | ✓ |
| user-data-isolation.1.16 | ✓ | - | ✓ |
| user-data-isolation.1.17 | ✓ | - | ✓ |
| user-data-isolation.1.18 | ✓ | - | ✓ |
| user-data-isolation.1.19 | ✓ | - | ✓ |
| user-data-isolation.1.20 | ✓ | - | ✓ |
| user-data-isolation.1.21 | ✓ | - | ✓ |
| user-data-isolation.1.22 | ✓ | - | ✓ |
| user-data-isolation.1.23 | ✓ | - | ✓ |
| user-data-isolation.1.24 | ✓ | - | ✓ |

### Критерии Успеха

Тестирование считается успешным, когда:

1. **Модульные тесты**:
   - Все тесты DataManager проходят
   - Все тесты UserProfileManager проходят
   - Покрытие кода >= 85%

2. **Property-based тесты**:
   - Все 5 свойств проверены на 100+ итерациях
   - Нет найденных контрпримеров

3. **Функциональные тесты**:
   - Все 4 функциональных теста проходят
   - Изоляция данных работает в реальных условиях
   - Данные корректно восстанавливаются после logout/login

## Технические Решения и Обоснование

### Решение 1: Использование user_email как Идентификатор Пользователя

**Решение:** Использовать email из Google OAuth профиля как идентификатор пользователя для изоляции данных.

**Альтернативы:**
- Использовать Google User ID (sub claim)
- Создать внутренний user_id
- Использовать комбинацию email + provider

**Обоснование:**
- Email уникален для каждого пользователя
- Email понятен для отладки (можно видеть в базе данных)
- Email уже доступен в профиле пользователя
- Не требуется дополнительное хранилище для маппинга ID → email
- Соответствует требованию user-data-isolation.1.1

### Решение 2: Автоматическая Фильтрация в DataManager

**Решение:** DataManager автоматически добавляет и фильтрует по user_email без явных параметров в методах.

**Альтернативы:**
- Передавать user_email как параметр в каждый метод
- Создать отдельный UserDataManager класс
- Использовать middleware для фильтрации

**Обоснование:**
- Упрощает API (не нужно передавать email в каждый вызов)
- Снижает риск ошибок (невозможно забыть передать email)
- Централизованная логика изоляции
- Соответствует требованиям user-data-isolation.1.11, user-data-isolation.1.12

### Решение 3: Кэширование Email в UserProfileManager

**Решение:** UserProfileManager кэширует currentUserEmail в памяти для быстрого доступа.

**Альтернативы:**
- Запрашивать email из базы данных при каждом вызове
- Хранить email в глобальной переменной
- Использовать Electron's session storage

**Обоснование:**
- Быстрый доступ (нет запросов к базе данных)
- Централизованное управление email
- Легко очищается при logout
- Соответствует требованию user-data-isolation.1.14

### Решение 4: Персистентность Данных После Logout

**Решение:** Данные пользователя остаются в базе данных после logout и восстанавливаются при повторном входе.

**Альтернативы:**
- Удалять все данные при logout
- Архивировать данные в отдельную таблицу
- Экспортировать данные в файл

**Обоснование:**
- Улучшает UX (пользователь не теряет данные)
- Поддерживает multi-user на одном устройстве
- Соответствует требованиям user-data-isolation.1.5, user-data-isolation.1.7
- Данные остаются приватными (изолированы по email)

### Решение 5: Composite Primary Key (key, user_email)

**Решение:** Использовать комбинацию (key, user_email) как первичный ключ в таблице user_data.

**Альтернативы:**
- Использовать auto-increment ID как первичный ключ
- Использовать только key как первичный ключ
- Создать отдельные таблицы для каждого пользователя

**Обоснование:**
- Гарантирует уникальность данных для каждого пользователя
- Эффективные запросы (индекс на первичном ключе)
- Простая схема данных
- Соответствует требованию user-data-isolation.1.2

### Решение 6: Обработка "No user logged in" Ошибки

**Решение:** Выбрасывать ошибку "No user logged in" при попытке операций без авторизации, с различной обработкой в зависимости от контекста.

**Альтернативы:**
- Молча игнорировать операции
- Использовать fallback к глобальному хранилищу
- Автоматически перенаправлять на логин

**Обоснование:**
- Явная обработка ошибок (не скрывает проблемы)
- Гибкая обработка в зависимости от контекста (logout, session expired, not authenticated)
- Соответствует требованиям user-data-isolation.1.13, user-data-isolation.1.19, user-data-isolation.1.20, user-data-isolation.1.21

## Зависимости

### Внешние Зависимости

- **google-oauth-auth**: Для получения email пользователя из Google OAuth профиля

### Внутренние Зависимости

- **DataManager**: Расширяется для поддержки изоляции данных
- **UserProfileManager**: Расширяется для кэширования email
- **SQLite Database**: Обновляется для добавления user_email колонки

## Заключение

Данный дизайн обеспечивает комплексную изоляцию данных пользователей в приложении Clerkly, покрывая все аспекты от хранения до автоматической фильтрации.

### Ключевые Архитектурные Решения

**Автоматическая Изоляция:**
Архитектура обеспечивает автоматическую изоляцию данных по user_email без необходимости явной передачи email в каждый метод. DataManager автоматически получает email из UserProfileManager и фильтрует все операции.

**Персистентность и Восстановление:**
Данные пользователя сохраняются в базе данных после logout и автоматически восстанавливаются при повторном входе, обеспечивая плавный UX и поддержку multi-user на одном устройстве.

**Безопасность и Приватность:**
Composite primary key (key, user_email) гарантирует, что данные одного пользователя никогда не будут доступны другому пользователю. Все операции требуют авторизации (наличие email).

### Покрытие Требований

Дизайн полностью покрывает все требования из requirements.md:

- ✅ **user-data-isolation.1** - Изоляция данных пользователей (24 критерия)

**Итого: 24 критерия приемки полностью покрыты дизайном**

### Свойства Корректности

Дизайн определяет 5 свойств корректности для property-based тестирования:
- Property 1: Автоматическое добавление user_email при сохранении
- Property 2: Автоматическая фильтрация по user_email при загрузке
- Property 3: Изоляция данных между пользователями
- Property 4: Персистентность данных после logout
- Property 5: Ошибка при отсутствии авторизации

### Стратегия Тестирования

Комплексная стратегия тестирования включает:
- **Модульные тесты**: Конкретные примеры, граничные случаи, условия ошибок
- **Property-based тесты**: Универсальные свойства на множестве входных данных (минимум 100 итераций)
- **Функциональные тесты**: End-to-end проверка изоляции данных в реальных условиях

Все 24 критерия приемки покрыты тестами согласно таблице покрытия требований.

### Следующие Шаги

1. **Обновить tasks.md** с задачами для реализации user data isolation
2. **Обновить DataManager** для поддержки user_email фильтрации
3. **Обновить UserProfileManager** для кэширования email
4. **Обновить схему базы данных** (добавить user_email колонку и индекс)
5. **Написать тесты** (модульные, property-based, функциональные)
6. **Валидировать** через `npm run validate` после каждого изменения

### Заключительные Замечания

Данный дизайн обеспечивает:
- ✅ Полное покрытие всех требований (user-data-isolation.1)
- ✅ Четкую архитектуру с автоматической изоляцией
- ✅ Комплексную стратегию тестирования
- ✅ Обработку всех граничных случаев и ошибок
- ✅ Безопасность и приватность данных
- ✅ Multi-user support с полной изоляцией
- ✅ Персистентность и восстановление данных
- ✅ Простой и понятный API

Дизайн готов к реализации.
