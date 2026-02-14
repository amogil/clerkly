# Документ Дизайна: Рефакторинг Database Layer

## Обзор

Данный документ описывает дизайн рефакторинга слоя доступа к базе данных. Основное изменение - разделение DataManager на два компонента:
- **DatabaseManager** - инициализация БД, доступ к SQLite, получение user_id
- **UserSettingsManager** - key-value storage для пользовательских настроек

## Архитектура

### Текущая Архитектура (До Рефакторинга)

```
┌─────────────────────────────────────────────────────────────┐
│                      DataManager                             │
│                                                              │
│  - initialize()           - инициализация БД                │
│  - saveData()             - сохранение данных               │
│  - loadData()             - загрузка данных                 │
│  - deleteData()           - удаление данных                 │
│  - close()                - закрытие соединения             │
│  - getCurrentUserId()     - через UserProfileManager        │
└─────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  IPCHandlers, AIAgentSettingsManager, TokenStorageManager,  │
│  UserProfileManager, WindowStateManager                      │
└─────────────────────────────────────────────────────────────┘
```

### Целевая Архитектура (После Рефакторинга)

```
┌─────────────────────────────────────────────────────────────┐
│                     DatabaseManager                          │
│                                                              │
│  - initialize(storagePath)  - инициализация БД и миграций   │
│  - setUserManager(um)       - установка UserManager         │
│  - getDatabase()            - доступ к SQLite instance      │
│  - getCurrentUserId()       - получение user_id             │
│  - close()                  - закрытие соединения           │
└─────────────────────────────────────────────────────────────┘
           │
           ├──────────────────────────────────────┐
           │                                      │
           ▼                                      ▼
┌─────────────────────────┐          ┌─────────────────────────┐
│   UserSettingsManager   │          │   WindowStateManager    │
│                         │          │   (исключение)          │
│  - saveData(key, value) │          │                         │
│  - loadData(key)        │          │  - использует только    │
│  - deleteData(key)      │          │    getDatabase()        │
│  + auto user_id         │          │  - БЕЗ user_id          │
└─────────────────────────┘          └─────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│  IPCHandlers, AIAgentSettingsManager, TokenStorageManager,  │
│  UserProfileManager                                          │
└─────────────────────────────────────────────────────────────┘
```

## Компоненты

### DatabaseManager

**Файл:** `src/main/DatabaseManager.ts`

```typescript
// Requirements: database-refactoring.1, user-data-isolation.6
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
   * Requirements: database-refactoring.1.1, user-data-isolation.6.1, user-data-isolation.6.7
   */
  initialize(storagePath: string): void {
    // Create directory if not exists
    // Open SQLite connection
    // Run migrations
    this.logger.info('Database initialized');
  }
  
  /**
   * Set UserManager for getting current userId
   * Requirements: database-refactoring.1.1
   */
  setUserManager(userManager: UserManager): void {
    this.userManager = userManager;
  }
  
  /**
   * Get SQLite database instance
   * Requirements: database-refactoring.1.1, user-data-isolation.6.2
   */
  getDatabase(): Database.Database {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }
  
  /**
   * Get current user ID (automatic isolation)
   * Requirements: database-refactoring.1.1, database-refactoring.1.2, user-data-isolation.6.3, user-data-isolation.6.4
   */
  getCurrentUserId(): string {
    const userId = this.userManager?.getCurrentUserId();
    if (!userId) {
      throw new Error('No user logged in');
    }
    return userId;
  }
  
  /**
   * Close database connection
   * Requirements: database-refactoring.1.1
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

### UserSettingsManager

**Файл:** `src/main/UserSettingsManager.ts`

```typescript
// Requirements: database-refactoring.2, user-data-isolation.2, user-data-isolation.3
import { DatabaseManager } from './DatabaseManager';
import { Logger } from './Logger';

class UserSettingsManager {
  private dbManager: DatabaseManager;
  private logger = Logger.create('UserSettingsManager');

  /**
   * Constructor - accepts DatabaseManager
   * Requirements: database-refactoring.2.4
   */
  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }
  
  private get db() {
    return this.dbManager.getDatabase();
  }
  
  private get userId() {
    return this.dbManager.getCurrentUserId();
  }

  /**
   * Save data with automatic user_id filtering
   * Requirements: user-data-isolation.2.4, user-data-isolation.3.1
   */
  saveData(key: string, value: any): { success: boolean; error?: string } {
    // Implementation unchanged, uses this.userId
  }

  /**
   * Load data with automatic user_id filtering
   * Requirements: user-data-isolation.2.5, user-data-isolation.3.1
   */
  loadData(key: string): { success: boolean; data?: any; error?: string } {
    // Implementation unchanged, uses this.userId
  }

  /**
   * Delete data with automatic user_id filtering
   * Requirements: user-data-isolation.2.6, user-data-isolation.3.1
   */
  deleteData(key: string): { success: boolean; error?: string } {
    // Implementation unchanged, uses this.userId
  }
}
```

### Инициализация в main/index.ts

```typescript
// Requirements: database-refactoring.3.7, user-data-isolation.6.7

async function initializeApp() {
  // 1. Create and initialize DatabaseManager FIRST
  const dbManager = new DatabaseManager();
  dbManager.initialize(storagePath);
  
  // 2. Create UserSettingsManager with DatabaseManager
  const userSettingsManager = new UserSettingsManager(dbManager);
  
  // 3. Create other managers that depend on UserSettingsManager
  const tokenStorage = new TokenStorageManager(userSettingsManager);
  const aiAgentSettings = new AIAgentSettingsManager(userSettingsManager);
  const ipcHandlers = new IPCHandlers(userSettingsManager);
  
  // 4. Create UserManager (needs tokenStorage)
  const userManager = new UserManager(tokenStorage, /* ... */);
  
  // 5. Connect DatabaseManager to UserManager for getCurrentUserId()
  dbManager.setUserManager(userManager);
  
  // 6. Create WindowStateManager with DatabaseManager (exception - no user_id)
  const windowStateManager = new WindowStateManager(dbManager);
  
  // 7. Create LifecycleManager
  const lifecycleManager = new LifecycleManager(
    dbManager,
    userSettingsManager,
    windowStateManager,
    // ... other dependencies
  );
  
  await lifecycleManager.initialize();
}
```

## Стратегия Тестирования

### Модульные Тесты

#### DatabaseManager Tests

```typescript
describe('DatabaseManager', () => {
  /* Preconditions: DatabaseManager not initialized
     Action: call getDatabase()
     Assertions: throws Error('Database not initialized')
     Requirements: database-refactoring.1.1 */
  it('should throw error when database not initialized');

  /* Preconditions: DatabaseManager initialized, UserManager not set
     Action: call getCurrentUserId()
     Assertions: throws Error('No user logged in')
     Requirements: database-refactoring.1.2 */
  it('should throw error when no user logged in');

  /* Preconditions: DatabaseManager initialized, UserManager set with valid user
     Action: call getCurrentUserId()
     Assertions: returns correct user_id
     Requirements: database-refactoring.1.1 */
  it('should return current user_id from UserManager');
});
```

#### UserSettingsManager Tests

```typescript
describe('UserSettingsManager', () => {
  /* Preconditions: DatabaseManager mock returns valid user_id
     Action: call saveData('key', 'value')
     Assertions: data saved with user_id
     Requirements: database-refactoring.2.4, user-data-isolation.2.4 */
  it('should save data with automatic user_id');

  /* Preconditions: DatabaseManager.getCurrentUserId() throws 'No user logged in'
     Action: call saveData('key', 'value')
     Assertions: throws Error('No user logged in')
     Requirements: database-refactoring.1.2 */
  it('should throw error when no user logged in');
});
```

### Покрытие Требований

| Требование | Модульные Тесты | Property-Based Тесты | Функциональные Тесты |
|------------|-----------------|----------------------|----------------------|
| database-refactoring.1.1 | ✓ | - | ✓ |
| database-refactoring.1.2 | ✓ | - | ✓ |
| database-refactoring.1.3 | ✓ | - | ✓ |
| database-refactoring.2.1 | ✓ | - | - |
| database-refactoring.2.2 | ✓ | - | - |
| database-refactoring.2.3 | ✓ | - | - |
| database-refactoring.2.4 | ✓ | - | ✓ |
| database-refactoring.2.5 | ✓ | - | - |
| database-refactoring.3.1-3.7 | ✓ | - | ✓ |

## Технические Решения

### Решение 1: Порядок Инициализации

**Проблема:** DatabaseManager нуждается в UserManager для getCurrentUserId(), но UserManager создается позже.

**Решение:** Использовать метод `setUserManager()` для отложенной установки зависимости.

**Обоснование:** Это позволяет избежать циклических зависимостей и обеспечивает правильный порядок инициализации.

### Решение 2: WindowStateManager как Исключение

**Проблема:** WindowStateManager работает с глобальными данными (не изолированными по user_id).

**Решение:** WindowStateManager использует только `DatabaseManager.getDatabase()`, не вызывая `getCurrentUserId()`.

**Обоснование:** Состояние окна должно быть одинаковым для всех пользователей на устройстве.

