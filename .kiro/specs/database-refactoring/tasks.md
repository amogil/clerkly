# Список Задач: Рефакторинг DataManager → DatabaseManager + UserSettingsManager

## Обзор

Данный документ содержит список задач для рефакторинга системы хранения данных:
- **DataManager** переименовывается в **UserSettingsManager** (key-value storage для user_data)
- Вводится новый **DatabaseManager** как единая точка входа для доступа к БД

**Статус:** Требуется реализация

**Оценка времени:** 3-4 дня

**Затронутые спецификации:**
- `.kiro/specs/user-data-isolation/design.md` - основной дизайн DatabaseManager и UserSettingsManager
- `.kiro/specs/clerkly/design.md` - обновлены примеры тестов
- `.kiro/specs/account-profile/design.md` - обновлены ссылки на UserSettingsManager
- `.kiro/specs/settings/design.md` - обновлены ссылки на UserSettingsManager
- `.kiro/specs/google-oauth-auth/design.md` - обновлены ссылки на UserSettingsManager
- `.kiro/specs/navigation/design.md` - обновлен архитектурный принцип
- `.kiro/specs/error-notifications/design.md` - обновлен архитектурный принцип
- `.kiro/specs/token-management-ui/design.md` - обновлен архитектурный принцип
- `.kiro/specs/window-management/design.md` - обновлены ссылки на DatabaseManager

---

## Фаза 1: Создание DatabaseManager (1 день)

### 1.1. Создать класс DatabaseManager
- [x] Создать файл `src/main/DatabaseManager.ts`
- [x] Реализовать интерфейс:
  ```typescript
  class DatabaseManager {
    private db: Database.Database | null = null;
    private userManager: UserManager | null = null;
    
    initialize(storagePath: string): void;
    setUserManager(userManager: UserManager): void;
    getDatabase(): Database.Database;
    getCurrentUserId(): string;  // throws 'No user logged in'
    close(): void;
  }
  ```
- [x] Добавить логирование через Logger
- [x] Добавить комментарии с Requirements
- _Requirements: user-data-isolation.6.1, user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.6.4, user-data-isolation.6.7_

### 1.2. Перенести инициализацию БД из DataManager в DatabaseManager
- [x] Перенести логику создания директорий
- [x] Перенести логику открытия SQLite соединения
- [x] Перенести логику запуска миграций
- [x] Перенести логику обработки поврежденной БД (backup и пересоздание)
- _Requirements: user-data-isolation.6.1, user-data-isolation.6.7_

### 1.3. Написать модульные тесты DatabaseManager
- [x] Создать файл `tests/unit/DatabaseManager.test.ts`
- [x] Тест: `should throw error when database not initialized`
- [x] Тест: `should throw error when no user logged in`
- [x] Тест: `should return current user_id from UserManager`
- [x] Тест: `should return database instance after initialization`
- [x] Тест: `should close database connection`
- _Requirements: user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.6.4_

### 1.4. Запустить валидацию Фазы 1
- [x] Выполнить `npm run validate`
- [x] Убедиться, что все тесты проходят

---

## Фаза 2: Переименование DataManager в UserSettingsManager (1 день)

### 2.1. Переименовать файл и класс
- [x] Переименовать `src/main/DataManager.ts` → `src/main/UserSettingsManager.ts`
- [x] Переименовать класс `DataManager` → `UserSettingsManager`
- [x] Обновить все импорты в проекте
- _Requirements: user-data-isolation.6.5_

### 2.2. Обновить конструктор UserSettingsManager
- [x] Изменить конструктор для принятия DatabaseManager:
  ```typescript
  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }
  ```
- [x] Удалить логику инициализации БД (перенесена в DatabaseManager)
- [x] Добавить геттеры для db и userId:
  ```typescript
  private get db() { return this.dbManager.getDatabase(); }
  private get userId() { return this.dbManager.getCurrentUserId(); }
  ```
- _Requirements: user-data-isolation.6.5, user-data-isolation.6.6_

### 2.3. Обновить методы UserSettingsManager
- [x] Обновить `saveData()` - использовать `this.userId` вместо прямого вызова
- [x] Обновить `loadData()` - использовать `this.userId` вместо прямого вызова
- [x] Обновить `deleteData()` - использовать `this.userId` вместо прямого вызова
- [x] Удалить метод `initialize()` (логика в DatabaseManager)
- [x] Удалить метод `close()` (логика в DatabaseManager)
- _Requirements: user-data-isolation.2.4, user-data-isolation.2.5, user-data-isolation.2.6, user-data-isolation.3.1_

### 2.4. Обновить тесты DataManager → UserSettingsManager
- [x] Переименовать `tests/unit/DataManager.test.ts` → `tests/unit/UserSettingsManager.test.ts`
- [x] Обновить все ссылки на DataManager в тестах
- [x] Обновить моки для использования DatabaseManager
- _Requirements: user-data-isolation.6.5_

### 2.5. Запустить валидацию Фазы 2
- [x] Выполнить `npm run validate`
- [x] Убедиться, что все тесты проходят

---

## Фаза 3: Обновление зависимых компонентов (1 день)

### 3.1. Обновить IPCHandlers
- [x] Обновить `src/main/IPCHandlers.ts`:
  - Заменить `DataManager` на `UserSettingsManager` в конструкторе
  - Обновить импорты
- [x] Обновить тесты `tests/unit/IPCHandlers.test.ts`
- _Requirements: clerkly.1.4, clerkly.2.5_

### 3.2. Обновить AIAgentSettingsManager
- [x] Обновить `src/main/AIAgentSettingsManager.ts`:
  - Заменить `DataManager` на `UserSettingsManager` в конструкторе
  - Обновить импорты
- [x] Обновить тесты `tests/unit/AIAgentSettingsManager.test.ts`
- _Requirements: settings.1_

### 3.3. Обновить TokenStorageManager
- [x] Обновить `src/main/auth/TokenStorageManager.ts`:
  - Заменить `DataManager` на `UserSettingsManager` в конструкторе
  - Обновить импорты
- [x] Обновить тесты `tests/unit/auth/TokenStorageManager.test.ts`
- _Requirements: google-oauth-auth.4_

### 3.4. Обновить UserProfileManager
- [x] Обновить `src/main/auth/UserProfileManager.ts`:
  - Заменить `DataManager` на `UserSettingsManager` в конструкторе
  - Обновить импорты
- [x] Обновить тесты `tests/unit/auth/UserProfileManager.test.ts`
- _Requirements: account-profile.1.3_

### 3.5. Обновить LifecycleManager
- [x] Обновить `src/main/LifecycleManager.ts`:
  - Заменить `DataManager` на `DatabaseManager` + `UserSettingsManager`
  - Обновить порядок инициализации
- [x] Обновить тесты `tests/unit/LifecycleManager.test.ts`
- _Requirements: clerkly.1.2, clerkly.1.3_

### 3.6. Обновить WindowStateManager (исключение)
- [x] Обновить `src/main/WindowStateManager.ts`:
  - Использовать `DatabaseManager.getDatabase()` напрямую
  - НЕ использовать user_id фильтрацию (глобальные данные)
- [x] Обновить тесты `tests/unit/WindowStateManager.test.ts`
- _Requirements: window-management.5.7, user-data-isolation.6.8_

### 3.7. Обновить main/index.ts
- [x] Обновить `src/main/index.ts`:
  - Создать DatabaseManager первым
  - Вызвать `dbManager.initialize(storagePath)`
  - Создать UserSettingsManager с dbManager
  - Передать UserSettingsManager в зависимые компоненты
  - Вызвать `dbManager.setUserManager(userManager)` после создания UserManager
- _Requirements: user-data-isolation.6.7_

### 3.8. Запустить валидацию Фазы 3
- [x] Выполнить `npm run validate`
- [x] Убедиться, что все тесты проходят

---

## Фаза 4: Обновление Property-Based и Функциональных Тестов (0.5 дня)

### 4.1. Обновить property тесты
- [x] Обновить `tests/property/DataManager.property.test.ts` → `tests/property/UserSettingsManager.property.test.ts`
- [x] Обновить все ссылки на DataManager
- [x] Обновить моки для DatabaseManager
- _Requirements: clerkly.2.6_

### 4.2. Обновить функциональные тесты
- [x] Обновить все функциональные тесты, использующие DataManager
- [x] Заменить `app.getDataManager()` на `app.getUserSettingsManager()`
- [x] Обновить тестовые хелперы
- _Requirements: clerkly.2.4_

### 4.3. Запустить валидацию Фазы 4
- [x] Выполнить `npm run test:property`
- [x] Убедиться, что все property тесты проходят

---

## Фаза 5: Финализация (0.5 дня)

### 5.1. Запустить полную валидацию
- [x] Выполнить `npm run validate`
- [x] Убедиться, что все проверки проходят:
  - ✅ TypeScript компиляция
  - ✅ ESLint
  - ✅ Prettier
  - ✅ Модульные тесты
  - ✅ Property-based тесты
  - ✅ Покрытие кода (минимум 85%)

### 5.2. Обновить документацию
- [x] Проверить комментарии с Requirements в коде
- [x] Убедиться, что все тесты имеют структуру (Preconditions, Action, Assertions, Requirements)

### 5.3. Запросить функциональные тесты
- [x] Спросить пользователя: "Запустить функциональные тесты? (они покажут окна на экране)"

---

## Примечания

- DatabaseManager является singleton-подобным объектом (один экземпляр на приложение)
- UserSettingsManager работает только с таблицей user_data (key-value storage)
- WindowStateManager - исключение, работает с глобальными данными без user_id фильтрации
- Все менеджеры получают user_id автоматически из DatabaseManager
- FOREIGN KEY constraints не используются - целостность поддерживается логикой приложения

## Риски

1. **Циклические зависимости** - DatabaseManager зависит от UserManager для getCurrentUserId()
   - Митигация: использовать `setUserManager()` после инициализации

2. **Порядок инициализации** - DatabaseManager должен быть создан до других менеджеров
   - Митигация: явный порядок в main/index.ts

3. **Обратная совместимость** - существующие тесты используют DataManager
   - Митигация: переименование файлов и обновление импортов

4. **WindowStateManager** - должен работать без user_id
   - Митигация: использовать только getDatabase(), не getCurrentUserId()

